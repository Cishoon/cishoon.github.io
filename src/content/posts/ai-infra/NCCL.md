---
title: NCCL 源码文档解读
categories: [笔记]
tags: [AI, AI Infra, CUDA, NCCL]
date: 2026-05-14
---

根据nccl源码中的文档过了一遍GPU间通信的主要操作和细节概念。

[源码链接](https://github.com/NVIDIA/nccl/tree/master/docs/examples )

<!--more-->

# NCCL



## 1 communicator

`communicator` 是 GPU 间通信前必须提前初始化构造的一个对象。里面记录了每个 rank 绑定的 GPU 设备信息、与每个 peer 的通信方式、预先算好的通信算法（ring / tree）、走哪条路径、分配好的中转缓冲区等等。

一个 comm 相当于一个聊天室，GPU 们在这个聊天室里进行一类数据传输。可以多开 comm，每个 comm 负责一类通信（比如 data-parallel 一个，tensor-parallel 另开一个，互不干扰，可并发跑）。

comm 的"会议室入场码"叫 `ncclUniqueId`（128 字节，里面编码了 rank 0 的 bootstrap TCP 地址 + 随机魔数），相当于腾讯会议的会议号。**每个 rank 必须拿到同一份 uniqueId** 才能加入这个 comm——uniqueId 是 per communicator 的，不是 per rank 的。

具体加入操作的代码是 `ncclCommInitRank(&comm, nranks, id, my_rank)`：

- `id` 所有 rank 都一样（决定加入哪个会议）
- `my_rank` 每个 rank 各不相同（决定我是会议里的几号）
- `nranks` 是总人数

单进程多 GPU 场景有个语法糖 `ncclCommInitAll`，内部偷偷生成一份 id + 循环调 N 次 `ncclCommInitRank`（外面包了 `ncclGroupStart/End`，避免单线程自死锁）。

这个调用是**集合同步（rendezvous）**的：所有 rank 都必须走到 `ncclCommInitRank`，且都走完内部所有阶段（互换硬件信息、算 ring/tree、交换 IPC 句柄或 RDMA QP 凭证），才会一起返回。任何一个 rank 没到，其他人就永远等下去。

返回后，comm 里已经记好了到每个 peer 的快速通道。后续集合通信按拓扑自动选最优路径：

- 同机有 NVLink / NVSwitch → 直接 **NVLink P2P**（最快，对应 `nvidia-smi topo` 里的 NV12）
- 同机无 NVLink，但同一 PCIe switch (PXB) → 走 **PCIe P2P**
- 同机但跨 NUMA (SYS) → 也是 PCIe，但要经过 CPU 间互连 (UPI/QPI)，是同机里最慢的
- 跨机 → 走 **NIC**（IB 上的 RDMA / RoCE）



## 2 CUDA stream

Stream 是 GPU 的工作队列。执行核函数、NCCL 函数时，就是把任务丢到 stream 里。**同一个 stream 里的任务严格顺序（FIFO）执行**。

通常的做法是一个 GPU 创建多个 stream，更充分地利用 GPU 资源（SM、copy engine、通信通道这些硬件单元可以并行）。

不同 stream 之间，只要硬件资源够，就可以真正并发执行；如果资源不够，GPU 调度器会把它们自动串行化。

Stream 是程序员视角的"逻辑通道"，能不能真并发由硬件决定。

默认 stream **一直存在**。当你写 kernel launch 不指定 stream，或者用同步版 `cudaMemcpy`，任务就被提交到默认 stream。

传统行为下（legacy default stream），**只要有任务被提交到默认 stream，它会和当前 CUDA 上下文里其他所有 stream 互相同步**——其他 stream 上的任务必须等默认 stream 干完，反之亦然，等于把所有 stream 强行变回串行。

所以生产代码会尽量避免让默认 stream 接活，全部显式指定 stream。

### 代码对比

**Kernel 启动**：

```c
// 默认 stream
my_kernel<<<grid, block>>>(args);

// 指定 stream —— 用四参数 launch 语法
//   第 3 个参数：动态共享内存字节数，通常 0
//   第 4 个参数：stream
my_kernel<<<grid, block, 0, stream>>>(args);
```

**Memcpy**：

```c
// 默认 stream，同步阻塞 CPU
cudaMemcpy(d_a, h_a, n, cudaMemcpyHostToDevice);

// 指定 stream，异步，立刻返回
cudaMemcpyAsync(d_a, h_a, n, cudaMemcpyHostToDevice, stream);
```

**NCCL**（stream 必填）：

```c
ncclSend(d_sendbuff, count, ncclFloat, peer, comm, stream);
ncclAllReduce(d_in, d_out, count, ncclFloat, ncclSum, comm, stream);
```

**等 stream 干完**：

```c
cudaStreamSynchronize(stream);    // CPU 阻塞，等单个 stream 空
cudaDeviceSynchronize();          // CPU 阻塞，等当前设备上所有 stream 空
cudaEventRecord(event, stream);   // 在 stream 上打个事件标记
cudaStreamWaitEvent(other, event); // 让另一个 stream 等这个事件，做跨 stream 依赖
```

**创建 / 销毁**（用之前要先 `cudaSetDevice` 切到目标卡）：

```c
cudaStream_t stream;
cudaSetDevice(device_id);
cudaStreamCreate(&stream);   // 创建：归属当前设备
// ... 干活 ...
cudaStreamDestroy(stream);   // 销毁
```



## 3 P2P Ring Pattern

只看代码里分配显存的部分：

```c
for (int i = 0; i < num_gpus; i++) {
  CUDACHECK(cudaSetDevice(devices[i]));   // 切到目标 GPU

  h_sendbuff[i] = (float *)malloc(size_bytes);                       // 主存
  h_recvbuff[i] = (float *)malloc(size_bytes);                       // 主存
  CUDACHECK(cudaMalloc((void **)&d_sendbuff[i], size_bytes));        // 显存
  CUDACHECK(cudaMalloc((void **)&d_recvbuff[i], size_bytes));        // 显存
}
```

NCCL 只读 GPU 显存，所以 send/recv 缓冲区**必须是 `cudaMalloc` 出来的**（`d_*`）。但 CPU 也想参与，所以另留一份主存副本（`h_*`）做两件事：

- **init**：CPU 在 `h_sendbuff` 里写测试 pattern，再 `cudaMemcpy` H2D 上去
- **verify**：通信结束后 `cudaMemcpy` D2H 拉回 `h_recvbuff`，CPU 比对结果

```
CPU 写 pattern
    ↓
h_sendbuff[i]                  (主存)
    ↓ cudaMemcpy H2D
d_sendbuff[i]                  (显存)
    ↓ ncclSend → ncclRecv      (ring 单跳，GPU 直传)
d_recvbuff[(i+1) % N]          (下一张卡的显存)
    ↓ cudaMemcpy D2H
h_recvbuff[(i+1) % N]          (主存)
    ↓
CPU 校验
```

## 4 User Buffer Registration

**任何一块用于 NCCL 通信的显存 buffer，在被使用前都必须先在各传输层注册——这是 NCCL 通信的前提**。注册的产物是一组"元数据"，让各种传输路径能直接访问这块 buffer。

注册的方式有两种：

- **隐式注册**（默认）：第一次 `ncclAllReduce` 看到陌生 buffer 时现场注册，结果存进 cache
- **显式注册**（UBR）：启动时主动调用 `ncclCommRegister`，元数据固化到 handle 里

视硬件/传输路径而定，注册过程会为这块 buffer 生成：

| 传输路径                   | 注册产物                           | 用途                                   |
| -------------------------- | ---------------------------------- | -------------------------------------- |
| **NVLink / P2P**           | CUDA **IPC handle**                | 让本节点其他 GPU 能直接访问这块显存    |
| **InfiniBand / RoCE**      | **Memory Region (MR)** + lkey/rkey | NIC 可以做 DMA 读写、做 RDMA           |
| **NVLink SHARP**           | 交换机侧的 buffer 登记             | 在网规约时交换机能直接命中这块显存     |
| **PCIe / shared host mem** | bounce buffer 映射、CPU 中转配置   | 走主存中转的回退路径                   |
| **Symmetric memory**       | 跨 rank 的虚地址映射（VMM）        | 所有 rank 看到同一虚地址，方便对称算法 |

数据 buffer 本身没变——**始终是用户分配的那块显存**——变的是各层"怎么找到、怎么访问它"的凭证。

**隐式注册的局限**：

- 第一次调用必然付完整注册代价
- cache 有上限，buffer 多了会被驱逐，下次又重来
- 部分高级路径（SHARP 在网规约、symmetric memory 算法、CUDA Graph 捕获）**不接受**隐式注册

**显式注册的好处**：

1. **保证 cache 命中**——handle 一直活着，绝不被驱逐
2. **省去首次调用的注册尾巴**——对延迟敏感场景有效
3. **解锁高级路径**——SHARP、symmetric memory、CUDA Graph 等只走显式注册
4. **性能可预测**——不受 cache 状态波动影响

```c
// 1) 用 NCCL 分配器（推荐，对齐/属性更友好；也可继续用 cudaMalloc）
void *d_buf;
ncclMemAlloc(&d_buf, size_bytes);

// 2) 显式注册，拿到 handle
void *handle;
ncclCommRegister(comm, d_buf, size_bytes, &handle);

// 3) 通信，调用本身和不注册时完全一样
ncclAllReduce(d_buf, d_buf, count, ncclFloat, ncclSum, comm, stream);
//   ↑ 内部 cache 命中 handle，跳过隐式注册路径

// 4) 清理（顺序敏感）
ncclCommDeregister(comm, handle);   // 先解注册
ncclMemFree(d_buf);                 // 再释放显存（用 ncclMemFree 配对 ncclMemAlloc）
ncclCommFinalize(comm);             // 最后销毁通信器
ncclCommDestroy(comm);
```

## 5 Symmetric Memory

**`ncclCommWindowRegister` = `ncclCommRegister` + 跨卡虚拟地址对齐 + peer access 权限**。

在 04 已经做了的"元数据注册"基础上，额外用 CUDA VMM API 把所有 rank 的 buffer 映射到**同一段连续虚拟地址**上，并放开 GPU 间互访权限。结果：每张 GPU 的 kernel 可以**像访问自己显存一样**访问其他 GPU 的数据。

**虚拟地址布局**

"对称" ≠ 共享内存。**对称指的是虚拟地址布局对称，物理显存仍然分离**。

```
            虚拟地址            GPU 0 页表        GPU 1 页表        GPU 2 页表        GPU 3 页表
slot 0:     base + 0×stride  →  本地             ─peer→ GPU 0      ─peer→ GPU 0      ─peer→ GPU 0
slot 1:     base + 1×stride  →  ─peer→ GPU 1     本地              ─peer→ GPU 1      ─peer→ GPU 1
slot 2:     base + 2×stride  →  ─peer→ GPU 2     ─peer→ GPU 2      本地              ─peer→ GPU 2
slot 3:     base + 3×stride  →  ─peer→ GPU 3     ─peer→ GPU 3      ─peer→ GPU 3      本地
```

- 所有 GPU 看到的"slot 0/1/2/.../N-1 的虚拟地址布局"完全一致
- 每张 GPU 有自己独立的页表，把同样的虚拟地址翻译到不同物理位置
- 每个 slot 对它自己的拥有者是本地访问，对其他 rank 是 peer 访问

**`stride` = 每个 rank 在窗口里占的大小**（单元数）。`buf[r * stride + i]` 就是"rank r 的 slot 的第 i 个元素"。



注册过程内部大致跑这套流程：

```c
cuMemCreate(&handle, size, ...)         // 各自创建物理分配
cuMemAddressReserve(&va, total_size,    // 所有 rank reserve 出同一段虚拟地址
                    align, hint, 0)
[各 rank 交换 handle，类似 IPC]
cuMemMap(va + r * stride, size,         // 把每个 rank 的物理分配映射到对应 slot
         0, handle_of_r, 0)             // —— 包括自己的和别人的
cuMemSetAccess(va, total_size,          // 给本地 GPU 开放对整段窗口的读写权限
               &access_desc, 1)
```



`float val = buf[3 * stride + 100];`（rank 0 上跑）：

1. GPU 0 的 SM 发出 load 到虚拟地址 `base + 3*stride + 400`
2. GPU 0 的 MMU 查页表 → 该地址映射到 GPU 3 的物理显存
3. MMU 把请求打包成 NVLink 事务发出
4. NVSwitch 路由到 GPU 3
5. GPU 3 的内存控制器读本地 HBM，回传数据
6. 数据通过 NVLink 回到 GPU 0，进入 SM 寄存器

**整个过程没有 NCCL 软件介入**——NCCL 的活在注册阶段就干完了，运行时是 GPU 硬件 + NVLink fabric 直接执行。



| 能力                     | 说明                                              |
| ------------------------ | ------------------------------------------------- |
| **直接 load/store 跨卡** | kernel 里用普通指针访问 peer 显存，无需 send/recv |
| **One-shot AllReduce**   | 一个 kernel 单跳完成规约，替代 ring 的 2(N-1) 跳  |
| **NVLink SHARP / NVLS**  | 在网计算的入场券，switch 直接做规约（需对应硬件） |
| **更低延迟**             | 中小消息延迟显著下降                              |

- **必须是 collective 调用**：所有 rank 同时调用，size 一致——因为内部要协同 reserve 同一段虚拟地址、交换 handle、互相 map
- **并发写不再安全**：多个 rank 同时写同一个 slot 会 race，NCCL 算法靠同步原语（barrier、signal）避免冲突，用户自己写跨卡算法时也要负责
- **跨节点退化**：本节点 NVLink 内有效；多机间需要其他机制（IB RDMA 等），不一定走 symmetric 路径

```c
// 1) 分配（用 NCCL allocator）
void *d_buf;
ncclMemAlloc(&d_buf, size_bytes);

// 2) 对称注册（collective —— 所有 rank 同时调用，size 一致）
ncclWindow_t win;
ncclCommWindowRegister(comm, d_buf, size_bytes, &win, NCCL_WIN_COLL_SYMMETRIC);

// 3) 通信（API 调用本身不变，但内部可走 one-shot / NVLS 路径）
ncclAllReduce(d_buf, d_buf, count, ncclFloat, ncclSum, comm, stream);

// 4) 清理（顺序敏感）
ncclCommWindowDeregister(comm, win);
ncclMemFree(d_buf);
ncclCommFinalize(comm);
ncclCommDestroy(comm);
```



## 6 通信计算融合

在核函数里直接进行GPU通信。

### 6.1 LSA（Local Shared Memory Access）

**用于节点内 NVLink 互联的 peer**：

- 访问方式：`ncclGetLsaPointer(win, offset, peer)` 拿 peer 指针 → 直接 load/store
- 同步：`ncclLsaBarrierSession` 设备端跨 GPU 屏障
- 物理路径：NVLink / NVSwitch

本质上是 **05 的对称内存能力 + 设备端 barrier**——把"对称窗口"从"NCCL 内部可用"变成"你的 kernel 也可用"。

| 概念                                       | 含义                                                         |
| ------------------------------------------ | ------------------------------------------------------------ |
| **CTA**                                    | = block（NVIDIA 官方术语，意为 Cooperative Thread Array），完全等价 |
| **`ncclDevComm`**                          | device 端通信器句柄，**驻留 GPU 显存的小 struct**，含 rank、nRanks、barrier 资源指针等。（ncclComm的Device版） |
| **team**                                   | "能做某种通信的一组 rank"。`ncclTeamLsa(devComm)` = 能通过 LSA 互访的所有 rank |
| **LSA barrier**                            | 跨 GPU 同步屏障，物理上是显存里的计数器组。`reqs.lsaBarrierCount` 决定个数 |
| **`ncclGetLsaPointer(win, offset, peer)`** | 拿到对称窗口里 peer rank 的 GPU 指针，等价于 `peerBase[peer] + offset`（注册时建好的映射表查询） |
| **acquire / release**                      | 跨 GPU 内存可见性的配对栅栏，类似 C++11 atomic memory order  |

#### Memory Model（acquire / release 真正在做什么）

**GPU 默认 relaxed**：一个 SM 的写可能停留在 L1，跨 GPU 的写可能停留在本 GPU L2，对方完全看不见。

```
release  =  "出门栅栏"：我退出前，把我做的所有写推出去让别人看见
            PTX 层：membar.sys / fence.sc.sys（system 范围）
            硬件动作：刷本 GPU cache 中对该地址的写到所有 GPU 可见

acquire  =  "入门栅栏"：我进入前，吸进对应 release 之前的所有写
            硬件动作：使本 GPU cache 对该地址失效，下次读拉新值
```

#### Host侧

```c
// 1. 标准 NCCL 初始化（同 03/04/05）
ncclCommInitRank(&comm, total_ranks, nccl_unique_id, my_rank);

// 2. 检查 device API 支持
ncclCommProperties_t props = NCCL_COMM_PROPERTIES_INITIALIZER;
ncclCommQueryProperties(comm, &props);
assert(props.deviceApiSupport);
assert(props.nLsaTeams == 1);   // 纯 LSA 例子需要单 team

// 3. 对称窗口注册（同 05）
ncclMemAlloc(&d_buf, size_bytes);
ncclCommWindowRegister(comm, d_buf, size_bytes, &win, NCCL_WIN_COLL_SYMMETRIC);

// 4. 创建 devComm，声明 barrier 需求
ncclDevComm devComm;
ncclDevCommRequirements reqs = NCCL_DEV_COMM_REQUIREMENTS_INITIALIZER;
reqs.lsaBarrierCount = NCCL_DEVICE_CTA_COUNT;   // 与 kernel 启动配置一致
ncclDevCommCreate(comm, &reqs, &devComm);

// 5. 启动自己写的 kernel
my_kernel<<<NCCL_DEVICE_CTA_COUNT, NCCL_DEVICE_THREADS_PER_CTA, 0, stream>>>(
    win, 0, win, 0, count, devComm);
```

#### Kernel侧

```c
__global__ void my_kernel(ncclWindow_t sendwin, size_t sendoffset,
                          ncclWindow_t recvwin, size_t recvoffset,
                          size_t count, struct ncclDevComm devComm) {
    // acquire barrier：等所有 peer 就绪 + 拿到他们的写可见性
    ncclLsaBarrierSession<ncclCoopCta> bar {
        ncclCoopCta(),               // 协作粒度（block 内全员）
        devComm,
        ncclTeamLsa(devComm),        // 同步对象：LSA team
        devComm.lsaBarrier,          // barrier 资源
        blockIdx.x                   // 每 CTA 用专属 barrier（避免全局大同步）
    };
    bar.sync(ncclCoopCta(), cuda::memory_order_acquire);

    // ===== 临界区：跨卡读写 =====
    // 用 ncclGetLsaPointer 拿 peer 指针，普通 load/store 即可

    // release barrier：让我的写对所有 peer 可见 + 等所有 peer 也完成
    bar.sync(ncclCoopCta(), cuda::memory_order_release);
}
```

#### 适用场景

✅ **适合**：

- 中小消息 AllReduce（延迟敏感）
- 通信-计算融合（FSDP / MoE / 序列并行）
- 持久化 kernel 训练
- 单节点 NVLink 强连通拓扑
- 自定义集合通信算法

❌ **不适合**：

- 大消息 AllReduce（ring 算法更优，带宽吃满）
- 跨节点（需要 GIN，下一节）

### 6.2 GIN （**GPU Initiated Networking**）

让 GPU kernel 直接驱动 NIC发起跨节点通信，完全绕过 CPU。

- **物理路径**：NIC（InfiniBand / RoCE / 其他 NCCL 网络后端），走 RDMA
- **通信模型**：消息传递（put / signal），类似 NVSHMEM、OpenSHMEM
- **解决的问题**：跨节点的设备端通信——LSA 走不了的 peer，全靠 GIN

和 LSA 的关系：**同一套 device API 框架**（barrier、symmetric window、devComm 结构），但通信原语从"load/store"换成了"put + signal"，因为底层路径从 NVLink 共享内存换成了 NIC RDMA。

GIN的写法更类似于传统网络/异步通信，用信号量来同步。

| 概念                                                | 含义                                                         |
| --------------------------------------------------- | ------------------------------------------------------------ |
| **`ncclGin`**                                       | GIN 工作句柄，绑定 `devComm` 和某个 ginContext               |
| **`ginContext`**                                    | NIC 工作通道，物理上对应 IB QP 或类似资源；多 context = 多通道并发 |
| **signal**                                          | rank 本地的累计计数器数组，由远端 put 完成时 NIC 自动 +1     |
| **`ncclTeamTagWorld()` / `ncclTeamWorld(devComm)`** | "world team"——所有 rank 都在内（对应 LSA 的 `ncclTeamLsa`）  |
| **`ncclGinBarrierSession`**                         | GIN 专用 barrier，走网络协调                                 |
| **`ncclGinFenceLevel`**                             | GIN barrier 的网络栅栏强度，通常 `Relaxed`（靠 flush+waitSignal 显式管完成性） |

#### Host侧

```c
ncclDevCommRequirements reqs = NCCL_DEV_COMM_REQUIREMENTS_INITIALIZER;
reqs.worldGinBarrierCount = NCCL_DEVICE_CTA_COUNT;   // world team 的 GIN barrier 数
reqs.ginSignalCount       = NCCL_DEVICE_CTA_COUNT;   // signal 计数器数
reqs.ginConnectionType    = NCCL_GIN_CONNECTION_FULL;// 拓扑：FULL=任意对任意，RING=只对邻居
ncclDevCommCreate(comm, &reqs, &devComm);

// 检查 GIN 支持
ncclCommProperties_t props = NCCL_COMM_PROPERTIES_INITIALIZER;
ncclCommQueryProperties(comm, &props);
assert(props.ginType != NCCL_GIN_TYPE_NONE);
```

通常 barrier 和 signal 都和 CTA 数量对齐——每个 CTA 用专属编号，避免全局大同步/共用计数器冲突。

#### Kernel侧

```c
__global__ void my_gin_kernel(ncclWindow_t sendwin, size_t sendoffset,
                              ncclWindow_t recvwin, size_t recvoffset,
                              size_t count, struct ncclDevComm devComm) {
    int ginContext = 0;                            // 单 context（多 context 用来打满带宽）
    unsigned int signalIndex = blockIdx.x;         // 每 CTA 专属 signal
    ncclGin gin { devComm, ginContext };

    // ① 读 signal 基线（signal 是不归零的累计计数器）
    uint64_t signalValue = gin.readSignal(signalIndex);

    // ② acquire barrier：所有 rank 进入通信阶段
    ncclGinBarrierSession<ncclCoopCta> bar {
        ncclCoopCta(), gin, ncclTeamTagWorld(), blockIdx.x
    };
    bar.sync(ncclCoopCta(), cuda::memory_order_acquire, ncclGinFenceLevel::Relaxed);

    int tid = threadIdx.x + blockIdx.x * blockDim.x;     // 本 GPU 内 tid（不需要跨 GPU 编号）
    int nthreads = blockDim.x * gridDim.x;

    // ③ 发送：每个 thread 负责若干 put
    for (int r = tid; r < devComm.nRanks; r += nthreads) {
        gin.put(ncclTeamWorld(devComm), r,           // 目标 rank
                recvwin, dst_offset,                  // 目的：peer 的 window 内偏移
                sendwin, src_offset,                  // 源：我的 window 内偏移
                size, ncclGin_SignalInc{signalIndex});// 完成时给目标的 signal[idx] +1
    }

    // ④ 等待入流：只有"接收 CTA"等 signal 到目标值
    int receivingCta = (devComm.rank % nthreads) / blockDim.x;
    if (blockIdx.x == receivingCta)
        gin.waitSignal(ncclCoopCta(), signalIndex, signalValue + devComm.nRanks);

    // ⑤ flush 出流：本地发出的 put 全部 ACK
    gin.flush(ncclCoopCta());

    // ⑥ release barrier：所有 rank 都完成"等收 + flush" 才退出
    bar.sync(ncclCoopCta(), cuda::memory_order_release, ncclGinFenceLevel::Relaxed);
}
```

#### `gin.*` API 详解

**`gin.readSignal(idx)` — 读基线信号值**

```c
uint64_t signalValue = gin.readSignal(signalIndex);
```

**签名**：`uint64_t readSignal(unsigned int idx)`

**作用**：返回 `signal[idx]` 当前的累计值。

signal 是**永不复位的累计计数器**（写多了它会一直涨）：

```
本次 kernel 调用前：signal[0] = 32（上次累计的）
本次 put 完成后：    signal[0] = 32 + N（N 次新增）
```

如果你不记录基线，光等"`signal[0] == N`"是错的——它早就大于 N 了。所以**先读 baseline = 32**，等到 `signal[0] >= 32 + N` 就知道这一轮的 put 都到了。

---

 **`gin.put(...)` — 主菜，单条网络消息**

```c
gin.put(ncclTeamWorld(devComm), r,
        recvwin, recvoffset + devComm.rank * size,
        sendwin, sendoffset + r * size,
        size, ncclGin_SignalInc{signalIndex});
```

**签名（精简）**：

```c
void put(team_t team,                    // 通信范围
         int peer,                       // 目标 rank
         ncclWindow_t dst_win,           // 目标 window
         size_t dst_offset,              // 目标 window 内的偏移
         ncclWindow_t src_win,           // 源 window
         size_t src_offset,              // 源 window 内的偏移
         size_t size,                    // 字节数
         SignalOp signal_op);            // 完成时怎么操作目标的 signal
```

**这条指令的含义**：

> 我（当前 rank）从我自己的 `src_win + src_offset` 开始读 `size` 字节，**通过网络**发到 peer `r` 的 `dst_win + dst_offset` 处。NIC 完成传输后，在 peer `r` 那边把 `signal[signalIndex]` 原子地 +1。

**关键性质**：

- **异步**：调用立刻返回，数据还在 NIC 工作队列里
- **One-sided**：peer 完全不知道、不参与——典型 RDMA write

具体到这个 example，第 `r` 个 put 干的事：

```
源: 我（rank=3）的 sendbuff[r * size, r * size + size)     ← 我准备给 r 的那段
目的: peer r 的 recvbuff[3 * size, 3 * size + size)        ← peer r 上"专属给 rank 3"的槽位
信号: peer r 上的 signal[signalIndex] += 1
```

**`ncclGin_SignalInc{signalIndex}` 是个 struct 字面量**——告诉 NIC："完成时给目标 signal[signalIndex] 做 increment 操作"。可能还有其他变体（比如 `SignalSet`、`SignalAtomic`），这里只用了 increment。

---

**`gin.waitSignal(scope, idx, target)` — 等指定 signal 达到目标值**

```c
gin.waitSignal(ncclCoopCta(), signalIndex, signalValue + devComm.nRanks);
```

**作用**：自旋等 `signal[idx] >= target_value`。

`scope = ncclCoopCta()` 表示**本 CTA 全员参与等待**——内部会先 `__syncthreads()`，然后选 1 个代表线程轮询信号值，其他线程等。

**这里的等待目标**：`signalValue (基线) + nRanks (应收到 N 次 +1)`。**意思**："等 N 个 peer 都给我发完 put"。

---

**`gin.flush(scope)` — 把自己发出去的 put 全部 ACK 完**

```c
gin.flush(ncclCoopCta());
```

**作用**：阻塞，直到本 CTA 之前调过的所有 `gin.put` **都被对端 NIC 收到并 ACK**（确认）。

**为什么 waitSignal 不够，还要 flush？** 因为两者关心的是**完全不同的方向**：

| 操作             | 关心的事                               |
| ---------------- | -------------------------------------- |
| `gin.waitSignal` | **入流**：有多少 put 到了我这里        |
| `gin.flush`      | **出流**：我发出去的 put 是否都 ACK 了 |

具体场景：

- 我（rank=3）给 8 个 peer 各发了一个 put
- waitSignal 等的是"其他 7 个 rank 都给我 rank=3 发了 put" → 关注**我收**
- flush 等的是"我发给那 8 个 peer 的 put 都送达了" → 关注**我发**

**只有两者都 OK，本 kernel 才能安全退出**——退出后下个 kernel 可能立刻读 recvbuff 或者再启 AlltoAll，必须保证所有数据流都已经"落地"。

`scope = ncclCoopCta()` 表示 flush 本 CTA 在这个 context 上发出的所有操作。



### 6.3 hybrid

混合模式，节点内 peer 走 LSA 直接 store，跨节点 peer 走 GIN put。

之前章节里 team 一直是"摆设"——LSA 例子里 `ncclTeamLsa` 就是所有 rank（因为 nLsaTeams==1），GIN 例子里 `ncclTeamWorld` 也是所有 rank。

```c
ncclTeam world = ncclTeamWorld(devComm);   // 所有 rank
ncclTeam lsa   = ncclTeamLsa(devComm);     // 本节点能 LSA 互访的 rank（子集）
```

具体例子（16 卡跨 2 节点）：

```
全局视图：
  node 0: world ranks 0,1,2,3,4,5,6,7
  node 1: world ranks 8,9,10,11,12,13,14,15

我是 world rank 10：
  world.rank = 10, world.nRanks = 16
  lsa.rank   = 2,  lsa.nRanks   = 8    ← 我在 node 1 的 LSA team 里是第 3 个
```

**`ncclBarrierSession` —— 拓扑感知 barrier**

```c
ncclBarrierSession<ncclCoopCta> bar {
    ncclCoopCta(), ncclTeamTagWorld(), gin, blockIdx.x
};
bar.sync(ncclCoopCta(), cuda::memory_order_acquire, ncclGinFenceLevel::Relaxed);
```

| Barrier 类型             | 路径                                  | 适用                   |
| ------------------------ | ------------------------------------- | ---------------------- |
| `ncclLsaBarrierSession`  | 纯 NVLink                             | LSA team 内            |
| `ncclGinBarrierSession`  | 纯网络                                | world team，全部走网络 |
| **`ncclBarrierSession`** | **节点内 LSA + 跨节点 GIN（自适应）** | world team，最优路径   |

对用户透明，NCCL 内部按拓扑选路径。需要传 `gin` 因为可能用到 GIN 资源做跨节点同步。
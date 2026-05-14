---
title: PASO 笔记
categories: [笔记]
tags: [AI, AI Infra, CUDA, 论文]
date: 2026-05-12
---

看 PASO 源码时记的混乱笔记。

包含pytorch的工作流，nccl的torch api简单介绍。

<!--more-->

# 看传统单卡串行训练方法

## PyTorch autograd 

训练神经网络的核心循环：
$$
\theta_{\text{new}} = \theta_{\text{old}} - \text{lr} \cdot \frac{\partial L}{\partial \theta}
$$
我们要的是 **每个参数 $\theta$ 对 loss 的偏导 $\frac{\partial L}{\partial \theta}$**。

模型有几百万参数，loss 是通过几十层运算算出来的。手动写一遍链式求导不可能。**autograd 就是自动求导的机器**。

历史上有两种自动求导：

**静态图（TF 1.x、早期 Caffe）**：用户先用 API 描述整个计算图（symbolic），框架编译后再喂数据。优点：可以全图优化。缺点：写起来像两种语言，debug 噩梦。

**动态图（PyTorch、新版 TF eager）**：用户像写普通 Python 一样写运算，框架**一边跑一边记录**。跑完之后能反向遍历那段历史。优点：直觉。缺点：每次都要重建。

**PyTorch 选了动态图**。所谓"计算图"，其实就是 PyTorch 一边算一边偷偷记下来的"操作历史"。



PyTorch 在每个 tensor 上挂了几个特殊属性：

| 属性            | 含义                                                        |
| --------------- | ----------------------------------------------------------- |
| `requires_grad` | bool。这个 tensor 是否参与梯度计算？                        |
| `grad_fn`       | 这个 tensor 是被哪个 op 算出来的？指向那个 op 的"反向节点"  |
| `grad`          | 该 tensor 的累积梯度（只对 leaf tensor 有意义）             |
| `is_leaf`       | bool。是不是图的"叶子"（用户直接创建的，或 `nn.Parameter`） |

leaf tensor：你**直接创建**的，不是任何 op 算出来的。比如 `torch.tensor([1,2,3])`、`torch.zeros(10)`、`nn.Parameter(...)`。它们 `grad_fn=None`。

non-leaf tensor：由 op 算出来的中间结果。它的 `grad_fn` 指向产生它的那个 op 的反向节点。

举例：

```python
import torch

x = torch.tensor([2.0], requires_grad=True)   # leaf
y = x * 3                                      # = [6.0]
z = y + 1                                      # = [7.0]
loss = z ** 2                                  # = [49.0]
```

跑完这 4 行，每个 tensor 长这样：

| tensor | 值   | requires_grad | is_leaf | grad_fn         |
| ------ | ---- | ------------- | ------- | --------------- |
| `x`    | 2.0  | True          | True    | `None`          |
| `y`    | 6.0  | True          | False   | `<MulBackward>` |
| `z`    | 7.0  | True          | False   | `<AddBackward>` |
| `loss` | 49.0 | True          | False   | `<PowBackward>` |

**两个关键现象**：

1. **`requires_grad` 是"传染"的**：`x` 标了 True，所有用到 `x` 的运算结果都自动 True。你不用一路手动标。
2. **`grad_fn` 是"向后指针"**：每个 non-leaf tensor 知道是谁创造了它。把所有 `grad_fn` 串起来，就是一张反向图：

```
x (leaf) ◀── MulBackward(.next = x's grad_fn=None)
                  ▲
                  │ 通过 y.grad_fn 找到
                  │
                  y ◀── AddBackward
                            ▲
                            │ 通过 z.grad_fn 找到
                            │
                            z ◀── PowBackward
                                      ▲
                                      │ 通过 loss.grad_fn 找到
                                      │
                                      loss

```

graph **不是 forward 时显式建出来的**，是每个 tensor 自带 `grad_fn` 指针，沿着指针能反推回 leaf。这就是"PyTorch 的计算图"。

```python
loss.backward()
```

从 `loss` 出发，沿着 `grad_fn` 指针反向走，**一步步用链式法则算梯度**：



```
loss → PowBackward:     dloss/dz = 2z = 14
                        把 14 推给 z 的 grad_fn

       AddBackward:     dz/dy = 1
                        累计：dloss/dy = dloss/dz · dz/dy = 14 · 1 = 14
                        推给 y 的 grad_fn

       MulBackward:     dy/dx = 3
                        累计：dloss/dx = dloss/dy · dy/dx = 14 · 3 = 42
                        推给 x 的 grad_fn

       (x 是 leaf, 没有 grad_fn, 但有 AccumulateGrad 节点)
       AccumulateGrad:  x.grad += 42
```

跑完 `print(x.grad)` 会打印 `tensor([42.])`。✓

**这就是 backward 的全部流程**：沿着 grad_fn 反向走，每个节点算自己的局部导数，乘上传过来的"上游梯度"，再传给下一个节点。leaf 的 `grad` 字段被 `AccumulateGrad` 写入。



为什么 forward 的激活不能立刻释放？

每个 `*Backward` 节点要算梯度，**必须知道 forward 时的中间值**。比如：

- `y = x * 3` 的 backward 要算 `dy/dx = 3`（常数，不耗显存）
- `y = x²` 的 backward 要算 `dy/dx = 2x`（**需要 x**）
- `y = ReLU(x)` 的 backward 要算 `dy/dx = (x > 0 ? 1 : 0)`（需要 x 或 y）
- `y = conv(x, w)` 的 backward 要算 `dy/dx, dy/dw`（**需要 x 和 w**）

每个 op 自己声明"我要保存哪些 tensor"。这些 tensor 被钉在对应的 `grad_fn` 节点上（"saved tensors"），autograd 持有引用。**这就是 forward 完后 activation 还活着的根本原因**——`grad_fn` 抓着它们不放。

backward 走到对应节点时，用完这些 saved tensor，就**释放引用**，refcount 归零，显存归还。



很关键的一点：**PyTorch 的计算图是按需建立、用完即焚的**。

- 每次 forward 都重新建一张新图
- `backward()` 走完一遍，所有 `grad_fn` 节点和 saved tensors 全部释放
- 下一次 forward 再建新图

为什么这样设计？因为 PyTorch 的 graph 跟 Python 控制流绑定。你可以写：

```python
def forward(x):
    for i in range(some_dynamic_n):
        if x.sum() > 0:
            x = self.layer_a(x)
        else:
            x = self.layer_b(x)
    return x
```

每次跑出来 graph 形状都可能不一样，PyTorch 照样能正确求导。这是 dynamic graph 最大优势。



`nn.Parameter` 跟普通 tensor 在图里啥区别？

`nn.Parameter` 就是个 `requires_grad=True` 的 leaf tensor，唯一额外功能是被 `nn.Module` 自动注册。

在计算图视角看：

- `nn.Parameter` 是 **leaf**
- 末端有 `AccumulateGrad` 节点
- backward 会把梯度写到 `.grad`

`inputs`（data）通常是普通 tensor，`requires_grad=False`。它是 leaf 但**不参与**梯度——autograd 走到它就停了。

所以 backward 实际只往 **`nn.Parameter`** 流梯度，不往 input 流（除非你显式 `inputs.requires_grad=True`，比如做对抗样本攻击时才需要）。



## 看一个完整代码

```python
class CNN(nn.Module):
    def __init__(self):
        super(CNN, self).__init__()
        self.conv1 = nn.Conv2d(3, 32, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)
        self.relu = nn.ReLU()
        self.fc1 = nn.Linear(64 * 8 * 8, 128)
        self.fc2 = nn.Linear(128, 10)

    def forward(self, x):
        x = self.pool(self.relu(self.conv1(x)))
        x = self.pool(self.relu(self.conv2(x)))
        x = x.view(-1, 64 * 8 * 8)
        x = self.relu(self.fc1(x))
        x = self.fc2(x)
        return x
```



## 模型定义 nn.Module

`nn.Parameter` 是 `torch.Tensor` 的子类，所以是向量，tensor。

区别是：

- 默认：`require_grad = True` ，标记这是一个希望被优化的tensor。
- `nn.Module` 会自动收集这些 require_grad 的参数，放到 model.parameters() 里。



```
self.conv1 = nn.Conv2d(3, 32, kernel_size=3, padding=1)
```

这一步，`nn.Conv2d(...).__init__` 内部：

```
self.weight = nn.Parameter(torch.empty(out_ch, in_ch, k, k)) 
self.bias   = nn.Parameter(torch.empty(out_ch))
self.reset_parameters()
```

此时他们的 `self.grad=None` 还没有存任何梯度的信息。



而 `.grad` 不是参数自己负责的，而是 `autograd` 引擎负责的。这一部分后续再讲。





## 优化器

```
optimizer = optim.AdamW(model.parameters(), lr=0.00085)
```

### `model.parameters()` 这一步在干什么？

`.parameter` 是 `nn.Module` 的一个生成器方法，不是 `list` 。他做的事：

1. 遍历 `self._parameters`（这个 module 直接拥有的 Parameter）
2. 对每个子 module（`self._modules`）递归调用 `parameters()`
3. **yield** 每一个 Parameter（返回的是引用，不是拷贝）

对于这个 CNN ：

```python
list(model.parameters())
# [
#   Parameter conv1.weight, shape [32, 3, 3, 3]
#   Parameter conv1.bias,   shape [32]
#   Parameter conv2.weight, shape [64, 32, 3, 3]
#   Parameter conv2.bias,   shape [64]
#   Parameter fc1.weight,   shape [128, 4096]
#   Parameter fc1.bias,     shape [128]
#   Parameter fc2.weight,   shape [10, 128]
#   Parameter fc2.bias,     shape [10]
# ]
```

这些 Parameter 对象都是在上一步 `.to(device)` 时创建好的，这一步只是把他们的引用喂给 `AdamW` ，不分配新显存。

### AdamW.\__init__ 在干什么？

```python
class AdamW(Optimizer):
    def __init__(self, params, lr=1e-3, betas=(0.9, 0.999),
                 eps=1e-8, weight_decay=1e-2, amsgrad=False):
        defaults = dict(lr=lr, betas=betas, eps=eps,
                        weight_decay=weight_decay, amsgrad=amsgrad)
        super().__init__(params, defaults)  # ← 关键：调用基类
```

把模型的参数引用和优化器本身的参数，传给基类 `Optimizer` 。

```python
class Optimizer:
    def __init__(self, params, defaults):
        self.defaults = defaults # 优化器参数
        self.state = defaultdict(dict)   # ← 空字典，关键！状态
        self.param_groups = []
        
        # 把传进来的 params 转成一个"参数组"
        param_groups = list(params)
        if not isinstance(param_groups[0], dict):
            param_groups = [{'params': param_groups}]
        for pg in param_groups:
            self.add_param_group(pg)
```

全部执行完后内存里：

```python
optimizer.param_groups  
# = [
#     {
#         'params': [conv1.weight, conv1.bias, ..., fc2.bias],  # 8 个 Parameter 引用
#         'lr': 0.00085,
#         'betas': (0.9, 0.999),
#         'eps': 1e-8,
#         'weight_decay': 0.01,
#         'amsgrad': False,
#         'maximize': False,
#         ... # 其他默认值
#     }
# ]

optimizer.state
# = defaultdict(dict, {})   ← 优化器的状态
```

这里为啥是 `param_groups` ？因为实际复杂工程里可能不同的参数用不同的超参数，比如：

```
optimizer = AdamW([
    {'params': model.backbone.parameters(),   'lr': 1e-5},  # 慢慢调骨干
    {'params': model.classifier.parameters(), 'lr': 1e-3},  # 头部学得快
], weight_decay=0.01)
```

这里先不管。



那么，`state` 里面是什么？是一个 `dict` ，key value是什么？

`state` 是个 `defaultdict(dict)`，键是 **Parameter 对象本身**（用 `id(param)` 作为字典 key 的语义），值是该 param 的状态字典。

他现在是空的，当优化器第一次执行到 `.step()` 时才会更新：

```python
state = self.state[param]    # defaultdict 会自动创建空 dict
if len(state) == 0:           # 第一次进
    state['step'] = torch.zeros(())
    state['exp_avg'] = torch.zeros_like(param)      # ← 这一刻才分配 +2.08MB
    state['exp_avg_sq'] = torch.zeros_like(param)   # ← 又分配 +2.08MB
    if amsgrad:
        state['max_exp_avg_sq'] = torch.zeros_like(param)
```

这里的参数是 Adam 家族数学公式里的中间变量。

最朴素的 SGD：$$\theta_{t} = \theta_{t-1} - \text{lr} \cdot g_t$$，只用当前梯度 $g_t$ 就能更新，不用任何 state 。这些 state 就是优化器里的记忆项。

`state['step']` 当前执行到了第几步。因为 Adam 公式里有 $\beta^t$，必须知道 $t$ 是多少。

`state['exp_avg']` 一阶矩 $m_t$ 梯度的动量。

数学定义：
$$
m_t = \beta_1 \cdot m_{t-1} + (1-\beta_1) \cdot g_t
$$
其中 $\beta_1 = 0.9$。这就是**梯度的指数移动平均（EMA）**。

展开看：
$$
m_t = (1-\beta_1)\left[g_t + \beta_1 g_{t-1} + \beta_1^2 g_{t-2} + \beta_1^3 g_{t-3} + \cdots\right]
$$
最近的梯度权重大，远的指数衰减。$\beta_1 = 0.9$ 时半衰期约 6.6 步，"有效记忆"长度 $\frac{1}{1-\beta_1} = 10$ 步。

直觉：**别只看最新一步的方向，看最近一段时间的"主流方向"**。如果连续 10 步都往某个方向走，就更确信这是真正的下降方向；如果方向震荡，$m_t$ 会自动平滑掉噪声。

模型里的每一个参数都要存一个动量参数，跟 `param` 同 shape 同 dtype ，所以加一倍参数大小。

`state['exp_avg_sq']` 二阶矩 $v_t$ 梯度平方的EMA。
$$
v_t = \beta_2 \cdot v_{t-1} + (1-\beta_2) \cdot g_t^2
$$
其中 $\beta_2 = 0.999$。注意 $g_t^2$ 是**逐元素**平方（不是矩阵平方）。

跟 `exp_avg` 像，只是平方过——估计每个维度上**梯度的能量/方差大小**。

$\beta_2 = 0.999$ 半衰期 ~693 步，有效记忆 1000 步，比一阶矩长得多。直觉：**梯度方向（一阶）变化快，但"梯度大小"（二阶/能量）相对稳，所以用更长的窗口估**。

进入 Adam 更新公式（不考虑 bias correction）：
$$
\theta_t = \theta_{t-1} - \text{lr} \cdot \frac{m_t}{\sqrt{v_t} + \epsilon}
$$
**核心思想**：用 $\sqrt{v_t}$（梯度能量的均方根 RMS）去**逐元素 normalize** 一阶矩。

- 某维度梯度一直很大（$v_t$ 大）→ 分母大 → 实际步长**小**
- 某维度梯度一直很小（$v_t$ 小）→ 分母小 → 实际步长**大**

效果：**每个参数自动获得自己的有效学习率**。这是 Adam 比 SGD 受欢迎的核心原因——你不用手调每层 lr，它自己适配。



用上 `step` —— bias correction

`exp_avg` 和 `exp_avg_sq` 初始化为 0，前几步会**朝 0 偏置**。

比如 $t=1$： $$m_1 = 0.9 \cdot 0 + 0.1 \cdot g_1 = 0.1 \cdot g_1$$

只有真实梯度的 10%！如果直接用，前期更新太小。

Adam 的修正：

$$\hat{m}_t = \frac{m_t}{1 - \beta_1^t}, \quad \hat{v}_t = \frac{v_t}{1 - \beta_2^t}$$

- $t=1$：分母 $1 - 0.9 = 0.1$，所以 $\hat{m}_1 = m_1 / 0.1 = g_1$ ✓ 还原了
- $t=10$：分母 $1 - 0.9^{10} \approx 0.65$，已经接近 1
- $t \to \infty$：分母 → 1，修正消失



目前为止，Adam 需要 2 个的 state + 1 个标量 step，总占用约 2 倍模型参数的大小。



`state['max_exp_avg_sq']` —— AMSGrad 变种用的

来源：2018 年 ICLR 论文 *"On the Convergence of Adam and Beyond"* 指出 Adam 在某些场景下**理论上不收敛**——因为 $v_t$ 可能在训练中变小，导致有效 lr 变大、震荡。

修正方案 AMSGrad：用 $\hat{v}_t$ 的**历史最大值**替代 $\hat{v}_t$，保证分母单调不减：
$$
\hat{v}*t^{\max} = \max(\hat{v}*{t-1}^{\max}, v_t) \\
\theta_t = \theta_{t-1} - \text{lr} \cdot \frac{\hat{m}_t}{\sqrt{\hat{v}_t^{\max}} + \epsilon}
$$
**这就是 `max_exp_avg_sq` 这个 buffer 的来源**：存历史最大的二阶矩。

显存开销 +1× 参数大小。**但实践里很少用**，因为：

- 性能未必比标准 Adam 好
- 多吃 1× 显存
- 默认 `amsgrad=False` 就不分配

回头看 PyTorch 源码里的 `if amsgrad:` 这层守卫——**只在用户显式开启时才分配**。这就是好的 lazy 设计。



而 PASO 的实现里：

```python
self.supported_keys = ['exp_avg', 'exp_avg_sq', 'max_exp_avg_sq', 'momentum_buffer']
for p in self.param_list:
    for key in self.supported_keys:
        if key not in self.optimizer.state[p]:
            self.optimizer.state[p][key] = torch.zeros_like(p, device=self.device)
```

不管用什么优化器，都分配这四个，这里一开始就有大问题。



## 第一次 forward & backward

```python
inputs, labels = next(data_iter)
inputs, labels = inputs.to(device), labels.to(device)
```

输入搬进显存：

`inputs.to(device)`：`[4096, 3, 32, 32]` fp32 = 4096·3·32·32·4 = **48.00MB** 
`labels.to(device)`：`[4096]` int64 = **32KB**



```python
optimizer.zero_grad()
outputs = model(inputs)
loss = criterion(outputs, labels)
loss.backward()
```



`optimizer.zero_grad()` 把每个参数的 `.grad` 清空。因为 PyTorch 的 backword 默认是累加到 `.grad` 上的，如果不清零，就会越叠越大。

所以每次计算 `.backword` 都会把梯度存下来，重新分配，涨到 2.08MB。下一轮 `zero_grad` 又把 grad 释放，降回去。



### `model(input)` 这一步发生了什么。

输入：

```
inputs:  shape=[4096, 3, 32, 32]  fp32
         = 4096 × 3 × 32 × 32 × 4 字节
         = 48.00 MB
```

这一步全是搬运到GPU的数据集。

`self.conv1(x)` —— 第一次卷积
$$
H_{\text{out}} = \left\lfloor \frac{H_{\text{in}} + 2 \cdot \text{padding} - \text{kernel}}{\text{stride}} \right\rfloor + 1 = \frac{32 + 2 - 3}{1} + 1 = 32
$$
输出：

```
conv1 out: [4096, 32, 32, 32]
         = 4096 × 32 × 32 × 32 × 4
         = 512.00 MB
```

`self.relu(...)` —— 第一个 ReLU

默认参数 `inplace=False` 即不是原地替换，会建一个新的 tensor 装结果，所以：

```
relu1 out: [4096, 32, 32, 32]  ← 又分配 512MB
```

`self.pool(...)` —— 第一次 max pooling

```
pool1 out: [4096, 32, 16, 16]  ← 128MB
```

`self.pool(self.relu(self.conv2(x)))` —— 第二组卷积块

跟前面一样走一遍：

```
conv2:  Conv2d(32, 64, k=3, p=1)
        in  [4096, 32, 16, 16]
        out [4096, 64, 16, 16]  ← +256MB

relu2:  ReLU(inplace=False)
        out [4096, 64, 16, 16]  ← +256MB

pool2:  MaxPool2d(2, 2)
        out [4096, 64, 8, 8]    ← +64MB
```

输出 tensor 形状 `[4096, 64, 8, 8]`，这是给 fc1 准备的"特征图"。

`x.view(-1, 64 * 8 * 8)` —— 不分配显存，只是改变形状。

`self.fc1(x)` —— 第一个全连接

```
fc1 out: [4096, 128]  ← 4096 × 128 × 4 = 2MB
```

`self.relu(self.fc1(x))` —— relu3

```
relu3 out: [4096, 128]  ← +2MB
```

`self.fc2(x)` —— 第二个全连接

```
fc2 out: [4096, 10]  ← 4096 × 10 × 4 = 160KB
```



### `loss.backward()`

autograd 从 `loss`（scalar）开始，沿着 forward 时记录的"计算链"反向走：

```
loss → CrossEntropy backward → fc2 backward → relu3 backward
     → fc1 backward → view backward → pool2 backward
     → relu2 backward → conv2 backward → pool1 backward
     → relu1 backward → conv1 backward → (停在 inputs，不再传)
```

每走过一个节点：

1. **用对应的 saved activation** 算出梯度
2. **释放那个 activation**（refcount 归零）

backward 进行时，allocated **持续下降**——因为前面占了 1.7GB 的激活一个个被释放。

举例反向走到 conv1 时：

- 用 `conv1_out` 算 dL/d(conv1.weight) 和 dL/d(conv1.bias)
- 用完立刻释放 `conv1_out`（512MB 一次性归还）
- 把 dL/d(conv1.weight) 写到 `conv1.weight.grad`（**第一次写：分配新 tensor，weight 大小 = 0.003MB**）
- 把 dL/d(conv1.bias) 写到 `conv1.bias.grad`（同上，128 字节）

整个 backward 走完，所有激活都被释放了，只有 **8 个 `.grad` tensor 留下**，总计 2.08MB。





### optimizer.step()

```python
@torch.no_grad()                              # ← 关键装饰器，下面会讲
def step(self, closure=None):
    for group in self.param_groups:           # 遍历每个参数组
        beta1, beta2 = group['betas']
        lr = group['lr']
        wd = group['weight_decay']
        eps = group['eps']
        
        # 收集这一组所有有梯度的 param
        params_with_grad, grads, exp_avgs, exp_avg_sqs, state_steps = [], [], [], [], []
        
        for p in group['params']:
            if p.grad is None:               # 没梯度的跳过
                continue
            
            state = self.state[p]            # 取出这个 param 的 state
            
            if len(state) == 0:              # ★ 第一次：lazy 分配 ★
                state['step']       = torch.zeros(())
                state['exp_avg']    = torch.zeros_like(p)     # +2.08MB
                state['exp_avg_sq'] = torch.zeros_like(p)     # +2.08MB
            
            params_with_grad.append(p)
            grads.append(p.grad)
            exp_avgs.append(state['exp_avg'])
            exp_avg_sqs.append(state['exp_avg_sq'])
            state_steps.append(state['step'])
        
        # 真正干活的核函数（in-place 更新这堆 tensor）
        _fused_adamw(
            params_with_grad, grads,
            exp_avgs, exp_avg_sqs, state_steps,
            beta1=beta1, beta2=beta2, lr=lr,
            weight_decay=wd, eps=eps,
        )

```



```python
with torch.no_grad():
    y = model(x)
```

在这个 `with` 块里，PyTorch 做两件事：

1. **新创建的所有 tensor 强制 `requires_grad=False`**（即使输入是 `requires_grad=True` 的 Parameter）
2. **不为这些 tensor 创建 `grad_fn`**（也不保存 saved tensors）

后果：

- **没有图被构建** → backward 没法跑（试图 `.backward()` 会报错"tensor has no grad_fn"）
- **不用保存 activations** → 显存大幅下降（!! 这是 inference 时 batch_size 能开到训练时几倍的原因）
- **速度也快一点** → 不用记录这些"小标签"



# NCCL

## 基本介绍

**NCCL** (NVIDIA Collective Communications Library) 是 NVIDIA 写的一个 GPU 间通信库。你可以把它理解成"GPU 版的 MPI":

- **数据通路**:同一台机器内,优先走 **NVLink** (A100 之间约 600 GB/s),没有 NVLink 就走 PCIe;跨机器走 InfiniBand 或 TCP。重点是 **GPU↔GPU 直传,不经过 CPU 内存**。
- **接口形式**:每次通信都是"一个 tensor 一次操作"。tensor 必须是 **CUDA 上的连续内存** (`.is_contiguous() == True`)——否则要么报错要么内部偷偷帮你 copy 一遍。

- **执行模型**:NCCL 把通信打包成 CUDA kernel 提交到一个 stream,不阻塞 CPU(stream 上排队)。但 PyTorch 的 `dist.send/recv` 是"提交完就返回,等下次同步时才真等完",所以 **看起来同步但其实异步**——这点先记住,后面有用。

    > 没看懂执行模型的意思，

### NCCL 在 PyTorch 里的用法

```python
dist.init_process_group(backend="nccl")        # 用 NCCL 后端
torch.cuda.set_device(local_rank)              # 每个进程绑一张 GPU
```

`torchrun --nproc_per_node=8` 会启动 8 个进程,每个进程通过 NCCL 加入一个通信组 (communicator),拿到自己的 `RANK` (0..7) 和 `WORLD_SIZE` (8)。这就是 [cv_nccl.py:503-505](vscode-webview://1h7jfe10vnfk0mrmergdep85l48lihgh6djtabqi8h96eu9rsosn/cv_nccl.py#L503-L505) 干的事。

### PyTorch 给 NCCL 的两类接口

**集合通信 (collective)** — 所有 rank 都得参与,语义"对齐":

| API                              | 做什么                                                    |
| -------------------------------- | --------------------------------------------------------- |
| `dist.broadcast(tensor, src)`    | 把 src 的 tensor 复制到所有 rank                          |
| `dist.all_reduce(tensor)`        | 所有 rank 的 tensor 元素求和(或其他 op),结果发回所有 rank |
| `dist.gather(tensor, list, dst)` | 所有 rank 把 tensor 送到 dst,dst 收到一个 list            |
| `dist.all_gather(list, tensor)`  | 所有 rank 都收到一个 list                                 |
| `dist.reduce_scatter`            | 求和后切片分给各 rank (ZeRO 的核心原语)                   |

**点对点 (P2P)** — 只有两个 rank 参与:

| API                      | 做什么                                              |
| ------------------------ | --------------------------------------------------- |
| `dist.send(tensor, dst)` | 发给 dst                                            |
| `dist.recv(tensor, src)` | 从 src 收,**写到调用者提供的 tensor 里** (in-place) |

### 各 API 的最小例子

下面所有片段都假设这样启动:

```bash
torchrun --nproc_per_node=4 demo.py
```

公共初始化代码 (后面例子省略):

```python
import os
import torch
import torch.distributed as dist

dist.init_process_group(backend="nccl")
rank = dist.get_rank()
world_size = dist.get_world_size()
torch.cuda.set_device(int(os.environ["LOCAL_RANK"]))
```

> 三条铁律: ① **所有参与的 rank 都要调用**同一个 API; ② tensor 必须在 **CUDA** 上且**形状/dtype 一致**; ③ 接收方提前准备**占位 tensor**, 数据是 **in-place** 写入。

#### 1. `broadcast` — 一对多复制

```python
if rank == 0:
    tensor = torch.tensor([1., 2., 3., 4.], device="cuda")
else:
    tensor = torch.zeros(4, device="cuda")   # 占位,会被覆盖

print(f"[rank {rank}] before: {tensor.tolist()}")
dist.broadcast(tensor, src=0)
print(f"[rank {rank}] after : {tensor.tolist()}")
```

输出 (rank 顺序可能乱):

```text
[rank 0] before: [1.0, 2.0, 3.0, 4.0]
[rank 1] before: [0.0, 0.0, 0.0, 0.0]
[rank 2] before: [0.0, 0.0, 0.0, 0.0]
[rank 3] before: [0.0, 0.0, 0.0, 0.0]
[rank 0] after : [1.0, 2.0, 3.0, 4.0]   ← src 自己不变
[rank 1] after : [1.0, 2.0, 3.0, 4.0]   ← 被覆盖
[rank 2] after : [1.0, 2.0, 3.0, 4.0]
[rank 3] after : [1.0, 2.0, 3.0, 4.0]
```

> 典型用途: 训练开始时把 rank 0 加载的模型权重同步到所有 rank (DDP 初始化就干这事)。

#### 2. `all_reduce` — 全员求和后回发

```python
tensor = torch.tensor([rank + 1.0], device="cuda")
print(f"[rank {rank}] before: {tensor.tolist()}")
dist.all_reduce(tensor, op=dist.ReduceOp.SUM)
print(f"[rank {rank}] after : {tensor.tolist()}")
```

输出:

```text
[rank 0] before: [1.0]
[rank 1] before: [2.0]
[rank 2] before: [3.0]
[rank 3] before: [4.0]
[rank 0] after : [10.0]   ← 1+2+3+4, 所有 rank 都拿到同样的结果
[rank 1] after : [10.0]
[rank 2] after : [10.0]
[rank 3] after : [10.0]
```

> 数据并行同步梯度的核心: 每个 rank 算各自 batch 的梯度, all_reduce 求和(再除以 world_size 就是平均梯度)。也可以传 `op=dist.ReduceOp.AVG` 让 NCCL 直接给你算平均。

#### 3. `gather` — 多对一收集

```python
tensor = torch.tensor([rank + 1.0], device="cuda")

if rank == 0:
    gather_list = [torch.zeros(1, device="cuda") for _ in range(world_size)]
else:
    gather_list = None   # 非 dst rank 传 None

dist.gather(tensor, gather_list=gather_list, dst=0)

if rank == 0:
    print(f"[rank 0] gathered: {[t.tolist() for t in gather_list]}")
else:
    print(f"[rank {rank}] my tensor unchanged: {tensor.tolist()}")
```

输出:

```text
[rank 0] gathered: [[1.0], [2.0], [3.0], [4.0]]   ← 只有 dst 拿到完整 list
[rank 1] my tensor unchanged: [2.0]
[rank 2] my tensor unchanged: [3.0]
[rank 3] my tensor unchanged: [4.0]
```

> ⚠️ NCCL 后端**不支持 gather**(只支持 all_gather), 需要用 gloo 后端, 或者直接用 all_gather 代替。

#### 4. `all_gather` — 多对多收集

```python
tensor = torch.tensor([rank + 1.0], device="cuda")
gather_list = [torch.zeros(1, device="cuda") for _ in range(world_size)]

dist.all_gather(gather_list, tensor)
print(f"[rank {rank}] gathered: {[t.tolist() for t in gather_list]}")
```

输出:

```text
[rank 0] gathered: [[1.0], [2.0], [3.0], [4.0]]
[rank 1] gathered: [[1.0], [2.0], [3.0], [4.0]]   ← 每个 rank 都拿到完整 list
[rank 2] gathered: [[1.0], [2.0], [3.0], [4.0]]
[rank 3] gathered: [[1.0], [2.0], [3.0], [4.0]]
```

> 张量并行 (TP) 常用: 各 rank 算了输出矩阵的一部分列, all_gather 拼回完整 tensor。

#### 5. `reduce_scatter` — 求和后切片分发

为了让"切片"效果直观, 让每个 rank 输入不同的数据:

```python
# input_list[i] 是要参与第 i 片 reduce 的数据
# 第 i 片的值 = (rank+1) * (i+1), 这样每个位置全员求和后值不同
input_list = [torch.tensor([(rank + 1) * (i + 1)], dtype=torch.float, device="cuda")
              for i in range(world_size)]
print(f"[rank {rank}] input : {[t.tolist() for t in input_list]}")

output = torch.zeros(1, device="cuda")
dist.reduce_scatter(output, input_list)
print(f"[rank {rank}] output: {output.tolist()}")
```

输出:

```text
[rank 0] input : [[1.0], [2.0], [3.0],  [4.0]]
[rank 1] input : [[2.0], [4.0], [6.0],  [8.0]]
[rank 2] input : [[3.0], [6.0], [9.0],  [12.0]]
[rank 3] input : [[4.0], [8.0], [12.0], [16.0]]

# 中间过程 (概念上, 不会真实存在):
# 第 0 位求和: 1+2+3+4 = 10
# 第 1 位求和: 2+4+6+8 = 20
# 第 2 位求和: 3+6+9+12 = 30
# 第 3 位求和: 4+8+12+16 = 40
# 然后切片分发:

[rank 0] output: [10.0]   ← 拿第 0 片
[rank 1] output: [20.0]   ← 拿第 1 片
[rank 2] output: [30.0]   ← 拿第 2 片
[rank 3] output: [40.0]   ← 拿第 3 片
```

> ZeRO-2/3 的核心原语: 梯度求和后, 每个 rank 只保留自己负责的那一份分片, 显存省 N 倍。
> 概念上 `reduce_scatter` ≈ `all_reduce + scatter`, 但通信量只有 all_reduce 的一半。

#### 6. `send` / `recv` — 点对点传输

```python
if rank == 0:
    tensor = torch.tensor([1., 2., 3., 4.], device="cuda")
    print(f"[rank 0] sending     : {tensor.tolist()}")
    dist.send(tensor, dst=1)
elif rank == 1:
    tensor = torch.zeros(4, device="cuda")
    print(f"[rank 1] before recv : {tensor.tolist()}")
    dist.recv(tensor, src=0)
    print(f"[rank 1] after  recv : {tensor.tolist()}")
# rank 2, 3 不参与, 不要调用
```

输出:

```text
[rank 0] sending     : [1.0, 2.0, 3.0, 4.0]
[rank 1] before recv : [0.0, 0.0, 0.0, 0.0]
[rank 1] after  recv : [1.0, 2.0, 3.0, 4.0]   ← 原地写入
```

> Pipeline 并行的相邻 stage 之间用它传 activation (forward) 和 gradient (backward)。
> 注意 `recv` 的 tensor 是**调用方自己分配**的, NCCL 把数据原地写进去。

#### 速查: 通信量对比 (单位: 单 rank 收发的字节数, 设单个 tensor 大小 = `M`)

| 操作              | 单 rank 通信量 | 备注                          |
| ----------------- | -------------- | ----------------------------- |
| `broadcast`       | `M`            | 树形/环形实现                 |
| `all_reduce`      | `2M(N-1)/N`    | ring all-reduce 的经典结论    |
| `all_gather`      | `M(N-1)/N`     | 每个 rank 只发自己那 1/N      |
| `reduce_scatter`  | `M(N-1)/N`     | 和 all_gather 对称            |
| `send`/`recv`     | `M`            | 仅两个 rank 参与              |



# TODO（后续内容不要看了，太乱了随手记的）

- [ ] 兼容PyTorch标准
- [ ] 优化器状态，现在无论选择什么都分配四个 state ，这里问题很大，根据不同优化器选择至少有 1~4 倍的冗余。
- [ ] 现在的设计要求一个GPU必须能塞下整个模型的参数，llm.py里的实现也是能单卡训练的模型。所以如果要训练更大的模型，必须要多卡存放参数。
- [ ] DeepSpeed在进行GPU通信的时候同时在做backward，实现流水线覆盖。PASO目前实现是没有的。现在代码里定义了两个桶，flat_buffer和grad_buffer，但是用的同步 `dist.send/recv` ，没有实现overlap，还额外空分配了200MB的显存。
- [ ] 可以用集和通信的API（就是昨天说的reduce这些），在发消息的过程就就完成Model Update的减法计算。

昨天说NCCL导致了额外的显存占用，我这个没有发现。现在NCCL占用的显存是固定的桶大小，额外的NCCL占用是很小的。所以NCCL部分造成的开销是固定的，大约1G左右，肯定不是瓶颈。



1. **`supported_keys` 硬编码 + 强制预分配**: 简化了握手协议(mask 恒为 1)和 dest 端的 `view(-1).copy_(...)` 风格,但代价是上面那 2N 的浪费。**更省内存的方案**: 第一次真正调用 `optimizer.step()` 后,根据 `optimizer.state` 实际出现了哪些 key,**懒初始化** dest 端的同名 buffer,握手时 mask 才有意义。
   
2. **`_sync_optimizer_state` 全键全传**: 即使 `max_exp_avg_sq`、`momentum_buffer` 是零张量,也照传不误。每次窗口滑动 (一般每轮训练都触发) 都浪费 2N × FP32 的 P2P 带宽。
   
3. **`dist.send/recv` 全是 blocking**: 文件 docstring 说 "non-blocking P2P",但代码里没看到 `isend/irecv` 或 `wait()`。bucket 间没有 overlap,理论上可以用 `isend`+流水线把通信和打包重叠,但当前实现没做。
   
4. **`error_tensor.item()` 在主循环里反复调用**: L339 `error = self.error_tensor.item()`。`.item()` 会触发 `cudaDeviceSynchronize`,这在 NCCL 流上意味着每步都要 GPU↔CPU 同步一次,断流水。可以保留在 GPU 上做比较,直到必须看具体数值再 `.item()`。
   
5. **`begin_idx + rank_order` 越界但仍 forward**: L552 检查了 `if begin_idx + rank_order < max_steps` 跳过越界 rank,但**它们仍参与 gather/broadcast/sync**,只是不上报真实 metric。逻辑没错,但接近 `max_steps` 时会有"幽灵 rank"参与同步,这部分通信被浪费。



## 1/2 激活函数state重复

为啥有四个 stage，为什么作者要这么写?看注释 [cv_nccl.py:248-253](vscode-webview://1h7jfe10vnfk0mrmergdep85l48lihgh6djtabqi8h96eu9rsosn/cv_nccl.py#L248-L253):

```python
# We assume all keys are "active" since we pre-allocated them.
# Or we can check if they are non-zero if we want to save bandwidth (optional optimization).
# For strict correctness and simplicity here: we sync all supported keys.
for idx in range(len(SUPPORTED_KEYS)):
    self.found_keys_mask[idx] = 1.0 
```

但是这个预分配也可以只分配一次，我觉得显存爆炸的点在这。

## 3 dist.send 数据搬运和发送流水串行

`dist.send` 

```python
offset = 0
for p in bucket:
    active_buffer[offset:offset+p.numel()].copy_(p.data.view(-1))
    offset += p.numel()
dist.send(tensor=active_buffer, dst=target_rank)
```

每个循环都是从 `active_buffer` 的开头开始分配，紧接着马上发送。

这里数据搬运和发送的流水是串行的。（访问的同一段显存，NCCL会在stream里被迫串行）

可以改成 2 buffer，搬运和send并行起来。

改动：

```python
# 准备阶段:分配双 buffer
self.flat_buffers = [torch.zeros(max_bucket, device=device) for _ in range(2)]

# 通信阶段
works = []
for k, bucket in enumerate(self.buckets):
    buf = self.flat_buffers[k % 2][:b_size]   # 双 buffer
    pack_into(buf, bucket)
    works.append(dist.isend(buf, dst=target)) # isend，cpu上也可以并行一下
for w in works:
    w.wait()
```



## flat_buffer grad_buffer冗余

另外我们这里用了两个 

```python
active_buffer = self.flat_buffer[:b_size]
active_grad_buffer = self.grad_buffer[:b_size]
```

FSDP 里是这样写的，但是FSDP那里的参数和梯度是并发的

### 场景 A: FSDP / ZeRO-3 —— 双 buffer 真的能并发

FSDP 把参数**分片**存:每个 rank 只持有 `1/N` 的参数。训练时:

```
forward 第 L 层:
  all-gather(param_L)         ─→ 拿到完整参数
  compute forward(param_L)
  丢弃 gather 来的完整参数

backward 第 L 层:
  all-gather(param_L)         ─→ 拿到完整参数(又一次)
  compute backward → grad_L
  reduce-scatter(grad_L)      ─→ 把梯度分片回各 rank
```

**关键**: backward 是**逐层逆序**进行的。当**第 L 层正在 reduce-scatter 它的 grad** 时,**第 L-1 层(下一个要算的)正在 all-gather 它的 param**——这两个 NCCL op 在不同的 stream 上**真的并发执行**。

时间线 (双 buffer 场景):

```
NCCL stream A (param):    [AG L-1 param]  [AG L-2 param]  [AG L-3 param]  ...
NCCL stream B (grad):     [RS L grad]     [RS L-1 grad]   [RS L-2 grad]   ...
                                ↑                ↑
                          这两个 op 用的是不同的物理 buffer,
                          所以可以在 GPU 上同时跑

时间 →
```

这里**两个 buffer 的物理显存是同时被读写的**(stream A 在写 param_buffer,stream B 在读 grad_buffer)。如果合并成一个 buffer,会有 RAW/WAW 冲突,**功能上就坏了**。

所以 FSDP 的双 buffer 不是"为了好看",是**算法依赖**:backward 的流水线要求参数通信和梯度通信能并发。

------

### 场景 B: PASO P2P —— 双 buffer 不可能并发

回到 cv_nccl.py 的 root_rank 代码 [cv_nccl.py:336-340](vscode-webview://1h7jfe10vnfk0mrmergdep85l48lihgh6djtabqi8h96eu9rsosn/cv_nccl.py#L336-L340):

```python
self._process_buckets(mode='send_params', ...)   # flat_buffer
dist.recv(self.error_tensor, ...)                 # 标量
self._process_buckets(mode='recv_grads', ...)    # grad_buffer
```

PASO 的协议依赖链:

```
root 发参数 → worker 收参数 → worker 算 error → worker 发 error → root 收 error
                                                              ↓
                                                          worker 发 grad → root 收 grad
```

**root 发完参数后,grad_buffer 里啥都没有,因为 worker 还没发**;**root 在收 grad 时,flat_buffer 已经空了,因为参数早发完了**。两个 buffer 的"忙时段"在时间上**互不重叠**:

```
NCCL stream:    [send flat_buffer]  [等 worker]  [recv error]  [等 worker]  [recv grad_buffer]
                                     ↑                                       ↑
                                     这段 GPU/buffer 全闲                    这时 flat_buffer 已经闲了

时间 →
```

不管你给它分几个 buffer,**协议链强制串行**,GPU 上从来不会出现两个 buffer 同时被读写的瞬间。



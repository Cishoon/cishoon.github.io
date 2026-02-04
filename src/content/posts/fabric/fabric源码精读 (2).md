---
title: Hyperledger Fabric 源码精读（2）
categories: [笔记]
tags: [go, fabric, 区块链, 超级账本]
date: 2024-09-14
---

- 开坑，学习 Fabric 的源码。

- 思路是根据 `fabric-sample` 的 `test-network` 中的脚本，一行行分析。遇到里面使用的指令，看源码如何实现。

- 下面内容非常混乱，写的毫无逻辑，之后有空重新整理一遍。

- 一口气写完太长了，typora里会卡，分章节发。

- 学习笔记，不保证内容正确性。

<!--more-->



# 2 createChannel

`network.sh` 的注释里明确说明，这个函数干了两件事：

1. join the peers of org1 and org2：加入两个组织的对等节点
2. update the **anchor peers** for each organization：更新每个组织的锚定节点

我完善一下：

1. 创建创世区块
2. 利用创世区块创建通道
3. 加入对等节点
4. 更新锚定节点



## 2.1 创建创世区块

test-network 的脚本固定由第一个组织进行创世区块的创建。

创建创世区块的核心语句是：

```shell
configtxgen -profile ChannelUsingRaft -outputBlock ./channel-artifacts/${CHANNEL_NAME}.block -channelID $CHANNEL_NAME
```

接下来看看configtxgen

### 2.1.1 configtxgen

| 选项                   | 描述                                        |
| ---------------------- | ------------------------------------------- |
| `-channelID string`    | 指定在配置交易中使用的通道ID。              |
| `-configPath string`   | 指定包含要使用配置的路径。                  |
| `-inspectBlock string` | 打印指定路径区块中包含的配置。              |
| `-outputBlock string`  | 指定写入创世区块的路径。                    |
| `-profile string`      | 指定 `configtx.yaml` 中用于生成的配置文件。 |

这个工具的输出主要受 `configtx.yaml` 文件内容的控制。

默认情况下，`configtxgen` 工具会依次尝试从 `$FABRIC_CFG_PATH` 环境变量指定的路径，当前路径和 `/etc/hyperledger/fabric` 路径下查找 `configtx.yam` 配置文件并读入，作为默认的配置。或者使用参数的 `-configPath` 定义。环境变量中以`CONFIGTX_` 前缀开头的变量也会被作为配置项。

很多功能都被启用了，好像唯一的功能就是创建创世区块？



在源码中，创建创世区块的核心代码都是由 `protoutil` 这个包实现的。

### 2.1.2 protoutil

`protoutil` 是 Hyperledger Fabric 中的一个实用工具，用于处理和操作协议缓冲区（protobuf）格式的数据。Hyperledger Fabric 使用协议缓冲区（Protobuf）作为其内部数据结构的主要序列化格式，而 `protoutil` 提供了一组工具和函数来简化这些数据的创建、解析、和转换过程。

具体来说，`protoutil` 可能包括以下功能：

- 序列化和反序列化 Protobuf 消息。
- 生成交易提案和区块。
- 解析和检验区块数据结构。
- 操作链码提案、响应和其他相关的 Protobuf 消息。

这些功能对于开发和维护 Fabric 网络至关重要，因为它们简化了与 Fabric 内部数据结构的交互。



什么是协作缓冲区 Protobuf ？https://protobuf.com.cn/overview/

简言之就是类似 Json 但比 Json 更紧凑轻量的数据格式。一个区块，无非就是一个键值对，里面存的数据不同而已。

| Field                 | Type                | Description                               |
| --------------------- | ------------------- | ----------------------------------------- |
| `Header`              | `*cb.BlockHeader`   | Contains metadata about the block itself. |
| `Header.Number`       | `uint64`            | The sequence number of the block.         |
| `Header.PreviousHash` | `[]byte`            | The hash of the previous block.           |
| `Header.DataHash`     | `[]byte`            | The hash of the block's data.             |
| `Data`                | `*cb.BlockData`     | Contains the actual data of the block.    |
| `Metadata`            | `*cb.BlockMetadata` | Contains metadata for the block.          |
| `Metadata.Metadata`   | `[][]byte`          | Array of metadata entries.                |

创世区块具体的值如下：

- `Header.Number`：`0`，因为这是创世区块。
- `Header.PreviousHash`：`nil`，因为这是创世区块，没有前一个区块。
- `Header.DataHash`：由`protoutil.ComputeBlockDataHash(block.Data)`计算得出。
- `Data`：包含一个`cb.Envelope`，其`Payload`为`cb.Payload`，`Data`为`cb.ConfigEnvelope`。
- `Metadata.Metadata`：包含两个条目：
    - `cb.BlockMetadataIndex_LAST_CONFIG`：包含`cb.LastConfig{Index: 0}`。
    - `cb.BlockMetadataIndex_SIGNATURES`：包含`cb.OrdererBlockMetadata{LastConfig: &cb.LastConfig{Index: 0}}`。



然后把这个东西写入一个文件中 `./channel-artifacts/${CHANNEL_NAME}.block` 就完成了创世区块的创建。



## 2.2 创建通道

循环执行以下脚本：

```bash
. scripts/orderer.sh ${CHANNEL_NAME}> /dev/null 2>&1
```

> `.` 命令是 `source` 命令的简写形式，用于在当前 shell 环境中执行一个脚本文件。这意味着文件中的所有命令都会在当前 shell 中运行，而不会创建新的子 shell。这与直接执行脚本文件（如 `./script.sh`）不同，后者会创建一个新的子 shell 来运行脚本中的命令。



orderer.sh:

```bash
osnadmin channel join 
	--channelID ${channel_name} 
	--config-block ./channel-artifacts/${channel_name}.block 
	-o localhost:7053 
	--ca-file "$ORDERER_CA" 
	--client-cert "$ORDERER_ADMIN_TLS_SIGN_CERT" 
	--client-key "$ORDERER_ADMIN_TLS_PRIVATE_KEY" 
>> log.txt 2>&1
```

突然出现了一个新工具：`osnadmin`



### 2.2.1 osnadmin channel

OSN 是 Ordering Service Node 的缩写。osnadmin channel 命令允许管理员在排序节点上执行与通道相关的操作，例如**加入通道**、**列出排序节点已加入的通道**以及**移除通道**。必须启用通道参与API，并且在每个排序节点的 orderer.yaml 中配置Admin端点。

`osnadmin channel join`  干的事，就是向 `https://localhost:7053/participation/v1/channels` 发送了一个HTTP POST请求，请求体是上一步生成的创世区块。

顺便的，`osnadmin channel list` 就是向 `https://localhost:7053/participation/v1/channels/${channel-id}` 发送 HTTP GET 请求，如果不携带特定的 `channel-id` 就是返回所有通道。

`osnadmin channel remove`  干的事，就是向 `https://localhost:7053/participation/v1/channels` 发送了一个HTTP DELETE请求。



这里也表明了，`orderer` 启动的服务里应该有很多接口可调用。



## 2.3 对等节点加入通道

在排序节点上创建好了通道，接下来就是让对等节点加入通道。

同样是循环执行脚本：

```bash
peer channel join -b $BLOCKFILE >&log.txt
```

其中 `BLOCKFILE="./channel-artifacts/${CHANNEL_NAME}.block"` ，就是刚刚产生的创世区块。

这里的 `peer channel` 好像就是 `osnadmin channel` 的 `peer` 版。



### 2.3.1 peer channel join

- **ChannelCmdFactory**

    其中用到了一个工厂模式，`InitCmdFactory` ，`peer channel` 会根据不同的指令需求（是否需要背书、是否需要广播给对等节点、是否需要广播给排序节点）打包客户端。

    ```go
    // ChannelCmdFactory holds the clients used by ChannelCmdFactory
    type ChannelCmdFactory struct {
    	EndorserClient   pb.EndorserClient
    	Signer           msp.SigningIdentity
    	BroadcastClient  common.BroadcastClient
    	DeliverClient    deliverClientIntf
    	BroadcastFactory BroadcastClientFactory
    }
    ```

    执行 join 只需要背书，不需要广播给对等节点和排序节点。

- **getJoinCCSpec**

    听函数名字和链码有关，获取了一个链码的Spec，但是到目前为止我还没有创建过链码？先来看看源码：

    ```go
    func getJoinCCSpec() (*pb.ChaincodeSpec, error) {
    	if genesisBlockPath == common.UndefinedParamValue {
    		return nil, errors.New("Must supply genesis block file")
    	}
    
    	gb, err := os.ReadFile(genesisBlockPath)
    	if err != nil {
    		return nil, GBFileNotFoundErr(err.Error())
    	}
    	// Build the spec
    	input := &pb.ChaincodeInput{Args: [][]byte{[]byte(cscc.JoinChain), gb}}
    
    	spec := &pb.ChaincodeSpec{
    		Type:        pb.ChaincodeSpec_Type(pb.ChaincodeSpec_Type_value["GOLANG"]),
    		ChaincodeId: &pb.ChaincodeID{Name: "cscc"},
    		Input:       input,
    	}
    
    	return spec, nil
    }
    ```

    返回一个 ChaincodeSpec 结构体指针，类型指定为 GOLAN 语言，链码ID为 **cscc** ，并且还设置了这个链码的输入参数：`JoinChain: 创世区块字节码`

    **cscc**，其实是一个内置的系统链码 (System Chaincode)，全称为 **Configuration System Chaincode**。

    系统链码是由 Hyperledger Fabric 平台内置的特殊链码，负责处理一些核心功能。开发者不需要自己编写或部署这些系统链码，它们在 Fabric 网络启动时自动部署，并在整个网络中使用。

    JoinChain 这个函数用于将一个新的节点加入到现有的通道中。当调用 `cscc.JoinChain` 时，节点会使用给定的创世区块来加入指定的通道。

- **executeJoin(cf *ChannelCmdFactory, spec *pb.ChaincodeSpec)**

    最后，将上面两个函数得到的结果（工厂和spec），放到一起执行。

    ```go
    func executeJoin(cf *ChannelCmdFactory, spec *pb.ChaincodeSpec) (err error) {
    	// Build the ChaincodeInvocationSpec message
    	invocation := &pb.ChaincodeInvocationSpec{ChaincodeSpec: spec}
    	creator, err := cf.Signer.Serialize()
    
    	// 根据序列化的身份（signer）和链码调用规范（invocation）创建提案
    	var prop *pb.Proposal
    	prop, _, err = protoutil.CreateProposalFromCIS(pcommon.HeaderType_CONFIG, "", invocation, creator)
    
    	// 根据提案和签名者创建签名的提案
    	var signedProp *pb.SignedProposal
    	signedProp, err = protoutil.GetSignedProposal(prop, cf.Signer)
    
    	// EndorserClient 是背书服务的客户端 API。
    	// ProcessProposal 用于处理提案。
        
    	var proposalResp *pb.ProposalResponse
    	proposalResp, err = cf.EndorserClient.ProcessProposal(context.Background(), signedProp)
    
    	logger.Info("Successfully submitted proposal to join channel")
    	return nil
    }
    ```

    还是很清晰的，前两步准备好了请求客户端和要发送的数据，这一步签了名之后，直接调用`EndorserClient.ProcessProposal(context.Background(), signedProp)` 来执行提议。

    封装的很深，执行的逻辑还藏在这个函数里。这个函数奇妙，有一个 `context` 参数，上下文在这里是怎么用的？

- `EndorserClient.ProcessProposal`

    > // For semantics around ctx use and closing/ending streaming RPCs, please refer to https://godoc.org/google.golang.org/grpc#ClientConn.NewStream.

    这个是一个接口，这里使用的实现是 `perr.pb.go` 中的实现，具体代码如下：

    ```go
    type endorserClient struct {
    	cc *grpc.ClientConn
    }
    func (c *endorserClient) ProcessProposal(
            ctx context.Context, in *SignedProposal, 
            opts ...grpc.CallOption
        ) (*ProposalResponse, error) 
    {
    	out := new(ProposalResponse)
    	err := c.cc.Invoke(ctx, "/protos.Endorser/ProcessProposal", in, out, opts...)
    	if err != nil {
    		return nil, err
    	}
    	return out, nil
    }
    ```

    `c.cc` 就是结构体中定义的 `cc *grpc.ClientConn` 一个普通的客户端连接。

    主要方法和属性

    - `Invoke`：用于调用 RPC 方法。
    - `NewStream`：用于创建流式 RPC 调用。
    - `Target`：返回连接的目标地址。
    - `Close`：关闭连接并清理相关资源。
    - `State`：返回连接的当前状态（例如，`Ready`、`Connecting`、`Idle` 等）。
    - `WaitForStateChange`：等待连接状态发生变化。

    这里传了一个 `context.Context` 参数，目的是允许给用户提供控制权，用户可以通过 ctx 对这个grpc goroutine 进行取消、超时等操作。但是这段代码里没有在上层进行其他控制，所以直接传了一个 `context.Background()` 进去。

    关于 gRPC 和 context 的详细内容见文末的附录。



### 2.3.2 viper

但是我还有个疑问，`peer channel join` 的参数或者环境变量是在哪里设置的？之前的 `osnadmin` 直接在参数里设置全了，而 `peer` 却没有任何参数设置。

其实是 `network.sh` 设置了这个参数：

```shell
FABRIC_CFG_PATH=$PWD/../config/
```

在该文件夹里有一个 `core.yaml` 里面定义了所有配置，里面写死了：

```yaml
peer:
	address:
		localhost:7051
```

另外，`setGlobals` 函数设置了全局变量，用于切换两个组织的配置：

```bash
  if [ $USING_ORG -eq 1 ]; then
    export CORE_PEER_LOCALMSPID=Org1MSP
    export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_ORG1_CA
    export CORE_PEER_MSPCONFIGPATH=...org1...
    export CORE_PEER_ADDRESS=localhost:7051
  elif [ $USING_ORG -eq 2 ]; then
    export CORE_PEER_LOCALMSPID=Org2MSP
    export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_ORG2_CA
    export =...org2...
    export CORE_PEER_ADDRESS=localhost:9051
  fi
```

前三个变量来区别组织1和组织2的证书、MSP，最后一个变量区分节点的监听地址。

（test-network 中一个组织只有一个节点。实际上，同一个组织下会有多个节点，他们的前三个变量相同，最后一个参数不同）



这里我很奇怪，怎么又是环境变量，又是配置文件，他们的命名方式都不一样，甚至环境变量还多了一个前缀 `CORE` 这怎么关联上的？

fabric 用了一个 go 的开源库 `viper` ，其功能就是很方便的从配置文件中读取值，也能使用环境变量去覆盖配置文件里的值。他会自动解析环境变量，并把变量名小写、将下划线替换。并且源码中还有：

```go
viper.SetEnvPrefix("CORE")
```

显而易见，是设置了环境变量的前缀为 CORE 。这就是 fabric 进行配置读取的方式。



### 2.3.3 总结复盘

至此，`peer channel join -b 创世区块.block` 执行完毕。再次复盘提出问题：



具体来说，这个过程调用了一个系统内置的链码函数 `cscc.JoinChain` ，节点会使用给定的创世区块来加入指定的通道。

> **问题1：**新的通道是通过创世区块来标识的吗？如果这个通道已经有好多个区块了，新的节点想加入进来，也是通过创世区块来加入吗？如果是，我这个例子都在本地，创世区块就存在本地，其他新节点想加入的时候，怎么获得创世区块？
>
> 
>
> **通道与创世区块的关系**：
>
> - **创世区块** 是通道的第一个区块，它包含了通道的初始配置和一些重要的元数据。每个通道都有一个唯一的创世区块，通道的标识在区块链中是通过区块链上的区块来维护的，其中创世区块是至关重要的第一块。
> - 当一个新节点要加入到一个已有的通道时，即使这个通道已经包含了很多区块，新节点仍然是通过创世区块来加入的。这是因为创世区块包含了通道的初始配置和结构信息，节点需要这些信息来了解通道的基本设置。
>
> **获取创世区块**：
>
> - 在生产环境中，新节点通常无法直接从本地获得创世区块，而是通过其他方式获取：
>     1. **通过已经加入通道的节点**：新节点可以从已经是通道成员的节点那里请求创世区块。这通常通过 `peer channel fetch` 命令来实现，该命令可以从通道的区块链上获取创世区块或其他指定的区块。
>     2. **从区块存储库中提取**：在某些情况下，创世区块可能会被存储在一个共享的存储库或文件系统中，节点可以从中获取。
>     3. **通过网络传输**：创世区块也可以通过安全的网络传输从其他节点或管理系统中获取。
>
> **加入现有通道**：
>
> - 当新节点使用创世区块加入现有的通道时，它首先会同步到当前通道的最新状态（即下载并验证通道中的所有区块，直到最新的区块）。这样，新节点便可以与通道中的其他节点保持一致。
>
>     这里提到新节点会同步通道的最新状态，这部分代码在 peer 内部执行。也就是 gRPC 发送请求后，docker 容器里的 peer 执行。



调用链码的方式是给背书节点发送 gRPC 请求。

**问题2：**通过阅读源码，我发现这里的背书节点，就是要加入的节点。这是为什么？背书节点的作用是什么？有没有其他使用背书节点的例子？

> **背书节点的角色**：
>
> - 在 Hyperledger Fabric 中，**背书节点（Endorser Peer）** 是负责模拟和验证交易的节点。每个参与者节点都可以配置为背书节点，背书节点根据链码的逻辑模拟交易，并生成背书（endorsement），背书包含节点对交易的认可。
> - **为什么背书节点就是要加入的节点**：
>     - 当一个节点想要加入一个通道时，它需要运行一个系统链码（如 `cscc`）来执行这个操作。在这种情况下，节点实际上是在请求自己作为背书节点来执行这个操作。这是因为加入通道的过程需要在本节点上进行一些检查和操作（例如验证创世区块、更新节点的通道状态等），这些操作都需要由本节点背书和认可。
> - **背书节点的其他使用例子**：
>     - **交易提案的背书**：在通常的交易流程中，客户端将交易提案发送给多个背书节点。这些节点分别模拟交易并生成背书响应。客户端收集足够的背书后，将交易提交给排序服务（Orderer）。
>     - **链码的安装与实例化**：当一个链码被安装或实例化时，背书节点也会参与其中，模拟链码的执行并生成相应的状态更新或响应。
>
> **总结**：
>
> - 背书节点在 Fabric 中不仅用于加入通道的操作，还用于各种交易和链码操作中，是确保区块链数据一致性和安全性的关键组件。
> - 在你提到的场景中，背书节点执行的 `cscc.JoinChain` 操作是为了确保节点正确加入通道，确保它能够获取到通道的配置并同步到最新状态。



同时 `peer` 会自动获取配置文件和环境变量。具体让哪个组织、哪个节点加入通道，都是在配置文件和环境变量中设置的。







## 2.4 设置锚定节点

什么是锚定节点？锚定节点的作用是什么？



### 2.4.1 获取通道配置

#### 2.4.1.1 peer channel fetch config

```bash
peer channel fetch config 
	${TEST_NETWORK_HOME}/channel-artifacts/config_block.pb 
	-o localhost:7050 
	--ordererTLSHostnameOverride orderer.example.com 
	-c $CHANNEL --tls --cafile "$ORDERER_CA"
```

`peer channel fetch` 用于获取一个特定的区块，并把它写入文件。后面可跟参数

```bash
<newest|oldest|config|(number)
```

除了 `config` 都好理解。看看源码

```go
switch args[0] {
	case "oldest":
		block, err = cf.DeliverClient.GetOldestBlock()
	case "newest":
		block, err = cf.DeliverClient.GetNewestBlock()
	case "config":
		iBlock, err2 := cf.DeliverClient.GetNewestBlock()
		if err2 != nil { return err2 }
    
		lc, err2 := protoutil.GetLastConfigIndexFromBlock(iBlock)
		if err2 != nil { return err2 }
    
		logger.Infof("Retrieving last config block: %d", lc)
		block, err = cf.DeliverClient.GetSpecifiedBlock(lc)
	default:
		num, err2 := strconv.Atoi(args[0])
		if err2 != nil {
			return fmt.Errorf("fetch target illegal: %s", args[0])
		}
		block, err = cf.DeliverClient.GetSpecifiedBlock(uint64(num))
}
```

即最新的块里存放了一项数据，记录最近的 config 存放在第几个区块里。

再具体一点，`InitCmdFactory` 根据有没有设置 `-o` 决定需要 `peerDeliver` 还是 `ordererDeliver`。

`peerDeliver` 还是 `ordererDeliver` 唯一的区别在于，`peer` 创建的 `CommonClient` 的 `keepalive` 选项为 `true`。

> `keepalive` 是一种网络层的机制，用于在没有数据流动时通过发送定期的 "心跳" 消息来保持连接的活跃状态。
>
> **Peer 节点和 Orderer 节点的通信差异**
>
> 1. **Peer 节点的通信需求**：
>     - **实时性和持久连接**：Peer 节点之间或客户端与 Peer 节点之间的通信往往涉及长时间的实时交互，如链码执行、状态查询、区块广播等。这些操作可能需要持久的连接，尤其是在监听区块事件或等待交易结果时，连接可能会长时间处于空闲状态。
>     - **保持连接稳定**：为了避免在这些操作期间连接断开，`keepalive` 选项被启用，以确保连接的稳定性，即使在长时间的空闲期内也能保持连接活跃。
> 2. **Orderer 节点的通信需求**：
>     - **批量性和间歇通信**：Orderer 节点的主要职责是排序交易并将它们打包成区块。客户端与 Orderer 节点的通信通常是间歇性的，如提交交易或请求区块。由于这种通信通常不是长时间持续的，连接建立和断开的频率较高，因此不太需要持续的 `keepalive`。
>     - **较短的通信生命周期**：与 Peer 节点的长时间通信不同，Orderer 节点的通信一般是短暂且快速的，通常在完成一次性请求后即关闭连接，因此 `keepalive` 的需求不大。

与 `EndorserClient` 不同的是，`peer` 和 `orderer` 使用的是 `AtomicBroadcast_DeliverClient` 原子的广播。

```go
func (x *atomicBroadcastBroadcastClient) Send(m *common.Envelope) error {
	return x.ClientStream.SendMsg(m)
}

func (x *atomicBroadcastBroadcastClient) Recv() (*BroadcastResponse, error) {
	m := new(BroadcastResponse)
	if err := x.ClientStream.RecvMsg(m); err != nil {
		return nil, err
	}
	return m, nil
}
```

其中 `ClientStream` 是 `gRPC` 的内置对象。

```go
func (d *DeliverClient) GetOldestBlock() (*cb.Block, error) {
	err := d.seekOldest()
	if err != nil {
		return nil, errors.WithMessage(err, "error getting oldest block")
	}

	return d.readBlock()
}
```

先发送请求，再读取返回值。go 中使用 gRPC 的请求和返回不用像 Js 那样特意写异步函数。



至此，读取了该通道的配置区块并写入 `config_block.pb` 本地保存。

#### 2.4.1.2 configtxlator

```bash
configtxlator proto_decode 
	--input ${TEST_NETWORK_HOME}/channel-artifacts/config_block.pb 
	--type common.Block 
	--output ${TEST_NETWORK_HOME}/channel-artifacts/config_block.json
```

这个函数功能很明显，将区块中的数据转为 JSON 格式。不分析这个工具的源码了，大体上就是用 proto 读取，保存成 json。



#### 2.4.1.3 jq

```bash
jq .data.data[0].payload.data.config
    ${TEST_NETWORK_HOME}/channel-artifacts/config_block.json >"${OUTPUT}"
```

`jq` 是一个用于处理 JSON 数据的命令行工具，它可以方便地从 JSON 文件中提取数据、进行过滤和格式化。

这段 Bash 代码执行了以下操作：

1. 使用 `jq` 从 `config_block.json` 文件中提取通道配置块（`.data.data[0].payload.data.config` 字段）。
2. 提取到的数据被写入到由环境变量 `OUTPUT` 指定的文件中。

### 2.4.2 修改通道配置

```json
jq '.channel_group.groups.Application.groups.'${CORE_PEER_LOCALMSPID}'.values += {"AnchorPeers":{"mod_policy": "Admins","value":{"anchor_peers": [{"host": "'$HOST'","port": '$PORT'}]},"version": "0"}}' ${TEST_NETWORK_HOME}/channel-artifacts/${CORE_PEER_LOCALMSPID}config.json > ${TEST_NETWORK_HOME}/channel-artifacts/${CORE_PEER_LOCALMSPID}modified_config.json
```

这段代码使用 `jq` 修改了 Hyperledger Fabric 网络中与某个组织（由 `CORE_PEER_LOCALMSPID` 环境变量指定）相关的通道配置。具体操作是：

1. **定位组织的配置部分**：
    - 通过 `jq` 表达式 `'.channel_group.groups.Application.groups.'${CORE_PEER_LOCALMSPID}'.values'` 定位到通道配置 JSON 文件中，特定组织的配置部分。
2. **添加或更新锚节点配置**：
    - 在定位到的组织配置部分中，使用 `+=` 操作符向 `values` 字段中添加或更新一个名为 `AnchorPeers` 的配置项。这个配置项包含锚节点的信息，包括 `mod_policy`、`value` 和 `version`。
    - `value` 字段中嵌套了 `anchor_peers` 信息，其中 `host` 和 `port` 的值分别从环境变量 `HOST` 和 `PORT` 中获取，代表了锚节点的主机和端口。
3. **保存修改后的配置**：
    - 将修改后的 JSON 数据保存到一个新的文件中，该文件路径由 `TEST_NETWORK_HOME` 和 `CORE_PEER_LOCALMSPID` 环境变量指定，表示该组织的修改后的通道配置。

### 2.4.3 创建配置更新

```bash
createConfigUpdate ${CHANNEL_NAME} ${TEST_NETWORK_HOME}/channel-artifacts/${CORE_PEER_LOCALMSPID}config.json ${TEST_NETWORK_HOME}/channel-artifacts/${CORE_PEER_LOCALMSPID}modified_config.json ${TEST_NETWORK_HOME}/channel-artifacts/${CORE_PEER_LOCALMSPID}anchors.tx
```

`createConfigUpdate` 函数的总体作用是生成一个配置更新交易（configuration update transaction）。这个过程涉及将原始和修改后的通道配置转换为二进制格式，计算出两者之间的差异，并将这个差异打包为一个可以提交的交易。

其具体实现如下：

```bash
configtxlator proto_encode --input "${ORIGINAL}" --type common.Config --output ${TEST_NETWORK_HOME}/channel-artifacts/original_config.pb

configtxlator proto_encode --input "${MODIFIED}" --type common.Config --output ${TEST_NETWORK_HOME}/channel-artifacts/modified_config.pb

configtxlator compute_update --channel_id "${CHANNEL}" --original ${TEST_NETWORK_HOME}/channel-artifacts/original_config.pb --updated ${TEST_NETWORK_HOME}/channel-artifacts/modified_config.pb --output ${TEST_NETWORK_HOME}/channel-artifacts/config_update.pb

configtxlator proto_decode --input ${TEST_NETWORK_HOME}/channel-artifacts/config_update.pb --type common.ConfigUpdate --output ${TEST_NETWORK_HOME}/channel-artifacts/config_update.json

echo '{"payload":{"header":{"channel_header":{"channel_id":"'$CHANNEL'", "type":2}},"data":{"config_update":'$(cat ${TEST_NETWORK_HOME}/channel-artifacts/config_update.json)'}}}' | jq . > ${TEST_NETWORK_HOME}/channel-artifacts/config_update_in_envelope.json

configtxlator proto_encode --input ${TEST_NETWORK_HOME}/channel-artifacts/config_update_in_envelope.json --type common.Envelope --output "${OUTPUT}"  
```

1. **编码原始配置文件为二进制格式**：
    - **目的**：将原始的 JSON 格式配置文件 (`${ORIGINAL}`) 编码为 `protobuf` 格式的二进制文件 `original_config.pb`。`protobuf` 是 Hyperledger Fabric 用于内部数据表示的格式。
2. **编码修改后的配置文件为二进制格式**：
    - **目的**：将修改后的 JSON 格式配置文件 (`${MODIFIED}`) 编码为 `protobuf` 格式的二进制文件 `modified_config.pb`。
3. **计算配置更新的差异**：
    - **目的**：比较原始配置和修改后的配置，计算出两者之间的差异，并生成一个表示这些差异的配置更新文件 `config_update.pb`。这个文件以 `protobuf` 格式保存，包含了需要应用的配置更改。
4. **解码配置更新为 JSON 格式**：
    - **目的**：将 `protobuf` 格式的配置更新文件 `config_update.pb` 解码回 JSON 格式的文件 `config_update.json`，方便后续处理或查看。
5. **创建包含配置更新的信封（Envelope）**：
    - **目的**：将配置更新嵌入到一个 `Envelope` 中，添加必要的元数据（如 `channel_id` 和类型）。这是为了将配置更新打包成一个完整的交易，可以提交到区块链网络中。
6. **编码带信封的配置更新为二进制格式**：
    - **目的**：将包含信封的配置更新（`config_update_in_envelope.json`）再次编码为 `protobuf` 格式的二进制文件，生成最终可以提交的配置更新交易 `anchors.tx`。



### 2.4.4 peer channel update

```bash
peer channel update 
	-o localhost:7050 
	--ordererTLSHostnameOverride orderer.example.com 
	-c $CHANNEL_NAME 
	-f ${TEST_NETWORK_HOME}/channel-artifacts/${CORE_PEER_LOCALMSPID}anchors.tx 
	--tls --cafile "$ORDERER_CA" >&log.txt
```

已经很明白这段代码的目的了。看看具体实现有没有特别的地方。

工厂什么都不需要：

```go
InitCmdFactory(EndorserNotRequired, PeerDeliverNotRequired, OrdererNotRequired)
```

官方文档说，Use the orderer at ip address `orderer.example.com:7050` to send the configuration transaction to all peers in the channel to update their copy of the channel configuration.

即这段代码是指定一个排序节点向通道内的所有对等节点广播，修改他们的配置。

要记住什么操作室部署好的节点服务做的，什么是调用的指令做的。广播的操作是 orderer 服务内部做的，`peer channel update` 只负责向排序节点发送一个 gRPC。



## 问题

### 锚节点的作用

1. **跨组织的区块传播**：
    - 锚节点是用于在不同组织之间进行区块传播的关键节点。当一个新的区块被 Orderer 节点生成并分发时，它首先会发送给每个组织的锚节点。然后，锚节点负责将这些区块传递给本组织内的其他 Peer 节点。
    - 这种机制确保了区块能够在不同组织的节点之间有效传播，保持所有节点的数据同步。
2. **跨组织的服务发现**：
    - 锚节点用于跨组织的服务发现。在 Hyperledger Fabric 中，当客户端（或其他 Peer 节点）需要与其他组织的节点通信时，它们可以通过查询锚节点来获取目标组织内的其他 Peer 节点的信息。
    - 例如，在执行一个跨组织的链码调用时，客户端可能需要发送交易提案到多个组织的 Peer 节点。锚节点提供了一个入口，使得客户端能够发现并连接到这些 Peer 节点。
3. **优化网络流量**：
    - 通过将区块传播的责任集中到少数锚节点，可以减少网络中全网广播带来的流量开销。这种集中化传播可以提高网络的效率和性能，避免不必要的数据冗余和延迟。

有点类似于网关。



### 各个Client的作用

在 Hyperledger Fabric 的源码中，`ChannelCmdFactory` 结构体中的几个客户端（`EndorserClient`、`BroadcastClient`、`DeliverClient`）各自承担着不同的角色和职责，它们分别用于与不同类型的 Fabric 节点通信。以下是对这些客户端的具体实现及其用途的详细解释：

#### 1. EndorserClient (`pb.EndorserClient`)

- **作用**：`EndorserClient` 是用于与背书节点（Endorser Peer）进行通信的客户端。它的主要职责是发送交易提案给背书节点，并接收背书节点返回的背书响应。
- **具体实现**：
    - `EndorserClient` 通常实现了 gRPC 接口，负责与 Peer 节点的 `ProcessProposal` 方法交互。背书节点会对交易提案进行模拟执行，并返回模拟的结果（包括读取集和写入集），这个过程称为“背书”。
    - `EndorserClient` 的具体实现类可能是通过 gRPC 框架生成的客户端代码，例如 `endorserClient`，它封装了与 `ProcessProposal` 的 gRPC 调用。
- **使用场景**：
    - 在客户端提交交易之前，会使用 `EndorserClient` 向多个 Peer 节点请求交易提案的背书。

#### 2. BroadcastClient (`common.BroadcastClient`)

- **作用**：`BroadcastClient` 是用于与 Orderer 节点通信的客户端。它的主要职责是将经过背书的交易提交给 Orderer 节点，以便将交易排序后打包进区块。
- **具体实现**：
    - `BroadcastClient` 也通常通过 gRPC 与 Orderer 节点通信。它实现了与 Orderer 节点的 `Broadcast` 方法的交互，负责将交易数据发送给 Orderer，Orderer 节点接收到交易后会对其进行排序，并打包到区块中。
    - 一个常见的实现类可能是 `broadcastClientImpl`，它封装了与 `Broadcast` 方法的 gRPC 调用。
- **使用场景**：
    - 在交易得到足够的背书之后，客户端会使用 `BroadcastClient` 将交易提交给 Orderer 节点进行排序和区块打包。

#### 3. DeliverClient (`deliverClientIntf`)

- **作用**：`DeliverClient` 是用于从 Orderer 或 Peer 节点接收区块和事件的客户端。它的主要职责是监听区块的传递或接收事件通知。
- **具体实现**：
    - `DeliverClient` 通过 gRPC 接口与 Orderer 或 Peer 节点进行通信，通常会实现 `Deliver` 方法的调用。`Deliver` 方法允许客户端从 Peer 节点或 Orderer 节点获取区块的传递或接收区块的通知。
    - 实现类可能是 `deliverClientImpl` 或者其他实现了 `deliverClientIntf` 接口的类，它封装了与 `Deliver` 方法的 gRPC 交互。
- **使用场景**：
    - 当客户端需要获取通道中的最新区块或监听特定事件（如区块提交事件）时，会使用 `DeliverClient` 来实现这一功能。

### 总结

- `EndorserClient`：用于与 Peer 节点通信，发送交易提案并接收背书响应。
- `BroadcastClient`：用于与 Orderer 节点通信，将交易提交给 Orderer 进行排序和区块打包。
- `DeliverClient`：用于接收区块或事件通知，可以从 Orderer 或 Peer 节点获取区块信息。









# 总结

至此，已经完成了 test-network 中网络的启动和通道的创建。

主要分析了如何使用 fabric 提供的工具（如 `peer` `osnadmin` `cryptogen` 等）进行构建网络。

但是网络的启动中留了一个问题：`peer node start` 和 `orderer start` 干了什么。源码中哪里进行了端口的开放，这些节点收到 gRPC 请求之后，后续进行了什么操作。

下一节完成了这部分问题。



# 附录

## gRPC 与传统 HTTP 调用的区别

gRPC 和传统的 HTTP 调用虽然都用于客户端与服务器之间的通信，但它们在底层实现、性能、数据格式、传输协议等方面有显著的区别。以下是一些关键的差异：

#### 1. **通信协议**

   - **gRPC**：基于 HTTP/2 协议，这使得 gRPC 具备了流式通信、多路复用、头部压缩、双向流等特性。HTTP/2 的多路复用允许多个请求和响应通过单个 TCP 连接同时传输，减少了延迟。
   - **传统 HTTP**：基于 HTTP/1.1（或 HTTP/2，但应用较少），主要通过请求-响应的方式进行通信，每次请求通常会创建一个新的连接（除非使用了持久连接）。

#### 2. **数据格式**

   - **gRPC**：使用 Protocol Buffers（protobuf）作为其序列化协议。这是一种高效的二进制格式，体积小、解析速度快，非常适合跨语言通信。
   - **传统 HTTP**：通常使用 JSON、XML 等文本格式。虽然 JSON 可读性好，但在性能和数据大小方面不如 protobuf 高效。

#### 3. **性能**

   - **gRPC**：由于使用了 HTTP/2 和 protobuf，gRPC 在性能和资源利用率上要优于传统的 HTTP 调用。gRPC 提供更低的延迟和更高的吞吐量。
   - **传统 HTTP**：相对较慢，尤其是在处理大规模通信或需要高并发的场景下，性能不如 gRPC。

#### 4. **双向流式通信**

   - **gRPC**：支持双向流式通信，这意味着客户端和服务器可以在单个 gRPC 调用中同时发送和接收消息。这对实时通信和流式数据处理特别有用。
   - **传统 HTTP**：基于请求-响应模型，通常是一对一的交互方式。虽然可以通过 WebSocket 实现双向通信，但这不是 HTTP 协议的原生功能。

#### 5. **服务定义**

   - **gRPC**：服务接口使用 protobuf 文件定义，强类型化，接口可以跨语言调用，且编译器自动生成客户端和服务器代码。
   - **传统 HTTP**：没有标准化的接口定义方式，通常使用 OpenAPI（Swagger）来定义 RESTful API，但客户端和服务器代码需要手动编写。

#### 6. **适用场景**

   - **gRPC**：非常适合微服务架构、大规模分布式系统、实时通信、跨语言服务调用等场景。
   - **传统 HTTP**：适合需要高可读性、与浏览器交互、简单或公开的 API 服务，通常用于 Web 服务和 RESTful API。

#### 7. **能否使用传统 HTTP 进行相同的调用？**

   在技术上，你可以使用传统的 HTTP 来实现类似的 RPC 调用，但这会带来一些挑战：

   - 你需要自己定义数据格式（例如 JSON），处理序列化和反序列化。
   - 缺乏 gRPC 提供的许多高级功能，如双向流、自动代码生成、负载均衡、强类型接口等。
   - 性能和资源利用率可能不如 gRPC 高效。

## Go 标准库中的 `context` 详细讲解

`context` 是 Go 标准库中的一个包，用于在不同的 goroutine 之间传递请求范围内的元数据、取消信号和超时信息。`context` 在处理并发操作时特别有用，尤其是在 gRPC、HTTP 服务器、数据库操作等场景下。

#### 1. **基本概念**

- **`context.Context` 接口**：
    - `context.Context` 是一个接口，它定义了在不同的 goroutine 之间传递请求范围内的信息的标准方法。
    - 它是不可变的，一旦创建，就不能修改，而是通过派生（创建子 context）的方式来添加新的信息。

- **背景上下文**：
    - **`context.Background()`**：通常作为根 context 使用，没有携带任何信息，一般在主函数、初始化或者测试时使用。
    - **`context.TODO()`**：占位用的 context，当你不确定应该使用什么 context 时，可以使用 `TODO()`。

#### 2. **常用的函数**

- **`context.WithCancel(parent Context) (ctx Context, cancel CancelFunc)`**：
    - 创建一个子 context，并返回一个取消函数 `cancel`。
    - 调用 `cancel()` 时，会向所有使用该 context 的 goroutine 发送取消信号。

- **`context.WithDeadline(parent Context, d time.Time) (Context, CancelFunc)`**：
    - 创建一个子 context，该 context 会在指定的时间点自动取消。
    - 同样返回一个 `CancelFunc`，可以主动取消。

- **`context.WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc)`**：
    - 与 `WithDeadline` 类似，但这里是指定一个相对的超时时间。

- **`context.WithValue(parent Context, key, val interface{}) Context`**：
    - 返回一个子 context，携带一个键值对，可以用于传递请求范围内的特定数据（例如用户身份、请求 ID 等）。
    - 注意：`WithValue` 应该谨慎使用，避免滥用造成混乱。

#### 3. **如何在代码中使用 `context`**

使用 `context` 的典型场景包括取消正在进行的操作、设置超时、传递元数据等。以下是一个简单的使用示例：

```go
func main() {
    // 创建一个带有超时的 context
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    ch := make(chan int)
    go doSomething(ctx, ch)

    select {
    case result := <-ch:
        fmt.Println("Received result:", result)
    case <-ctx.Done():
        fmt.Println("Operation timed out:", ctx.Err())
    }
}

func doSomething(ctx context.Context, ch chan int) {
    select {
    case <-time.After(10 * time.Second): // 模拟耗时操作
        ch <- 42
    case <-ctx.Done():
        fmt.Println("Operation cancelled:", ctx.Err())
    }
}
```

在这个例子中，如果 `doSomething` 操作超过 5 秒没有完成，`ctx.Done()` 会被触发，导致操作取消。

#### 4. **`context` 的使用建议**

- **传递上下文**：函数之间传递 context 时，通常将 `context.Context` 作为第一个参数。
- **及时取消**：使用 `WithCancel`、`WithTimeout`、`WithDeadline` 创建的 context 一定要在不需要时调用返回的 `CancelFunc`，否则可能导致资源泄露。
- **避免滥用 `WithValue`**：`WithValue` 适合传递请求范围内少量的信息，但不应该用它来传递大量数据或者频繁使用。

### 总结

- **gRPC** 是一个高性能的 RPC 框架，适合微服务和高并发场景，与传统 HTTP 调用在协议、数据格式、性能和功能上有显著差异。
- **Go 的 `context`** 用于在并发操作中传递元数据、取消信号和超时控制，是处理并发任务时的重要工具。它有助于管理资源，避免资源泄露或长时间未完成的任务。




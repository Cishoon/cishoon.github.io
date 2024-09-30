---
title: Hyperledger Fabric 源码精读（3）
categories: [笔记]
tags: [go, fabric, 区块链, 超级账本]
date: 2024-09-16
---

- 开坑，学习 Fabric 的源码。

- 思路是根据 `fabric-sample` 的 `test-network` 中的脚本，一行行分析。遇到里面使用的指令，看源码如何实现。

- 下面内容非常混乱，写的毫无逻辑，之后有空重新整理一遍。

- 一口气写完太长了，typora里会卡，分章节发。

- 学习笔记，不保证内容正确性。

- 因为台风改签明天了……再看一点

<!--more-->

# 3 peer node start

有一个参数：

```bash
--peer-chaincodedev   start peer in chaincode development mode
```

最终执行的是 `internal/peer/node/start.go` 中的 `serve()` 函数。非常长，挑重点的详细记录：

1. `viper` 获取所有参数，输出所有环境变量

2. 检查 MSP 类型，仅支持 `FABRIC` 模式

3. `grpc.EnableTracing = true` （效果类似于，每次发送请求都会在控制台输出请求信息）

4. 获取核心配置

5. 创建平台注册凭证

6. 启动操作系统

7. 观察者模式，监听 `opsSystem.Provider`

8. 配置链码安装路径、存储器和解码器

9. 解析 `peerHost` 和 `listenAddress` （这两个地址有区别吗？？）

    > 发现一个之前没搞清楚的概念，主机地址和监听地址其实是不同的，只不过大多数开发场景中，`peerHost` 和 `listenAddr` 可能会指向相同的主机地址，但它们的上下文和作用略有不同：一个是用于解析配置和标识网络位置，另一个是用于节点启动时的监听配置。
    >
    > 主机地址一般是 IP 地址或域名，例如，`192.168.1.10` 或 `example.com` 都是主机地址。
    >
    > 监听地址可以是 IP 地址或通配符，比如 `0.0.0.0` 和 `192.168.1.10` 都是监听地址。
    >
    > 存在很多主机地址和监听地址不同的情况：
    >
    > 单网卡多IP，一台电脑有多个IP地址（网卡有多个网络接口），但是只监听一个IP；使用通配符或者localhost监听。

10. 配置一堆服务端配置

11. 创建 `peer` 实例

12. 获取本地 MSP ，从 MSP 中获取身份

13. 根据身份，创建 `MembershipInfoProvider` ，用来判断一个节点是否连接到一个组织。

14. 创建政策检查器和管理器

15. 启动 `aclProvider` (ACL 是什么？)

    > ACL 是 Access Control List（访问控制列表），和计网中的概念相同。

16. 创建 `lifecycleValidatorCommitter` ，用于链码生命周期管理。

17. 配置 `ccprovider`

18. 
























---
title: A Trusted WebAssembly Runtime Environment with Remote Attestation for TrustZone 论文笔记
categories: [笔记]
tags: [TrustZone, 论文, WebAssembly]
date: 2024-10-04
---

本文提出了 WATZ ，一个可以在 TrustZone 中执行 Wasm 代码的运行时环境，并提供了远程执行验证。

几个问题：

1. 在 TrustZone 的 TEE 中运行 Wasm 代码，有什么困难？
2. 除了 WATZ，其他的 Wasm 运行时（例如 Wasmtime、WAVM）可以在 TEE 中执行 Wasm 代码吗？如果不可以，为什么不可以？如果可以，为什么不直接用他们呢？
3. 论文中提到的 **远程执行验证** 是什么？有哪些应用？

<!--more-->

# 1 背景和相关研究

## 1.1 Webassembly and TEE

有哪些已有的研究？

- TWINE： 是一个嵌入式受信运行时，用于在 Intel SGX 隔离区执行 Wasm 应用程序。
- Enarx：针对 Intel SGX 隔离区和 AMD SEV 虚拟机。
- Veracruz： 只支持基于 VM 的 TEE，例如 Arm CCA [31] 和 AWS Nitro [32] 隔离区。
- AccTEE 和 Se-Lambda： 使用 V8 JavaScript/Wasm 引擎在 Intel SGX 隔离区运行 Wasm 二进制文件。

这些已有的研究，都不是针对 Arm TrustZone 的。除了 Veracruz，都是只针对 Intel SGX 的。



> ### Intel SGX 与 Arm TrustZone
>
> **目标平台**：
>
> - SGX是x86架构的解决方案，主要用于英特尔的服务器和PC处理器。
> - TrustZone是ARM架构的解决方案，广泛应用于移动设备和嵌入式系统。
>
> **隔离粒度**：
>
> - SGX隔离的是应用程序的一部分，即Enclave，它的设计目标是保护用户态应用中的特定敏感部分。
> - TrustZone隔离的是整个系统，它通过划分安全世界和非安全世界，隔离操作系统和应用，涵盖了更大的范围。
>
> **实现方式**：
>
> - SGX通过硬件支持的加密内存保护，实现对Enclave内存的隔离，其他部分无权访问。
> - TrustZone通过在硬件层面划分不同的执行世界，实现全系统级别的隔离。



<img src="./paper-WATZ(待)/image-20241004143317922.png" alt="image-20241004143317922" style="zoom:50%;" />

AOT（处理提前编译的 Wasm 字节码）、WASI（启用系统交互）、RA（支持远程证明）、RA in WASI（为托管的 Wasm 应用程序提供控制远程证明的 WASI API）、µRT（使用小型运行时，内存小于 1 MB）、IoT TEE（为物联网设备设计）和 TEE(s)（总结 TEE 技术）。



## 1.2 远程证明（RA）

> 什么是远程证明？
>
> **远程证明** 就像是在远程验证一个人或事物的身份和真实性一样，只是这里指的是计算机程序或设备。简单来说，它是一种机制，允许你在不直接接触程序或设备的情况下，确认它们没有被篡改，并且运行的是你期望的软件。
>
> **案例**：
>
> 想象一下，你有一个智能家居系统，里面运行着许多程序来控制灯光、温度、安全摄像头等。这些程序都存储在设备上，而你无法直接查看它们。这时，远程证明就派上用场了。
> 假设某个程序被黑客篡改，变成了恶意软件。如果没有远程证明，你很难发现这个问题。但如果你使用了远程证明，你就可以定期向设备发送一个请求，让它证明自己运行的是正确的软件。如果设备通过了证明，你就知道它没有被黑客攻击，可以放心地使用它。
>
> **远程证明的应用场景**：
>
> * **物联网 (IoT)**: 远程证明可以确保 IoT 设备运行的是安全的软件，防止黑客攻击。
> * **云计算**: 远程证明可以确保云服务器运行的是可信的软件，保护用户数据安全。
> * **区块链**: 远程证明可以确保区块链节点运行的是正确的软件，维护区块链网络的可靠性。
> * **汽车**: 远程证明可以确保车载软件没有被篡改，保障行车安全。
>
> **总结**：
>
> 远程证明是一种重要的安全机制，可以帮助我们验证计算机程序或设备的真实性，防止黑客攻击和数据泄露。它在许多领域都有广泛的应用，为我们的信息安全提供了重要保障。

在本篇论文中，远程证明是为了保证在 Arm TrustZone TEE 中运行的 WebAssembly 代码的正确性。





# 源码对比

 `unine-watz` 中的代码继承自其他开源项目：

```
The fork of the runtime is based on the revision cba4c782.
The fork of optee_os is based on the revision 3af354e3.
The fork of build is based on the revision af24ff9.
```

首先我要找到他修改了什么地方。



## optee_os

在 `core` 和 `lib` 文件夹中做了修改，主要提供了新的 PTA （内核中运行的 TA ），提供了 `attesting_service` 远程认证服务。



## build

里面增加了一个 `linux-patches/use_monotonic_time.patch` 修改时间的补丁，目的猜测应该是 benchmark 测试的时候控制输出的时间。



## runtime

`./product-mini/platforms` 文件夹中新增了 `linux-trustzone`，其中有两个文件夹 `vedliot_verifier` 和 `vedliot_attester`.

这两个文件夹中的内容都是一个标准的 TA。



在 WATZ 的远程认证机制中，attester（证明者）和 verifier（验证者）扮演着关键角色：
* **Attester (证明者)**: 
    * 运行在 WATZ 环境中的 Wasm 应用程序，负责生成证据并证明其自身代码的完整性。
    * 通过与 WATZ 内置的 attestation service（认证服务）交互，获取证据，并将其发送给 verifier 进行验证。
    * 可以使用 WASI-RA API 控制远程认证流程，例如发起握手、发送证据、接收秘密数据等。
* **Verifier (验证者)**: 
    * 运行在可信环境之外的实体，负责验证 attester 发送的证据，并确认其代码的完整性和平台的真实性。
    * 接收 attester 发送的 evidence，并使用设备的公钥对其进行验证。
    * 检查 evidence 中的代码测量值，确保其与预定义的参考值匹配。
    * 如果验证通过，可以与 attester 建立安全的通信通道，并安全地传输秘密数据。

![image-20241025143152581](./paper-WATZ(待)/image-20241025143152581.png)

所以 `vedliot_attester` 是个可以调用 Wasm 的程序的 TA ！





先试试看 Wasm 怎么用。

WAMR：[Build iwasm](https://github.com/bytecodealliance/wasm-micro-runtime/blob/main/product-mini/README.md)、[Build wamrc AOT compiler](https://github.com/bytecodealliance/wasm-micro-runtime/blob/main/wamr-compiler/README.md)



WATZ 的移植和测试过程，见 毕设05。




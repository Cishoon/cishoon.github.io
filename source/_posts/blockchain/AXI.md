---
title: AXI 系统总线
categories: [笔记]
tags: [ARM, FPGA, AMBA]
date: 2024-08-27
---

> 本文属于学习笔记，内容可能有误、可能不全面，仅代表个人在学习这一知识时的理解和总结
>

第一次接触AMBA AXI系统总线，学习 [Learn the architecture - An introduction to AMBA AXI](https://developer.arm.com/documentation/102202/0300?lang=en) ，做到笔记。

<!--more-->

# AMBA

## Q&A

> 什么是AMBA？

AMBA（Advanced Microcontroller Bus Architecture）是由ARM公司开发的一种标准化的芯片内部总线协议，简单来说，它就是一种让芯片内部不同部分能够快速、可靠地相互通信的“高速公路”。在一个芯片里，有很多不同的“模块”，比如处理器、内存、输入输出设备等等，这些模块需要彼此传递数据，而AMBA就是负责管理这些数据怎么传输的。



> 在AMBA提出之前，芯片内部的各个模块应该也能传递数据，那时候是怎么实现数据传递的？

在AMBA提出之前，芯片内部各个模块之间的确已经能够实现数据传递，但方式较为复杂和不统一。以下是一些在AMBA之前常见的数据传输方式：

1. **定制总线**

    在AMBA出现之前，芯片制造商通常会为每个项目定制设计自己的总线系统。这种定制总线完全由设计团队根据具体需求设计，缺乏统一的标准。这意味着每个新项目可能需要重新设计数据传输的方式，耗时且复杂。

    缺点：

       - 缺乏标准化，导致设计难度大。

       - 不同模块之间的接口可能不兼容，集成和调试复杂。

       - 难以重复使用设计，增加开发成本和时间。


2. **共享总线架构**

    在一些设计中，多个模块会共享同一条总线。这种架构较为简单，但由于所有模块都使用同一条总线，可能会产生“总线争用”的问题，即多个模块同时请求访问总线，导致数据传输的延迟或效率下降。

    缺点：

    - 总线带宽有限，当多个模块同时访问时，容易产生瓶颈。
    - 缺乏灵活性，难以适应复杂的多模块通信需求。

3. **专用接口**

    一些芯片设计会为特定模块之间的通信设计专用的接口。这种方式虽然在特定场景下效率较高，但其灵活性很差。每对模块之间需要专用的连接，这使得芯片设计复杂度大幅增加。

    缺点：

       - 专用接口需要针对每对模块单独设计，增加了设计工作量。

       - 难以扩展，增加新模块时需要重新设计接口。


AMBA的提出为这些问题提供了一个解决方案。它标准化了芯片内部的通信，允许设计者使用一套通用的协议和总线结构来连接不同的模块。这样一来，不仅减少了设计复杂度，也提高了模块之间的兼容性和重用性，使得芯片设计变得更高效、更灵活。

通过AMBA，总线系统可以自动处理诸如优先级、仲裁等复杂问题，开发者只需要专注于模块本身的设计，而不必再花费大量时间去解决数据传输的问题。



> AMBA是什么时候提出的？

AMBA（Advanced Microcontroller Bus Architecture）最早是由ARM公司在**1996年**提出的。最初的版本被称为AMBA 2.0，后来逐步发展出更高级的版本，如AMBA 3和AMBA 4，分别引入了更先进的功能和特性，以适应不断发展的嵌入式系统需求。

AMBA 2.0版本主要引入了两种总线：AHB（Advanced High-performance Bus）和 APB（Advanced Peripheral Bus）。在后续的版本中，**AXI（Advanced eXtensible Interface）**等新总线协议被引入，以支持更高性能和更复杂的系统设计。

AMBA的推出标志着嵌入式系统设计进入了一个新的标准化阶段，使得芯片设计和模块集成变得更加高效和灵活。

## 总结

AMBA是一个**标准化协议**，用于芯片内部各个模块之间的数据传输。

使用AMBA，可以一定程度降低嵌入式系统设计的复杂度。



AXI是AMBA 3.0 提出的总线协议，下面详细学习AXI的设计，理解他的工作原理和使用方法，感受为什么AXI总线能够降低设计的复杂度。



以及，有很多其他现成的IP核，使用的是AXI总线。如果我想设计一个模块与其他IP核连接，必须在我的模块里实现AXI总线。





# AXI 总线协议



## 详细架构



## 关键特性

AXI 协议具有多个关键特性，这些特性旨在提高数据传输和事务处理的带宽和延迟，如下所示：

- **独立的读写通道**：AXI 支持两组不同的通道，一组用于写操作，另一组用于读操作。拥有两组独立的通道有助于提高接口的带宽性能，因为读写操作可以同时进行。
- **多重未完成地址**：AXI 允许存在多个未完成的地址。这意味着管理器可以在不等待先前事务完成的情况下发起新事务。这可以提高系统性能，因为它使得事务的并行处理成为可能。
- **地址和数据操作之间没有严格的时间关系**：在 AXI 中，地址和数据操作之间没有严格的时间关系。这意味着，例如，管理器可以在写地址通道上发出写地址，但没有时间要求规定管理器何时必须在写数据通道上提供相应的数据。
- **支持非对齐数据传输**：对于由宽度超过一个字节的数据传输组成的突发传输，访问的首字节可以与自然地址边界不对齐。例如，起始字节地址为 0x1002 的 32 位数据包并未对齐到自然的 32 位地址边界。
- **乱序事务完成**：AXI 支持乱序事务完成。AXI 协议包含事务标识符，不同 ID 值的事务完成顺序没有限制。这意味着单个物理端口可以支持乱序事务，通过充当多个逻辑端口，每个逻辑端口按顺序处理其事务。
- **基于起始地址的突发事务**：AXI 管理器仅发出第一个传输的起始地址。对于后续的任何传输，受控端将根据突发类型计算下一个传输地址。







## 传输和事务

https://developer.arm.com/documentation/102202/0300/Channel-transfers-and-transactions?lang=en

简而言之，分为读写两个部分，分别有以下接口：

- **写**：
    - Write Address
    - Write Data
    - Write Response
- **读**：
    - Read Address
    - Read Data （包括Response的内容）

传输就是读或写1个数据的过程。一个事务可以由一个或多个传输组成，也就是可以一次性传输多次。

传输前需要先握手配对，即主机的VALID和从机的READY均为1时，开始传输。

写事务是所有数据写入**之后**，返回一个OK。读事务是每读取一个数据的**同时**，返回一个OK。





## 信号

https://developer.arm.com/documentation/102202/0300/Channel-signals?lang=en

定义了各个接口的具体信号实现。

其中提到了安全支持，这在TrustZone中很有用。



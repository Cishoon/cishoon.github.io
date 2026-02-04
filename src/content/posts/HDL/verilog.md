---
title: Verilog 部分特性整理
categories: [HDL]
tags: [HDL, FPGA, 学习笔记]
date: 2024-08-19
---
找老师问有什么东西可以给我先看起来，老师发来了Verilog……

孽缘未了啊，这回重头认真学一学。

记录一些之前没有考虑过的内容。

参考这个网站https://hdlbits.01xz.net/

<!--more-->

# 隐式声明

通常变量需要使用 `wire` 或 `reg` 声明。

但是也可以直接使用 `wire t = a & b;` 这样直接创建一个中间变量 `t` ，但是 `t` 的宽度**一定是1bit**。

这个在之前写CPU的时候错过无数遍了。

# wire 和 reg

> A note on wire vs. reg: The left-hand-side of an assign statement must be a *net* type (e.g., `wire`), while the left-hand-side of a procedural assignment (in an always block) must be a *variable* type (e.g., `reg`). These types (wire vs. reg) have nothing to do with what hardware is synthesized, and is just syntax left over from Verilog's use as a hardware *simulation* language.

其实没有本质区别。

reg只能写在always里，wire只能写在外面通过assign或module连接。

reg只是设计Verilog时的历史遗留问题。

# 避免锁存器

https://hdlbits.01xz.net/wiki/Always_if2

> 一个常见的错误来源：如何避免生成锁存器（Latches）
>
> 在设计电路时，你必须首先从电路的角度进行思考：
>
> - 我需要这个逻辑门
> - 我需要一个组合逻辑块，它有这些输入并产生这些输出
> - 我需要一个组合逻辑块，后面跟着一组触发器（flip-flops）
>
> 你不能做的是：先写代码，然后希望它能生成一个合适的电路。
>
> ```
> If (cpu_overheated) then shut_off_computer = 1;
> If (~arrived) then keep_driving = ~gas_tank_empty;
> ```
>
> 语法正确的代码不一定会生成合理的电路（组合逻辑 + 触发器）。通常的问题是："在你未指定的情况下会发生什么？"。Verilog 的回答是：保持输出不变。
>
> 这种“保持输出不变”的行为意味着当前状态需要被记住，因此会产生一个锁存器（latch）。组合逻辑（例如逻辑门）无法记住任何状态。要留意 “Warning (10240): … inferring latch(es)” 警告消息。除非锁存器是故意设计的，否则它几乎总是表示一个错误。组合电路必须在所有情况下对所有输出赋值。这通常意味着你需要使用 `else` 子句或对输出赋予默认值。

一个最重要的思路，写HDL和其他高级语言是非常不一样的两个体系。

其他编程语言描述过程，HDL如其名描述**硬件结构**。

不管是写什么代码，都是在告诉编译器生成一个什么样的硬件结构。

这个问题就是如果不明确指明所有情况，则会产生锁存器，因为Verilog在没有指明的情况下会保持wire的输出不变。

总之：**当使用分支语句时必须覆盖所有情况。**

---

后续遇到继续补充

---
title: 零知识证明
categories: [笔记]
tags: [区块链, 零知识证明]
date: 2025-09-25
---

想研究零知识证明能不能进一步压缩、加速，首先得熟悉现在的实现方法。

然后一查发现零知识证明的技术基础有一点丰富。

参考教程：[https://learnblockchain.cn/column/117](https://learnblockchain.cn/column/117)

<!--more-->

# 1 前置准备

## 1.0 数学知识

参考这篇文章：[BLS、BBS、BBS+与其数学基础](https://cishoon.github.io/blockchain/BBS)

或者 [参考教程](https://learnblockchain.cn/column/117) 的前几章。



## 1.1 将解决方案变成布尔表达式

所有密码学算法（NP难问题）都有一个共通的特点：解决问题困难、验证答案简单。

所以期待能有一种**通用的语言**来描述NP问题和解决方案。



**Cook-Levin 定理**：**所有的P类问题和NP类问题都可以表示为一个布尔表达式**。

> 直观理解：任何问题都能翻译成一堆二进制状态 + 状态变换规则，而这些规则最后都能被写成布尔公式。



布尔表达式就是一个典型的求解困难、验证简单的问题。



而布尔表达式都可以做成一个等价的算数电路。（数字逻辑）





https://learnblockchain.cn/article/11313
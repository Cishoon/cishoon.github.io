---
title: Ethernaut - MagicNumber
categories: [Ethernaut]
tags: [以太坊, 智能合约, Ethernaut]
date: 2024-12-24
---

创建一个10字节的智能合约……

<!--more-->

这题要学会怎么写原生的EVM字节码。

https://medium.com/coinmonks/ethernaut-lvl-19-magicnumber-walkthrough-how-to-deploy-contracts-using-raw-assembly-opcodes-c50edb0f71a2

这个暂时不展开学习了，肯定得花一些时间。可以参考上面这个详细教程。

另外发现了好玩的：教你EVM字节码的游戏https://stermi.xyz/blog/lets-play-evm-puzzles



```js
await web3.eth.sendTransaction({from:player,data:"0x600a600c600039600a6000f3602A60805260206080f3"});
```


---
title: Ethernaut - Vault
categories: [Ethernaut]
tags: [以太坊, 智能合约, Ethernaut]
date: 2024-12-22
---

解锁这个保险箱！

<!--more-->

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Vault {
    bool public locked;
    bytes32 private password; // 隐藏的密码

    constructor(bytes32 _password) {
        locked = true;
        password = _password;
    }

    function unlock(bytes32 _password) public { // 知道密码就可以破解了
        if (password == _password) {
            locked = false;
        }
    }
}
```

隐藏的密码，private变量，知道密码就可以破解了。呃这怎么办。

创建这个智能合约肯定是个明文的事务，我得想办法获取这个明文事务的参数……

跑偏了，这就直接看创建题目的智能合约了，不太好不太好。

这题考私有变量获取。



# Solidity合约内存空间

## 1 Storage

- storage 是合约的永久存储空间，数据会持久存储在区块链上。
- 每个状态变量分配到一个 **存储槽（storage slot）** 中，每个存储槽为 **256 位（32 字节）**。
- **变量布局**: Solidity 按照变量声明的顺序将状态变量分配到存储槽中。
- 动态类型：
    - 动态数组 `uint256[]`，slot 0里存数组长度，keccak256(0) + i 对应第i个元素的位置
    - 结构体，按字节顺序塞满存储槽，一个不够就连续
    - Map：键 k 的值存储在 keccak256(abi.encode(k, slot)) 的位置。



## 2 Memory

- memory 是用于临时存储数据的内存空间，在合约调用期间存在，调用结束后会被销毁。
- memory 中的访问速度比 storage 快得多。
- **动态分配**: 当存储动态数组（如字符串、字节数组）时，memory 的大小在运行时动态分配。



## 3 calldata

就是 msg.data 里的内容。





# 解题

```js
const res = await provider.getStorage(CONTRACT_ADDRESS, 1);
console.log(res);
// byte32转string
let str = ethers.toUtf8String(res);
console.log(str);
```

```
0x412076657279207374726f6e67207365637265742070617373776f7264203a29
A very strong secret password :)
```

<img src="./09-Vault/image-20241222155800089.png" alt="image-20241222155800089" style="zoom:50%;" />
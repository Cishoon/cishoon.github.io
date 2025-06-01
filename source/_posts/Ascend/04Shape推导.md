---
title: Ascend 学习笔记 03 - 广播机制与Shape推导
categories: [笔记]
tags: [AI, 硬件加速, Ascend]
date: 2025-03-27
---

测试点一直有一个过不去，然后发现是tensor运算过程中会自动形状推导，这个完全不知道，AI学太少了，，

代码已经实现了，让AI写一个文档记录一下怎么操作。

但是，这个方法存在一些性能问题，等下一篇博客。

<!--more-->

# 广播机制与Shape推导分析

在深度学习框架中，广播机制允许不同形状的张量在进行算术运算时自动扩展为相同的形状。下面将从host侧和kernel侧分别描述广播机制的实现。

## 1. Host侧实现

### 1.1 输入与输出Shape获取

在host侧，首先需要获取输入和输出张量的原始形状：

```cpp
auto condShape = context->GetInputShape(0)->GetOriginShape();
auto x1Shape = context->GetInputShape(1)->GetOriginShape();
auto x2Shape = context->GetInputShape(2)->GetOriginShape();
auto yShape = context->GetOutputShape(0)->GetOriginShape();
```

### 1.2 维度对齐与Shape推导

将所有输入Shape统一到输出Shape的维度，对于低维张量，前面补1：

```cpp
for (int32_t i = 0; i < yDimNum; i++) {
    yShapeVec[i] = yShape.GetDim(yDimNum - 1 - i);
    condShapeVec[i] = condDimNum - 1 - i >= 0 ? condShape.GetDim(condDimNum - 1 - i) : 1;
    x1ShapeVec[i] = x1DimNum - 1 - i >= 0 ? x1Shape.GetDim(x1DimNum - 1 - i) : 1;
    x2ShapeVec[i] = x2DimNum - 1 - i >= 0 ? x2Shape.GetDim(x2DimNum - 1 - i) : 1;
}
```

### 1.3 Stride计算

根据Shape计算每个维度的stride，用于线性索引的转换：

```cpp
uint32_t y_stride = 1, cond_stride = 1, x1_stride = 1, x2_stride = 1;
for (size_t i = 0; i < yDimNum; i++) {
    if (yShapeVec[i] != 1) {
        yStrides[i] = y_stride;
        y_stride *= yShapeVec[i];
    }
    // ... 同样处理cond, x1, x2的stride
}
```

### 1.4 广播需求判断

检查每个维度是否需要扩展：

```cpp
uint32_t needBroadcast = 0;
for (int i = 0; i < yDimNum; i++) {
    if (condShapeVec[i] != yShapeVec[i] || x1ShapeVec[i] != yShapeVec[i] || x2ShapeVec[i] != yShapeVec[i]) {
        needBroadcast = 1;
        break;
    }
}
```

## 2. Kernel侧实现

### 2.1 索引转换

在kernel侧，通常需要一个索引转换函数，将输出张量的线性索引映射到输入张量的线性索引：

```cpp
__aicore__ inline uint32_t convertIndex(uint32_t srcIndex, uint32_t* shape, uint32_t* strides)
{
    uint32_t dstIndex = 0;
    for (int32_t i = 0; i < yDimNum; i++) {
        dstIndex += srcIndex / yStrides[i] % shape[i] * strides[i];
    }
    return dstIndex;
}
```

### 2.2 数据复制与广播

当需要广播时，数据从全局内存到本地缓冲区的复制过程中会调用索引转换函数：

```cpp
if (needBroadcast) {
    uint32_t index = 0;
    for (int i = 0; i < processDataNum; i++) {
        index = convertIndex(baseIndex + i, inputShape, inputStrides);
        localBuffer.SetValue(i, globalMemory.GetValue(index));
    }
} else {
    DataCopy(localBuffer, globalMemory[progress * tileDataNum], processDataNum);
}
```



## 3. 总结

广播机制的Shape推导是一个典型的多维数组处理问题，其核心思路包括：

1. 维度对齐：将所有输入张量提升到相同维度。
2. 计算stride：针对各个维度的步长计算。
3. 索引映射：实现从输出索引到输入索引的映射。
4. 条件选择：基于条件张量执行元素选择。

这种实现既支持标准的广播语义，又通过各种优化手段（如内存缓冲区、数据分块、多核协同）来提高计算效率。



# 优化

```cpp
uint32_t x1Index = 0;
uint32_t q[8] {};
uint32_t r[8] {};
uint32_t indices[8] {};
uint32_t currentOffset = 0;

uint32_t n = baseIndex;
for (uint8_t i = 0; i < this->yDimNum; i++) {
    q[i] = n / yStrides[i];
    r[i] = n % yStrides[i];
    indices[i] = q[i] % yShape[i];
    currentOffset += indices[i] * x1Strides[i];
}

x1Local.SetValue(0, x1Gm.GetValue(currentOffset));

for (int i = 1; i < this->processDataNum; i++) {
    n += 1;
    for (uint8_t dim = 0; dim < this->yDimNum; dim++) {
        r[dim] += 1;
        if (r[dim] == yStrides[dim]) {
            r[dim] = 0;
            q[dim] += 1;
            uint32_t new_index = q[dim] % yShape[dim];
            currentOffset += (new_index - indices[dim]) * x1Strides[dim];
            indices[dim] = new_index;
        }
    }
    x1Local.SetValue(i, x1Gm.GetValue(currentOffset));
}
```


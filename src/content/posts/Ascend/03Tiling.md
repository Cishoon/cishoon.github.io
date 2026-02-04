---
title: Ascend 学习笔记 03 - 非对齐尾块处理（Tiling）
categories: [笔记]
tags: [AI, 硬件加速, Ascend]
date: 2025-03-24
---

非对齐尾块处理方式。

<!--more-->

之前的例子输入都非常整齐，8x2048的half平分到各个AICore上的很轻松，但是实际情况下不一定这么凑巧。

算子的输入必须要能刚好对齐到一个 block 32B 上，如果不刚好需要先进行数据补齐。



# 流程

## 步骤1：32字节对齐

计算输入的数据能否被 32B 整除，将数据填充到向上填充到32B。



## 步骤2：按照核数拆分数据

尽可能平均分发挥最大性能。例如 42 个 block 分到 4 个核上，分为 11、11、10、10.



## 步骤3：根据UB限制进行内核数据分批计算

一个核一次计算的数据大小受到 UB 限制。`get_unified_buffer_size` 可以获得 UB 大小。

> 一个核一次计算的数据块就叫 tile

这里假设 UB 大小为 1536B 。

以加法为例，x+y=z，计算一下一个 tile 可以放多少个 block。

```
1536B / 32B = 48 block， 最多一次算 48 block
48 / 2 = 24 , double buffer，折半每次计算的数量，翻倍循环次数
24 / 3 = 8 , 每个变量可以取 8 个 block
```



而大核要 11 个block，所以要两次计算，第一次 8 个，第二次 3 个。小核第二次 2 个。



# Tiling 算法

## Tiling 结构体

```cpp
namespace optiling {
BEGIN_TILING_DATA_DEF(TilingData)
    TILING_DATA_FIELD_DEF(uint32_t, bigCoreDataNum); 	// 大核处理的总数据数量（个）
    TILING_DATA_FIELD_DEF(uint32_t, smallCoreDataNum); 	// 小核处理的总数据数量（个）
    
    TILING_DATA_FIELD_DEF(uint32_t, finalBigTileNum); 	// 大核上数据搬运的次数
    TILING_DATA_FIELD_DEF(uint32_t, finalSmallTileNum);	// 小核上数据搬运的次数
    
    TILING_DATA_FIELD_DEF(uint32_t, tileDataNum);		// 单核单次搬运可处理的数据数量
    TILING_DATA_FIELD_DEF(uint32_t, bigTailDataNum);	// 大核最后一次搬运可处理的数据数量
    TILING_DATA_FIELD_DEF(uint32_t, smallTailDataNum);	// 小核最后一次搬运可处理的数据数量
    
    TILING_DATA_FIELD_DEF(uint32_t, tailBlockNum);		// 大核的个数，等于平均分配block的余数
END_TILING_DATA_DEF;
    
REGISTER_TILING_DATA_CLASS(AddCustom, TilingData)
}
```

 

## TilingFunc

以 AddCustom 为例

```cpp
const uint32_t BLOCK_SIZE = 32; // block字节数，常量
const uint32_t BUFFER_NUM = 2;	// double buffer，常量
static ge::graphStatus TilingFunc(gert::TilingContext* context) 
{
    TilingData tiling;	// 解析tiling结构体
    
    // 每个核一次计算最多能处理的字节数，从接口获取
    uint64_t = ubSize; 	
    auto ascendcPlatform = platform_ascendc::PlatformAscendC(context->GetPlatformInfo());
    ascendcPlatform.GetCoreMemSize(platform_ascendc::CoreMemType::UB, ubSize);
    
    // 获取AICore数量
    auto coreNum = ascendcPlatform.GetCoreNum();
    
    // 获取输入数据数量, inputNum表示几个元素
    uint32_t inputNum = context->GetInputShape(0)->GetStorageShape().GetShapeSize();

    // typeLength表示输入的数据类型占几个字节，inputLength表示输入数据的总字节
    uint32_t typeLength = 0;
    ge::TypeUtils::GetDataTypeLength(context->GetInputDesc(0)->GetDataType(), typeLength);
    uint32_t inputLength = inputNum * typeLength;
    
    // ubDataNumber，x+y=z，理论上应该是3，但是Add接口不支持int8，所以先转换成half进行计算
    uint32_t ubDataNumber = (typeLength == 1) ? 5 : 3; // 特殊处理
    // 一个tile里可以存几个block, 一个tile里有几个数据
    uint32_t tileBlockNum = (ubSize / BLOCK_SIZE / BUFFER_NUM) / ubDataNumber;
    uint32_t tileDataNum = (tileBlockNum * BLOCK_SIZE) / typeLength;
    
    // 输入数据向上 32B 对齐
    uint32_t inputLengthAlign32 = (((inputLength - BLOCK_SIZE - 1) / BLOCK_SIZE) * BLOCK_SIZE);
    
    /// 计算核数，即计算上下界。
    // 1. 算上界，最多 coreNum 个核
    coreNum = (coreNum < inputLengthAlign32 / BLOCK_SIZE) ? coreNum : inputLengthAlign32 / BLOCK_SIZE; 
    // 2. 算下界，最少 1 个核
    coreNum = (coreNum >= 1) ? coreNum : 1;
    // 3. 每个核平均计算几个block
   	uint32_t everyCoreInputBlockNum = (inputLengthAlign32 / BLOCK_SIZE) / coreNum; 
    // 4. 余数，即需要几个大核
    uint32_t tailBlockNum = (inputeLengthAlign32 / BLOCK_SIZE) % coreNum; 
    
    /// 计算小核其他参数
    // 1. 小核处理的总数据数量（个）
    uint32_t smallCoreDataNum = everyCoreInputBlockNum * BLOCK_SIZE / typeLength; 
    // 2. 小核Tile数量：finalSmallTileNum
    uint32_t smallTileNum = everyCoreInputBlockNum / tileBlockNum; 
    uint32_t finalSmallTileNum = (everyCoreInputBlockNum % tileBlockNum) == 0 ? smallTileNum : smallTileNum + 1; 
    // 3. 最后一次搬运的数据数量
    uint32_t smallTailDataNum = smallCoreDataNum - (tileDataNum * smallTileNum); 
    smallTailDataNum = smallTailDataNum == 0 ? tileDataNum : smallTailDataNum;
    
    /// 计算大核其他参数
    everyCoreInputBlockNum += 1;
    // 1. 大核处理的总数据数量（个）
    uint32_t bigCoreDataNum = everyCoreInputBlockNum * BLOCK_SIZE / typeLength; 
    // 2. 大核Tile数量：finalBigTileNum
    uint32_t bigTileNum = everyCoreInputBlockNum / tileBlockNum; 
    uint32_t finalBigTileNum = (everyCoreInputBlockNum % tileBlockNum) == 0 ? bigTileNum : bigTileNum + 1; 
    // 3. 最后一次搬运的数据数量
    uint32_t bigTailDataNum = bigCoreDataNum - (tileDataNum * bigTileNum); 
    bigTailDataNum = bigTailDataNum == 0 ? tileDataNum : bigTailDataNum;
    
    // 塞进tiling结构体
    tiling.set_XXXXXX();
    tiling.set_XXXXXX();
    tiling.set_XXXXXX();
    // ...
        
    size_t *currentWorkspace = context->GetWorkspaceSizes(1);
    currentWorkspace[0] = 0;
    return ge::GRAPH_SUCCESS;
}
```



## Kernel侧

```cpp
__aicore__ inline void Init(GM_ADDR x, GM_ADDR y, GM_ADDR z, 
                            uint32_t bigCoreDataNum, uint32_t smallCoreDataNum, 
                            uint32_t finalBigTileNum, uint32_t finalSmallTileNum, 
                            uint32_t tileDataNum, 
                            uint32_t bigTailDataNum, uint32_t smallTailDataNum,
                            uint32_t tailBlockNum)
{
	ASSERT(GetBlockNum() != 0 && "block dim can not be zero!"); // 当前任务配置的核数，保证非0
    
    uint32_t blockIdx = GetBlockIdx(); // 当前AIcore编号
    this->tileDataNum = tileDataNum; // 除了最后一次，一个tile里的数据数量
    
    uint32_t globalBufferIndex; // 这个核处理数据的起始地址
    if (blockNum < tailBlockNum)  // 如果是大核
    {
        this->coreDataNum = bigCoreDataNum;
        this->tileNum = finalBigTileNum;
        this->tailDataNum = bigTailDataNum;
		globalBufferIndex = bigCoreDataNum * blockIdx;
    }
    else { // 小核
        this->coreDataNum = smallCoreDataNum;
        this->tileNum = finalSmallTileNum;
        this->tailDataNum = smallTailDataNum;
        globalBufferIndex = bigCoreDataNum * tailBlockNum 
            				+ smallCoreDataNum * (blockIdx - tailBlockNum);
    }
	
    xGm.SetGlobalBuffer((__gm__ TYPE_X*)x + globalBufferIndex, this->coreDataNum);
    yGm.SetGlobalBuffer((__gm__ TYPE_Y*)y + globalBufferIndex, this->coreDataNum);
    zGm.SetGlobalBuffer((__gm__ TYPE_Z*)z + globalBufferIndex, this->coreDataNum);
    
    pipe.InitBuffer(inQueueX, BUFFER_NUM, this->tileDataNum * sizeof(TYPE_X));
    pipe.InitBuffer(inQueueY, BUFFER_NUM, this->tileDataNum * sizeof(TYPE_Y));
    pipe.InitBuffer(outQueueZ, BUFFER_NUM, this->tileDataNum * sizeof(TYPE_Z));
    pipe.InitBuffer(tmp1, this->tileDataNum * sizeof(half)); // 对于int8的特殊处理
    pipe.InitBuffer(tmp2, this->tileDataNum * sizeof(half)); 
}

__aicore__ inline void Process()
{
    int32_t loopCount = this->tileNum; // 循环的次数，等于tile数量
    this->processDataNum = this->tileDataNum; // 要处理的数据数量
    for (int32_t i = 0; i < loopCount; i++) {
        if (i == loopCount - 1) { // 如果是最后一次
            this->processDataNum = this->tailDataNum;
        }
        CopyIn(i);
        Compute(i);
        CopyOut(i);
    }
}
```





# 总结

1. 数据向上扩展到 32B 
2. 计算出总 block 数
3. 在各个核里平分 block 


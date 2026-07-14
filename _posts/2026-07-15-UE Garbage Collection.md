---
layout: post
title:  "UE Garbage Collection"
date:   2026-07-16 20:30:00 +0800
categories: jekyll update
---

# 引言

垃圾回收（**Garbage Collection**，后简称 **GC**）是一种对内存对象生命周期的自动管理机制。当程序占用的一部分内存在一定时间里不会被再次访问时，依靠 **GC** 算法向系统归还这些内存空间，是 **GC** 的基本目的。GC 可以帮助程序员减轻内存管理的负担，许多语言如 Java、C#、GO 等都内置了 **GC** 机制和垃圾回收器。C++ 语言本身不提供 **GC**，但 UE4/UE5 的 UObject 系统在 C++ 之上实现了自己的 **GC**。

# 概念

根据定义和回收方法的不同，有以下常见的几种 **GC** 回收实现策略：[^1]

## 引用计数法

通常叫做 **Reference Counting**，使用过智能指针的应该都不陌生。它的思路是：

1. 每个对象维护一个引用计数；
2. 引用增减时加减；
3. 计数归零时，对象立刻可以回收。

引用计数最直观优点便是对象的生命周期直接且易于预测，可以立即对归零对象内存进行回收。但它也有一些经典缺点，例如循环引用、多线程下的引用计数更新开销、以及引用计数本身所占用内存的额外开销等。

## 追踪收集法

**Tracing GC** 是 **GC** 策略中最常见的一种策略。它的核心思想是图遍历的可达性分析：

1. 先设计一批根对象（roots）；
2. 从根沿着引用向外遍历；
3. 那么可达对象即当前活跃对象，反之即为垃圾，可进行回收。

只要对象无法从根访问，那么即便出现内部相互引用，也同样会在变成不可达对象。而基于该方法的思路，也诞生了诸多变体，由于笔者认识有限，暂不对其一一概述，本文仅聚焦于 UE 的实现，对该方法进行介绍剖析。

# UE 的 GC 实现

UE 的 GC 大致可以拆成四层：

1. **入口与阶段切分**：从 <cfunc>CollectGarbage</cfunc> 进入，决定这轮 GC 的大框架。
2. **可达性分析**：找出哪些对象还活着。
3. **销毁与清理**：把已经不可达的对象安全地送进 <cfunc>BeginDestroy</cfunc> / <cfunc>FinishDestroy</cfunc> / Purge。
4. **标记阶段内部实现**：继续下潜到 <ctype>FRealtimeGC</ctype>、Schema、并行遍历这些底层细节。

下面也按这个顺序展开。

## 从入口看一次 GC


### 最外层入口：CollectGarbage

先看最外层入口，<cfunc>CollectGarbage</cfunc> 的实现位于 Engine/Source/Runtime/CoreUObject/Private/UObject/GarbageCollection.cpp：

```cpp
void CollectGarbage(EObjectFlags KeepFlags, bool bPerformFullPurge)
{
	AcquireGCLock();
	UE::GC::CollectGarbageInternal(KeepFlags, bPerformFullPurge);
	// GC lock was released after reachability analysis inside CollectGarbageInternal
}
```

最外层逻辑其实很直白：

1. 先拿 <cvar>GCLock</cvar>，避免其他线程同时做 UObject 相关操作。
2. 进入 <cfunc>CollectGarbageInternal</cfunc>。
3. 真正的锁释放并不在这个函数末尾，而是在 GC 内部流程走到合适阶段后释放。

### 转发层：CollectGarbageInternal

而 <cfunc>CollectGarbageInternal</cfunc> 本身又非常薄，只是把工作转发给 <cvar>GReachabilityState</cvar>：

```cpp
FORCEINLINE void CollectGarbageInternal(EObjectFlags KeepFlags, bool bPerformFullPurge)
{
	GReachabilityState.CollectGarbage(KeepFlags, bPerformFullPurge);
}
```

所以从源码结构上看，本文核对的 UE5.7.4 GC 可以粗略分成 3 段：

1. <cfunc>PreCollectGarbageImpl</cfunc>：GC 前准备。
2. <cfunc>PerformReachabilityAnalysis</cfunc>：可达性分析，也就是 Mark。
3. <cfunc>PostCollectGarbageImpl</cfunc> + <cfunc>UnhashUnreachableObjects</cfunc> + <cfunc>IncrementalDestroyGarbage</cfunc>：把不可达对象逐步销毁并释放。

### 源码核对后的修改说明

本文最初整理时混入了旧版本 GC 流程中的符号和顺序。对照 UE5.7.4 的 <cfunc>GarbageCollection.cpp</cfunc> 后，主要修改如下：

1. **调整 <cfunc>PreCollectGarbageImpl</cfunc> 的锁顺序**：GC Lock 不是只在 Flush 异步加载时释放，而是在首次 Reachability 迭代中先释放，再执行 Flush 和 <cfunc>PreGarbageCollect</cfunc> 回调，最后重新获取。这样修改是因为引擎明确要求调用用户回调时不能持有 GC Lock，否则容易产生死锁。
2. **移除 <cvar>GUnreachableObjectFlag</cvar> 与 <cvar>GMaybeUnreachableObjectFlag</cvar> 的交换步骤**：这套旧流程在当前源码中已经不存在，相关全局标记从 UE5.5 开始也已被弃用。
3. **补充 Incremental Gather 分支**：<cfunc>GatherUnreachableObjects</cfunc> 不一定在 <cfunc>PostCollectGarbageImpl</cfunc> 中一次完成；允许增量收集时，它会延后到 <cfunc>UnhashUnreachableObjects</cfunc> 中继续执行。这样修改是为了区分 Full Purge 与普通增量 GC。
4. **把最终释放流程改为 <cfunc>FObjectPurge::DestroyObjects</cfunc>**：当前源码没有 <ctype>FAsyncPurge</ctype>，实际路径是 <cfunc>IncrementalPurgeGarbage</cfunc> -> <cfunc>IncrementalDestroyGarbage</cfunc> -> <cfunc>FObjectPurge::DestroyObjects</cfunc>。
5. **区分引用查询与正式 Mark 路径**：<ctype>FReferenceFinder</ctype> 可以展示属性引用和 ARO 两类来源，但它不是实时 GC 的主遍历器；正式 Mark 由 <ctype>FRealtimeGC</ctype> 和 <ctype>TFastReferenceCollector</ctype> 完成。

## 第一阶段：GC 前准备

### PreCollectGarbageImpl 的关键步骤

<cfunc>FReachabilityAnalysisState::PerformReachabilityAnalysisAndConditionallyPurgeGarbage</cfunc> 会先调用 <cfunc>PreCollectGarbageImpl</cfunc>。这里面比较关键的几件事是：

```cpp
if (!GIsIncrementalReachabilityPending)
{
	ReleaseGCLock();

	if (GFlushStreamingOnGC && IsAsyncLoading())
	{
		FlushAsyncLoading();
	}

	FCoreUObjectDelegates::GetPreGarbageCollectDelegate().Broadcast();

	if (GFlushStreamingOnGC && IsAsyncLoading())
	{
		FlushAsyncLoading();
	}

	AcquireGCLock();
}

GIsGarbageCollectingAndLockingUObjectHashTables = true;
LockUObjectHashTables();
```

这里能看出几个设计点：

1. **首次 Reachability 迭代会先释放 GC Lock**。Flush 和 Delegate 都可能进入其他 UObject 逻辑，持锁执行容易造成死锁。
2. **GC 前可能 Flush 两次异步加载**。第一次处理已有加载任务，第二次处理 <cfunc>PreGarbageCollect</cfunc> 回调中新触发的加载。
3. **PreGarbageCollect Delegate 会在锁外广播**，所以很多引擎模块或业务系统都能在 GC 前安全地做收尾。
4. **UObject 哈希表只在可达性分析阶段加锁**，而不是整个销毁阶段一直锁住。

这也是为什么 UE 的 GC 不只是一个“遍历并 delete”的简单过程，它前后插了不少同步和状态收敛逻辑。

## 第二阶段：可达性分析先回答“谁还活着”

GC 的核心问题其实不是“怎么删”，而是“谁还能活着”。UE 的答案是：**从一组根对象出发，把所有可达对象都标出来，剩下的就是垃圾**。

从源码看，常见的保活路径主要有下面几种。

### 1. RootSet

最直接的一种方式是把对象放进 RootSet。<ctype>UObjectBaseUtility</ctype> 里接口非常明确：

```cpp
FORCEINLINE void AddToRoot()
{
	GUObjectArray.IndexToObject(InternalIndex)->SetRootSet();
}

FORCEINLINE void RemoveFromRoot()
{
	GUObjectArray.IndexToObject(InternalIndex)->ClearRootSet();
}
```

另外在 ObjectMacros.h 里还能看到构造期标记 <cvar>RF_MarkAsRootSet</cvar>：

```cpp
RF_MarkAsRootSet = 0x00000080,
```

<cvar>RF_MarkAsRootSet</cvar> 只用于要求对象在构造时进入 RootSet。对象注册到 <cvar>GUObjectArray</cvar> 后，该标记会被转换成 <cvar>EInternalObjectFlags::RootSet</cvar> 并从 <cvar>EObjectFlags</cvar> 中清除。因此不能用 <cfunc>HasAnyFlags(RF_MarkAsRootSet)</cfunc> 判断对象当前是否位于 RootSet；但一个对象只要实际进入 RootSet，即使没有普通引用链指向它，也不会在这轮 GC 中被回收。

### 2. 反射系统能看到的引用

对于绝大部分业务代码，最常见的保活方式还是 <cvar>UPROPERTY</cvar> / <cvar>TObjectPtr</cvar>。GC 在扫描对象时会同时走“属性引用”和“类自定义引用”两条路。

从引用来源的角度，可以先用 <cfunc>FReferenceFinder::FindReferences</cfunc> 理解“属性引用 + ARO”这两条路径：

```cpp
if (!Object->GetClass()->IsChildOf(UClass::StaticClass()))
{
	AddPropertyReferences(Object->GetClass(), Object, InReferencingObject);
}
Object->CallAddReferencedObjects(*this);
```

这段代码展示了属性引用和 <cfunc>AddReferencedObjects</cfunc> 两类引用来源，但 <ctype>FReferenceFinder</ctype> 本身是通用引用查询辅助类，并不是实时 GC 的主 Mark 路径。正式 GC 会由后文的 <ctype>FRealtimeGC</ctype> 和 <ctype>TFastReferenceCollector</ctype> 根据 Schema 遍历这些引用。

其中 <cfunc>CallAddReferencedObjects</cfunc> 最终走的是类元数据里登记的函数指针：

```cpp
FORCEINLINE void CallAddReferencedObjects(UObject* This, FReferenceCollector& Collector) const
{
	check(CppClassStaticFunctions.GetAddReferencedObjects() != nullptr);
	CppClassStaticFunctions.GetAddReferencedObjects()(This, Collector);
}
```

这也解释了为什么平时会反复强调：

1. UObject 成员引用最好走 <cvar>UPROPERTY</cvar> / <cvar>TObjectPtr</cvar>。
2. 如果某个引用无法被反射系统自动看见，就要自己在 <cfunc>AddReferencedObjects</cfunc> 里补出来。

### 3. 非 UObject 宿主通过 <ctype>FGCObject</ctype> 挂住引用

如果一个对象本身不是 UObject，但它内部又持有 UObject 指针，那就不能指望普通反射系统自动扫描了。这时 UE 提供了 <ctype>FGCObject</ctype>：

```cpp
class FGCObject
{
public:
	virtual void AddReferencedObjects(FReferenceCollector& Collector) = 0;
	virtual FString GetReferencerName() const = 0;
};
```

它背后的实现也很直白，<ctype>UGCObjectReferencer</ctype> 会把所有注册过的 <ctype>FGCObject</ctype> 汇总起来，然后在 GC 时统一转发 <cfunc>AddReferencedObjects</cfunc>。

因此像编辑器工具类、管理器、非 UObject 容器这类对象，只要继承 <ctype>FGCObject</ctype> 并正确上报引用，同样可以参与 GC 引用链。

### 4. Cluster

UE 还引入了 Cluster 来降低 Mark 阶段的遍历成本。<cfunc>CreateCluster</cfunc> 的实现里能看到这种意图：

```cpp
void UObjectBaseUtility::CreateCluster()
{
	const int32 ClusterIndex = GUObjectClusters.AllocateCluster(InternalIndex);
	FClusterReferenceProcessor Processor(InternalIndex, Cluster, GetOutermost());
	CollectReferences(Processor, ArrayStruct);
}
```

本质上可以把 Cluster 理解为：**把一批强关联对象预先收敛成一个组**。这样 GC 扫描到 ClusterRoot 时，不需要再把组内对象当成完全独立的散点来处理。

### 全量与增量入口

GC 的真正主体在 <cfunc>FReachabilityAnalysisState::PerformReachabilityAnalysisAndConditionallyPurgeGarbage</cfunc>。它会根据配置选择全量或增量分析：

```cpp
const bool bReachabilityUsingTimeLimit = !bFullPurge && GAllowIncrementalReachability;
PerformReachabilityAnalysisAndConditionallyPurgeGarbage(bReachabilityUsingTimeLimit);
```

继续往下，<cfunc>PerformReachabilityAnalysis</cfunc> 会决定走 <cfunc>CollectGarbageFull</cfunc> 还是 <cfunc>CollectGarbageIncremental</cfunc>：

```cpp
if (bPerformFullPurge)
{
	UE::GC::CollectGarbageFull(ObjectKeepFlags);
}
else
{
	UE::GC::CollectGarbageIncremental(ObjectKeepFlags);
}
```

这里要注意一点，UE5.7.4 的 GC 已经不是“每次都必须一口气扫完”的模型了，而是支持 **Incremental Reachability**：

1. 本轮先做一段可达性分析。
2. 如果时间片耗尽，就挂起状态。
3. 下一帧再继续从中断点恢复。

对应状态就保存在 <ctype>FReachabilityAnalysisState</ctype> 里，例如：

```cpp
bool bIsSuspended = false;
double IterationStartTime = 0.0;
double IterationTimeLimit = 0.0;
```

这样做的直接目的就是减少单帧 GC 卡顿。

## 第三阶段：不可达对象先整理，再销毁

### PostCollectGarbageImpl 做什么

当可达性分析完成后，<cfunc>PostCollectGarbageImpl</cfunc> 会做一轮后处理：

```cpp
DissolveUnreachableClusters(GatherOptions);
ClearWeakReferences(...);

GGatherUnreachableObjectsState.Init();
if (bPerformFullPurge || !GAllowIncrementalGather ||
	!FGCFlags::IsIncrementalGatherUnreachableSupported())
{
	GatherUnreachableObjects(GatherOptions, 0.0);
}

UnlockUObjectHashTables();
ReleaseGCLock();
```

这里有几个值得关注的点：

1. **本轮记录的弱引用会在这个阶段被处理**。指向不可达对象的弱引用会失效；对于 <cvar>TWeakObjectPtr</cvar>，更准确的说法是它不再有效，而不是保证其内部存储立即被直接置空。
2. **真正的 UObject 哈希锁和 GC 锁在这里陆续释放**，后续的销毁逻辑不再要求整个对象系统一直处于“硬锁死”状态。
3. **不可达对象收集可能立即完成，也可能增量执行**。Full Purge 或不支持 Incremental Gather 时会直接填充 <cvar>GUnreachableObjects</cvar>；否则只初始化状态，随后在 <cfunc>UnhashUnreachableObjects</cfunc> 中继续收集。

这一步做完以后，GC 已经知道“谁该死”，接下来只是“怎么死得安全”。

### BeginDestroy：先进入不可访问状态

#### Unhash 阶段与 BeginDestroy

<cfunc>UnhashUnreachableObjects</cfunc> 会先完成仍未结束的 Incremental Gather，再遍历不可达对象并调用 <cfunc>ConditionalBeginDestroy</cfunc>：

```cpp
while (GUnrechableObjectIndex < GUnreachableObjects.Num())
{
	UObject* Object = static_cast<UObject*>(ObjectItem->Object);
	Object->ConditionalBeginDestroy();
}
```

而 <cfunc>ConditionalBeginDestroy</cfunc> 的核心逻辑也很直接：

```cpp
if (!HasAnyFlags(RF_BeginDestroyed))
{
	SetFlags(RF_BeginDestroyed);
	BeginDestroy();
}
```

也就是说，这个阶段做的不是立刻释放内存，而是：

1. 给对象打上 <cvar>RF_BeginDestroyed</cvar>。
2. 进入对象自定义的 <cfunc>BeginDestroy</cfunc>。
3. 启动异步清理、渲染资源释放、外部句柄断开等“前置销毁工作”。

很多资源型 UObject 都会在这里启动异步释放，而不是立刻删除。

### FinishDestroy：等资源准备好后再做最终销毁

#### IncrementalDestroyGarbage 与 FinishDestroy

后续 <cfunc>IncrementalDestroyGarbage</cfunc> 会继续处理这些不可达对象。关键判断在这里：

```cpp
if (Object->IsReadyForFinishDestroy())
{
	Object->ConditionalFinishDestroy();
}
else
{
	GGCObjectsPendingDestruction.Add(Object);
}
```

如果对象还没准备好，比如还在等渲染线程释放 fence，那就先丢进 pending 队列，下次再试。

真正的 <cfunc>ConditionalFinishDestroy</cfunc> 则会做最终收尾：

```cpp
if (!HasAnyFlags(RF_FinishDestroyed))
{
	SetFlags(RF_FinishDestroyed);
	FinishDestroy();
	GUObjectArray.ResetSerialNumber(this);
	GUObjectArray.RemoveObjectFromDeleteListeners(this);
}
```

这一步之后，对象的弱引用序列号会被重置，删除监听也会移除，说明它已经进入“逻辑上彻底死亡”的阶段。

等所有对象都完成 <cfunc>FinishDestroy</cfunc> 后，<cfunc>FObjectPurge::DestroyObjects</cfunc> 会释放它们在 <cvar>GUObjectArray</cvar> 中的索引，调用 UObject 析构函数，再通过 <cvar>GUObjectAllocator</cvar> 回收对象内存。所以 UE 的对象回收本质上是一个明显的三段流程：

1. <cfunc>BeginDestroy</cfunc>：开始清场。
2. <cfunc>FinishDestroy</cfunc>：确认可以收尾。
3. <cvar>Purge/Delete</cvar>：最终释放内存。

## 把整条主线串起来：一次完整 GC 的调用链

### 调用链总览

把前面的流程串起来，大致就是下面这样：

```cpp
CollectGarbage(...)
	AcquireGCLock()
	CollectGarbageInternal(...)
		GReachabilityState.CollectGarbage(...)
			PreCollectGarbageImpl(...)
				ReleaseGCLock()
				[可选] FlushAsyncLoading()
				BroadcastPreGarbageCollect() // 锁外回调
				[可选] FlushAsyncLoading()
				AcquireGCLock()
				LockUObjectHashTables()
			PerformReachabilityAnalysisAndConditionallyPurgeGarbage(...)
				PerformReachabilityAnalysis()
					CollectGarbageFull / CollectGarbageIncremental
			PostCollectGarbageImpl(...)
				ClearWeakReferences()
				初始化或直接执行 GatherUnreachableObjects()
				UnlockUObjectHashTables()
				ReleaseGCLock()
				[Full Purge 或关闭增量 BeginDestroy]
					UnhashUnreachableObjects()
						[必要时继续 GatherUnreachableObjects()]
						ConditionalBeginDestroy()
				[Full Purge] IncrementalPurgeGarbage(false)
			[普通 GC 的后续 Tick] IncrementalPurgeGarbage(...)
				UnhashUnreachableObjects()
					ConditionalBeginDestroy()
				IncrementalDestroyGarbage()
					IsReadyForFinishDestroy()
					ConditionalFinishDestroy()
					FObjectPurge::DestroyObjects()
```

为了更直观一点，也可以把这条主线画成一个时序图：

<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({
	startOnLoad: true,
	theme: 'default',
	themeVariables: {
		fontSize: '12px'
	}
});
</script>

<style>
.mermaid svg {
	max-width: 100%;
	height: auto;
}

.mermaid text,
.mermaid .messageText,
.mermaid .noteText {
	font-size: 12px !important;
}
</style>

<div class="mermaid">
sequenceDiagram
	participant Game as Game Thread
	participant Reach as FReachabilityState
	participant FastGC as FRealtimeGC / TFastReferenceCollector
	participant Purge as Destroy Phase

	Game->>Game: AcquireGCLock()
	Game->>Reach: CollectGarbageInternal()
	Reach->>Reach: PreCollectGarbageImpl()
	Reach->>Game: ReleaseGCLock()
	alt 正在异步加载
		Game->>Game: FlushAsyncLoading()
	end
	Reach->>Reach: BroadcastPreGarbageCollect()
	opt 回调触发新的异步加载
		Game->>Game: FlushAsyncLoading()
	end
	Reach->>Game: AcquireGCLock()
	Reach->>Reach: LockUObjectHashTables()
	Reach->>FastGC: PerformReachabilityAnalysis()
	FastGC->>FastGC: Mark root / initial refs
	FastGC->>FastGC: Traverse token stream
	alt 增量可达性超时
		FastGC-->>Reach: Suspend and continue next frame
	else 本轮完成
		FastGC-->>Reach: Reachability complete
	end
	Reach->>Reach: ClearWeakReferences()
	Reach->>Reach: Init / GatherUnreachableObjects
	Reach->>Game: UnlockUObjectHashTables()
	Reach->>Game: ReleaseGCLock()
	Reach->>Purge: UnhashUnreachableObjects()
	Purge->>Purge: Continue incremental gather if pending
	Purge->>Purge: ConditionalBeginDestroy()
	Purge->>Purge: IncrementalDestroyGarbage()
	loop Until ready
		Purge->>Purge: IsReadyForFinishDestroy()
	end
	Purge->>Purge: ConditionalFinishDestroy()
	Purge->>Purge: FObjectPurge::DestroyObjects()
	Purge-->>Game: GC complete
</div>

这条链路说明 UE 的 GC 并不是传统教材里那种“单线程 stop-the-world 标记清除”的简化版本，而是混合了：

1. 反射引用收集。
2. 自定义 <cfunc>AddReferencedObjects</cfunc>。
3. 非 UObject 宿主的 <ctype>FGCObject</ctype>。
4. Cluster 优化。
5. 增量 Reachability。
6. 增量 Destroy/Purge。

## 第四阶段：再往下看一层，FRealtimeGC 怎么并行遍历引用

上面提到 Mark 阶段最终会进入 <ctype>FRealtimeGC</ctype>。这一层开始，UE 才真正把“对象图遍历”这件事做成了可并行的流水线。

### FRealtimeGC 的分发层

先看 <ctype>FRealtimeGC</ctype> 的核心分发逻辑：

```cpp
template<class CollectorType, class ProcessorType>
FORCEINLINE void CollectReferencesForGC(ProcessorType& Processor, UE::GC::FWorkerContext& Context)
{
	using FastReferenceCollector = TFastReferenceCollector<ProcessorType, CollectorType>;

	if constexpr (IsParallel(ProcessorType::Options))
	{
		ProcessAsync([](void* P, FWorkerContext& C) { FastReferenceCollector(*reinterpret_cast<ProcessorType*>(P)).ProcessObjectArray(C); }, &Processor, Context);
	}
	else
	{
		FastReferenceCollector(Processor).ProcessObjectArray(Context);
	}
}
```

这里已经把设计意图写得很明显了：

1. <ctype>FRealtimeGC</ctype> 自己不直接写遍历细节，它负责根据配置选择不同 <ctype>Processor</ctype> 和 <ctype>Collector</ctype> 组合。
2. 真正的对象遍历由 <cfunc>TFastReferenceCollector::ProcessObjectArray</cfunc> 完成。
3. 如果启用了并行 GC，就通过 <cfunc>ProcessAsync</cfunc> 把多个 <ctype>FWorkerContext</ctype> 分发到不同 worker 上执行。

#### 初始引用收集

另外 <ctype>FRealtimeGC</ctype> 在正式遍历前，还会单独准备一批 <cvar>InitialReferences</cvar>：

```cpp
if (IsParallel(Options))
{
	InitialCollection = UE::Tasks::Launch(TEXT("CollectInitialReferences"),
		[&] () { FGCObject::GGCObjectReferencer->AddInitialReferences(InitialReferences); });
}
```

这一步主要在并行 GC 下把 <ctype>FGCObject</ctype> 那条链上的初始原生引用提前收集出来。这样后续 worker 一启动，就能直接从统一的初始引用集开始扩散；单线程 GC 不会在这里预收集，而是通过 <cfunc>UGCObjectReferencer::AddReferencedObjects</cfunc> 处理。

### TFastReferenceCollector 的并行模型

<cfunc>TFastReferenceCollector::ProcessObjectArray</cfunc> 是并行遍历最核心的函数。它不是简单“每个线程扫自己那一段数组”，而是一个带工作窃取的循环：

```cpp
while (true)
{
	Context.Stats.AddObjects(CurrentObjects.Num());
	ProcessObjects(Dispatcher, CurrentObjects);

	if (Processor.IsTimeLimitExceeded())
	{
		FlushWork(Dispatcher);
		Dispatcher.Suspend();
		SuspendWork(Context);
		return;
	}

	FWorkBlock* Block = RemainingObjects.PopFullBlock<Options>();
	...
	switch (StealWork(Context, Collector, Block, Options))
	{
		case ELoot::Block: break;
		case ELoot::ARO: goto StoleARO;
		case ELoot::Context: goto StoleContext;
	}
}
```

这里面可以看出 3 个关键机制：

1. **对象不是按单个粒度分发，而是按 block 分发**，降低线程同步成本。
2. **本地队列空了以后可以 <cfunc>StealWork</cfunc>**，从其他 worker 那里偷 block 或上下文，尽量保持所有核心都在干活。
3. **增量 GC 时可以 suspend**，把当前上下文保留下来，下一帧继续跑。

所以 UE 的并行遍历并不是“静态切片”，而更接近一个 work-stealing scheduler。

### 每个对象在遍历时会做什么

#### 对象遍历时的三类输入

继续看 <cfunc>ProcessObjects</cfunc>：

```cpp
UClass* Class = CurrentObject->GetClass();
UObject* Outer = CurrentObject->GetOuter();

if (!!(Options & EGCOptions::AutogenerateSchemas) && !Class->HasAnyClassFlags(CLASS_TokenStreamAssembled))
{
	Class->AssembleReferenceTokenStream();
}

FSchemaView Schema = Class->ReferenceSchema.Get();
Dispatcher.HandleImmutableReference(Class, EMemberlessId::Class, EOrigin::Other);
Dispatcher.HandleImmutableReference(Outer, EMemberlessId::Outer, EOrigin::Other);
Private::VisitMembers(Dispatcher, Schema, CurrentObject);
```

这段逻辑非常关键，它说明一个 UObject 在 GC 看来其实会被拆成 3 类输入：

1. **隐含引用**：<cvar>Class</cvar>、<cvar>Outer</cvar>，以及仅在 <cvar>WITH_EDITOR</cvar> 下处理的 <cvar>ExternalPackage</cvar>。
2. **Schema 描述的成员引用**：也就是 Token Stream / GC Schema 里记录的属性布局。
3. **ARO 路径**：在 Schema 访问过程中命中的 <cfunc>AddReferencedObjects</cfunc> 调用。

换句话说，<ctype>FRealtimeGC</ctype> 并不是靠 C++ 反射逐字段动态判断，而是尽量把“怎么访问成员引用”预编译成 Schema，然后在遍历期做顺序解释执行。

### Token Stream / GC Schema：GC 真正遍历的不是属性，而是“编译后的引用布局”

#### Schema 的组装阶段

UE 老资料里经常会提到 <cvar>ReferenceTokenStream</cvar>。在 UE5.7.4 这套实现里，它更接近一个已经结构化好的 **GC Schema**。<cfunc>UClass::AssembleReferenceTokenStreamInternal</cfunc> 负责把类的属性信息编译成这份 Schema：

```cpp
FSchemaBuilder Schema(0);
if (UClass* SuperClass = GetSuperClass())
{
	SuperClass->AssembleReferenceTokenStreamInternal();
	Schema.Append(SuperSchema);
}

for (TFieldIterator<FProperty> It(this, EFieldIteratorFlags::ExcludeSuper); It; ++It)
{
	FProperty* Property = *It;
	Property->EmitReferenceInfo(Schema, 0, EncounteredStructProps, DebugPath);
}

ReferenceSchema.Set(FSchemaView(...));
ClassFlags |= CLASS_TokenStreamAssembled;
```

这里有两个重点：

1. **Schema 会先继承父类的引用布局**，所以子类不需要重复描述整条继承链。
2. **每个 <ctype>FProperty</ctype> 不是在 GC 时被直接访问，而是在组装阶段先发出自己的引用描述**。

#### EmitReferenceInfo 到底在发什么

不同属性类型会把自己翻译成不同的 <ctype>EMemberType</ctype>。

例如最普通的 UObject 指针属性：

```cpp
void FObjectProperty::EmitReferenceInfo(...)
{
	Schema.Add(UE::GC::DeclareMember(DebugPath, BaseOffset + GetOffset_ForGC(), UE::GC::EMemberType::Reference));
}
```

数组属性则会根据内部元素类型发出不同 token：

```cpp
if (Inner->IsA(FObjectProperty::StaticClass()))
{
	Type = EMemberType::ReferenceArray;
}
else
{
	Inner->EmitReferenceInfo(InnerSchema, 0, EncounteredStructProps, DebugPath);
}

Schema.Add(UE::GC::DeclareMember(DebugPath, BaseOffset + GetOffset_ForGC(), Type, InnerSchema.Build()));
```

##### 结构体和数组这类复杂成员

结构体属性更有意思，如果结构体自己实现了 <cfunc>AddStructReferencedObjects</cfunc>，还会发一个 <cvar>MemberARO</cvar>：

```cpp
if (Struct->StructFlags & STRUCT_AddStructReferencedObjects)
{
	Schema.Add(UE::GC::DeclareMember(DebugPath, Offset + Idx * ElementSize, EMemberType::MemberARO, StructARO));
}
```

所以 Token Stream / Schema 里并不只是“某偏移上有个 UObject*”这么简单，它还会编码：

1. 这是单对象引用还是数组引用。
2. 这是普通数组、稀疏数组还是 memory image array。
3. 这里是否要递归进入内嵌 struct。
4. 这里是否要额外调用 ARO。
5. 什么时候 <cvar>Jump</cvar>，什么时候 <cvar>Stop</cvar>。

#### 遍历时怎么解释执行这些 token

真正消费 Schema 的地方是 <cfunc>VisitMembers</cfunc>：

```cpp
switch (Member.Type)
{
	case EMemberType::Reference:
		Dispatcher.HandleKillableReference(*(UObject**)MemberPtr, FMemberId(DebugIdx), Origin);
		break;
	case EMemberType::ReferenceArray:
		Dispatcher.HandleKillableArray(*(TArray<UObject*>*)MemberPtr, FMemberId(DebugIdx), Origin);
		break;
	case EMemberType::StructArray:
		VisitStructArray(Dispatcher, FSchemaView((++WordIt)->InnerSchema, Origin), *(FScriptArray*)MemberPtr);
		break;
	case EMemberType::MemberARO:
		CallARO(Dispatcher, MemberPtr, *++WordIt);
		break;
	case EMemberType::ARO:
		CallARO(Dispatcher, Instance, *++WordIt);
		return;
	case EMemberType::Stop:
		return;
}
```

这个实现很像一个轻量字节码解释器：

1. 读一个 member word。
2. 根据 <ctype>EMemberType</ctype> 决定是直接取引用、遍历数组、递归 struct，还是调用 ARO。
3. 必要时通过 <cvar>Jump</cvar> 调整实例游标。
4. 遇到 <cvar>Stop</cvar> 或实例级 <cvar>ARO</cvar> 就结束。

相比每次 GC 都重新基于 <ctype>FProperty</ctype> 做虚函数分派，这种方案的优势是：**遍历期更线性、更 cache friendly，也更适合并行 worker 批处理。**

### 命中引用之后发生什么

#### 从 token 到真正标记对象

当 <cfunc>VisitMembers</cfunc> 找到一个真正的 UObject 引用时，最终会落到 <cfunc>HandleTokenStreamObjectReference</cfunc>：

```cpp
if (ValidateReference(Object, PermanentPool, FReferenceToken(ReferencingObject), MemberId))
{
	FReferenceMetadata Metadata(GUObjectArray.ObjectToIndex(Object));
	...
	bool bReachedFirst = TReachabilityProcessor<Options>::HandleValidReference(Context, FImmutableReference{Object}, Metadata);
}
```

这里才会真正决定：

1. 这个引用是否合法。
2. 指向的对象是不是第一次被标记到。
3. 是否需要把它推进后续工作队列。
4. 在开启 Garbage Elimination / History Tracking 时，是否顺手做额外处理。

所以从实现层面讲，GC 的 Mark 阶段可以拆成下面这条更底层的流水线：

1. <cfunc>UClass::AssembleReferenceTokenStreamInternal</cfunc> 预编译 Schema。
2. <cfunc>TFastReferenceCollector::ProcessObjectArray</cfunc> 按 block 拉取对象。
3. <cfunc>VisitMembers</cfunc> 解释执行 Schema。
4. <cfunc>HandleTokenStreamObjectReference</cfunc> 校验并标记目标对象。
5. 新发现的对象继续入队，直到没有新的可达对象为止。

## 对业务代码的几个直接结论

读完这套实现后，平时写 UE 代码时有几个结论会更清楚：

1. **UObject 引用不要裸奔**。能让反射系统看见的引用，尽量走 <cvar>UPROPERTY</cvar> / <cvar>TObjectPtr</cvar>。
2. **如果引用藏在非反射容器里，就要自己补 <cfunc>AddReferencedObjects</cfunc>**，否则对象看起来“明明还在用”，但 GC 并不知道。
3. **非 UObject 管理器持有 UObject 时，优先考虑 <ctype>FGCObject</ctype>**。
4. **<cfunc>AddToRoot</cfunc> 虽然好用，但不要滥用**。RootSet 是最硬的保活方式，用多了很容易把对象生命周期搞乱。
5. **<cfunc>BeginDestroy</cfunc> 和 <cfunc>FinishDestroy</cfunc> 不是一回事**。有异步资源的对象，经常会卡在两者之间一段时间。

# 小结

UE5.7.4 的垃圾回收，本质上仍然是“从 Root 出发做可达性分析，再清理不可达对象”的 Mark-Sweep 思路；但为了适应大型项目的运行时需求，引擎在实现上又叠加了增量分析、多线程引用遍历、Cluster、增量销毁等一整套机制。

所以平时我们遇到的很多 GC 问题，例如对象被提前回收、WeakPtr 失效、资源迟迟不释放、某一帧 GC 卡顿严重，往往都可以沿着下面这几个方向排查：

1. 引用链有没有被反射系统或 <cfunc>AddReferencedObjects</cfunc> 正确上报。
2. 对象是不是被错误地 Root 住了。
3. 是否卡在 <cfunc>BeginDestroy</cfunc> -> <cfunc>IsReadyForFinishDestroy</cfunc> -> <cfunc>FinishDestroy</cfunc> 之间。
4. 是否开启了 Incremental Reachability / Incremental Purge，导致 GC 跨帧完成。

把这条主线理顺之后，再去看具体模块的 GC Bug，基本就不会只停留在“这个对象怎么突然没了”的表面现象上了。

# 参考
- [Wikipedia: Garbage Collection (computer science)](https://en.wikipedia.org/wiki/Garbage_collection_(computer_science))
---
layout: post
title:  "UE Garbage Collection"
date:   2026-07-18 20:30:00 +0800
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

UE 的 GC 按实际调用链大致可以拆成五层：

1. **入口与阶段切分**：从 <cfunc>CollectGarbage</cfunc> 进入，决定这轮 GC 的大框架。
2. **GC 前准备**：释放/重新获取 GC Lock，处理异步加载、回调和 UObject Hash 锁。
3. **可达性分析的输入与调度**：说明哪些对象会成为保活起点，以及本轮走全量、增量、暂停还是恢复。
4. **标记阶段内部实现**：下潜到 <ctype>FRealtimeGC</ctype>、Schema、并行遍历这些底层细节。
5. **后处理、销毁与清理**：把不可达对象整理出来，再安全地送进 <cfunc>BeginDestroy</cfunc> / <cfunc>FinishDestroy</cfunc> / Purge。

首先通过调用链先对 GC 的整体实现有个把握：

```cpp
// GarbageCollection.cpp
CollectGarbage(...)
	AcquireGCLock()
	CollectGarbageInternal(...)
		GReachabilityState.CollectGarbage(...)
			[如果上一轮增量可达性还未完成]
				bPerformFullPurge = true
				PerformReachabilityAnalysisAndConditionallyPurgeGarbage(false)
				AcquireGCLock()
			PerformReachabilityAnalysisAndConditionallyPurgeGarbage(...)
				PreCollectGarbageImpl(...)
					ReleaseGCLock()
					[可选] FlushAsyncLoading()
					BroadcastPreGarbageCollect() // 锁外回调
					[可选] FlushAsyncLoading()
					AcquireGCLock()
					[如果上一轮增量销毁还未完成] IncrementalPurgeGarbage(false)
					LockUObjectHashTables()
				PerformReachabilityAnalysis()
					CollectGarbageFull / CollectGarbageIncremental
						CollectGarbageImpl(...)
							FRealtimeGC::PerformReachabilityAnalysis(...)
				[如果需要追踪垃圾引用] FRealtimeGC::PerformReachabilityAnalysis(...) // debug rerun
				PostCollectGarbageImpl(...)
					[如果可达性分析已完成]
						DissolveUnreachableClusters()
						ClearWeakReferences()
						初始化或直接执行 GatherUnreachableObjects()
					UnlockUObjectHashTables()
					ReleaseGCLock()
					[如果可达性分析已完成]
						PostReachabilityAnalysis.Broadcast()
						[Full Purge 或关闭增量 BeginDestroy]
							UnhashUnreachableObjects()
								[必要时继续 GatherUnreachableObjects()]
								ConditionalBeginDestroy()
						GObjPurgeIsRequired = true
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
	participant Reach as FReachabilityAnalysisState
	participant FastGC as FRealtimeGC / TFastReferenceCollector
	participant Purge as Destroy Phase

	Game->>Game: AcquireGCLock()
	Game->>Reach: CollectGarbageInternal()
	Reach->>Reach: PerformReachabilityAnalysisAndConditionallyPurgeGarbage()
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
	opt 上轮增量销毁尚未完成
		Reach->>Purge: IncrementalPurgeGarbage(false)
	end
	Reach->>Reach: LockUObjectHashTables()
	Reach->>FastGC: PerformReachabilityAnalysis()
	FastGC->>FastGC: Mark root / initial refs
	FastGC->>FastGC: Traverse token stream
	alt 增量可达性超时
		FastGC-->>Reach: Suspend and continue next frame
	else 本轮完成
		FastGC-->>Reach: Reachability complete
	end
	opt 可达性分析已完成
		Reach->>Reach: ClearWeakReferences()
		Reach->>Reach: Init / GatherUnreachableObjects
	end
	Reach->>Game: UnlockUObjectHashTables()
	Reach->>Game: ReleaseGCLock()
	opt 可达性分析已完成
		Reach->>Purge: UnhashUnreachableObjects()
		Purge->>Purge: Continue incremental gather if pending
		Purge->>Purge: ConditionalBeginDestroy()
		Purge->>Purge: IncrementalDestroyGarbage()
		loop Until ready
			Purge->>Purge: IsReadyForFinishDestroy()
		end
		Purge->>Purge: ConditionalFinishDestroy()
		Purge->>Purge: FObjectPurge::DestroyObjects()
	end
	Purge-->>Game: GC complete
</div>

这条链路说明 UE 的 GC 并不是传统教材里那种“单线程 stop-the-world 标记清除”的简化版本，而是混合了：

1. 反射引用收集。
2. 自定义 <cfunc>AddReferencedObjects</cfunc>。
3. 非 UObject 宿主的 <ctype>FGCObject</ctype>。
4. Cluster 优化。
5. 增量 Reachability。
6. 增量 Destroy/Purge。

下面按实际调用链展开，对 GC 的流程进行拆解和分析：

## 入口与阶段切分：从入口看一次 GC


### 最外层入口：CollectGarbage

先看最外层入口，<cfunc>CollectGarbage</cfunc> 的实现位于 Engine/Source/Runtime/CoreUObject/Private/UObject/GarbageCollection.cpp：

```cpp
// GarbageCollection.cpp
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

<cfunc>CollectGarbageInternal</cfunc> 本身又非常薄，只是把工作转发给 <cvar>GReachabilityState</cvar>：

```cpp
// GarbageCollection.cpp
FORCEINLINE void CollectGarbageInternal(EObjectFlags KeepFlags, bool bPerformFullPurge)
{
	GReachabilityState.CollectGarbage(KeepFlags, bPerformFullPurge);
}
```
<ctype>FReachabilityAnalysisState</ctype> 是 UE 的 GC 状态机，负责整个可达性分析和销毁阶段的状态管理。它的成员函数 <cfunc>CollectGarbage</cfunc> 不只是简单转发：如果上一轮增量可达性分析还没结束，它会先强制以 Full Purge 的方式把上一轮收尾，再重新获取 GC Lock，随后才启动这次请求的 GC：
```cpp
// GarbageCollection.cpp
void FReachabilityAnalysisState::CollectGarbage(...)
{
	if (GIsIncrementalReachabilityPending)
	{
		bPerformFullPurge = true;
		...
		PerformReachabilityAnalysisAndConditionallyPurgeGarbage(/*bReachabilityUsingTimeLimit =*/ false);
		...
		AcquireGCLock();
	}

	ObjectKeepFlags = KeepFlags;
	bPerformFullPurge = bFullPurge;
	const bool bReachabilityUsingTimeLimit = !bFullPurge && GAllowIncrementalReachability;
	PerformReachabilityAnalysisAndConditionallyPurgeGarbage(bReachabilityUsingTimeLimit);
}
```

<cfunc>PerformReachabilityAnalysisAndConditionallyPurgeGarbage</cfunc> 是 GC 的核心调度函数，其内部逻辑可分成如下 3 段：

1. <span class="cfunc">PreCollectGarbageImpl</span>：GC 前准备。
2. <span class="cfunc">PerformReachabilityAnalysis</span>：可达性分析，也就是 Mark。
3. <span class="cfunc">PostCollectGarbageImpl</span>：释放 UObject Hash/GC Lock；如果本轮可达性分析已经完成，再处理弱引用、收集不可达对象，并按 Full Purge 或后续 Tick 进入销毁阶段。

## 第一阶段：GC 前准备

GC 流程会先调用 <cfunc>PreCollectGarbageImpl</cfunc>，用于做一些 GC 前的准备工作：

```cpp
// GarbageCollection.cpp
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

1. **部分流程前会先释放 GC Lock**：
   
   <span class="cfunc">FlushAsyncLoading</span> 和 <ctype>GetPreGarbageCollectDelegate</ctype> 可能会存在竞争 GC 锁操作🔒，持锁🔒执行容易造成死锁。可以参考[GC & AsyncLoading DeadLock Bug]({% post_url 2026-07-08-GCDeadLockBug %})。
2. **GC 前可能 Flush 两次异步加载**:
   
   第一次处理已有加载任务，第二次处理客户端逻辑 <cfunc>PreGarbageCollect</cfunc> 回调可能触发新的加载。

3. **UObject 哈希表只在可达性分析阶段加锁**：
   
   比较有意思的是除了 GC 外， UObject 哈希表只会在 <cfunc>UObject::Rename</cfunc> 和 <cfunc>GetArchetypeFromRequiredInfo</cfunc> 里加锁。

## 第二阶段：可达性分析的输入与调度

正如前文所述 UE 采取的是 **Tracing GC** 的策略，因此需要从一组根对象出发进行可达性分析，判断 GC 时哪些是垃圾，占据的动态内存可以被正确回收。

### 如何区分垃圾

在 UE 中区分垃圾的方式主要有下面四种：
#### 1. **根对象**

**根对象**是 GC 追踪的出发点，必不是垃圾。客户端逻辑也常用 <ctype>UObjectBaseUtility</ctype> 里的接口标记/解标记根对象：

```cpp
// UObjectBaseUtility.h
void AddToRoot()
{
	GUObjectArray.IndexToObject(InternalIndex)->SetRootSet();
}

void RemoveFromRoot()
{
	GUObjectArray.IndexToObject(InternalIndex)->ClearRootSet();
}
```

除了上述接口外，在 *ObjectMacros.h* 中还存在构造期标记 <cvar>RF_MarkAsRootSet</cvar>，该标记可实现 UObject 对象在构造时被添加进 RootSet。可以在 <cfunc>UObjectBase::AddObject</cfunc> 中看到其作用：
```cpp
// ObjectMacros.h
RF_MarkAsRootSet = 0x00000080,

// UObjectBase.cpp
void UObjectBase::AddObject(UObjectBase* Object)
{
	...
	if (ObjectFlags & RF_MarkAsRootSet)
	{		
		InternalFlagsToSet |= EInternalObjectFlags::RootSet;
		ObjectFlags &= ~RF_MarkAsRootSet;
	}
	...
}
```
两种方法均会殊途同归调用到如下调用链：
```cpp
// UObjectArray.h / GarbageCollection.cpp
ThisThreadAtomicallySetFlag(...)
	SetRootFlags(...)
```
而 <cfunc>SetRootFlags</cfunc> 负责处理 <ctype>UObject</ctype> 对象自身的根标记以及把 <ctype>UObject</ctype> 对象的**索引**添加至全局根集 <cvar>UE::GC::Private::GRoots</cvar> 其具体流程如下：
1. 给 <cvar>FUObjectItem::Flags</cvar> 原子设置 <cmrc>EInternalObjectFlags_RootFlags</cmrc>；
2. 若对象此前没有任何根标记，将其对象索引加进 <cvar>UE::GC::Private::GRoots</cvar>；
3. 如果正处于增量可达性分析阶段，调用 <cfunc>MarkAsReachable</cfunc>，避免刚加入 RootSet 的对象被本轮 GC 回收。

#### 2. 反射可见引用

🐱对于绝大部分客户端逻辑代码，这是最常见的保活方式。为对象添加 <cvar>UPROPERTY</cvar> 标记的 <cvar>TObjectPtr</cvar>，即可通过反射暴露对象的引用。

💻GC 在扫描对象时，根据添加引用源的不同，分为“属性引用”和“自定义引用”两种方式。

📕可以用 <cfunc>FReferenceFinder::FindReferences</cfunc> 理解两种方式在 GC 扫描可达性中的差异：

```cpp
// GarbageCollection.cpp
if (!Object->GetClass()->IsChildOf(UClass::StaticClass()))
{
	AddPropertyReferences(Object->GetClass(), Object, InReferencingObject);
} 
Object->CallAddReferencedObjects(*this);
```

这段代码展示了两类引用来源的查询差异，<cfunc>AddPropertyReferences</cfunc> 通过类上的信息获取反射属性链 `UStruct->RefLink`：
```cpp
// UObjectGlobals.cpp
static void CollectStructReferences(FReferenceCollector& Collector, const StructType* Struct, void* Instance, const UObject* Referencer)
{
	...
	for (FProperty* It = Struct->RefLink; It; It = It->NextRef)
	{
		FPlatformMisc::PrefetchBlock(It->NextRef, PropertyPrefetchBytes);
		CollectPropertyReferences<CollectFlags>(Collector, *It, Instance, Referencer);
	}
}
```
而 <cfunc>CallAddReferencedObjects</cfunc> 则通过类元数据里记录的函数指针，获取引用对象：

```cpp
// Class.h
FORCEINLINE void CallAddReferencedObjects(UObject* This, FReferenceCollector& Collector) const
{
	check(CppClassStaticFunctions.GetAddReferencedObjects() != nullptr);
	CppClassStaticFunctions.GetAddReferencedObjects()(This, Collector);
}
```

#### 3. 非 UObject 对象使用 <ctype>FGCObject</ctype> 引用

🤦‍如果一个对象本身不是 UObject，但它内部又持有 UObject 指针，那就不能指望普通反射系统自动扫描了，因为它甚至不存在 UStruct 的类似结构。因此 UE 提供了全新的数据结构对此类对象进行管理 <ctype>FGCObject</ctype>：

```cpp
// GCObject.h
class FGCObject
{
public:
	virtual void AddReferencedObjects(FReferenceCollector& Collector) = 0;
	virtual FString GetReferencerName() const = 0;
};
```

实现很简单，<ctype>UGCObjectReferencer</ctype> 会把所有注册过的 <ctype>FGCObject</ctype> 汇总起来，然后在 GC 时统一转发 <cfunc>AddReferencedObjects</cfunc>。

非 <ctype>UObject 对象</ctype>，只要继承 <ctype>FGCObject</ctype>，同样可以参与 GC 引用链。

#### 4. Cluster

UE 还引入了 Cluster 来降低 Mark 阶段的遍历成本。<cfunc>CreateCluster</cfunc> 的实现里能看到这种意图：

```cpp
// UObjectClusters.cpp
void UObjectBaseUtility::CreateCluster()
{
	const int32 ClusterIndex = GUObjectClusters.AllocateCluster(InternalIndex);
	FClusterReferenceProcessor Processor(InternalIndex, Cluster, GetOutermost());
	CollectReferences(Processor, ArrayStruct);
}
```

本质上就是挨个遍历太麻烦了，而 Cluster **把一批强关联对象预先收敛成一个组**。这样 GC 扫描到 ClusterRoot 时，不需要再把组内对象当成完全独立的散点来处理。

### 调度入口：PerformReachabilityAnalysis

可达性分析（Reachability Analysis）负责把对象标记为“可能不可达”，再从保活起点沿引用图扩展，所有被访问到的对象都会重新标为可达。不可达对象会在下一阶段被收集和销毁。

这里有两个同名但职责不同的入口：

1. <span class="cfunc">FReachabilityAnalysisState::PerformReachabilityAnalysis</span> 是**调度层**：决定本次收集是否执行或推迟一轮。
2. <span class="cfunc">FRealtimeGC::PerformReachabilityAnalysis</span> 是**执行层**：从根集出发实际遍历 <ctype>UObject</ctype> 的引用图。

#### 调度：全量、增量与延迟迭代

调度层的代码如下：

```cpp
// GarbageCollection.cpp
void FReachabilityAnalysisState::PerformReachabilityAnalysis()
{
	...

	if (bPerformFullPurge)
	{ 	UE::GC::CollectGarbageFull(...); } 			// [全量 GC]
	else if (NumRechabilityIterationsToSkip == 0 || // 不跳过本轮迭代
	!bIsSuspended || 								// 处理首次迭代可能存在的不可达
	IterationTimeLimit <= 0.0f) 					// 无时间约束条件
	{ 	UE::GC::CollectGarbageIncremental(...); } 	// [增量 GC]
	else
	{ 	/* 延迟可达性分析，跳过本轮*/ }

	...
}
```

上述的逻辑很直白仅是根据条件把请求转发至**全量**或**增量**收集。但无论哪种收集方式，最终都会通过如下调用链：
```cpp
// GarbageCollection.cpp
CollectGarbageFull / CollectGarbageIncremental
	CollectGarbageImpl(...)
		FRealtimeGC::PerformReachabilityAnalysis(...)
```
最终调用 <span class="cfunc">FRealtimeGC::PerformReachabilityAnalysis</span> 执行层，进行可达性分析。

**全量/增量** 的区分会仅体现在 <cfunc>CollectGarbageImpl</cfunc> 的内部参数上：
```cpp
// GarbageCollection.cpp
template<bool bPerformFullPurge>
void CollectGarbageImpl(...)
{
	...
	const EGCOptions Options = GetReferenceCollectorOptions(bPerformFullPurge);
	// return value = EGCOptions::IncrementalReachability : EGCOptions::None
	...
}
```
<span class="cvar">Options</span> 中的标记参数决定下一步执行**全量**或**增量**可达性分析。

#### 集合初始化

进入 <ctype>FRealtimeGC::PerformReachabilityAnalysis</ctype> 会调用 <cfunc>StartReachabilityAnalysis</cfunc>。其核心是 <cfunc>MarkObjectsAsUnreachable</cfunc>：

```cpp
// GarbageCollection.cpp
// FRealTimeGC::PerformReachabilityAnalysis
//   StartReachabilityAnalysis
//		MarkObjectsAsUnreachable
// ping-pong design, mark all UObject unreachable
FGCFlags::SwapReachableAndMaybeUnreachable();

MarkClusteredObjectsAsReachable(GatherOptions, InitialObjects);
MarkRootObjectsAsReachable(GatherOptions, KeepFlags, InitialObjects);
```

这个过程中比较有意思的是，<cfunc>FGCFlags::SwapReachableAndMaybeUnreachable</cfunc> 采用了一种 ping-pong 的设计机制：它并未逐对象写入“**不可达**”标记，仅交换全局 <cvar>Reachable</cvar> 与 <cvar>MaybeUnreachable</cvar> 内部标记位的语义，低成本切换了全体存活对象的可达性。

随后会建立本轮可达性分析的初始状态：

   1. 根对象和本轮中持有 <cvar>KeepFlags</cvar> 的对象；
   2. Cluster 簇对象中首对象为根对象的集合，以及其引用的对象。

对于带有 <cvar>FGCObject::EFlags::AddStableNativeReferencesOnly</cvar> 标记的 <ctype>FGCObject</ctype>，此处有一个小并行优化：
+ 并行模式，还会异步调用 <cfunc>UGCObjectReferencer::AddInitialReferences</cfunc>，通过 <cfunc>AddStableReference</cfunc>提前收集**引用槽位**；
+ 单线程模式，则在扫描 <ctype>UGCObjectReferencer</ctype> 时，同非标记对象一同处理这组引用；

未带该标记的普通 <ctype>FGCObject</ctype> 则通过后面的流程中 <cfunc>UGCObjectReferencer::AddReferencedObjects</cfunc> 处理。

#### 扫描对象可达性

接着，会使用 <cfunc>PerformReachabilityAnalysisPass</cfunc> 来调度真正的 Mark Pass。

首先，该函数会建立本轮的 Context，其来源首次为新建立，否则会复用上轮保存的 Context：
```cpp
// GarbageCollection.cpp
// void PerformreachabilityAnalysisPass(...)
if (!GReachabilityState.IsSuspended())
{
	Context = Pool.AllocateFromPool();
}
else
{
	Context = GReachabilityState.GetContextArray()[0];
	Context->bDidWork = false;
	InitialObjects.Reset();
}
```
如是恢复的情况，则清空 <cvar>InitialObjects</cvar>。

当 GC Barrier 标记出的对象非空时，将其添加至 <cvar>InitialObjects</cvar>：
```cpp
// GarbageCollection.cpp
if (!Private::GReachableObjects.IsEmpty())
{
	Private::GReachableObjects.PopAllAndEmpty(InitialObjects);
}
else if (GReachabilityState.GetNumIterations() == 0 || (Stats.bFoundGarbageRef && !GReachabilityState.IsSuspended()))
{
	Context->InitialNativeReferences = GetInitialReferences(Options);
}
```
在增量可达性分析过程中，对象图的写操作，会使得 GC Barrier 标记出一些对象被放入 GReachableObjects，否则其引用的对象可能因错误标记而被回收。

上面的另一个分支则是首次迭代时，把 <ctype>FGCObject</ctype> 中具有 <cvar>AddStableNativeReferencesOnly</cvar> 标记的引用对象提前记入 Context 中，可参考[**集合初始化**](#集合初始化)末尾并行优化部分回顾。

如增量可达分析时标记了 Cluster 则调用 <cfunc>MarkReferencedClustersAsReachable</cfunc>，对 Cluster 中元素进行处理：
```cpp
// GarbageCollection.cpp
if (!Private::GReachableClusters.IsEmpty())
{
	// Process cluster roots that were marked as reachable by the GC barrier
	TArray<FUObjectItem*> KeepClusterRefs;
	Private::GReachableClusters.PopAllAndEmpty(KeepClusterRefs);
	for (FUObjectItem* ObjectItem : KeepClusterRefs)
	{
		// Mark referenced clusters and mutable objects as reachable
		MarkReferencedClustersAsReachable<EGCOptions::None>(ObjectItem->GetClusterIndex(), InitialObjects);
	}
}
```

之后会为根对象增加预访问的 Padding，并使 <ctype>FWorkerContext</ctype> 保存这个数组的只读视图（View）。这么做是为了后续的 <ctype>FPrefetchingObjectIterator</ctype> 可以在遍历时预取对象数据，做路径性能优化。
```cpp
// GarbageCollection.cpp
Context->SetInitialObjectsUnpadded(InitialObjects);
```
随后才是根据 Context 进入正式的可达性分析阶段：
```cpp
// GarbageCollection.cpp
PerformReachabilityAnalysisOnObjects(Context, Options);
```
完成后会做一些收尾处理，对应全量/增量模式有一定的保留逻辑差异。这里先不展开，而是进入可达性分析的核心逻辑。

#####



#### 时间片暂停、恢复与完成条件

增量模式下，worker 在处理完当前对象块后检查时间限制。若超时，会先 flush 批量引用，再保存未完成的 work list、结构体批处理状态和 worker context，并将 <cvar>bIsSuspended</cvar> 设为真。下一次调度不会再次执行初始标记，而是复用保存的 context 继续，因此本轮对象的可达性状态是连续的。

一次 <ctype>FRealtimeGC</ctype> 调用会持续执行 pass，直到出现以下之一：

1. 增量时间片耗尽，分析挂起，留待后续 tick 恢复。
2. 所有 UObject work list、GC barrier 对象队列和 barrier Cluster 队列都为空；启用 Verse 时还要求 Verse 的待处理队列为空。此时 Mark 才真正收敛，随后进入不可达对象整理和销毁阶段。

## 第三阶段：FRealtimeGC 怎么并行遍历引用

上面提到 Mark 阶段最终会进入 <ctype>FRealtimeGC</ctype>。这一层开始，UE 才真正把“对象图遍历”这件事做成了可并行的流水线。

### FRealtimeGC 的分发层

先看 <ctype>FRealtimeGC</ctype> 的核心分发逻辑：

```cpp
// GarbageCollection.cpp
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
// GarbageCollection.cpp
if (IsParallel(Options))
{
	InitialCollection = UE::Tasks::Launch(TEXT("CollectInitialReferences"),
		[&] () { FGCObject::GGCObjectReferencer->AddInitialReferences(InitialReferences); });
}
```

这里预收集的并非所有 <ctype>FGCObject</ctype> 引用，而只是构造时带有 <cvar>FGCObject::EFlags::AddStableNativeReferencesOnly</cvar> 标记的那一组。该标记约束其 <cfunc>AddReferencedObjects</cfunc> 只能通过 <cfunc>AddStableReference*</cfunc> 上报稳定的原生引用，因此并行 GC 可以在正式遍历前异步取得这些引用，等待任务完成后再把它们作为 <cvar>InitialNativeReferences</cvar> 分发给 worker。

单线程 GC 不会执行这次预收集：<cfunc>TReachabilityCollectorBase::NeedsInitialReferences</cfunc> 在非并行模式下返回 <cvar>true</cvar>，于是扫描 <ctype>UGCObjectReferencer</ctype> 时，<cfunc>UGCObjectReferencer::AddReferencedObjects</cfunc> 会处理这组稳定引用。至于未带该标记、位于 <cvar>RemainingReferencedObjects</cvar> 中的普通 <ctype>FGCObject</ctype>，无论并行还是单线程模式，都会在扫描 <ctype>UGCObjectReferencer</ctype> 时通过各自的 <cfunc>AddReferencedObjects</cfunc> 上报引用。

### TFastReferenceCollector 的并行模型

<cfunc>TFastReferenceCollector::ProcessObjectArray</cfunc> 是并行遍历最核心的函数。它不是简单“每个线程扫自己那一段数组”，而是一个带工作窃取的循环：

```cpp
// FastReferenceCollector.h
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
// FastReferenceCollector.h
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
// Class.cpp
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
// ObjectProperty.cpp
void FObjectProperty::EmitReferenceInfo(...)
{
	Schema.Add(UE::GC::DeclareMember(DebugPath, BaseOffset + GetOffset_ForGC(), UE::GC::EMemberType::Reference));
}
```

数组属性则会根据内部元素类型发出不同 token：

```cpp
// ArrayProperty.cpp
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
// StructProperty.cpp
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
// FastReferenceCollector.h
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
// FastReferenceCollector.h
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

## 第四阶段：不可达对象先整理，再销毁

### PostCollectGarbageImpl 做什么

当可达性分析完成后，<cfunc>PostCollectGarbageImpl</cfunc> 会做一轮后处理：

```cpp
// GarbageCollection.cpp
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
// GarbageCollection.cpp
while (GUnrechableObjectIndex < GUnreachableObjects.Num())
{
	UObject* Object = static_cast<UObject*>(ObjectItem->Object);
	Object->ConditionalBeginDestroy();
}
```

而 <cfunc>ConditionalBeginDestroy</cfunc> 的核心逻辑也很直接：

```cpp
// Obj.cpp
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
// GarbageCollection.cpp
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
// Obj.cpp
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

# UE 升级迭代的修改

本文最初整理时混入了旧版本 GC 流程中的符号和顺序。对照 UE5.7.4 的 <cfunc>GarbageCollection.cpp</cfunc> 后，主要修改如下：

1. **调整 <cfunc>PreCollectGarbageImpl</cfunc> 的锁顺序**：GC Lock 不是只在 Flush 异步加载时释放，而是在首次 Reachability 迭代中先释放，再执行 Flush 和 <cfunc>PreGarbageCollect</cfunc> 回调，最后重新获取。这样修改是因为引擎明确要求调用用户回调时不能持有 GC Lock，否则容易产生死锁。
2. **移除 <cvar>GUnreachableObjectFlag</cvar> 与 <cvar>GMaybeUnreachableObjectFlag</cvar> 的交换步骤**：这套旧流程在当前源码中已经不存在，相关全局标记从 UE5.5 开始也已被弃用。
3. **补充 Incremental Gather 分支**：<cfunc>GatherUnreachableObjects</cfunc> 不一定在 <cfunc>PostCollectGarbageImpl</cfunc> 中一次完成；允许增量收集时，它会延后到 <cfunc>UnhashUnreachableObjects</cfunc> 中继续执行。这样修改是为了区分 Full Purge 与普通增量 GC。
4. **把最终释放流程改为 <cfunc>FObjectPurge::DestroyObjects</cfunc>**：当前源码没有 <ctype>FAsyncPurge</ctype>，实际路径是 <cfunc>IncrementalPurgeGarbage</cfunc> -> <cfunc>IncrementalDestroyGarbage</cfunc> -> <cfunc>FObjectPurge::DestroyObjects</cfunc>。
5. **区分引用查询与正式 Mark 路径**：<ctype>FReferenceFinder</ctype> 可以展示属性引用和 ARO 两类来源，但它不是实时 GC 的主遍历器；正式 Mark 由 <ctype>FRealtimeGC</ctype> 和 <ctype>TFastReferenceCollector</ctype> 完成。

# 参考
- [Wikipedia: Garbage Collection (computer science)](https://en.wikipedia.org/wiki/Garbage_collection_(computer_science))

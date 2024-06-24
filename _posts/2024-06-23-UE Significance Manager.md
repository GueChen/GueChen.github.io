---
layout: post
title:  "Significance Manager in UE5"
date:   2024-06-22 20:20:00 +0800
categories: jekyll update
---

## 定义

下列定义摘取自官方文档 [Significance Manager in Unreal Engine ](https://dev.epicgames.com/documentation/en-us/unreal-engine/significance-manager-in-unreal-engine?application_version=5.3)：

> **Significance Manager** 提供了一个支持编写特定于项目的灵活代码的能力的集中框架，这些代码可用于对对象求值并确定它们相对于彼此的优先顺序。通过使用该评估方法，对象可通过关闭 **粒子发射器** 等 **组件** 或以较低的频率运行复杂AI代码的方式修改其行为。

简而言之，该系统可根据名为「重要度」（Significance）的指标来**定制化**管理 `UObject` 对象的表现以提升性能。所谓重要度即一个根据位置计算的浮点数数据。

## 使用

需要开启插件后支持该功能：

![]({{ site.baseurl }}\assets\img\post\significance_manager\open_plugin.png)

开启后，可通过其 `static USignificanceManager* Get(const UWorld* World)` 接口拿到该系统。需要关注的其它接口有三个：

1. 对象注册接口 `RegisterObject`：

   ```cpp
    virtual void RegisterObject(UObject* Object, FName Tag,   FManagedObjectSignificanceFunction SignificanceFunction,   EPostSignificanceType InPostSignificanceType = EPostSignificanceType::None, FManagedObjectPostSignificanceFunction   InPostSignificanceFunction = nullptr);
   ```

   参数为两个函数和 Post 更新方式：

   + `SignificanceFunction` 和 `InPostSignificanceFunction`
   + `InPostSignificanceType`

   两个函数中的第一个用于更新管理对象的 「重要度」，第二个则根据 「重要度」的数值对行为进行管理。

2. 注销接口 `UnregisterObejct`：

   ```cpp
   virtual void UnregisterObject(UObject* Object);
   ```

3. 由于该系统不自动运行，所以需要开发者在每帧合适的位置手动调用 `Update`。

   该示例来自 [ Significance Manager 官方文档]((https://dev.epicgames.com/documentation/en-us/unreal-engine/significance-manager-in-unreal-engine?application_version=5.3))：

   ```cpp
   void UMyGameViewportClient::Tick(float DeltaTime)
   {
   	// 调用超类的Tick函数。
   	Super::Tick(DeltaTime);
   	// 确保具有有效的世界场景和Significance Manager实例。
   	if (UWorld* World = GetWorld())
   	{
   		if (USignificanceManager* SignificanceManager = FSignificanceManagerModule::Get(World))
   		{
   			// 仅使用玩家0的全局变换，每帧更新一次。
   			if (APawn *PlayerPawn = UGameplayStatics::GetPlayerPawn(World, 0))
   			{
   				// Significance Manager使用ArrayView。构造单元素数组来容纳Transform。
   				TArray<FTransform> TransformArray;
   				TransformArray.Add(PlayerPawn->GetTransform());
   				// 使用通过ArrayView传入的单元素数组来更新Significance Manager。
   				SignificanceManager->Update(TArrayView<FTransform>(TransformArray));
   			}
   		}
   	}
   }
   ```

通常可在一个对象的初始化如 `BeginPlay` 等调用注册进重要度系统，在对象销毁如 `EndPlay` 等位置注销。

## 实现细节

文件路径十分简洁:

>SignificanceManager:.
>
>│  SignificanceManager.Build.cs
>
>│
>
>├─Private
>
>│      SignificanceManager.cpp
>
>│
>
>└─Public
>
>​        OrderedBudget.h
>
>
>
>​        SignificanceManager.h

该目录下比较重要的类为 `USignificanceManager` ，其重要的数据成员比较容易看到：

```cpp
class SIGNIFICANCEMANAGER_API USignificanceManager : public UObject
{
    //...
    
    // All objects being managed organized by Tag
	TMap<FName, TArray<FManagedObjectInfo*>> ManagedObjectsByTag;

	// Reverse lookup map to find the tag for a given object
	TMap<TObjectPtr<UObject>, FManagedObjectInfo*> ManagedObjects;

	// Array of all managed objects that we use for iteration during update. This is kept in sync with the ManagedObjects map.
	TArray<FManagedObjectInfo*> ObjArray;
    
	// We copy ObjArray to this before running update to avoid mutations during the update. To avoid memory allocations, making it a member.
	TArray<FManagedObjectInfo*> ObjArrayCopy;
}
```

这些成员变量是注册的用于管理 `UObject` 的数据结构，注册的成员参与计算重要度并以重要度为依据定制其行为。现对其中重要函数的实现进行阐述如下：

### 对象注册

注册对象的接口为 `RegisterObject`，实现如下：

```cpp
FManagedObjectInfo* ObjectInfo = new FManagedObjectInfo(Object, Tag, SignificanceFunction, PostSignificanceType, PostSignificanceFunction);
RegisterManagedObject(ObjectInfo);
```

其更细节的注册在 `RegisterManagedObject` 中：

```cpp
UObject* Object = ObjectInfo->GetObject();

// 该对象已经被管理，
if (ManagedObjects.Contains(Object))
{
    delete ObjectInfo;
    return;
}

// 该对象注册为串行的更新
if (ObjectInfo->GetPostSignificanceType() == EPostSignificanceType::Sequential)
{
    ObjWithSequentialPostWork.Add({ ObjectInfo, ObjectInfo->GetSignificance() });
}

// Calculate initial significance
if (Viewpoints.Num())
{
    ObjectInfo->UpdateSignificance(Viewpoints,bSortSignificanceAscending);

    if (ObjectInfo->GetPostSignificanceType() == EPostSignificanceType::Sequential)
    {
        ObjectInfo->PostSignificanceFunction(ObjectInfo, 1.f, ObjectInfo->GetSignificance(), false);
    }
}

// 将注册的对象信息加入管理数据结构中
ManagedObjects.Add(Object, ObjectInfo);
ObjArray.Add(ObjectInfo);
TArray<FManagedObjectInfo*>& ManagedObjectInfos = ManagedObjectsByTag.FindOrAdd(ObjectInfo->GetTag());

// 二分找到当前 Tag 里根据重要度排序获取的合适位置
BinarySerachInsert(ObjectInfo, ManagedObjectInfos); // 没有该函数为方便阅读简略省去过程
```

上述过程中 `BinarySerachInsert` 是对较长但原理上较简单的二分搜索的省略，可视作该对象第一次插入时即经过一次排序，处于对应 **Tag** 中合适的位置。

### 对象注销

对象注销的过程没什么特别的在此不详细概述，大概只需了解其主要目的。

即移除 `UObject` 对象对应的管理数据结构 `ManagedObjects`、`ObjWithSequentialPostWork`、`ObjArray`、`ManagedObjectsByTag` 上的信息，同时销毁前主动调用一次对象绑定的 `PostSignificanceFunction` 函数以更新对象状态。

### 对象更新

更新的接口为 `Update`，其传入的参数为包含 `FTransform`  的 `TArray` 数组，通常为玩家控制主角的位置信息。

实现过程伪码如下，可参考源码自行对照其中细节：

```cpp
// SignificanceManager.cpp
// void USignificanceManager::Update(TArrayView<const FTransform> InViewpoints)
// 为所有串行调用对象保存旧的重要度值
for SequentialObjInfo in  ObjWithSequentialPostWork:
	SequentialObjInfo.OldSignificance = SequentialObjInfo.ObjectInfo->GetSignificance();

// 并行的更新管理对象的重要度，同时若管理对象为并行则调用其 Post 函数
ParallelFor ObjInfo in ObjArray
{
    ObjInfo->UpdateSignificance(Viewpoints,bSortSignificanceAscending);
}

// 顺序调用串行管理对象的 Post 函数
for SequentialObjInfo in  ObjWithSequentialPostWork:
	SequentialObjInfo.PostSignificanceFunction(...);

// 对管理对象根据其标签对其重要度进行排序
for [Tag, ObjInfoArray] in ManagedObjectsByTag:
	ObjInfoArray.StableSort(PickCompareBySignificance(bSortSignificanceAscending));
```

实现上比较直观的，其中需要注意的是 `UpdateSignificance` 函数并非直接调用传入的重要度更新函数，外面包裹了一层 `Wrapper` ，是一种简单的模板模式，它的实现细节伪码如下：

```cpp
// SignificanceManager.cpp
// void USignificanceManager::FManagedObjectInfo::UpdateSignificance(const TArray<FTransform>& InViewpoints, const bool bSortAscending)
float OldSignificance = Significance;
// 根据传入的 View 的 Transform 计算出根据当前排序规则下的重要度最值
Significance = GetMostValuebleSignificane(InViewPoints, bSortAscending); // 没有这个函数

// 如实现上使用并发 Post 则此时直接调用 Post 函数，因为外层是 ParallelFor
if (PostSignificanceType == EPostSignificanceType::Concurrent)
{
    PostSignificanceFunction(this, OldSignificance, Significance, false);
}
```

而在伪码中 `GetMostValuebleSignificance` 则会调用传入时设置的 `SignificanceFunction` 来计算重要度

## 简单的例子

下面是一个接入重要度系统的简单示例，其功能是根据 `Actor` 与玩家位置计算重要度来设置上面 `UStaticMeshComponent` 的可见度，其代码如下：

```cpp
// AMyCustomActor.h
#pragma once

#include "CoreMinimal.h"
#include "ACustomActor.generated.h"

UCLASS()
class AMyCustomActor : public AActor
{
	GENERATED_BODY()
protected:
	// 把对象注册进重要度系统
	virtual void BeginPlay() override;

	// 把对象从重要度系统注销
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	    // 自定义计算重要度函数
    float UpdateSignificance(const FTransform& InTransform);

    // 自定义根据重要度更新组件属性函数
    void PostSignificance(float OldSignificance, float NewSignificance, bool bUnregister);
};


// AMyCustomActor.cpp
#include "ACustomActor.h"
#include "SignificanceManager.h"

// 最大更新距离
constexpr const float MaxActivateDistance = 4000.0f;

void AMyCustomActor::BeginPlay()
{
    // 注册对象
	if (USignificanceManager* SignificanceManager = USignificanceManager::Get(GetWorld()))
	{
		SignificanceManager->RegisterObject(
            // 注册对象
			this, 
            // 标签
			TEXT("MyCustomSignificance"),
            // Update 函数
			[this](USignificanceManager::FManagedObjectInfo* InObjectInfo, const FTransform& InTransform)->float
			{
				return UpdateSignificance(InTransform);
			},
            // Post 方式是串行或并行
			USignificanceManager::EPostSignificanceType::Sequential,
            // Post 函数
            [this](USignificanceManager::FManagedObjectInfo* InObjectInfo, float OldSignificance, float NewSignificance, bool bUnregister)
			{
				PostSignificance(OldSignificance, NewSignificance, bUnregister);
			}
        );
	}
}

void AMyCustomActor::EndPlay(const EEndPlayReason::Type EndPlayReson)
{
    // 注销对象
	if (USignificanceManager* SignificanceManager = USignificanceManager::Get(GetWorld()))
	{
		SignificanceManager->UnregisterObject(this);
	}
}

float AMyCustomActor::UpdateSignificance(const FTransform& InTransform)
{
    // 计算位置差
	FVector LocationBias = InTransform.GetLocation() - GetActorLocation();
	float   Distance = LocationBias.Length();
    // 截取到最大距离之内，作减则距离越近重要度越高
	return 1.0 - FMath::Clamp(Distance / MaxActivateDistance, 0.0f, 1.0f);
}

void AMyCustomActor::PostSignificance(float OldSignificance, float NewSignificance, bool bUnregister)
{	
    // 重要度提高，且高于 0.5 的阈值则设组件为可见
	if (NewSignificance > OldSignificance && NewSignificance > 0.5f)
	{
		ForEachComponent<UStaticMeshComponent>(true, [](UStaticMeshComponent* Component){
			Component->SetVisibility(true);
		});
	}
    // 重要度降低，且低于 0.5 的阈值则设组件为不可见
	else if(NewSignificance < OldSignificance && NewSignificance < 0.5f)
	{
		ForEachComponent<UStaticMeshComponent>(true, [](UStaticMeshComponent* Component) {
			Component->SetVisibility(false);
		});
	}
}

```


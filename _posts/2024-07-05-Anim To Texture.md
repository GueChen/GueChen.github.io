---
layout: post
title:  "Anim To Texture"
date:   2024-07-10 20:20:00 +0800
categories: jekyll update
---

# 定义
看了下网上比较多的是教大家怎么用 『AnimToTexture』这个插件，既有珠玉在前，我就不献木渎之丑。

比较有意思的是在之前的 5.1 版本中该插件还是在 Animation 目录下，但在 5.3 中又到了 Experimental 目录下。

本文将简单的过一遍这个插件里一些代码的实现细节：

# 文件目录
整个目录分为两个部分 「AnimToTexture」 与 「AnimToTextureEditor」：

>Source
>├─AnimToTexture
>└─AnimToTextureEditor

其中前者定义了一些基本的数据结构，而后者定义了编辑器下的资产操作，包括将 `SkeletalMesh` 转换为 `StaticMesh` 与将 `AnimSequence` 烘焙到 `Texture` 上。 

# 细节实现

在应用中比较需要关注的实际是 「AnimToTextureEditor」 模块下的 `AnimToTextureBPLibrary.xxx` 文件，该文件定义了大部分蓝图或编辑器下使用的接口操作。实际上是 4 个函数：

+ `AnimationToTexture` - 烘焙动画数据到纹理的接口
+ `ConvertSkeletalMeshToStaticMesh` - 转换骨骼网格体为静态网格体接口
+ `SetLightMapIndex` - 设置光照贴图的辅助函数接口
+ `UpdateMaterialInstanceFromDataAsset` - 更新材质实例的参数接口

实际上用起来比较重要的是 1、2 两个，现对它们的实现进行阐述分析：

## ConvertSkletalMeshToStaticMesh

该函数首先会生成一个临时的 `Actor` ：

```cpp
// AnimToTextureBPLibrary.cpp
// UStaticMesh* UAnimTextureBPLibrary::ConvertSkeletalMeshToStaticMesh(...)
// ... 一些 check 检查
AActor* Actor = World->SpawnActor<AActor>();
USkeletalMeshComponent* MeshComponent = NewObject<USkeletalMeshComponent>(Actor);
MeshComponent->RegisterComponent();
MeshComponent->SetSkeletalMesh(SkeletalMesh);
TArray<UMeshComponent*> MeshComponents = { MeshComponent };
```

并在指定路径上创建一个空的 `StaticMesh` 资产：

```cpp
// AnimToTextureBPLibrary.cpp
// UStaticMesh* UAnimTextureBPLibrary::ConvertSkeletalMeshToStaticMesh(...)
// Create New StaticMesh
if (!FPackageName::DoesPackageExist(PackageName))
{
	IMeshUtilities& MeshUtilities = FModuleManager::Get().LoadModuleChecked<IMeshUtilities>("MeshUtilities");
	OutStaticMesh = MeshUtilities.ConvertMeshesToStaticMesh(MeshComponents, FTransform::Identity, PackageName);
}
// Update Existing StaticMesh
else
{
    OutStaticMesh = LoadObject<UStaticMesh>(nullptr, *PackageName);
}
```

值得注意的 <cfunc>ConvertMeshesToStaticMesh</cfunc> 函数，在后面实际烘焙为静态模型时起到关键作用，当前由于临时 `Actor` 中并没有值，实际仅创建一个空的资产。

随后生成临时资产存储实际转换的 `StaticMesh`：

```cpp
// AnimToTextureBPLibrary.cpp
// UStaticMesh* UAnimTextureBPLibrary::ConvertSkeletalMeshToStaticMesh(...)
// 注意此处的第一个参数
UStaticMesh* TempMesh = MeshUtilities.ConvertMeshesToStaticMesh(MeshComponents, FTransform::Identity, TransientPackage->GetPathName());
```



## AnimationToTexture
---
layout: post
title:  "Navigation - NavMesh in UE5"
date:   2024-03-11 00:27:35 +0800
categories: jekyll update
---

# 引言

在 Wikipedia 中是这样定义**导航**🛰的：

> **Navigation** is a field of study that focuses on the process of monitoring and controlling the movement of a craft or vehicle from one place to another.

观测或控制某种交通工具从一个位置到另一个位置的研究即为 **导航**🛰。就日常而言，人们下意识的感到自己在使用导航，是打开地图前往一个不知道怎么走的目的地时。

这个知道起点与终点，不知道怎么走的问题，在游戏中可以被称为寻路问题（Pathfinding）。例如 RTS 星际争霸中控制枪兵移动到鼠标🖱位置，便是一个典型的寻路问题。在算法中，寻路问题的对应的是经典的图论问题。然而，连续的游戏世界似乎很难与一个抽象离散且有限的图集联系在一起，因此需要一些方法提取出抽象图。

较早的代表方案是栅格地图（Grid Map），把连续的平面离散为一个个网格。该方法对于早期的平面或 2.5D 的游戏是良好的，例如星际争霸中可以看到建造时出现的占据栅格。而对于现代游戏简单的栅格地图遇到了两个难题：其一，是地图越来越大了，高精度的栅格地图开销是巨大的，无论是内存还是寻路；其二，是三维的场景越来越多，简单的栅格没法满足高度重叠的情况。

另一种方案是基于多面体网格的导航网格（NavMesh）技术，它的核心思想是用多边形网格来建模可走世界的表面，多边形网格相互连接自然构成一个一个的寻路节点。该方法是一个 2.5D 的图结构，一方面，可以有效减少探索节点与存储的单元；另一方面，对于地形起伏也可以有较好的支持调整。

导航网格的的代表方案是 Recast Navigation，UE5 中的导航系统即是基于此构建的，现将对其中的数据结构即生成过程进行介绍。

# 数据结构

待施工👨‍🏭

# 生成算法

Unreal Engine 中导航网格的生成分为两类，一种是在导航栏中的构建（Build）里选择构建路径（Build Path），另一种是引擎默认的导航系统 UNavigationSystemV1 中的 Tick 函数。

二者的调用路径均是殊途同归，以构建路径为例其主要调用堆栈大致如下：

{% highlight cpp %}

UNavigationSystemV1::Build()

​	ANavigationData::EnsureBuildCompletion()

​		FRecastNavMeshGenerator::EnsureBuildCompletion()

​			FRecastNavMeshGenerator::ProcessTileTasksAndGetUpdatedTiles()

​				FRecastNavMeshGenerator::ProcessTileTasksAsyncAndGetUpdatedTiles()

​					FRecastTileGenerator::DoWork()

{% endhighlight %}

感觉有些云里雾里但是没有关系，只要知道生成的入口经过一系列中间过程调用到最后的 `FRecastTileGenerator::DoWork()` 即可。

现对其中流程进行拆分介绍：

## GatherGeometryFromSources

收集 Tile 包围盒中的碰撞数据，待施工👨‍🏭

## 生成导航块 - GenerateTile

实际执行 Tile 生成的函数，其过程即为体素化提取多边形网格，其中又主要拆分为两个阶段 `GenerateCompressedLayers` 与 `GenerateNavigationData`，对应的聚合集合的粒度不同。

第一个阶段负责把收集的碰撞数据体素化，并以层为单位区分聚合体素块；第二个阶段则针对每一层数据进行处理，以块为单位，提取轮廓，并最终生成多边形网格。

现对其中细节展开介绍：

### 体素化与层集合划分 - GenerateCompressedLayers

该阶段负责将碰撞数据转换为体素数据，并以层为单位进行体素集合划分，实现细节上可分为以下五个子步骤：

+ 体素化 - `RasterizeTriangles`
+ 体素筛选 - `GenerateRecastFilter`
+ 构建可行高度场 - `BuildCompactHeightField`
+ 边缘剔除 - `RecastErodeWalkable`
+ 体素分层 - `RecastBuildLayers`

#### 体素化 - RasterizeTriangles

该步骤负责将三角面体素化，实现的逻辑上较为直白，遍历存储在「<cvar>RawGeometry</cvar>」上的几何体碰撞数据，进行体素化「<cfunc>RasterizeGeometryRecast</cfunc>」处理。
在体素化函数内部分为两个阶段：

+ 标记可走三角面 - <cfunc>rcMarkwalableTriangles</cfunc>

  坡度过大的地区无法生成导航，可走的三角面的坡度应小于生成参数 `AgentMaxSlope` ，下图展示了因坡度区别而有无导航的示例：

  <div style="text-align: center;"><img src='{{ site.baseurl }}\assets\img\post\navigation\walkable_tri_diff.png' width='320'></div>

  计算三角形坡度可根据外法线夹角判断该三角面可不可走，计算外法线方向使用叉积如下图所示：

  <div style="text-align: center;"><img src='{{ site.baseurl }}\assets\img\post\navigation\mark_walkable_tri.png' width='320'></div>


+ 三角面体素化 - <cfunc>rcRasterizeTriangles</cfunc>
  
  该步骤中将使用三角面生成以高度场表示的占据体素，示意图如下所示:
  <div style="text-align:center;"><img src='{{ site.baseurl }}\assets\img\post\navigation\voxel_heightfield.png' width=500></div>
  
  三角形体素化思路为先沿单一方向对三角形面进行切割形成长条，后再对切割出的长条进行细分，形成体素。

  实现上，分为以下步骤：
  1. 首先沿边遍历，对 z 方向进行切割，记录每个 z 条上的 x 最值点，获取 x 方向长条；
  2. 接着对 x 方向进行切割，保证每一个切割块均在超参数 `CellSize` 内。
  
  体素化与光栅化的扫描线方案存在相似性，其平面示意如下图所示：
  <div style="text-align:center;"><img src='{{ site.baseurl }}\assets\img\post\navigation\voxel_tri_process.png' width=800></div>

  同时存在两个优化情况：
  1. 当三角形仅占据一个体素 「span」 时，不用切割，可直接记录其 y 方向上高度，填入高度场；
  2. 当三角形在 y 方向上跨度不超过超参数 `CellHeight` 时，切割时可不用记录 y 轴的值跨度。

#### ~~ApplyVoxelFilter~~

> 待补充，暂时没看，看注释是过滤掉 Tile 外的体素

#### 体素筛选 - GenerateRecastFilter

该步骤对体素化中一些不满足 AI 可走的块进行剔除标记，使用宏 <cmcr>RC_NULL_AREA</cmcr> 进行标记。

需要剔除的体素块一共有两种类型：

+ ➕<cfunc>rcFilterLowHangingWalkableObstacles</cfunc> - 增加可行体素
+ ➖<cfunc>rcFilterLedgeSpans</cfunc> - 筛除不可行体素

**rcFilterLowHangingWalkableObstacles**

标记低悬障碍物为可达区域，若一个体素块原先被标记为**不可达**，但其同位置的链表上前一个体素块可达，且前后的高度差低于最大攀爬高度 <cvar>walkableClimb</cvar>，则认为该体素块可通过攀爬到达：

```cpp
// RecastFilter.cpp
// void rcFilterLowHangingWalkableObstacles(...)
Δheight = Abs(curSpan.height - prevSpan.height);
if(Δheight <= walkableClimb)
{
    curSpan.area = 👟;
}
```

其示意图如下所示，

【❌缺示意图】

**rcFilterLedgeSpans**

该步骤筛除孤立在空中的 **ledge** 体素，所谓 **ledge** 即一个体素的所有邻居均低于可攀爬高度，那该体素孤立且没有可达的可能性，则理应被剔除。

> **ledge**： ledge is a span with one or more neighbors whose maximum is further away than walkableClimb from the current span's maximum.
>
> <div style="text-align:right;font-family:MV Boli;">-RecastFilter.cpp rcFilterLedgeSpans</div>

其代码实现大致如下：

```cpp
// RecastFilter.cpp
// void rcFilterLedgeSpans(...)
ΔneighborHeightMin = Min(neighborSpan.height - curSpan.height);
if(ΔneighborHeightMin > walkableClimb)
{
    curSpan.area = ❌👟;
}
```

其示意图如下：



除此外还有一个可选过滤项 <cvar>filterNeighborSlope</cvar> ，当前邻居块间高度差大于可攀爬高度时，可判断当前体素块是陡崖的一部分，也应当予以排除：

```cpp
// RecastFilter.cpp
// void rcFilterLedgeSpans(...)
neighborHeightMax = Max(neighborSpan.height);
neighborHeightMin = Min(neighborSpan.height);
if(neighborHeightMax - neighborHeightMin > walkableClimb)
{
    curSpan.area = ❌👟;
}
```

其示意图如下：



其它还有两类可选的过滤函数：

+ <cfunc>rcFilterWalkableLowHeightSpans</cfunc>
+ <cfunc>rcFilterWalkableLowHeightSpans</cfunc>


- [ ] [👨‍🏭待施工]

至此原始体素的生成与标记完毕。

#### 构建可行高度场 - BuildCompactHeightField

在游戏中，不考虑攀爬与飞行的条件下，一个 NPC 的寻路通常是指在物体 『**上表面**』 移动。

对于一个体素，其实并不关心它中间的部分，而只用关注它的上层的高度与可提供站立的空间。

因此，可以有更为紧凑的体素表述，称为紧凑高度场/可行走高度场。

【❌缺图】

构建的过程十分朴素，把上个体素（Span）中记录的上表面高度填入紧凑体素，并记录该可供站立的空间高度：

```cpp
// RecastFilter.cpp
// void rcBuildCompactHeightfield(...)
chf.span.y = curSpan.smax;                 // 记录站立点的高度
chf.span.h = nextSpan.smin - curSpan.smax; // 记录站立空间的高度
```

在该过程中同时会对四方向上的邻居块进行检测，构筑邻居块间的连接关系。两个邻居块具备连接关系的条件有二：

+ 高度差在可攀爬高度 <cvar>walkableClimb</cvar> 之内

  ```cpp
  // RecastFilter.cpp
  // void rcBuildCompactHeightfield(...)
  if(Abs(neighbourSpan.y - curSpan.y) <= walkableClimb) ...
  ```

+ 两块间可以容纳一个完整的 「 Agent 」，即顶的下界与底的上界之差大于 <cvar>walkableHeight</cvar> 

  ```cpp
  // RecastFilter.cpp
  // void rcBuildCompactHeightfield(...)
  top = Min(span.y + span.h, neighbourSpan.y + neighbourSpan.h);
  bot = Max(span.y, neighbourSpan.y);
  if((top - bot) >= walkableHeight) ...
  ```

#### 边缘过滤 - RecastErodeWalkable

理想的 「 Agent 」 是一个没有体积只有位置的点，但游戏中的角色必然不理想。考虑到角色的体积与重心，不是所有可行走高度场均能够提供站立的空间，如边缘对于 『**矮胖型**』 绝对不是安全站立点。

所以，需要对获取的可行走区域进行进一步的过滤剔除。

对于「 Agent 」 假设其重心位于中心点，则不超出其半径的边缘区或碰撞区即为安全区，计算安全区可使用距离场，计算距离场可采用两阶段遍历的方法（ 2-Pass Distance Transform ）的方式：

+ 首先标记  **『边界』** 的体素，指不可行走或四方邻居存在缺失的块：

  ```cpp
  // RecastArea.cpp
  // bool rcErodeWalkableArea(...)
  if (chf.areas[i] == RC_NULL_AREA) {
      dist[i] = 0;
  }
  else {
      countNeighbour = 0;
      ...
      if(countNeighbour != 4)
  	    dist[i] = 0;
  }
  ```

+ 接着通过两次遍历填充生成距离场，填充规则为四方邻居距离加 2，对角邻居距离加 3（$3 \approx 2\sqrt{2}$）

  1. 第一次遍历，对 $9 \times 9$ 的方格内下方与左侧的 4 个邻居块进行填充
  
  2. 第二次遍历，对 $9 \times 9$ 的方格内上方与右侧的 4 个邻居块进行填充
  
     【❌缺图】
  
  填充时取填入的最小值
  
+ 对于距离场值小于 <cvar>walkableRadius</cvar> 的块即判定为不可行区域

  ```cpp
  // RecastArea.cpp
  // bool rcErodeWalkableArea(...)
  if (dist[i] < thr)
      chf.areas[i] = RC_NULL_AREA;
  ```

#### 体素分层 - RecastBuildLayers






### GenerateNavigationData



生成 Tile，待施工👨‍🏭

# 一些写完后可能会删去的碎碎念

第一个内容果然还是导航吧。

说起导航，第一反应其实是 SLAM 小车 UAV、无人机、激光雷达巴拉巴拉。要说为啥，因为老本行是机器人那边的，同组的👨👩一提导航就铁定是 SLAM，想起大三被贵州老铁拉着做冯如杯的时光...跑题了。

Anyway，每天健完身下班回来都写点东西，希望劳动节前能更完本篇。

# 参考

[^1]: [Distance Transforms](https://www.cs.auckland.ac.nz/~rklette/Books/MK2004/pdf-LectureNotes/08slides.pdf)
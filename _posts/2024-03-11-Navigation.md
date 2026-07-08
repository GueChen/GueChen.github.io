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

这个知道起点与终点，不知道怎么走的问题，在游戏中被称为寻路问题（Pathfinding）。例如 RTS 星际争霸中控制枪兵移动到鼠标🖱位置，便是一个典型的寻路问题。在算法中，寻路问题的对应的是经典的图论问题。然而，连续的游戏世界似乎很难与一个抽象离散且有限的图集联系在一起，因此需要一些方法提取出抽象图。

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
  
  该步骤实际是把碰撞体拆解为三角面，生成以高度场表示的占据体素，在编辑器中体素化可视化示意图如下:
  <div style="text-align:center;"><img src='{{ site.baseurl }}\assets\img\post\navigation\voxel_heightfield.png' width=500></div>

  对于一个拆分的三角面，首先对三个顶点进行体素化，下图为一个三维空间的三角面三个顶点分别体素化的示意：
  <!-- 3d 演示部分 -->
  
  <link rel="stylesheet" href="{{site.baseurl}}/assets/css/3d/3dcontainer.css">
  <script type="importmap">
        {
          "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
          }
        }
  </script>
  <div class="three-container-box">
  <div class="three-container" id="rasterize_voxel"></div>
  </div>
  <script type="module" src="{{ site.baseurl }}/assets/js/navigation/rasterization_voxel.js?v=20260706-1"></script>

  三个体素块已足够描述一个体素三角形，但为了方便后续合并处理过滤空间上的碰撞重叠影响，需要继续扫描填充，计算三角面对应的离散体素块。

  从顶点生成整个三角面的体素思路与光栅化的扫描线方案拥有一定的相似性，可以先沿单一方向对三角形面进行切割形成长条，再对切割出的长条进行填充。

  实现上，分为以下步骤：
  1. 首先沿边遍历，对 z 方向进行切割，记录每个 z 条上的 x 最值点，获取 x 方向长条；
  2. 接着对 x 方向进行切割填充，保证每一个切割块均在超参数 `CellSize` 内。

  其平面示意如下图所示：
  <div style="text-align:center; max-width: 840px; margin: 0 auto;">
    <div id="voxel_scanline_demo" style="width: 100%;"></div>
  </div>
  <script src="{{ site.baseurl }}/assets/js/navigation/voxel_scanline_demo.js"></script>

  同时存在两个优化情况：
  1. 当三角形仅占据一个体素 「span」 时，不用切割，可直接记录其 y 方向上高度，填入高度场；
  2. 当三角形在 y 方向上跨度不超过超参数 `CellHeight` 时，切割时可不用记录 y 轴的值跨度。

#### 体素剔除
在 UE 对应 <cfunc>FRecastTileGenerator::ApplyVoxelFilter</cfunc>。

该步骤只有在开启 <cvar>bPerformVoxelFiltering</cvar> 且导航盒子不完全覆盖 Tile 时执行，用于把落在生成边界外的可走体素过滤置空，做一次裁剪剔除。实现上可概括为以下几步：

  1. 先将每个导航盒子按 <cvar>WalkableRadius * CellSize</cvar> 向外扩一圈；
  2. 遍历高度场 <cvar>rcHeightfield</cvar> 中每个栅格 `(x, y)` 中占据的体素 「span」 链表；
  3. 对每个可走体素 「span」，还原映射回原世界空间中的占据高度，并构造包围盒；
  4. 若体素 「span」 原世界空间包围盒的不在任一扩张边界盒内，则该体素应当剔除。

可简化为如下伪代码：

{% highlight cpp %}
for each InclusionBounds:
    ExpandedBounds = InclusionBounds.ExpandBy(WalkableRadius * CellSize)

for each cell(x, y) in HeightField:
    for each span in cell:
        if span.area != RC_WALKABLE_AREA:
            continue

        SpanMinV = voxel box min corner
        SpanMaxV = voxel box max corner

        if SpanMinV not in any ExpandedBounds
        and SpanMaxV not in any ExpandedBounds:
            span.area = RC_NULL_AREA
{% endhighlight %}

其中边界盒额外扩张是一个关键细节。源码注释里直接写明这样做是为了避免产生 **fake cliffs**：如果严格按原始边界裁切，边缘体素由于精度误差可能被错误剔除，容易造成错误的“悬崖”或断裂边界。

其三维示意图如下所示：

<div class="three-container-box">
<div class="three-container" id="apply_voxel_filter_demo"></div>
</div>
<script type="module" src="{{ site.baseurl }}/assets/js/navigation/apply_voxel_filter_demo.js"></script>

因此，<cfunc>ApplyVoxelFilter</cfunc> 只负责先把不该参与后续构网的边界外体素剔掉，后面的 <cfunc>rcFilterLowHangingWalkableObstacles</cfunc>、<cfunc>rcFilterLedgeSpans</cfunc> 等步骤才真正开始按“是否可通行”来筛选体素。

#### 体素筛选

对应 <cfunc>GenerateRecastFilter</cfunc> 部分，该步骤对体素化中一些不满足 AI 可走的块进行剔除标记，使用宏 <cmcr>RC_NULL_AREA</cmcr> 进行标记。

需要剔除的体素块一共有两种类型：

+ ➕<cfunc>rcFilterLowHangingWalkableObstacles</cfunc> - 增加可行体素
+ ➖<cfunc>rcFilterLedgeSpans</cfunc> - 筛除不可行体素

**rcFilterLowHangingWalkableObstacles**

标记低悬障碍物为可达区域。若当前体素块原先被标记为**不可达**，但其在**同一格子链表中下方紧邻的前一个体素块**可达，且二者的**表面高度差**<cvar>smax</cvar>  不超过最大攀爬高度 <cvar>walkableClimb</cvar>，则会把当前体素块的区域类型补标为可走：

```cpp
// RecastFilter.cpp
// void rcFilterLowHangingWalkableObstacles(...)
Δheight = Abs(curSpan.smax - prevSpan.smax);
if(Δheight <= walkableClimb)
{
    curSpan.area = prevSpan.area;
}
```

其示意图如下所示，

<div class="three-container-box">
<div class="three-container" id="low_hanging_obstacle_demo"></div>
</div>
<script type="module" src="{{ site.baseurl }}/assets/js/navigation/low_hanging_obstacle.js"></script>

**rcFilterLedgeSpans**

该步骤筛除孤立在空中的 **ledge** 体素，所谓 **ledge** 即一个体素的任一邻居低于可攀爬高度，那该体素即是悬崖，对于寻路而言，该体素本身的存在即是不安全的，理应被剔除。

> **ledge**： ledge is a span with *one or more* neighbors whose maximum is further away than walkableClimb from the current span's maximum.
>
> <div style="text-align:right;font-family:MV Boli;">-RecastFilter.cpp rcFilterLedgeSpans</div>

其代码实现大致如下：

```cpp
// RecastFilter.cpp
// void rcFilterLedgeSpans(...)
minh = +INF;
for each neighbor in 4 directions
   minh = Min(minh, neighborTop - curTop);

if(minh < -walkableClimb)
{
   curSpan.area = ❌👟;
}
```

其示意图如下：

<div class="three-container-box">
<div class="three-container" id="ledge_drop_demo"></div>
</div>
<script type="module" src="{{ site.baseurl }}/assets/js/navigation/ledge_drop_demo.js"></script>

这里与源码的第一段判断一致，实际比较的是当前 span 到四方向邻居可站立面的最小高度差 <cvar>minh</cvar>。只要存在某个方向的下降超过 <cvar>walkableClimb</cvar>，当前 span 就会被视为 ledge。

除此外还有一个可选过滤项 <cvar>filterNeighborSlope</cvar> ，当前邻居块间高度差大于可攀爬高度时，可判断当前体素块是陡崖的一部分，也应当予以排除：

```cpp
// RecastFilter.cpp
// void rcFilterLedgeSpans(...)
accessibleNeighborMax = -INF;
accessibleNeighborMin = +INF;
for each accessible neighbor in 4 directions
{
    accessibleNeighborMax = Max(accessibleNeighborMax, accessibleNeighborTop);
    accessibleNeighborMin = Min(accessibleNeighborMin, accessibleNeighborTop);
}

if(accessibleNeighborMax - accessibleNeighborMin > walkableClimb)
{
    curSpan.area = ❌👟;
}
```

其示意图如下：

<div class="three-container-box">
<div class="three-container" id="ledge_slope_demo"></div>
</div>
<script type="module" src="{{ site.baseurl }}/assets/js/navigation/ledge_slope_demo.js"></script>

这一段与源码中的 <cvar>asmax - asmin > walkableClimb</cvar> 对应，统计的是**可达邻居**的最高与最低可站立面，而不是简单把所有邻居高度直接拿来比较。



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

+ 接着通过两次遍历填充生成距离场，填充规则为四方邻居距离加 2，对角邻居距离加 3（$3 \approx 2\sqrt{2}$）：

  1. 第一次遍历，对 $9 \times 9$ 的方格内上方与左侧的 4 个邻居块进行填充；
  
  2. 第二次遍历，对 $9 \times 9$ 的方格内下方与右侧的 4 个邻居块进行填充。
   
  填充时取填入的最小值。
  
+ 对于距离场值小于 <cvar>walkableRadius</cvar> 的块即判定为不可行区域：

  ```cpp
  // RecastArea.cpp
  // bool rcErodeWalkableArea(...)
  if (dist[i] < thr)
      chf.areas[i] = RC_NULL_AREA;
  ```

可参考下方 demo 来模拟整个图生成距离场的过程：

  <link rel="stylesheet" href="{{site.baseurl}}/assets/css/grid.css">
  <p>
    <div class="inline-grid" data-size="15"></div>
  </p>
  <script src="{{ site.baseurl }}/assets/js/grid.js"></script>

至此，体素生成阶段已完成。

#### 体素分层 - RecastBuildLayers

在拥有了所有可行走体素后，可以开始着手建图。已有的体素结构之间存在连接关系，理论上已是一张可用的图，但问题在于节点太多了。每一个体素块都可以看作是一个图的节点，寻路的复杂度过高，且存储这些节点是较为浪费的。

因此，需要对生成的体素进行集合划分，其中的第一类集合即为 「 **层** 」（**Layers**）。

需注意生成的多边形网格可看作是一个 2.5D 的结构，因此对于在高度上有重叠的块需进行区分，而对于连通的块可进行合并。

划分集合的第一个依据是将邻近的块进行合并，如何判断是否邻近？答案是 「 **距离场** 」。

> 🤔注意上一步的距离场似乎有复用的空间，但 Recast 中的实现是重新再算了一次，应该是考虑到 2-Pass 计算本身并不复杂，且复用的话分区代码就不那么简洁。（个人想法）

**rcBuildDistanceField**

计算距离场调用的是函数 <cfunc>rcBuildDistanceField</cfunc>：

```cpp
// RecastRegion.cpp
// bool rcBuildDistanceField(...)
calculateDistanceField(...);

boxBlur(...);
```

其中 <cfunc>caculateDistanceField</cfunc> 的计算采用两阶段遍历（ 2-Pass Distance Transform ），具体过程可参考 [边缘过滤](#边缘过滤 - RecastErodeWalkable) ，再此不再赘述；

而 <cfunc>boxBlur</cfunc> 则是对生成的距离场进行平滑处理，使用的是具备连接关系的 9 邻居合求均值的方式：

```cpp
// RecastRegion.cpp
// unsigned short* boxBlur(...)
dst[i] = (sum(neigborsSrc) + 5) / 9;
```

**rcBuildHeightFieldLayers**

构建分层的方式被称为 「 **分水岭算法** 」（**Watershed Algorithm**），该算法的思路也十分直观：*水从低洼的地方注入，逐渐上涨淹没所有陆地*。

低洼的地方，在本例中即为可站立体素最中心的块；而在距离场的视角，即距离边缘最远的地方。

把每一个新的水坑视作一个新的区域，设置距离阈值，让水坑的水逐步上涨标记周边体素，直到所有体素均被标记完毕。

+ PartⅠ - rcGatherRegionsNoFilter

  首先对体素块进行「 **边界** 」（**Border**）标记：
  ```cpp
  // RecastRegion.cpp
  // bool rcGatherRegionNoFilter(...)
  PaintRectRegion(0, bw, 0, h,...); 
  PaintRectRegion(w-bw, w, 0, h,,...); 
  PaintRectRegion(0, w, 0, bh,...); 
  PaintRectRegion(0, w, h-bh, h,...); 
  ```

  > 需注意该处的边界指的是整个 Tile 的四周，此处标记是为了后面与其它 Tile 作连接使用

  随后使用 <cfunc>floodRegion</cfunc> 与 <cfunc>expandRegions</cfunc> 两个函数交替填充整个区域：

  ```cpp
  // RecastRegion.cpp
  // bool rcGatherRegionNoFilter(...)
  while(level > 0)
  {
      level -= 2;
      // 扩充当前区域
      expandRegions(level, ...);
     	for(auto & span : chf)
      {
          // 水没有淹到当前高度
          if(span.dist < level)         continue;
          // 区域已标记
          if(span.region != 0)          continue;
          // 该体素不可行
          if(span.area == RC_NULL_AREA) continue;
          // 注入新的区域标识
          floodRegion(span, regionId++);
      }
  }
  ```

  具体了解一下两个函数的实现：

  + **floodRegion**
  
    采用四邻居的深度优先搜索（DFS）遍历填充集合归属，后使用 「 **region** 」 代称归属集合:
    > 💡<cvar>regionId</cvar> 是最重要的输入参数，它是一个递增的整数，仅代表「 **region** 」的编号。

    1. 传入的体素块会先把 「 **region** 」定义为 <cvar>regionId</cvar> 并压入栈 <cvar>stack</cvar> 中;
    2. 每次取出栈 <cvar>stack</cvar> 中的一个元素 <cvar>span</cvar>，检查八向连通邻居，若 <cvar>area</cvar> 一致，但已有 「 **region** 」 归属，则不用填充本轮输入的 <cvar>regionId</cvar>，可回退归属为 **0**，不继续向外扩张，等待下一个步骤获取邻居的归属标记。
    3. 否则，该块保留 <cvar>regionId</cvar> 作为自己的 「 **region** 」，并将满足条件的连通四邻居标为相同的 <cvar>regionId</cvar>，构成一个新的归属集合，并压入栈继续迭代。

    <div id="flood_region_conflict_demo" style="margin: 12px 0 12px;"></div>
     
    <div id="flood_region_fill_demo" style="margin: 12px 0 4px;"></div>
.
    <script src="{{ site.baseurl }}/assets/js/navigation/flood_region_demo.js"></script>

    另外值得注意的是，在一轮填充中被标记的区域，会把 「 **dist** 」 标记为 0，代表本轮淹没的洼地。

  + **expandRegions**

    该步骤不生成新的「 **region** 」，而是把上一个步骤中标记可染色的体素，尽可能的染色标记归属 「 **region** 」：
    
    1. 先把所有满足以下条件的体素块收集进栈 <cvar>stack</cvar>：

        <div style="text-align:center;">
          $$
          \begin{cases}
          span.dist \ge level \\
          span.region = 0
          \end{cases}
          $$
        </div>

    2. 随后逐个检查栈中元素的四连通邻居，若邻居与当前体素 <cvar>area</cvar> 一致且已有 「 **region** 」 归属，则当前体素可继承该邻居的区域 「 **region** 」。

    3. 若多个邻居具备不同的 「 **region** 」，则取距离场意义上最近的邻居。

    4. 直到剩余栈中的元素，再无邻居具备 「 **region** 」。

    其示意图如下：

    <div id="expand_region_demo" style="margin: 12px 0 4px;"></div>
    <script src="{{ site.baseurl }}/assets/js/navigation/expand_region_demo.js"></script>

  两个过程均使用一个队列完成，思路类似 BFS，完成该阶段后所有的可行走体素块均具有自己的集合 「 **区域** 」（region）标记。

+ PartⅡ

  对于已有的 「 **区域** 」若每一个均划分一份集合，则集合的空间不重叠度有些过高，例如两块在高度上没有冲突的 「 **区域** 」以 2.5D 的角度来看，完全可以属于同一个集合，这个新的更大的集合称为 「**层**」（Layer）。因此对可以合并的 「 **区域** 」邻居进行划分。

  该过程实际对已有集合进行了两个标记：

  1. 记录每个 「 **区域** 」 的相邻邻居 「 **区域** 」；
  2. 标记在高度上存在重叠，无法合并的 「 **区域** 」。
  
  实际过程中分别对应了 <cfunc>walkContour</cfunc> 与 <cfunc>addUniqueLayerRegion</cfunc> 两个函数，整个过程伪码如下：
  
  ```cpp
  // RecastRegion.cpp
  // bool rcBuildHeightFieldLayers(...)
  for(auto & span : chf)
  {
      reg = regs[span.index];
      // 标记高度上重叠的区域，代表两个区域无法合并
      nspan = nullptr;
      for(auto overlapSpan : overlapSpans)
      {
          overReg = regs[overlapSpan.index;
          if(overReg != reg)
          {
              addUniqueLayerRegion(reg, overReg);
          }
      }
      
      //... 略过已处理区域
   	
      // 该可行走高度块是某区域边缘
  	// 遍历该区域边缘收集所有可合并邻居区域
      if(isSolidEdge(span, ...))
  	{
          walkContour(span, dir, ...);
      }                  
  }
  ```
  
  其中 <cfunc>addUniqueLayerRegion</cfunc> 的实现方式为在 <ctype>rcLayerRegion</ctype> 中维护一个成员数组 <cvar>layers</cvar>，该数组记录了所有重叠 「 **区域** 」。而该函数就负责检测并添加重叠区域的编号至该数组。
  
  接下来，对遍历边缘进行详细分析：
  
  + IsSolidEdge
  
    给定一个体素块和一个探测方向，若该块与探测方向上的邻居块相连，但两者的区域不同，则该块为当前 「 **区域** 」 的边缘；
  
    <div id="is_solid_edge_demo" style="margin: 12px 0 4px;"></div>
    <script src="{{ site.baseurl }}/assets/js/navigation/is_solid_edge_demo.js"></script>
  
  + walkContour
  
    给定一个体素块和一个初始探测方向，沿边缘遍历该「 **区域** 」，并记录所有的相邻「 **区域** 」，该过程遵循如下探索规则：
    
    1. 若探测方向上是不同 「 **区域** 」，则保持原地不动，探测方向向顺时针转动；
    2. 若探测方向上是相同 「 **区域** 」，则向该方向移动，探测方向向逆时针转动。
    
    其整个过程示意图如下所示：
    
    <div id="walk_contour_demo" style="margin: 12px 0 4px;"></div>
    <script src="{{ site.baseurl }}/assets/js/navigation/walk_contour_demo.js"></script>
    
    在遍历边缘过程中，使用一个 <ctype>rcIntArray</ctype> 结果将经过的所有区域收集统计，如此编获取了所有相邻的邻居 「 **区域** 」，整个过程伪码大致如下：
    
    ```cpp
    // RecastRegion.cpp
    // void walkContour(span, dir, ...)
    // 记录初始方向和位置
    startDir  = dir;
    startSpan = span;
    iter = 0;
    
    while(iter < maxIter)
    {
        // 当前方向为不同区域，停留，顺时针转向
        if(isSolidEdge(curSpan, curDir))
        {
            neighborRegion = Region(span, dir);
            regCollector.push(neighborRegion);
            curDir = RotateCW(curDir)
        }
        else
        // 当前方向为相同区域，前进，逆时针转向
        {
            curSpan = Forward(curSpan, curDir);
            curDir = RotateCCW(curDir);
        }
        
        // 遍历完毕，退出循环
        if(curSpan == startSpan && curDir == startDir)
            break;
    }
    ```
  
+ Part Ⅲ

  对于相邻且满足合并条件的 「 **区域** 」打上 「 **层** 」的标记，「 **层** 」可以看作是一种 2D 的体素集合，邻居 「 **区域** 」可合并为一个 「 **层** 」需满足以下条件：

  + 与当前「 **层** 」没有在垂直方向重叠；
  + 合并后所有邻居的高度差小于 「 **层** 」 高度差限制（255 个体素高度）；

  标记过程采用类似 BFS 的方案，通过一个 **根区域**  遍历所有 **邻居区域**，其伪码如下：

  ```cpp
  // RecastRegion.cpp
  // bool rcBuildHeightFieldLayers(...)
  unsigned short layerId = 0;
  for(rcLayerRegion& reg : regions)
  {
      // 跳过已访问及空区域
      if(reg.visted || !reg.hasSpans) continue;
      reg.layerId = layerId;
      reg.visited = true;
      reg.base = true;
      
      // BFS 遍历邻居区，标记层号
      stack.push(reg);
      while(!stack.IsEmpty())
      {
          rcLayerRegion& reg = stack.pop();
          // 遍历邻居
          for(rcLayerRegion& neiReg : reg.connections)
          {
              // 跳过边缘
              if(neiReg.reg & RC_BORDER_REG) continue;
              // 跳过已访问
              if(neiReg.visited) continue;
              // 跳过重叠区
              if(reg.layers.contain(neiReg)) continue;
              // 跳过高度差超限的情况
              ymin = rcMin(reg.min, neiReg.min);
              ymax = rcMax(reg.max, neiReg.max);
              if((ymax - ymin) >= HeightLimit) continue;
              
              stack.push(neiReg);
              neiReg.visited = true;
              neiReg.layerId = layerId;
              
              // 添加当前区域的重叠区至根区
              addUniqueLayersRegion(reg, neiReg.layers);
              reg.min = ymin;
              reg.max = ymax;            
          }
      }
      // 层号自增
      ++layerId;
  }
  ```

+ Part Ⅳ

  对于不相邻，但是高度接近且不存在垂直重叠的「 **层** 」可继续进行合并操作。由于 Part Ⅲ 已标记过根区域，而从一个根区域出发，可遍历一个 「 **层** 」内的所有区域。因此，此时根区域可作为「 **层** 」 的代表，仅需遍历所有根区域进行对比，即等价于遍历遍历「 **层** 」对比合并高度：
  
  ```cpp
  // RecastRegion.cpp
  // bool rcBuildHeightFieldLayers(...)
  for(rcLayerRegion& reg : regions)
  {
      // 非根，可跳过
      if(!reg.base) continue;
      unsigned short newId = reg.layerId;
      while(true)
      {
          unsigned short oldId = 0xffff;
          for(rcLayerRegion& otherReg : regions)
          {
              // 与上检测根重复
              if(otherReg == reg) continue;
              // 非根，可跳过
              if(!otherReg.base) continue;
              // 检测该层是否在合并高度范围内
              if(overlapRange(reg, otherReg, mergeHeight)) continue;
               // 跳过高度差超限的情况
              ymin = rcMin(reg.min, otherReg.min);
              ymax = rcMax(reg.max, otherReg.max);
              if((ymax - ymin) >= HeightLimit) continue;            
              // 遍历该层中其它区域，若存在重叠区则跳过该层
              if(OverlapNeighbor(otherReg, Reg)) continue; 
              
              // 该层可合并，记录跳出循环
              oldId = otherReg.layerId;
              break;            
          }
          
          // 没有可合并层，跳出循环
          if(oldId == 0xffff) break;
          
          // 合并所有该层的区域
          MergeOtherRegBelongToLayer(regions, oldId, newId);
      }
  }
  ```
  
  合并后，「 **层** 」的生成已经完成，随后仅需把生成的数据填入 <ctype>rcHeightfieldLayer</ctype> 中。

#### RecastBuildTileCache

把构建的层数据压缩并存储到压缩信息中，这里的操作只有构建 <ctype>dtTileCacheLayerHeader</ctype> 结构体头来记录下基本信息，以及使用 <cfunc>dtBuildTileCacheLayer</cfunc> 将上一步构建好的层数据压缩到 <cvar>FTileRasterizationContext::Layers</cvar> 中去。

```cpp
// RecastNavMeshGenerator.cpp
// bool FRecastTileGenerator::RecastBuildTileCache(...)
for(const rcHeightFieldLayer& layer : RecastContext.LayerSet->layers)
// 遍历建立的 『层』 结构，构造 TileCache
{
  dtTileCacheLayerHeader header = ...; // 头赋值，位置，大小，包围盒范围等
  
  // 压缩数据构造 TileCache
  status = dtBuildTileCacheLayer(...); 
  if(Failed(statis)) return false;

  // 把压缩数据放入 Layers 中
  RasterContext.Layers.Add(FNavMeshTileData(CompressedData, ...)); 
}
CompressedLayers = MoveTemp(RasterContext.Layers);
```

使用的压缩方式取决于执行 <cfunc>dtBuildTileCacheLayer</cfunc> 时传入的 Compressor 类型。在 <cfunc>FTileCacheCompressor::compress</cfunc> 中可以看到，默认是使用 **Oodle** 作为压缩方式，当有修改时会使用 **ZLib**。
```cpp
// RecastNavMeshGenerator.cpp
// dtStatus FTileCacheCompressor::compress(...)
FCompressedCachedHeader DataHeader = ...;

if(GNavMeshUseOodleCompression)
{
  CompressedSize = FOodleDataCompression::CompressParallel(...);
  
  // 返回值处理判断成功与否
  ...
}
else
{
  if(FCompression::CompressMemory(NAME_Zlib, ...))
  // 返回值处理判断成功与否
  ...
}
```
由于本次介绍内容主要聚焦在 NavMesh，且限于本人水平有限，压缩算法不在本次介绍内容内。

经过压缩后，「 **层** 」的处理至此已全部结束。可能会比较疑惑，为什么这里几乎没有几何的图信息，还是要存一个 <cvar>CompressedLayer</cvar> 作为中间结构。从组织上看，中间结构是为了区分几何信息改变外的操作，以解耦计算。通过缓存中间结构，当不存在引发体素改变的情况时，无需重复进行耗时的体素化高度场操作，可直接对 「层」 结构进行处理。

### GenerateNavigationData
对已经生成的 「层」 结构进行处理:
```cpp
// RecastNavMeshGenerator.cpp
// bool FRecastTileGenerator::GenerateNavigationData(...)
for (auto & layer : CompressedLayers)
{
  // 合法性检查
  ...

  // 处理压缩 「层」 数据
  bGenDataLayer = GenerateNavigationDataLayer(.../*layer*/); 

  if(!bGenDataLayer) break;
}

if(bGenDataLayer) NavigationData = MoveTemp(GenerationContext.NavigationData);
```
这里对 <cfunc>FRecastTileGenerator::GenerateNavigationDataLayer</cfunc> 中步骤分为以下几步：
+ MarkDynamicAreas - 标记 Modifier 带来的区域类型
+ dtBuildTileCachePartition - 对 「层」 的数据进一步划分为 「区」块
+ dtBuildTileCacheContours - xxx
+ dtBuildTileCachePolyMesh - xxx
+ dtBuildTileCachePolyMeshDetail - xxx
+ GatherOffMeshLinkData - xxx
+ dtCreateNavMeshData - xxx

#### MarkDynamicAreas

该步骤用于标记导航修改器（Modifier）相关的体素区域，用于区分出不同寻路消耗（Cost）的地块。
```cpp
// RecastNavMeshGenerator.cpp
// FRecastTileGenerator::MarkDynamicAreas(...)
// 存在 Modifier 时该函数才生效，标记不同地块
if(Modifiers.Num())
{
  if(xxx.bUseSortFunction && Modifiers.Num() > 1)
  {
    FGCScopeGuard GCScopeGuard;
    // 按 cost 和 fixedCost 对 modifiers 排一个升序
    ...->SortAreasForGenerator(Modifiers);  
  }
  // 标记过低高度区域，一般用不到
  if(TileConfig.bMarkLowHeightArea)
  {
    // 该函数不存在，仅方便阅读流程
    MarkDynamicAreaUseModifiers() // AreaMod == xxxInLowPass
    // 剩余未处理 LowHeight 区域均视作不可行走
    dtReplaceArea(Layer, RECAST_NULL_AREA, RECAST_LOW_AREA);
  }
  // 正常 Modifier 的处理流程
  // 该函数不存在，仅方便阅读流程
  MarkDynamicAreaUseModifiers() // AreaMod != xxxInLowPass
}
```

注意 <cfunc>MarkDynamicAreaUseModifiers</cfunc> 并不存在，仅用于表述函数流程做简述：

```cpp
// 伪码函数 MarkDynamicAreaUseModifiers
// 遍历所有 Modifiers 中的 Areas 进行标记
for(FRecasAreaNavModifierElement& Element : Modifiers)
    for(const FAreaNavModifier& AreaMod : Element.Areas)
    {
      // 仅处理涉及 LowPass 情况
      if(AreaMod.GetApplyMode() == ENavigationAreaMode::xxx) // LowPass / not
      {
        const int32* AreaIdPtr = ...; // 标记的地块区域，如水、障碍、路等
        const int32* ReplaceAreaIDPtr = ...; // 替换的过滤区域，这里仅指 LowHeightArea
        if(AreaIdPtr != nullptr)
        {
          // 实际还对实例化组件和非实例化组件进行了区分，
          // Replace 的情况则是对 ReplaceAreaIdPtr 区域进行处理
          MarkDynamicArea(AreaMod, ..., *AreaIdPtr, ReplaceAreaIdPtr);
        }
      }
    }
```

在 <cfunc>MarkDynamicArea</cfunc> 中，首先根据 『Modifier』 的包围盒 『Bounds』 来判断当前 「层」是否包含 『Modifier』：

```cpp
// RrecastNavMeshGenerator.cpp
// FRecastTileGenerator::MarkDynamicArea(...)
// 上一步分 「层」 时已经算好的包围盒
FBox LayerUnrealBounds = Recast2UnrealBox(Layer.header->bmin, Layer.header->bmax);
FBox ModifierBounds = Modifier.GetBounds().TransformBy(LocalToWorld);
// 不相交则不必处理该 Modifier，对该 「层」 数据无影响
if(!LayerUnrealBounds.Intersect(ModifierBounds)) return;

switch(Modifier.GetShapeType())
{
  case Cylinder:
    ProcessCylinderModifier(); // 伪码函数不存在
    break;
  case Box:
    ProcessBoxModifier(); // 同上
    break;
  case Convex:
  case InstancedConvex:
    ProcessConvexModifier(); // 同上
    break;
}
```
随后根据 『Modifier』 的几何形状做分别做处理。由于这里是流程上的综述，不详细描写不同形状的 『Modifier』 如何计算各自占据的几何区域。感兴趣可跳转至【❌补链接】

该步骤补充了 <cvar>layer</cvar> 中的 <cvar>areas</cvar> 数组，等于每一个体素的寻路耗费被重新标记了一次。

#### dtBuildTileCachePartition
对 「层」 的体素数据进行进一步划分，这里划分的 「区」 要区别于 Recast 中划分的 「区域」。这里的 「区」 是指相对于 「层」 更小的一个体素集合划分。

UE 中提供了 MONOTONE，WATERSHED 和 CHUNKY 三种划分方案，这里同上仅介绍笔者熟悉的 WATERSHED 抛砖引玉：

+ **WATERSHED 分水岭算法**
  
  分水岭算法构建 「层」 数据的过程中已经使用过一次，其原理即从低洼的块逐渐使用 BFS 的方法填充，直至覆盖标记所有计算块。

  + dtBuildTileCacheDistanceField 构筑距离场
  
  使用两阶段遍历（2-Pass Distance Transform）流程可参考[边缘过滤](#边缘过滤 - RecastErodeWalkable)
  ```cpp
  // DetourTileCacheRegion.cpp
  // static void caculateDistanceField(...)
  // 遍历标记边缘
  // area 是地块类型，由上一步 MarkDynamicAreas 标记
  // src  是距离场值，在该函数中计算获取
  for(auto& [area, src] : layer)
  {
    // 遍历 4 邻居：+ 邻居，o 当前点
    //     +
    //  +  o  +
    //     +
    for(auto& [nei_area, nei_src] : getNeightbors(cur))
      if(nei_area != area)
      {
        src = 0;  // 地块类型不一致，该块为边缘
      }
  }

  // Pass1：自上向下，自左向右
  //         → +2
  //  ↙  ↓  ↘
  //+3   +2   +3
  for(auto& cur : layer)
  {
      for(auto& neighbor : getULNeightbour(cur))
      {
        // 如是 4 邻居之一距离为 2，否则为 3
        float dist = straghtDir(cur, neighbor) ? 2 : 3;
        cur.src = max(cur.src, neighbor.src + dist);
      }
  }

  // Pass2：自下向上，自右向左
  //  +3  +2  +3
  //    ↖ ↑ ↗
  // +2 ←
  for(auto& cur : layer)
  {
      for(auto& neighbor : getDRNeightbour(cur))
      {
        // 如是 4 邻居之一距离为 2，否则为 3
        float dist = straghtDir(cur, neighbor) ? 2 : 3;
        cur.src = max(cur.src, neighbor.src + dist);
      }
  }
  ```
  生成 「层」 的距离场后，再通过一个 <cfunc>boxBlur</cfunc> 使距离场的过度更为平滑：
  ```cpp
  // DetourTileCacheRegion.cpp
  // void BoxBlur(...)
  // 8 邻居求平均
  for(auto& src : layer.src)
  {
    src = (sum(neighbor.src) + 5) / 9
  }
  ```
  距离场可作为辅助数据划分 「区」。
  + dtBuildTileCacheRegions 集合「区」划分
  
  这里划分的集合 「区」 是为了分出初始的多边形块，通过多边形块提取顶点信息，构成图结构中的组成点。
  值得一提的是，虽然分水岭的思路是由低向高填充，但本次操作中，高距离场值反而代表了低洼区域：
  ```cpp
  // DetourTileCacheRegion.cpp
  // dtStatus dtBuildTileCacheRegions(...)
  unsigned short regionId = 1;  // 实际是计数与区域区分的标志
  unsigned short level = (layer.distField.maxDist + 1) & ~1;
  while(level > 0)
  {
    // 每次迭代距离自减 2，因为上一步距离场扩散的最小单位是 2
    level = level >= 2? level - 2: 0;
    // 以 level 为最小值扩充一次边界
    if(expandRegions(..., level, ...))
    {
      ... // 记录数据保存
    }

    // 填充区域
    for(auto& reg : Regions)
      if(floodRegion(..., level, regionId, ...))
        regionId++; // 标记扩散完毕，Id 自增标记下一类区域
  }

  if(expandRegions(..., 0/*level*/, ...)) // 最后扩充一次，补齐边界条件
  {
    ... // 记录数据保存
  }

  filterSmallRegions(...);
  ```
  现对操作细节进行补充介绍：
    + expandRegions 扩充 「区」 的范围
  
    找出当前被淹没（dist >= level）且未被标记（cur_region == 0）的块，根据最近已标记邻居进行标记:
    ```cpp
    // detourTileCacheRegion.cpp
    // unsinged short* expandRegions(..., level, ...)
    dtIntArray stack;
    // 遍历距离场和区域信息，找到当前未区分且距离场值大于 level 的块入栈
    for(auto& [x, y] : layer)
    {
      if(dtFiled.data[x, y] >= level && regions[x, y] == 0)
      {
        stack.push({x, y});
      }
    }

    // 遍历栈中元素
    while(stack.size() > 0)
    {
      auto&& [x, y] = stack.pop();

      unsigned short minDist = 0xffff;
      unsigned short reg = regions[x, y];
      // 遍历 [x,y] 的四邻居
      for(auto& [nx, ny] : getNeighbor(x, y))
      {
        curDist = dtField.data[nx, ny] + 2;
        // 找到最近的已被标记的邻居，则当前块的区域和最近邻居一致
        if(regions[nx, ny] != 0 &&  curDist < minDist)
        {
          reg = regions[nx, ny];
          minDist = curDist;
        }
      }
      // 更新区域标记和距离场值
      regions[x, y] = reg;
      dtFiled[x, y] = curDist;
    }
    ```

    这个步骤实际向外扩大了一圈已存 「区」 的范围。
    + floodRegion 添加新 「区」
  
    标记当前 {x, y} 的块为 「区」 regionId，并向距离场值大于当前 level 的 4 邻居扩散一次 「区」 标记：
    ```cpp
    // DetourTileCacheRegion.cpp
    // bool floodRegion(x, y, ..., level, reg, ...)
    dtIntArray stack;
    // 当前 {x,y} 元素先标记为 reg 「区」 并入栈
    stack.push({x, y});
    region[x, y] = reg;
    dist[x, y] = 0; // 距离场值归 0 后续不会纳入分水岭更新的范围

    unsigned short lev = level >= 2 ? level - 2 : 0;
    // bfs
    while(stack.size() > 0)
    {
      auto&& [x, y] = stack.pop();
      unsigned short nreg = 0;
      // 遍历 8 邻居，若存在邻居已有 「区」 标记则跳过此次标记
      for(auto [nx, ny] : get8Neighbors(x, y))
      {
        // 略过地块类型不一致
        if(areas[nx, ny] != areas[x, y]) continue;
        // 略过未标记邻居
        if(regions[nx, ny] == 0) continue;
        
        nreg = regions[nx, ny];
      }
      // 邻居有 「区」，则修改当前 「区」 与邻居一致
      if(nreg != 0)
      {
        regions[x, y] = nreg;
        continue;
      }

      // 遍历 4 邻居，将距离场值大于 lev 且未标记的 「区」 打上 「区」 标识
      // 等于一次 4 邻居扩散
      for(auto [nx, ny] : getNieghbors(x, y))
      {
        if(areas[nx, ny] != areas[x, y]) continue;
        if(dtField.data[nx, ny] >= lev && regions[nx, ny] == 0)
        {
          regions[nx, ny] = reg;
          dist[nx, ny] = 0;
          stack.push({nx, ny});
        }
      }
    }
    ```
    重复上述两个步骤直至所有块均分好块为止。

  + filterSmallRegions 过滤小 「区」，并合并高度差不大的 「区」
  
    经过上面两个步骤的处理，所有的高度场块均被打上了 「区」 的标记，现在已经可以使用这里的 「区」 标记划分多边形集合。但是上述的过程生成的集合 「区」 仍存在几个问题：
    + 部分 「区」 过小；
    + 存在重叠可合并的 「区」；

    因此对这两种可以处理的 「区」 经行进一步的精细化处理：
    ```cpp
    // DetourTileCacheRegion.cpp
    // dtStatus filterSmallRegions(..., unsigned short& maxRegionId, ...)
    const int nreg = maxRegionId + 1;
    dtFixedArray<dtLayerRegion> regions(...);
    regions.set(0);
    for(int i = 0; i < nreg; ++i)
      regions[i] = dtLayerRegion(i);
    
    // 遍历记录 「区」 的邻居 「区」
    for(auto& [x, y] : layer)
    {
      unsigned short r = srcReg[x, y];
      
      // 取对应 r 的 region
      dtLayerRegion& reg = regions[r];
      reg.cellCount++;
      reg.border |= (y == 0) || (y == h - 1) || (x == 0) || (x == w -1);

      // 该 region 已处理过略过
      if(reg.connections.size() > 0) continue;

      // 保存地块信息
      reg.AreaType = layer.area[x, y];

      // 判断是否为 「区」 边缘
      int ndir = -1;
      for(int dir = 0; dir < 4; ++dir)
        if(isSolidEdge(layer, srcReg, x, y, dir))
        {
          ndir = dir;
          break;
        }

      // 如果是边缘，则绕边缘走一圈，记录一个 「区」 的所有邻居 「区」
      if(ndir != -1)
        walkContour(x, y, ndir, ..., reg.connections);
    }

    // 移除过小的 「区」
    for(int i = 0; i < nreg; ++i)
    {
      dtLayerRegion& reg = regions[i];
      // 「区」id 错误
      if(reg.id == 0) continue;
      // 「区」内无元素
      if(reg.cellCount == 0) continue;
      // 「区」已遍历过
      if(reg.visited) continue;

      dtIntArray stack;
      dtIntArray trace;
      
      reg.visited = true;
      stack.push(i);
      
      bool connectsToBorder = false;
      int cellCount = 0;
      while(stack.size())
      {
        int ri = stack.pop();
        dtLayerRegion& creg = regions[ri];

        connectsToBorder |= creg.border;
        cellCount += creg.cellCount;
        trace.push(ri);

        // 遍历邻居，将未访问邻居入栈
        for(int j = 0; j < creg.connections.size(); ++j)
        {
          dtLayerRegion& neireg = regions[creg.connections[j]];
          // 过滤已遍历以及非法情况
          if(neireg.visited) continue;
          if(neireg.id == 0) continue;
          stack.push(neireg.id);
          neireg.visited = true;
        }
      }
      // 「区」 所有的邻居元素合少于指定值
      // 且处于非边缘位置，则这个 「区」 可过滤
      if(cellCount < minRegionArea && !connectsToBorder)
      {
        for(int j = 0; j < trace.size(); ++j)
        {
          regions[trace[j]].cellCount = 0;
          regions[trace[j]].id = 0;
        }
      }
    }

    // 合并小 「区」 到邻居 「区」
    int mergeCount = 0;
    do
    {
      mergeCount = 0;
      for(int i = 0; i < nreg; ++i)
      {
        dtLayerRegion& reg = regions[i];
        if(reg.id == 0) continue;
        if(reg.cellCount == 0) continue;
        // 若当前 「区」 超过合并限制或为边缘，则不参与合并
        if(reg.cellCount > mergeRegionSize && reg.border) continue;

        int smallest = 0xffffffff;
        unsigned short mergeId = reg.id;
        // 找到邻接中包含高度场块最少的 「区」
        for(int j = 0; j < reg.connections.size(); ++j)
        {
          dtLayerRegion& mreg = regions[reg.connections[j]];
          if(mreg.id == 0) continue;
          // 包含高度场块最少且能够合并
          if(mreg.cellCount < smallest &&
             CanMergeWithRegion(reg, mreg) ...)
          {
            smallest = mreg.cellCount;
            mergeId = mreg.id;
          }
        }

        // 当前 id 并非合并 id
        if(mergeId != reg.id)
        {
          unsigned short oldId = reg.id;
          dtLayerRegion& target = regions[mergeId];
          // 合并 i 块到 mergeId 的 「区」 上
          if(mergeRegions(target, reg))
          {
            // 替换邻居的邻接 「区」
            for(int j = 0; j < nreg; ++j)
            {
              if(regions[j].id == 0) continue;
              if(regions[j].id == oldId)
                regions[j].id = mergeId;

              replaceNeighbour(regions[j], oldId, mergeId);
            }
          }
        }
      }

    } while(mergeCount > 0);
    ...// 一些数据处理操作压缩 「区」 id
    ```
    这里的两个方法与 Recast 中的 <cfunc>isSolidEdge</cfunc> 与 <cfunc>walkContour</cfunc> 几乎完全一致，如对细节存在疑惑，可参考上文【❌链接】部分。
    这里需要重点关注的函数有两个 <cfunc>canMergeWithRegion</cfunc> 与 <cfunc>mergeRegions</cfunc>：
    + canMergeWithRegion
    
    判断两个 「区」 中包含地块的类型是否一致，且互相不为多包含邻居：
    ```cpp
    // DetourTileCacheRegion.cpp
    // bool canMergeWithRegion(...)
    if(rega.areaType != regb.areaType) return false;
    int n = 0;
    for(int i = 0; i < rega.connections.size(); ++i)
    {
      if(rega.connections[i] == regb.id) ++n;
    }
    // 邻居次数大于 1 次
    if(n > 1) return false;
    return true;
    ```
    + mergeRegions
    
    将一个 「区」 中的所有邻居归并到另外一个 「区」 里，如果归入区具备边缘标志则打上该标志。
    ```cpp
    待补充
    ```
    经过该函数后所有的高度场块均被划入了对应集合，其中每个 「区」 集合即可看做一个待提取多边形。

#### dtBuildTileCacheContours
该函数用于提取多边形顶点，将集合由高度场块构成的 「区」 转化为 「顶点集」：
```cpp
// 遍历标记 「层」 的连接关系
for(auto [x, y]: layer)
{
  // 跳过无效 「区」
  const unsigned short ri = layer.regs[x, y];
  if(ri == 0xffff) continue;

  unsigned char res = 0;
  for(auto [nx, ny]: getNeighbour(x, y))
  {
    if(layer.regs[nx, ny] != layer.regs[x, y])
      res |= (1 << getDir(nx, ny, x, y));
  }
  flags[x, y] = res ^ 0xf;
}

for(auto [x, y]: layer)
{
  // 内部块，不含顶点
  if(flags[x, y] == 0) continue;
  const unsigned short ri = layer.reg[x, y];
  // 无效 「区」 
  if(ri == 0xffff || ri == 0) continue;

  if(!walkContour(...)) return DT_FAILURE | DT_BUFFER_TOO_SMALL;

  simplifyContour(...);

  ...// 存储顶点的一些数据申请处理

  const int contIdx = lcset.nconts++;
  dtTileCacheContour& cont = lcset.conts[contIdx];
  ...// cont 的一些赋值

  int nnei = 0;
  if(cont.nverts > 0)
  {
    for(int i = 0, j = nverts - 1; i < nverts; j = i++)
    {
      unsigned short lh = getCorerHeight(layer, vert, ...);
      
      cont.verts[j] = verts[j];
      cont.verts[j][1] = lh;

      ...// 记录 portal 信息，portal 指边缘方向
    }

    nlinks[contIdx] = nnei;
  }
}

// 部分轮廓为内轮廓，需要合并
for(int i = 0; i < lcset.nconts; ++i)
{
  dtTileCacheContour& cont = lcset.conts[i];
  // 通过有向面积判断内轮廓或外轮廓
  if(calcAreaOfPolygon2D(verts, nverts) < 0)
  {
    for(int j = 0; j < lcset.nconts; ++j)
    {
      dtTileCacheContour& mcont = lcset.conts[j];
      if(i == j) continue;

      if(mcont.nverts && mcont.reg == cont.reg)
      {
        getClosestIndices(mcont, cont, ...);
        ...// 记录合并顶点
      }
    }

    if(mergeIdx != -1)
    {
      dtTileCacheContour& mcount = lcset.conts[mergeIdx];
      // 合并顶点集
      mergeContours(..., mcont, cont, ...);
    }
  }
}

#if WITH_NAVMESH_CLUSTER_lINK
...// Cluster Links 相关暂略过
#endif
```
这里需要注意的是提取完顶点集合后得到的顶点集不一定就能用于多边形生成，因为获得的轮廓也有可能是内轮廓。在获取轮廓为内轮廓的情况下，需要将内轮廓与最近顶点的外轮廓进行合并。

这里可以简单推测一下，如果内轮廓与一个外轮廓构成多边形轮廓，那么这组构成轮廓一定存在最近顶点对。否则，它俩一定构不成一个中空的多边形轮廓。

除此之外，该过程还隐藏了一个细节，即生成的轮廓点上实际记录了边缘的方向，这个方向信息可为后续构建多边形图之间的连接节省额外的计算。

#### dtBuildTileCachePolyMesh
这里使用上一步骤提取的 **「顶点集」** 构建 **「凸多边形集」**。这里的凸多边形（Convex Polygon）很重要，凸多边形具备一个很好的性质：
> Every point on every line segment between two points inside or on the boundary of the polygon remains inside or on the boundary.
>
>                                                                                                                       --Wikipedia
凸多边形内任取两点构成线段上的任意点仍落在凸多边形内。该性质确保了寻路时只要多边形的起点和终点落在其边上，则多边形内任意位置均是可达的，且容易找到最短路径即连接两点的线段。

现对该过程进行介绍：
```cpp
// DetourTileCacheBuilder.cpp
// dtStatus dtBuildTileCachePolyMesh(...)
// 遍历「顶点集」
for(auto & cont : lcset.conts)
{
  // 略过空集，顶点少于 3 无法构成最简多边形三角形
  if(cont.nverts < 3 || cont.area == DT_TILECACHE_NULL_AREA) continue;

  // 三角剖分
  int ntris = triangulate(cont, ...);
  if(ntris <= 0)
  {
    ntris = -ntris;
  }

  // 添加并移除中间点
  for(auto & v: cont.verts)
  {
    indices[j] = addVertex(v, ...);
    if(v[3] & 0x80)
    {
      vflags[indices[j]] = 1;
    }
  }

  // 构建初始多边形，实际填充的是三角形的索引
  int npolys = 0;
  for(int j = 0; j < ntris; ++j)
  {
    const unsigned short* t = &tris[j * 3];
    if(t[0] != t[1] && t[0] != t[2] && t[2] != t[3])
    {
      polys[npolys * MAX_VERTS_PER_POLY + 0] = indices[t[0]];
      polys[npolys * MAX_VERTS_PER_POLY + 1] = indices[t[1]];
      polys[npolys * MAX_VERTS_PER_POLY + 2] = indices[t[2]];
      npolys++;
    }
  }
  // 无三角形略过
  if(!npolys) continue;

  // 合并多边形
  int maxVertsPerPoly = MAX_VERTS_PER_POLY;
  if(maxVertsPerPoly > 3)
  {
    for(;;)
    {
      int bestMergeVal = 0;
      int bestPolyA, bestPolyB, bestEdgeA, bestPolyB; // = 0
      for(auto& poly_j : polys)
      for(auto& poly_k : polys)
      {
        int ea, eb;
        int v = getPolyMergeValue(poly_j, poly_k, mesh.verts, ea, eb);
        if(v > bestMergeVal)
        {
          ...// 更新所有 best 的值
        }
      }
      
      // 存在可合并多边形，合并为新的多边形
      // 2 → 3， 3 → 4 ...
      if(bestMergeVal > 0)
      {
        unsigned short* polyA = &polys[bestPolyA];
        unsigned short* polyB = &polys[bestPolyB];
        mergePolys(polyA, polyB, bestEdgeA, bestEdgeB);
        memcpy(polyB, &polys[(npolys - 1)*MAX_VERTS_PER_POLY], sizeof(unsigned short)* MAX_VERTS_PER_POLY);
        npolys--;
      }
      // 已不存在可合并项，结束循环
      else
      {
        break;
      }
    }
  }

  ...// 储存多边形数据
}

for(int i = 0; i < mesh.nverts; ++i)
{
  // 被标记为可移除点
  if(vflags[i])
  {
    // 复查一下是否可移除
    if(!canRemoveVertex(mesh, (unsigned short)i)) continue;
    dtStatus status = removeVertex(ctx, mesh, (unsigned short)i, maxTris);
    ...// 错误处理
    // 移除顶点后所有 flags 均平移以 1 - 1 对应
    for(int j = 0; j < mesh.nverts; ++j) vflags[j] = vflags[j + 1]; 
    --i;
  }
}

// 构建一下多边形的邻接信息
if(!buildMeshAdjacency(..., mesh, lcset)) return DT_FALURE | DT_OUT_OF_MEMORY;

return DT_SUCCESS;
```
该函数提取了 **「凸多边形集」**，且多边形之间已包含连接关系，理论上这个多边形集已经可以用于构建图集，来发挥寻路算法的作用，但是由于当前近似是比较粗糙的，因此可以进一步的细化剖分，以确保寻路的精度。
【👨‍🏭待补充内部函数细节】
#### dtBuildTileCachePolyMeshDetail
这一步骤是对上过程构成的 **「凸多边形集」** 进行进一步的细分，以提取精度更高的图元节点，来提高寻路算法的精度。

在 UE 中该项实际是个可选项，构建前可选择勾选以开启或关闭该选项，默认提供开启的情况。
```cpp
// DetourTileCacheDetail.cpp
// dtStatus dtBuildTileCachePolyMeshDetail(...)
for(int i = 0; i < lmesh.npolys; ++i)
{
  int index = i*nvp*2;
  const auto* p = &lmesh.polys[index];
  
  ...// 保存精细的顶点数据，以及多边形包围盒
  // 找到一个多边形的包围区，并填充该包围区的高度
  getLayerHeightData(layer, p, lmesh.verts, npoly, hp, stack);

  // 构建多边形细节
  if(!buildLayerPolyDetail(poly, npoly, cs, ch,
			sampleDist, sampleMaxError, hp,
			verts, nverts, tris, edges, samples))
  {
    return DT_FAILURE;
  }

  ...// 转换顶点到世界坐标并存储
}
```

现在对其中两个函数 <cfunc>getLayerHeightData</cfunc> 和 <cfunc>buildLayerPolyDetail</cfunc> 的一些实现细节进行介绍：
+ getLayerHeightData
  
  该函数负责遍历多边形的顶点，并使用泛洪填充的方式，把多边形的包围盒内有高度的区域填充上高度数据，用于下一步细节多边形的生成：
  ```cpp
  // DetourTileCacheDetail.cpp
  // static void getLayerHeightData(...)
  // 遍历多边形顶点，寻找 9 邻居高度最小块作为起始点
  for(auto& vert: verts)
  {
    // 在 8 向邻居中找高度最小块
    auto&& [dmin, cx, cy] = findMinHeightsIn9Neighbors(...);

    stack.push({cx, cy});
  }
  
  // 找到多边形中心位置
  auto&& [pcx, pcy] = getCenterOfPolygon(verts);

  ... // 初始化操作把有值区的 data 置 1

  // DFS 排出所有数据或找到中心为止，为啥要这么做？
  // 目前能看到的是该方案可以把所有与中心无连接的孤立点剔除
  // 如果是一个非凸结构，如内环，可以直接剔除掉这个多边形
  while(stack.size() > 0)
  {
    auto&& [cx, cy] = stack.pop();

    // 靠近中心结束循环
    if(isNeareCenter(cx, cy, pcx, pcy)) break;

    for(auto & [nx, ny] : get4Neighbor(cx, cy))
    {
      if(!inBound(nx, ny) ||              // 超出包围盒范围
         hp.data[nx, ny] != 0 ||          // 已标记
         !IsValid(layer.heights[nx, ny])) // 高度数据无效
      {
        continue;
      }

      hp.data[nx, ny] = 1;
      stack.push({nx, ny});
    }
  }

  memset(hp.data, 0xff, sizeof(unsigned short)*hp.width*hp.height);

  // 栈内数据填充
  for(auto& [cx, cy] : stack)
  {
    hp.data[cx, cy] = layer.heights[cx, cy];
  }

  // BFS 填充高度采样数据
  int head = 0;
  while (head*2 < stack.size())
  {
    int cx = stack[head*2+0];
		int cy = stack[head*2+1];
		head++;
    
    ...// 扩建 stack 大小

    // 遍历 4 邻居并填充采样高度，且将邻居入队
    for(auto&& [nx, ny] : get4Neightbor(cx, cy))
    {
      if(!isInBound(nx, ny) ||
         isUnSet(hp.data[nx, ny]) ||
         isUnSet(layer.heights[nx, ny]))
      {
        continue;
      }

      hp.data[nx, ny] = layer.heights[nx, ny];
      stack.push({nx, ny});
    }
  }
  ```
  经过这一个步骤，我们就获取了一个对于当前多边形包围盒内有高度区域的高度采样盒，盒子内记录的是这个范围内的对应点的高度采样值。

+ buildLayerPolyDetail

  该函数把当前的凸多边形进一步细化为 **「细节三角形集」**，输出新的顶点数组 `verts` 与三角形索引 `tris`。该函数按 **“先稳住边界，再补内部误差”** 的思路分为三步：

  1. 对多边形边界采样并简化；
  2. 使用边界点做一次 Delaunay 三角化；
  3. 在多边形内部按误差继续补点，直到误差收敛。

  **边界采样**

  函数开始时先拷贝原始多边形顶点；如果 `sampleDist > 0`，则继续沿每条边按固定间距采样：

  ```cpp
  // DetourTileCacheDetail.cpp
  // static bool buildLayerPolyDetail(...)
  for (edge in polygon)
  {
      // 统一边方向，避免相邻多边形在共享边上采样顺序不一致
      sortLexicographically(vj, vi);
      // 采样数 = 1 + floor(边长 / 采样间距)
      nn = 1 + floor(edgeLength / sampleDist);
      for (k = 0; k <= nn; ++k)
      {
          pos = lerp(vj, vi, k / nn);
          pos.y = getHeight(pos.x, pos.y, pos.z, hp) * ch;
      }

      // 若采样点到线段的最大偏差超过 sampleMaxError
      // 则保留该点，意味着该点应作为细节多边形继续分化
      simplifyByMaxDeviation(edgeSamples, sampleMaxError);
      appendToHull(edgeSamples);
  }
  ```

  这里最关键的是两点：

  1. 采样后的高度并不是直接沿原边线插值，而是通过上一步生成的高度盒 `hp` 回查 `getHeight`，因此边界会贴合该层真实的高度场；
  2. 处理边时先按字典序统一方向，这样相邻多边形在共享边上会得到同一组采样结果，从而避免细节网格在接缝处出现裂缝。

  边界采样完成后，`hull` 中保存的是一圈外轮廓点，它既包含原始顶点，也可能包含新插入的边界细分点。

  **基础三角化**

  有了新的边界点后，函数会先做一次基础的三角化：

  ```cpp
  edges.resize(0);
  tris.resize(0);
  delaunayHull(nverts, verts, nhull, hull, tris, edges);
  ```

  调用的是 `delaunayHull`。它以边界环为约束，逐步补齐三角形面，得到一份满足 Delaunay 条件的初始细节网格。若这一步失败，则退化为简单的扇形三角化，至少保证当前多边形仍能输出可用结果。

  **按误差向内部补点**

  初始三角化只有边界约束，内部精度仍然可能不够。因此函数会在多边形包围盒内按 `sampleDist` 生成规则采样点，并剔除过于贴近边界的点：

  ```cpp
  for (z = z0; z < z1; ++z)
  {
      for (x = x0; x < x1; ++x)
      {
          pt = {x * sampleDist, midY, z * sampleDist};
          if (distToPoly(nin, in, pt) > -sampleDist / 2) continue;

          samples.push(x);
          samples.push(getHeight(pt.x, pt.y, pt.z, hp));
          samples.push(z);
      }
  }
  ```

  接着进入一个典型的 **误差驱动细分** 过程：反复找到“当前误差最大”的内部采样点，把它加入顶点集，并重新做一次 Delaunay 三角化。

  ```cpp
  for (iter = 0; iter < nsamples; ++iter)
  {
      best = findMaxErrorSample(samples, verts, tris);
      if (best.error <= sampleMaxError) break;

      verts.push(best.point);
      delaunayHull(nverts, verts, nhull, hull, tris, edges);
  }
  ```

  其中误差由 `distToTriMesh` 计算，本质上是 **“采样点高度” 与 “当前细节三角网在该点处插值得到的高度”** 的差值。误差大的点会优先被加入网格，因此细分结果会集中在起伏变化更明显的位置；而平坦区域通常不需要继续加点。

  UE 实现还有一个小细节：在评估内部采样点时，会对 `x/z` 加一个非常小的随机扰动 `jitter`，用于避免规则网格与对称边界组合时出现不稳定的退化三角形。

  整体上看，`buildLayerPolyDetail` 并不是“均匀细分”，而是一个 **边界一致、误差受控、逐步逼近真实高度场** 的细节网格构建过程。最终得到的 `tris` 仍然是同一块导航区域，但其局部高度表达会比上一步的凸多边形集精确得多。
  

#### Construct OffMeshData

#### dtCreateNavMeshData

# 参考

[^1]: [Distance Transforms](https://www.cs.auckland.ac.nz/~rklette/Books/MK2004/pdf-LectureNotes/08slides.pdf)

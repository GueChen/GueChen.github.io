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
  
  该步骤中将使用三角面生成以高度场表示的占据体素，示意图如下所示:
  <div style="text-align:center;"><img src='{{ site.baseurl }}\assets\img\post\navigation\voxel_heightfield.png' width=500></div>

  一个三角面体素化的示意如下所示：
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
  <div class="three-container" id="threeBox"></div>
  <div class="three-container" id="rasterize_voxel"></div>  
  <div id="controls" style="text-align: center; margin-top: 20px;">
  </div>
  <label>
    Tile Size:
    <input class="slider" id="tileSizeSlider" type="range" min="4" max="10" step="1" value="4">
    <span class="slider-value" id="tileSizeValue">4</span>
  </label>
  <label>
    Cell Size:
    <input class="slider" id="cellSizeSlider" type="range" min="0.1" max="1" step="0.1" value="0.1">
    <span class="slider-value" id="cellSizeValue">0.1</span>
  </label>
  <label>
    Cell Height:
    <input class="slider" id="cellHeightSlider" type="range" min="0.05" max="1" step="0.05" value="0.05">
    <span class="slider-value" id="cellHeightValue">0.05</span>
  </label>
  </div>
  <script type="module" src="{{ site.baseurl }}/assets/js/3d/rasterization.js"></script>
  <script type="module" src="{{ site.baseurl }}/assets/js/navigation/rasterization_voxel.js"></script>

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

+ 接着通过两次遍历填充生成距离场，填充规则为四方邻居距离加 2，对角邻居距离加 3（$3 \approx 2\sqrt{2}$）：

  1. 第一次遍历，对 $9 \times 9$ 的方格内下方与左侧的 4 个邻居块进行填充；
  
  2. 第二次遍历，对 $9 \times 9$ 的方格内上方与右侧的 4 个邻居块进行填充。
  
     【❌缺图】
    <link rel="stylesheet" href="{{site.baseurl}}/assets/css/grid.css">
    <p>
      <div class="inline-grid" data-size="10"></div>
    </p>
    <script src="{{ site.baseurl }}/assets/js/grid.js"></script>
  
  填充时取填入的最小值。
  
+ 对于距离场值小于 <cvar>walkableRadius</cvar> 的块即判定为不可行区域：

  ```cpp
  // RecastArea.cpp
  // bool rcErodeWalkableArea(...)
  if (dist[i] < thr)
      chf.areas[i] = RC_NULL_AREA;
  ```

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

  对体素块进行标记，主要过程发生在 <cfunc>rcGatherRegionsNoFilter</cfunc> 中，具体过程如下：

  首先标记 「 **边界** 」（**Border**） 区：

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

  + floodRegion

    找到一个体素块，检查它的八邻居，若存在与其 「 **区块** 」 （area） 一致，但已有集合标记 「 **区域** 」（region） 的连通邻居，则该块的 「 **区域** 」所属应与该邻居保持一致；

    否则，该块应视为一个新的 「 **区域** 」，并将满足距离的非标记连通四邻居标为相同的 「 **区域** 」，构成一个新的体素集合。

    > **区域** 只是对其中集合的一种称呼，没有特别含义，把它看作是集合划分即可

    其示意图如下：

    【👨‍🏭待施工】

  + expandRegions

    对于在距离场中高于输入阈值 <cvar>level</cvar> 但未有归属集合的体素块，检查它的四个连通邻居，若其中存在 「 **区块** 」 （area） 一致，且已有集合标记 「 **区域** 」（region）的，将该体素块归入邻居集合。

    若存在多个可取集合，则取距离场上最近的邻居。

    其示意图如下：

    【👨‍🏭待施工】

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
  
    【缺图👨‍🏭】
  
  + walkCountour
  
    给定一个体素块和一个初始探测方向，沿边缘遍历该「 **区域** 」，并记录所有的相邻「 **区域** 」，该过程遵循如下探索规则：
    
    1. 若探测方向上是不同 「 **区域** 」，则保持原地不动，探测方向向顺时针转动；
    2. 若探测方向上是相同 「 **区域** 」，则向该方向移动，探测方向向逆时针转动。
    
    其整个过程示意图如下所示：
    
    【缺图👨‍🏭】
    
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
由于本次介绍内容主要聚焦在 NavMesh，且限于本人水平未学习过相关算法，压缩算法不在本次介绍内容内。

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
+ dtBuildTileCacheRegion - xxx
+ dtBuildTileCacheContours - xxx
+ dtBuildTileCachePolyMesh - xxx
+ dtBuildTileCachePolyMeshDetail - xxx
+ GatherOffMeshLinkData - xxx
+ dtCreateNavMeshData - xxx

生成 Tile，待施工👨‍🏭

# 一些写完后可能会删去的碎碎念

第一个内容果然还是导航吧。

说起导航，第一反应其实是 SLAM 小车 UAV、无人机、激光雷达巴拉巴拉。要说为啥，因为老本行是机器人那边的，同组的👨👩一提导航就铁定是 SLAM，想起大三被贵州老铁拉着做冯如杯的时光...跑题了。

Anyway，每天健完身下班回来都写点东西，希望劳动节前能更完本篇。

~~急急急~劳动节前够呛啦~~~~

已经不急了，下个节点 7 月！

# 参考

[^1]: [Distance Transforms](https://www.cs.auckland.ac.nz/~rklette/Books/MK2004/pdf-LectureNotes/08slides.pdf)

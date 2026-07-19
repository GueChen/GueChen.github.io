---
layout: post
title:  "UE Instancing"
date:   2026-07-20 20:30:00 +0800
categories: jekyll update
---

# 引言
实例化是计算机图形学中一种十分常用的优化手段，用于一次性渲染大量相同的物体。自 Direct3D 9 以来，微软（Microsoft）提供实例化的接口，而 OpenGL 也在 3.1 版本后提供了对应的渲染接口，如今，实例化已是图形渲染中不可或缺的技术手段。UE4/UE5 也提供了实例化的功能，本文将对 UE 中的实例化进行分析。

UE 中提供了三种常见的静态网格实例化路径，分别是 **ISM**（Instanced Static Mesh）、**HISM**（Hierarchical Instanced Static Mesh）和 Auto Instancing。需要先说明的是，官方文档里通常把后者称为 **Dynamic Instancing**，它并不是一个新的组件类型，而是渲染器在 Mesh Drawing Pipeline 中对兼容 draw call 做自动合批的结果。本文将结合 **官方文档** 与 **UE 5.7 源码** 对这三种方式进行对比分析。

# ISM vs HISM vs Auto Instancing

先给出一个结论：**ISM / HISM 是显式的数据组织方式，Auto Instancing 是渲染阶段的自动合批策略**。前两者会改变关卡或 Actor 内部的数据组织，后者通常不改变你的关卡结构，只在渲染线程尝试把兼容的 draw 合成 instanced draw。

官方文档可参考：

+ [Instanced Static Mesh Component](https://dev.epicgames.com/documentation/en-us/unreal-engine/instanced-static-mesh-component-in-unreal-engine)
+ [Mesh Drawing Pipeline](https://dev.epicgames.com/documentation/en-us/unreal-engine/mesh-drawing-pipeline-in-unreal-engine)

三者的核心差异如下：

| 维度 | ISM | HISM | Auto Instancing |
| --- | --- | --- | --- |
| 入口 | 显式使用 `UInstancedStaticMeshComponent` | 显式使用 `UHierarchicalInstancedStaticMeshComponent` | 无需新组件，渲染器自动尝试合批 |
| 优化层级 | 减少 `UObject` / Component 数量，同时减少 draw call | 在 ISM 基础上进一步优化大规模静态实例的裁剪与 LOD | 主要减少 draw call，不减少 Actor / Component 数量 |
| 数据组织 | 一个组件保存一组实例，核心数据是 `PerInstanceSMData` | 除实例数据外，还维护 `ClusterTreePtr`、`SortedInstances` 等层级树数据 | 没有新的实例组件数据，仍然是原本的 `UStaticMeshComponent` / `UStaticMeshActor` |
| 剔除与 LOD | UE5.7 中 ISM 已有 `InstanceLODDistanceScale`、`InstanceMinDrawDistance`、`bUseGpuLodSelection` 等显式控制项，通常由 GPU 逐实例处理裁剪/LOD | 借助静态层级树加速 culling / LOD，适合 1000+ 静态实例 | 仍按原始 Primitive 参与可见性流程，只是在提交 draw 时尝试合并 |
| 动态更新 | 适合会频繁增删改实例的场景 | 实例频繁变化时层级树需要重建，维护成本更高 | 无显式增删实例接口，属于 best-effort 渲染优化 |
| 典型场景 | 重复道具、可交互静态物件、需要 per-instance custom data | 草、树、石块等大批量静态散布物 | 已经铺好的大量相同 Static Mesh Actor，希望“不改结构先吃到一些合批收益” |
| 主要限制 | 材质、碰撞、阴影等大多仍是组件级共享属性 | 对频繁运动或频繁编辑的实例不友好 | 需要 shader binding 完全兼容，且仅在特定渲染路径下生效 |

如果只看**“我应该优先用哪个”**，可以简单记成：

+ **实例很多，而且经常要改**：优先 ISM；
+ **实例非常多，而且基本不动**：优先 HISM；
+ **项目里已经有很多普通 Static Mesh Actor，不想重构**：Auto Instancing 可以当作“白送的额外合批”，但不要把它当成 ISM/HISM 的等价替代品。

## 同一批场景下，三者的成本怎么对比

如果假设三种方案最终画的是**同样一批重复资产、同样的可见结果**，那它们的差异主要不在“能不能画出来”，而在 **CPU 侧怎么组织实例、什么时候做 culling、GPU 最后拿到什么样的 draw**。

这里先约定一下本文这一小节里的口径：

+ **第一帧**：这一批物体第一次进入当前视角并开始生成/消费相关渲染数据的那一帧
+ **静态帧**：主要指**相机基本不动**、可见集合变化很小的连续帧
+ **动态帧**：主要指**相机持续移动**、可见集合和 screen size / LOD 持续变化的连续帧

也就是说，这里的“静态 / 动态”**首先是按视角变化来分**，不是指实例本身是否增删改。  
“实例本身经常移动、增删、重排”的成本，下面会单独补一段专门说明。

### 第一帧

第一帧最重要的区别，其实是“前期准备成本”落在哪一层：

| 维度 | ISM | HISM | Auto Instancing |
| --- | --- | --- | --- |
| 组件/对象管理 | 一个组件管很多实例，CPU 侧对象数量少 | 和 ISM 一样对象数少，但还要额外维护层级树 | 仍是很多普通 `StaticMeshComponent`，对象管理成本最高 |
| 第一帧 culling 成本 | 先过组件级 primitive 可见性，再在后面走 per-instance culling | 除 primitive 之外，还能借 cluster tree 更早裁掉整组实例 | 仍按每个原始 primitive 各自做可见性、LOD、relevance，primitive 侧工作量通常最大 |
| 第一帧额外准备 | 上传实例缓冲、建立 instance data 相关渲染资源 | 除实例缓冲外，还可能有树构建/重建成本 | 不建实例组件数据，但要在 visible MDC 上做 state bucket 合并与 primitive-id buffer 构造 |
| 第一帧总体印象 | 比大量普通 StaticMesh 更稳，通常比 Auto Instancing 更像“前置建好批” | 如果实例很多且静止，常是第一帧后续收益最高，但树维护最重 | 最容易直接使用，但 CPU 侧 primitive 遍历和后续合批整理通常最贵 |

如果场景里是“很多很多个普通 `StaticMeshComponent` 指向同一个资产”，**Auto Instancing 的第一帧并不会跳过这些组件各自的 primitive 可见性流程**。它是等这些 primitive 已经进入 visible draw command 阶段后，才尝试把兼容的 cached MDC 合起来。所以在第一帧上，Auto Instancing 往往更像：

+ **前面的 primitive 侧成本偏高**
+ **后面的 draw-call merging 帮你追回一部分提交成本**

而 ISM/HISM 则更像是：

+ **内容层先把“很多物件”压成“少量组件”**
+ **然后 renderer 再在这个基础上继续做实例级剔除**

### 静态帧

这里的静态帧主要指：**相机基本固定不动**，所以每帧的可见集合、screen size、LOD 选择都比较稳定。

| 维度 | ISM | HISM | Auto Instancing |
| --- | --- | --- | --- |
| CPU culling | 组件数少，primitive 级开销较低；后续主要看 per-instance culling | 通常最低，尤其是远距离大规模散布物，cluster tree 很容易提前裁掉大块实例 | 仍要面对较多 primitive / component 级遍历，只是提交 draw 时可减少 draw call |
| Draw 提交 | 一个组件天然就是 instanced draw，提交流程紧凑 | 和 ISM 类似，但受益于更强的层级裁剪 | 需要先得到 visible MDC，再做动态合批；成功时 draw call 会降，但前置遍历没消失 |
| 稳定场景收益 | 高 | 最高，前提是实例大多不动 | 中等，更像“在不重构内容的前提下尽量省 draw” |

如果相机长期稳定、场景里的重复实例也很多，**HISM 往往是三者里最吃香的**，因为它把“实例很多”这件事转化成了更适合静态层级树处理的问题。ISM 次之；Auto Instancing 虽然也能减少 draw call，但它并没有从根源上减少“原始 primitive 的数量”。

### 动态帧

这里的动态帧主要指：**相机持续移动**，于是每一帧的 frustum culling 结果、screen size、LOD、进入各个 mesh pass 的可见集合都更容易变化。

| 维度 | ISM | HISM | Auto Instancing |
| --- | --- | --- | --- |
| 相机移动时的 culling 成本 | 组件数少，primitive 级成本仍相对可控；后面继续走 per-instance culling | 层级树仍有优势，尤其在超大规模散布物场景里，能较快裁掉整簇实例 | 每帧都要重新面对大量原始 primitive 的可见性/LOD/relevance，前置成本通常最高 |
| Draw 提交波动 | 仍是 instanced draw，提交成本相对稳定 | 同样较稳定，但可见 cluster 变化会影响进入后续阶段的实例组 | 可见 MDC 集合变化后，每帧都还要重新做 compatible draw 的合并整理 |
| 动态帧总体印象 | 通常最稳健、最均衡 | 在超大规模静态散布物里依旧强，但视角变化剧烈时优势更多体现在层级裁剪 | 当你不能改内容结构时仍有价值，但视角频繁变化时 CPU 侧前置工作通常最多 |

也就是说，**只要这里说的“动态帧”是指相机在动，而不是实例自己在改**，那么 HISM 的优势并不会像“实例频繁编辑”那样明显坍塌。它依旧能依赖层级树做大尺度裁剪；ISM 依旧是通用且稳定的默认解；Auto Instancing 的主要问题仍是它没有减少原始 primitive 数量。

### 如果实例本身也在频繁变化

上面的“动态帧”是按**相机变化**定义的。  
如果你还叠加了另一层条件——**实例本身也经常移动、增删、重排**——那结论要再补一句：

+ **ISM** 通常是三者里最稳的
+ **HISM** 会因为树维护/重建变得更吃亏
+ **Auto Instancing** 虽然不需要维护实例树，但也始终拿不到 ISM/HISM 那种显式实例数据组织收益

### GPU 开销

GPU 侧不能只看 draw call 数，还要看实例剔除方式、LOD 选择方式、是否有额外的无效实例被送进后续阶段。

| 维度 | ISM | HISM | Auto Instancing |
| --- | --- | --- | --- |
| Draw call 数 | 通常很低，一个组件就能带很多实例 | 同样很低 | 成功合批时可以明显下降，但不保证 always merge |
| GPU instance 处理 | 强绑定 GPU Scene / per-instance culling 路径，实例级处理能力强 | 既有实例化 draw，也有层级树帮助减少进入后续阶段的实例组 | 本质还是把多个单实例 draw 合成 instanced draw，本身没有 ISM 那种“实例数据容器” |
| 无效工作控制 | 较好，尤其在实例很多时 | 最好，静态大规模场景下通常最容易减少无效实例参与 | 中等，能减少 draw dispatch，但对“原始 primitive 太多”这件事帮助有限 |
| 典型 GPU 画像 | 通用且稳定 | 静态大规模散布物最优 | 更像“不改内容结构时的额外收益” |

如果把 GPU 开销说得更直白一点：

+ **Auto Instancing** 的主要收益点是“少发几条 draw”
+ **ISM** 的收益点是“从一开始就按实例组织数据，再做 per-instance culling”
+ **HISM** 的收益点是“在实例化基础上，再尽量别让整团看不见的实例进入后续阶段”

因此在“同样的绘制结果”前提下，可以把三者的大致排序理解成：

+ **第一帧 CPU 成本**：HISM `>=` Auto Instancing `>=` ISM  
  `HISM` 可能输在树准备，`Auto Instancing` 可能输在 primitive 数量，`ISM` 通常最均衡
+ **静态帧 CPU culling 成本**：Auto Instancing `>=` ISM `>=` HISM  
  primitive 数量越大、实例越静止，`HISM` 越有优势
+ **动态帧 CPU 成本（相机持续移动）**：Auto Instancing `>=` ISM `>=` HISM  
  视角变化越频繁、原始 primitive 越多，`Auto Instancing` 越容易输在前置可见性遍历；超大规模静态散布物里 `HISM` 往往仍有优势
+ **GPU 提交与实例利用率**：Auto Instancing 通常不如 ISM/HISM 稳定；静态超大场景里 HISM 往往最好，通用场景下 ISM 最稳

这里要特别强调：这些排序是**同规模、同可见结果、按典型源码路径推导出来的经验比较**，不是绝对常数。是否启用 Nanite、材质是否破坏合批、实例是否半透明、是否保持实例顺序、GPU Scene / Instance Culling 的具体路径，都可能改变最终收益。

# Auto Instancing

Auto Instancing 在官方渲染文档里的名称其实是 **Dynamic Instancing**。它不是 `UObject` 层面的实例组件，而是 **Mesh Drawing Pipeline** 在渲染线程里尝试做的一次自动 draw-call merging。

## 它本质上在做什么

如果把话说得更具体一点，Auto Instancing 做的不是“把若干 Actor 变成一个组件”，而是：

+ 先让每个普通 `StaticMeshComponent` 仍按自己的方式生成 cached mesh draw commands；
+ 再在 renderer 里检查这些 visible mesh draw commands 能不能合并；
+ 如果它们足够兼容，就把多条原本 `NumInstances == 1` 的 draw command 合成为一条 instanced draw。

因此，Auto Instancing 发生的层次比 ISM/HISM 更晚：

+ **ISM / HISM**：内容层、组件层先改变数据组织；
+ **Auto Instancing**：渲染层看到 draw command 后再决定能不能顺手合批。

这也是为什么它只能减少 draw call，**却不能减少 Actor / Component / UObject 数量**。

## 开关与生效前提

这部分在 5.7 源码里仍然很直接，开关对应：

```cpp
// SceneRendering.cpp
r.MeshDrawCommands.DynamicInstancing = 1
```

并且 `IsDynamicInstancingEnabled()` 还明确要求 **GPU Scene** 可用：

```cpp
return CVarMeshDrawCommandsDynamicInstancing.GetValueOnRenderThread() > 0
    && UseGPUScene(GMaxRHIShaderPlatform, FeatureLevel);
```

除此之外，官方文档和源码还能总结出几个关键前提：

+ 只有 **cached mesh draw commands** 才能参与这类自动合批；
+ 官方文档明确指出，目前这基本把它限制在 **`FLocalVertexFactory`** 路径上；
+ draw 必须拥有完全兼容的 shader bindings / vertex streams / primitive id stream / pipeline state；
+ 如果 draw 走的是动态路径、或者根本没有稳定的 cached MDC，那通常就吃不到这类收益。

所以 Auto Instancing 更像是“**建立在 cached MDC 体系之上的 bonus**”，不是所有静态网格都天然能享受到的免费优化。

## 代码路径：它在什么时候尝试合批

在 5.7 里，这条路径最关键的代码点之一是 `BuildMeshDrawCommandPrimitiveIdBuffer(...)`。渲染器在遍历 visible mesh draw commands 时，会按 `StateBucketId` 这样的状态分桶看它们能不能合并。

从代码条件上看，一条命令想进入这条经典 Dynamic Instancing 合批路径，至少要满足：

+ `StateBucketId != INDEX_NONE`
+ `PrimitiveIdStreamIndex >= 0`
+ `MeshDrawCommand->NumInstances == 1`
+ 后面还得有下一条命令，并且下一条命令和它属于同一个 `StateBucketId`

也就是说，**Auto Instancing 的经典目标是：把很多原本单实例的 cached MDC 拼成一条新的 instanced MDC。**

这也顺带解释了一个常见误区：  
**“相同资产”不是充分条件，真正的关键是“相同状态桶 + 相同命令签名”。**

## 从剔除角度看它是怎么工作的

如果从剔除的角度来理解 Auto Instancing，一个非常关键的事实是：

> **Dynamic Instancing 不是先合批、再统一做 primitive culling；而是先完成 primitive / static mesh relevance 过滤，再把已经可见的 visible mesh draw commands 做后续合并。**

这点从 `SceneVisibility.cpp` 的流程可以看得很清楚：

+ 先对 primitive 做可见性判断、距离裁剪、预计算可见性、遮挡相关处理；
+ 再结合 `StaticMeshRelevance`、LOD、screen size、dithered LOD 等条件筛出当前 pass 真的要提交的 mesh；
+ 然后 `FDrawCommandRelevancePacket::AddCommandsForMesh(...)` 才把它们变成 `VisibleCachedDrawCommands` 或 dynamic build requests；
+ 再往后，`BuildMeshDrawCommandPrimitiveIdBuffer(...)` 才开始尝试对这些 **已经进入 visible list 的 MDC** 做 Dynamic Instancing。

换句话说，Dynamic Instancing 并不会让一大批原本不可见的 primitive 先错误地“打包进一个大 draw 再去画”；**primitive 级别的可见性筛选仍然先发生**，它只是在“已经判定需要参与当前 pass 的那些 draw command”之上继续做合并。

### 那它会不会比别的组件在 culling 上更贵

答案要分成两层：

+ **在 primitive 可见性判断这一步，通常不会明显更贵**
+ **在 pass setup / draw command 合并这一步，会多一层额外处理成本**

前者的原因是：对普通 `StaticMeshComponent` 来说，Dynamic Instancing 不会改变它最前面的 primitive 级剔除流程。`InitViews`、`SceneVisibility`、LOD 选择、distance cull、是否进入某个 mesh pass，这些事情本来就要做，Auto Instancing 只是发生在后面。

真正新增的成本主要在后者，也就是：

+ 遍历 `VisibleMeshDrawCommands`
+ 按 `StateBucketId` 分桶
+ 生成 / 重写 primitive id buffer
+ 在合适时构造新的 instanced MDC

这些开销本质上属于 **render pass setup 成本**，而不是传统意义上“多做了一轮 primitive culling”。所以更准确的说法应该是：

> **Dynamic Instancing 会增加 draw-command 级别的整理/压缩开销，但不等于显著增加 primitive 级 culling 开销。**

### 为什么你会看到“第一帧偏高，静止几帧后逐渐降低”

如果你的实测现象是：**Auto Instancing 场景第一次进入视野时 culling / InitViews 相关开销偏高，而相机静止几帧后逐渐回落**，这和 5.7 的可见性、遮挡历史、Dynamic Instancing 时机是吻合的。

可以把它拆成四层看：

+ **第一层：Auto Instancing 不会减少第一轮 primitive 数量**  
  大量普通 `StaticMeshComponent` 在第一轮仍然要各自经过 frustum culling、distance cull、LOD / relevance 判定。Auto Instancing 发生在这些 primitive 已经变成 `VisibleCachedDrawCommands` 之后，所以它来不及帮你省掉这轮前置遍历。

+ **第二层：第一帧通常还没有成熟的 occlusion history**  
  `FPrimitiveOcclusionHistory` 初始值里，`WasOccludedLastFrame = false`，`OcclusionStateWasDefiniteLastFrame = false`，说明新进入视野的 primitive 一开始不会带着“上一帧已经确认被挡住”的稳定结论进来。  
  对 HZB / query 路径来说，第一帧更多是在**提交测试、建立历史**，而不是充分消费历史。

+ **第三层：静止几帧后，遮挡历史开始起作用**  
  一旦 `HZBOcclusionTests` 或过去几帧的 query readback 变成有效结果，很多原本第一帧被保守地当成 visible 的 primitive，就会在后续帧更早地判成 occluded，不再进入后面的 visible MDC / Dynamic Instancing 整理阶段。  
  所以你看到的不只是“draw call 变少”，更是 **参与后续 pass setup 的 visible primitive / visible MDC 变少了**。

+ **第四层：稳定视角下，查询本身也会被节流**  
  在 query 路径里，如果一个 primitive 已经被证明是 visible，后续并不是每帧都必须用同样强度重新测一次。源码里会结合 `LastPixelsPercentage`、`LastProvenVisibleTime`、`PrimitiveProbablyVisibleTime` 来决定是否继续频繁发 query。  
  这意味着静止视角下不仅“被挡住的东西”会逐步退出 visible 集合，**连遮挡测试本身的压力也会慢慢趋稳**。

把这四层合起来，你测到的曲线通常就会像这样：

+ **第一帧**：原始 primitive 全量参与前置可见性流程，occlusion history 还没热起来，visible MDC 偏多，Auto Instancing 还要在后面做合并整理，所以 culling / pass setup 看起来偏高
+ **接下来几帧**：HZB / query readback 逐步有效，被遮挡的 primitive 开始更早退出，visible MDC 数下降，Dynamic Instancing 需要整理的命令也变少
+ **相机静止后**：可见集合趋于稳定，occlusion history 与 query throttling 都开始工作，开销进一步回落

这里还有一个很容易忽略的细节：**这个“逐渐降低”往往不是只过 1 帧就完成，而是可能跨 1~N 帧。**  
因为 UE 的 occlusion 结果读取本来就有 buffered frames，`FOcclusionQueryHelpers::GetNumBufferedFrames(...)` 会决定 readback 的滞后帧数；如果开了 round-robin occlusion，这个历史收敛还可能更慢。

所以更准确地说：

> **Auto Instancing 第一帧看起来“剔除偏高”，往往不是它把 culling 变重了一整套，而是“原始 primitive 还没被历史遮挡信息筛下去 + 后面的 visible MDC 合并整理已经开始算成本”这两件事叠在一起。**

### 它为什么有时反而能减少后续开销

虽然前面多了一层 command compaction，但如果最终成功把很多兼容的 `NumInstances == 1` draw 合成了一条 instanced draw，那么后续：

+ RHI draw call 数会减少
+ 部分状态切换会减少
+ primitive id buffer / GPU Scene 数据能以 instanced 方式批量消费

因此它的收益点并不在“前面的剔除更省”，而更偏向于：

+ **后面的 draw dispatch 更少**
+ **同一批兼容 draw 的提交更紧凑**

### 和 ISM / HISM 在剔除侧的最大差别

这里也能顺手看出它和 ISM/HISM 的根本差异：

+ **Auto Instancing**：先按普通 primitive 流程完成可见性筛选，再对可见的 MDC 做自动合批
+ **ISM**：一个组件天然带多个实例，后面还能继续进入 GPU per-instance culling
+ **HISM**：在 ISM 基础上再加层级树，让 culling / LOD 更早、更粗粒度地受益

所以如果你问“**第一次绘制 MDC 时 Dynamic Instancing 会不会比别的组件在 culling 上花费更多**”，最稳妥的回答是：

+ **不会在最前面的 primitive culling 阶段显著更贵**
+ **会在可见 draw command 的整理与合并阶段增加一些 pass setup 成本**
+ **这笔成本换来的是后续 draw dispatch 数量下降**

## 为什么同样资产有时也不会合批

决定兼容性的底层判断并不只看 mesh 资产名。`FMeshDrawCommand::MatchesForDynamicInstancing()` 会同时比较：

+ `CachedPipelineId`
+ `ShaderBindings`
+ `VertexStreams`
+ `PrimitiveIdStreamIndex`
+ `IndexBuffer / FirstIndex / NumPrimitives`
+ `NumInstances`

这意味着就算你看到场景里摆了很多“同一个静态网格”，只要下面任意一项不一致，就可能进不了同一个 bucket，或者最终匹配失败：

+ 材质实例不同
+ Lightmap / lightmap cluster 不同
+ Vertex color 不同
+ Shader permutation 不同
+ Vertex streams 不同
+ Primitive 相关绑定方式不同

官方文档和源码里还明确点名了几类会破坏 dynamic instancing 的情况：

+ **loose parameters**
+ **单独 SRV / sampler 绑定**
+ **per-component vertex colors**
+ **SpeedTree Wind**
+ 某些导致 small lightmap texture 分裂的 lightmap 情况

对应地，源码里甚至直接有告警：

+ `One or more Cached Mesh Draw commands use loose parameters ... will break dynamic instancing`
+ `Cached Mesh Draw command uses individual SRVs ... will break dynamic instancing`
+ `Cached Mesh Draw command uses individual Texture Samplers ... will break dynamic instancing`

所以 Auto Instancing 的真实画风并不是“同资产必合批”，而是“**同资产只是起点，最终还得通过一整套 draw-command 级别的一致性检查**”。

## 如何观察它有没有生效

如果要观察场景里的 Auto Instancing 效果，最直接的几个开关是：

+ `r.MeshDrawCommands.DynamicInstancing`
+ `r.MeshDrawCommands.LogDynamicInstancingStats 1`
+ `r.MeshDrawCommands.UseCachedCommands`

其中：

+ `DynamicInstancing` 控制是否开启这条自动合批路径；
+ `LogDynamicInstancingStats` 用来把合批统计打到日志；
+ `UseCachedCommands` 对排查也很有用，因为 Auto Instancing 本身就建立在 cached MDC 之上。

## 它和 ISM / HISM 的边界

这也是为什么 Auto Instancing 虽然很香，但不能把它当成“自动版 ISM”：

+ 它**不帮你压缩关卡数据结构**；
+ 它**不提供 `AddInstance` / `UpdateInstanceTransform` 这种显式实例管理接口**；
+ 它**不保证一定合批成功**；
+ 它**更像渲染器赠送的额外优化**，而不是一个稳定可控的内容组织方案。

如果你手里已经有一大片普通 `StaticMeshActor`，短期又不想改成 ISM/HISM，那 Auto Instancing 值得期待；但如果你从一开始就在设计一套可扩展的重复物件系统，那么 **显式用 ISM / HISM 通常更可控**。

# ISM

## 组件层定义与数据组织

ISM 是最直接的实例化组件。官方对它的定义非常明确：**一个 ISM 组件内部包含一组相同的 Static Mesh 实例**。每个实例拥有独立 Transform，但材质、碰撞、阴影等很多属性仍然是**组件级共享**的。

源码上也能看到这一点：在 UE 5.7 中，`UInstancedStaticMeshComponent` 内部直接维护了 `PerInstanceSMData`、`PerInstanceSMCustomData`、`InstanceReorderTable` 等实例数组，同时还暴露了 `InstanceLODDistanceScale`、`InstanceMinDrawDistance`、`bUseGpuLodSelection` 等和逐实例裁剪/LOD 相关的控制项，说明它本质上就是“**一个组件 + 一批实例数据**”的组织方式。

ISM 的优点主要有三点：

+ **减少对象数量**：把原本一堆 `UStaticMeshComponent` / `AStaticMeshActor` 折叠成一个组件；
+ **减少 draw call**：相同网格实例走同一条 instanced draw 路径；
+ **保留较好的动态性**：增删实例、更新实例 Transform、设置 per-instance custom data 都比较直接。

## LOD 与裁剪特性

官方文档还特别提到一个很重要但容易被忽略的点：**在现代 UE 里，ISM 也可以按实例处理 LOD**。而从 5.7 的组件字段也能看出，这已经不是一句抽象描述，而是已经落实到了显式的 LOD / draw distance 控制项上。这意味着“只有 HISM 才能做 per-instance LOD”已经不再是一个完全准确的结论。

但代价也很直接：ISM 没有 HISM 那种静态层级树，因此它的 cull / LOD 更依赖 GPU 逐实例处理；在低端平台上，这部分成本可能更高。

## 从组件到 RHI 的主渲染路径

如果继续往渲染实现里看，ISM 从组件一路走到 RHI 的路径大致如下。

### Game Thread：组件创建 SceneProxy

`UInstancedStaticMeshComponent::CreateSceneProxy()` 会先检查实例数据是否合法，然后调用 `Super::CreateSceneProxy()` 创建渲染代理。在 5.7 中，这一步最终会走到 `CreateStaticMeshSceneProxy()`，并构造 `FInstancedStaticMeshSceneProxy`。

与此同时，组件侧会把实例更新整理进 `PrimitiveInstanceDataManager`，再通过 `FlushChanges()` 把实例数据描述同步给渲染线程。

### Render Thread：初始化实例缓冲与 Vertex Factory

`FInstancedStaticMeshSceneProxy::CreateRenderThreadResources()` 会把实例缓冲绑定到 vertex factory：`InstancedRenderData.BindBuffersToVertexFactories(...)`。这一步很关键，它把“这批实例的 Transform / Custom Data / Instance Header”真正变成了渲染线程可消费的 GPU 资源。

随后又会创建各个 LOD 对应的 loose uniform buffer，供后续 mesh pass 使用。

### Static Path：由 DrawStaticElements 产出 FMeshBatch

普通 ISM 在常规渲染下并不是强制 dynamic relevance，它继承的是 `FStaticMeshSceneProxy::GetViewRelevance()`，因此主路径通常还是 **static relevance**。也正因此，它的主提交流程不是 `GetDynamicMeshElements()`，而是 `FStaticMeshSceneProxy::DrawStaticElements()`。

更准确地说，`FInstancedStaticMeshSceneProxy` 自己没有重写 `DrawStaticElements()`，但 `FStaticMeshSceneProxy::DrawStaticElements()` 内部会调用虚函数 `GetMeshElement(...)`；而 ISM 正好重写了 `GetMeshElement()`，并在里面继续调用 `SetupInstancedMeshBatch()`，把普通 static mesh batch 改造成 instanced mesh batch：

+ `OutMeshBatch.VertexFactory = &InstancedRenderData.VertexFactories[LODIndex]`
+ `BatchElement0.bForceInstanceCulling = true`
+ `BatchElement0.NumInstances = GetInstanceDataHeader().NumInstances`
+ 还会写入 `PrimitiveUniformBuffer`、`LooseParametersUniformBuffer`、`InstancedLODIndex` 等字段

到这里为止，渲染器已经拿到了一个标准的 `FMeshBatch`，并且这个 batch 明确声明了“我有多少个实例、实例数据在哪个 vertex factory 里取”。换句话说，**ISM 的关键不是默认走 dynamic path，而是在 static path 里把 batch 实例化了。**

### Mesh Drawing Pipeline：FMeshBatch 变成 FMeshDrawCommand

后面就进入官方文档里的 Mesh Drawing Pipeline：各个 pass 的 `FMeshPassProcessor::AddMeshBatch(...)` 会把 `FMeshBatch` 转成 pass 专用的 `FMeshDrawCommand`。这一步会完成 shader 选择、render state 整理、shader binding 收集等工作。

对 ISM 来说，前面 SceneProxy 写进 `FMeshBatch` 的实例数、PrimitiveId、uniform buffer、vertex factory 绑定，都会在这里继续往下传递。

### RHI 提交：接口名字相同，但实例数不同

最后，在 `MeshDrawCommands` 路径里，渲染器会把这些 `FMeshDrawCommand` 提交给 `SubmitMeshDrawCommandsRange(...)`。再往下看 `FMeshDrawCommand::SubmitDraw()` / `SubmitDrawEnd()`，对于 indexed mesh，最终通常会落到：

+ `RHICmdList.DrawIndexedPrimitive(...)`
+ 或在 indirect 路径下落到 `RHICmdList.DrawIndexedPrimitiveIndirect(...)`

这里需要强调一个容易误解的点：**ISM 并不是换了一套完全不同名字的 RHI draw API，而是走了同一族 draw 接口，但把 `NumInstances` 从普通 Static Mesh 常见的 `1` 变成了 `MeshDrawCommand.NumInstances`**。

在 5.7 代码里，`FMeshDrawCommand::SetDrawParametersAndFinalize()` 会把 `BatchElement.NumInstances` 写入 `MeshDrawCommand.NumInstances`，而前面 ISM 在 `SetupInstancedMeshBatch()` 里已经把它设置成 `GetInstanceDataHeader().NumInstances`。因此最终 RHI 调用的关键差异其实是：

+ **普通 Static Mesh**：通常是 `DrawIndexedPrimitive(..., NumInstances = 1)`
+ **ISM**：通常是 `DrawIndexedPrimitive(..., NumInstances = 实例数量)`

这时对 RHI 来说，它看到的已经不再是“一个个 Actor”或者“一个个 Component”，而是一条条准备好的 draw command；ISM 的价值也正体现在这里：**同一个 mesh section 可以携带一整批实例一次性发到 GPU**，而不是为每个实例分别走一遍 draw。

## ISM 与 GPU Per-Instance Culling

上面那条“组件 -> SceneProxy -> FMeshBatch -> MDC -> RHI”是主链路，但 ISM 在 5.7 里还有一个非常关键的后续阶段：**GPU Per-Instance Culling / Instance Culling**。

这条路径之所以会和 ISM 强相关，是因为 `SetupInstancedMeshBatch()` 里显式设置了：

+ `BatchElement0.bForceInstanceCulling = true`
+ `BatchElement0.bFetchInstanceCountFromScene`（可由 `r.InstancedStaticMeshes.FetchInstanceCountFromScene` 控制）

而渲染器侧又会通过 `HasPrimitiveIdStreamIndex` 来判断命令是否支持 GPU Scene instancing。结合 `FInstancedStaticMeshVertexFactory` 继承自 `FLocalVertexFactory`、拥有实例流和 PrimitiveId stream 这一点，ISM 自然就成了 **GPU per-instance culling** 的典型使用者。

具体到 `FInstanceCullingContext::SetupDrawCommands()`，渲染器会进一步根据这些标志决定：

+ 当前命令是否支持 GPU Scene instancing
+ 是否强制走 instance culling
+ 是否要使用 indirect draw
+ 如何把 `InstanceSceneDataOffset + NumInstances` 写进后续的 draw command / indirect args

因此，ISM 并不是“先在 CPU 上把实例都筛完，再一次性画出去”这么简单；更准确地说，**ISM 会先形成带实例数的 draw command，再把 per-instance 的可见性筛选继续下放到 GPU Scene / Instance Culling 阶段**。这也是为什么 UE5 里的 ISM 在大规模场景下，和传统“纯 CPU 管理实例列表”的老式 instancing 路线相比，表现和实现细节都很不一样。

## ISM 与 Auto Instancing 的边界

前面已经看过 Auto Instancing 的工作层级。回到 ISM 这里，一个更细的问题是：**ISM 自己生成的 Mesh Draw Command，是否还能继续参加 Auto Instancing / Dynamic Instancing？**

结论先说在前面：**一般不指望再和普通 Static Mesh 一起参加这类自动合批。**

原因不是一句“因为它已经是实例化了”就能概括完，而是匹配条件本身决定了它很难和普通 Static Mesh 命令合并。5.7 里 `FMeshDrawCommand::MatchesForDynamicInstancing()` 会同时比较：

+ `CachedPipelineId`
+ `ShaderBindings`
+ `VertexStreams`
+ `PrimitiveIdStreamIndex`
+ `IndexBuffer / FirstIndex / NumPrimitives`
+ `NumInstances`

这意味着：

+ 普通 Static Mesh 的自动合批，典型情况是很多 `NumInstances = 1` 的 cached MDC 彼此兼容，然后被合成一个 instanced draw；
+ ISM 自己产出的 MDC 从一开始就是 `NumInstances = N`，并且使用的是 `FInstancedStaticMeshVertexFactory` 对应的实例流；
+ 普通 Static Mesh 则是常规 `FLocalVertexFactory` 路径，vertex streams 和 shader permutation 也不同。

因此，**即便是“同一个 Static Mesh 资产 + 同一个材质”**，ISM 和普通 Static Mesh 的 MDC 也通常不会匹配成功，至少有下面几层差异：

+ **VertexFactory 不同**：ISM 用的是 `FInstancedStaticMeshVertexFactory`，普通 Static Mesh 是 `FLocalVertexFactory`
+ **VertexStreams 不同**：ISM 多了实例流 / instance buffer
+ **NumInstances 不同**：普通 Static Mesh 常见是 1，ISM 是 N
+ **ShaderBindings 也可能不同**：ISM 额外带有 instancing 相关 uniform / SRV 绑定

换句话说，**ISM 的“批”是在组件层先做好的批；Auto Instancing 的“批”是在 renderer 层对兼容 MDC 再做一次自动合批**。两者发生的层次不同，匹配条件也不同，所以通常不会把“一个 ISM draw”再和“一堆普通 Static Mesh draw”混成同一个自动合批结果。

顺便一提，`FInstancedStaticMeshVertexFactory` 在 5.7 里依然声明了 `SupportsCachingMeshDrawCommands`，所以从“能不能生成 cached MDC”这个角度讲，ISM 当然可以进入 cached mesh draw command 体系；但**能进入 cached MDC 体系**并不等于**能和普通 Static Mesh 一起通过 `MatchesForDynamicInstancing()`**。真正卡住它们混合合批的，是上面那组更严格的匹配条件。

## 相同资产的多个 ISM 之间，能不能再合批

这个问题需要分成两层来回答：

+ **经典 Dynamic Instancing 意义下的 MDC 合批**
+ **Instance Culling 阶段对相同命令的后续压缩**

### 经典 Dynamic Instancing 路径

按传统 Dynamic Instancing 的那条路径看，多个 ISM draw 一般不是主要合批对象。

原因在 5.7 的 `BuildMeshDrawCommandPrimitiveIdBuffer(...)` 里写得很直白：它尝试把多个 draw 合成新的 instanced MDC 时，要求 `VisibleMeshDrawCommand.MeshDrawCommand->NumInstances == 1`。而普通 ISM 在 `SetupInstancedMeshBatch()` 之后生成的 `MeshDrawCommand`，`NumInstances` 通常本来就是该组件自己的实例数 `N`，不是 `1`。所以：

+ **很多普通 Static Mesh draw**：典型是 `NumInstances == 1`，适合走经典 Dynamic Instancing 合批；
+ **一个普通 ISM draw**：本身已经是 `NumInstances == N`，通常不会再走这条“把多个单实例 MDC 拼成一个新 instanced MDC”的老路。

### GPU Scene / Instance Culling 阶段的后续压缩

但事情到这里还没结束。5.7 里还有第二层：**`FInstanceCullingContext::SetupDrawCommands()` 会在 GPU Scene / Instance Culling 阶段继续尝试 compact identical commands。** 这一步对 ISM 是重要的，因为代码注释和条件都说明了：**多个 ISM draw 在某些情况下是可以继续被压缩到一起的**，但条件比普通 Static Mesh 更苛刻。

可以继续压缩的典型前提有：

+ 多个可见命令拥有相同的 `StateBucketId`
+ `CullingPayloadFlags` 一致
+ 不要求实例顺序保持（`bPreserveInstanceOrder == false`）
+ 不落在当前“不支持 merging ISM draws”的特殊路径上

其中最值得注意的是这条源码注释：

> `UniformBufferView path and instance order preservation do not support merging ISM draws atm`

也就是说，**相同资产的多个 ISM 可以再压缩，但不是无条件的**。当前至少有几类情况会明显阻止它们继续合并：

+ **需要保持实例顺序**  
  最典型的是半透明材质。前面 `SetupInstancedMeshBatch()` 就可能设置 `bPreserveInstanceOrder`，而在 `InstanceCullingContext` 里，一旦进入 `bUseIndirectDraw && bPreserveInstanceOrder`，压缩条件就会被关掉。

+ **命令状态不完全一致**  
  即便资产相同，如果 LOD、Section、材质、shader permutation、WPO、pass 状态、culling payload 不同，也拿不到同一个 `StateBucketId`，自然无法继续 compact。

+ **落在当前不支持合并 ISM draw 的路径上**  
  代码里已经明确点名 `UniformBufferView path` 是限制项之一，说明这类路径下即便资产相同，也不保证继续压缩。

+ **和普通 Static Mesh 混合**  
  这一点前面已经解释过：ISM 与普通 Static Mesh 在 VertexFactory、VertexStreams、NumInstances 等关键字段上不同，通常不会混进同一个自动合批结果。

因此，更准确的结论应该写成：

+ **相同资产的多个普通 Static Mesh**：常见是先靠 Dynamic Instancing 把多个 `NumInstances == 1` 的 cached MDC 合并；
+ **相同资产的多个 ISM**：组件内部本来就已经先做了一层实例化；之后在 GPU Scene / Instance Culling 阶段，**还有机会**对多个“状态完全一致”的 ISM draw 继续做 command compaction，但这是**条件性的再压缩**，不是无条件保证。

## 小结

如果把这条链路压缩成一句话，可以概括为：

> **UInstancedStaticMeshComponent 负责组织实例数据；FInstancedStaticMeshSceneProxy 在 static relevance 下借助 `GetMeshElement()` / `SetupInstancedMeshBatch()` 把 static mesh batch 改造成 instanced mesh batch；随后 MeshPassProcessor 再把它编译成 FMeshDrawCommand，最后由 RHI 以 instanced draw 的形式提交到 GPU，并在需要时继续进入 GPU Per-Instance Culling / Instance Culling 阶段。**

因此，ISM 更像是一个**通用默认解**：当你已经明确知道“这里有大量重复静态网格，而且这些实例可能会改动”，优先考虑 ISM 往往最稳。

# HISM

HISM 可以理解为“**带层级树的 ISM**”。它继承自 `UInstancedStaticMeshComponent`，但在 UE 5.7 中仍额外维护了 `ClusterTreePtr`、`SortedInstances`、`NumBuiltInstances`、`NumBuiltRenderInstances` 等数据，用来把实例组织成可供裁剪和 LOD 使用的层级结构。

这一点从源码也很直观：

+ `UHierarchicalInstancedStaticMeshComponent` 里有 `ClusterTreePtr` 和 `SortedInstances`；
+ `BuildTreeIfOutdated()` 会在 `PrimitiveInstanceDataManager.HasAnyChanges()`、重排表失效、包围盒变化等情况下重建树；
+ 组件还支持 `bIsAsyncBuilding`，说明这棵树本身就是一个需要维护的额外结构。

官方文档给 HISM 的定位也很清楚：**当你有成千上万个基本静止不动的实例时，HISM 往往更合适**。因为它能利用这棵静态层级树加速 culling 和 LOD 过程。

但 HISM 并不是“全面强于 ISM”：

+ 实例经常移动、增删时，层级树会反复失效并重建，维护成本更高；
+ HISM 的 LOD 更偏“按组”处理，不适合特别强调单个实例 LOD 精确表现的场景；
+ 如果项目主要使用 **Nanite**，官方文档明确建议优先用 **ISM**，因为 Nanite 自己已经有一套 culling / LOD 体系，此时 HISM 的收益会下降。

所以 HISM 更适合 **Foliage / Grass / 大量静态散布物** 这种“**数量极多，但基本不动**”的内容。

# Skeletal Mesh Instancing

Skeletal Mesh 不在这三者的讨论范围内。上面三种路径本质上都围绕 **Static Mesh** 展开，而骨骼网格还要额外处理骨骼动画、蒙皮、动画缓冲等问题，约束条件完全不同，不能简单类比。

# 总结

三种方式并不是互斥关系，而是发生在**不同层次**的优化手段：

+ **ISM / HISM**：内容层、组件层的显式实例化；
+ **Auto Instancing**：渲染层、Draw Command 层的自动合批。

因此实践里最常见的策略往往是：

+ **先用 ISM/HISM 把内容组织对**；
+ **再让渲染器继续吃 Auto Instancing / GPU Scene / Nanite 等额外收益**。

如果只给一句经验结论，那就是：

+ **默认先想 ISM**；
+ **超大规模静态散布物再考虑 HISM**；
+ **Auto Instancing 当 bonus，不当主方案**。
---
layout: post
title:  "GC & AsyncLoading DeadLock Bug"
date:   2026-07-08 20:30:00 +0800
categories: jekyll update
---

# 引言
遇到一个比较神奇的 Bug，顺手记录一下原因以及官方修复。起因是游戏的一些逻辑导致了主线程卡在了 GC 里一直出不来，看起来是一个死循环，实际上是触发了多线程死锁问题。

# 断点现场
笔者使用的版本是 UE 5.1，调用堆栈大致如下所示:

```cpp
CollectGarbageInternal(...)
    FCoreUObjectDelegates::GetPreGarbageCollectDelegate().Broadcast()
        ...
            UWorld::DestroyWorld(...)
                UWorld::FlushLevelStreaming(...)
                    // Lambda Calling
                        FlushAsyncLoading(...)
                            FAsyncLoadingThread::FlushAsyncLoading(...)
```
死循环的部分如下，**Game 线程**循环卡在了 <cfunc>IsAsyncLoadingPackages</cfunc> 的一个原子变量 <cvar>QueuedPackagedCounter</cvar> 上：
```cpp
// AsyncLoadingThread.cpp
// void FAsyncLoadingThread::FlushAsyncLoading(...)
while (IsAsyncLoadingPackages())
{
    // Do Some thing...
}
```
<cvar>QueuedPackagedCounter</cvar> 是用于记录发起的异步加载请求是否被成功消费掉。

在通常启用**异步加载线程**的条件下，只有**异步加载线程**会消费这个请求，消费的路径为：
```cpp
// AsyncLoading.cpp
FAsyncLoadingThread::Run(...)
    TickAsyncThread(...)
        // ProcessAsyncLoading(...)
        CreateAsyncPackagesFromQueue(...)
            ProcessAsyncPackageRequest(...)
                // 这里会消费掉 QueuedPackagedCounter
```

比较特殊的情况是在 <cfunc>CreateAsyncPackagesFromQueue</cfunc> 前有一个多线程的 GC 互斥锁 `FGCScopeGuard GCGuard`。需要拿到互斥锁才能执行**异步加载线程**的消费逻辑：
```cpp
// AsyncLoading.cpp
// TickAsyncThread(...)
// 尝试获取 GC 锁
FGCScopeGuard GCGuard; 
CreateAsyncPackagesFromQueue(bUseTimeLimit, bUseFullTimeLimit, TimeLimit); 

```

而在  <cfunc>CollectGarbageInternal</cfunc> 部分，**Game 线程**调用 GC 时又已经占据了 GC 锁：
```cpp
// GarbageCollection.cpp
void CollectGarbage(...)
{
    ...
    // No other thread may be performing UObject operations while we're running
    AcquireGCLock();

    // Perform actual garbage collection
    CollectGarbageInternal(KeepFlags, bPerformFullPurge);

    // Release the GC lock to allow async loading and other threads to perform UObject operations under     the FGCScopeGuard.
    ReleaseGCLock();
    ...
}
```
整理一下已有条件，**Game 线程**在 GC 时已经拿到了 **GC 的互斥锁**，而**异步加载线程**在消费加载队列时也需要拿到 **GC 的互斥锁**，于是就形成了一个死锁的情况😅。

由于 **Game 线程**在 `PreGarbageCollectDelegate` 中调用了 `FlushAsyncLoading`，需要等待**异步加载线程**消费加载队列，而**异步加载线程**需要等待 **GC 互斥锁** 释放才能消费加载队列，最后就导致 **Game 线程**卡住。

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

其死锁时序大致如下：
<div class="mermaid">
sequenceDiagram
    participant Game as Game 线程
    participant Async as 异步加载线程

    Game->>Game: AcquireGCLock()
    Note over Game: GC 锁已被 Game 线程持有
    Game->>Game: PreGarbageCollectDelegate
    Game->>Async: FlushAsyncLoading()
    Game->>Game: while(IsAsyncLoadingPackages())
    Note over Game: 等待队列清空
    Async->>Async: FGCScopeGuard / AcquireGCLock()
    Note over Async: 尝试获取 GC 锁
    Note over Async: 线程被阻塞
    Note over Game,Async: Game 等待队列消费
    Note over Game,Async: Async 等待 GC 锁释放
</div>

# 解决方案
第一时间其实心里大概有数，是客户端的一些异步加载逻辑写的不符合引擎「**祖训**」导致了 Bug。对症下药嘛，就去调整了不符合 「**祖训**」 的部分，但这种调整显然是治标不治本的，毕竟：
  
**经过 1s 翻来覆去的激烈思想斗争，我决定做出一个违背祖宗的决定**

对各位开发也是习以为常了🤣，而这个 Bug 最致命的一点正是：**正常的客户端逻辑，却可能导致引擎层面发生死锁**。

最终还是找到了上游的修复，实际官方在 GC 过程中还是考虑到了异步加载线程的情况：
```cpp
//GarbageCollection.cpp
//void CollectGarbageInternal(...)
...
ReleaseGCLock(); // 注意此处，实际是在 GC 途中有释放锁的操作
FlushAsyncLoading();
AcquireGCLock();
...
FCoreUObjectDelegates::GetPreGarbageCollectDelegate().Broadcast();
```

而官方修复也是简单粗暴，直接把重新获取锁的代码往下挪了几行，没错就是这么简单：
```cpp
//GarbageCollection.cpp
//CollectGarbageInternal(...)
ReleaseGCLock();
FlushAsyncLoading();
...
FCoreUObjectDelegates::GetPreGarbageCollectDelegate().Broadcast();
...
AcquireGCLock(); // 注意此处，获取锁的位置下移了
```

修复后的时序就顺畅很多：
<div class="mermaid">
sequenceDiagram
    participant Game as Game 线程
    participant Async as 异步加载线程

    Game->>Game: ReleaseGCLock()
    Note over Game,Async: Game 线程先释放 GC 锁
    Game->>Async: FlushAsyncLoading()
    Async->>Async: FGCScopeGuard / AcquireGCLock()
    Note over Async: 成功拿到 GC 锁
    Async->>Async: CreateAsyncPackagesFromQueue()
    Async->>Async: 消费请求队列
    Async->>Async: GCUnlock()
    Async-->>Game: FlushAsyncLoading 返回
    Game->>Game: PreGarbageCollectDelegate.Broadcast()
    Game->>Game: AcquireGCLock()
</div>

如果使用 UE 5.5 以下的版本建议还是在自己项目中尽早 merge [官方修复代码](https://github.com/EpicGames/UnrealEngine/commit/d1f5b751a95cfd70c7734638f53729276be9c6d4)🤖。不然很可能遇到这个 Bug。
# 修复 local-doc 索引内存预算判定的 flaky
> Task version: v1
> Status: completed

## Goal

`cli/src/deep/local-doc/indexer.ts` 的内存预算判定把两次 `process.memoryUsage().heapUsed` 采样之差当作"本次已用内存"，但中间一次 GC 就让差值变成负数。负值会把 `batchBytes * 4` 那项检查放松掉自己的绝对值，于是额度本该拦下的批次被放行——调用方拿到了索引，而不是 `MEMORY_LIMIT_REACHED`。

表现是 CI 上 `test/unit/deep/local-doc.test.ts` 间歇性失败，本地永远复现不了。

## Background / Confirmed Facts

2026-11-01 实测，全部可复现：

**触发事实**：PR #21 合并到 `main` 后，CI run `41314315686` 的 `test (node 20.x)` 失败。而同一份提交在分支上的 run `41313634352`（13:56）是**过的**。同一代码、不同结果。

失败信息：
```
FAIL test/unit/deep/local-doc.test.ts > local-doc indexer
     > reports an exhausted memory budget when no batch can be indexed
AssertionError: promise resolved "{ …(2) }" instead of rejecting
```

**根因定位**：`indexer.ts:264`（修复前）
```ts
const heapUsed = process.memoryUsage().heapUsed - initialHeapBytes;
if (heapUsed >= memoryBudgetBytes || heapUsed + batchBytes * 4 > memoryBudgetBytes) {
```

**假设实测**：写探针模拟同一算法，跑 30 次采样：
```
样本 30 次，heapUsed 为负: 4 次
最小偏移: -758888
```

代入测试参数（内容 300,000 字符，预算 1,048,576 字节）：
```
-758,888 + 300,000 × 4 = 441,112
441,112 > 1,048,576 ?  否
```
判定不成立 → 批次被插入 → `chunks > 0` → 不抛 `MEMORY_LIMIT_REACHED` → 测试报 resolve 而非 reject。

**同一算法的三处**：`buildIndexFromBatches:264`、`buildIndexFromScannedFiles:320`、`exceedsMemoryBudget:368`。是同一个根因的三个副本，不是三个缺陷。

**本地复现不了**：连续跑该测试 20 次，0 次失败。GC 何时落在两次采样之间不受测试控制，所以"多跑几次"不是验证手段。

**归属**：既有代码缺陷，与本会话此前所有改动无关（那些只动了 workflow、文档、错误分类）。它一直存在，只是需要一个恰好撞上的 GC 才暴露。

## Requirements

- R1 — 内存增量不得为负。两次堆采样之间的 GC 回收，应被当作"本循环净增长为零"，而不是"用了负数内存"。
- R2 — 三处副本必须一起修。只修 `buildIndexFromBatches` 会留下两个同样脆弱的位置。
- R3 — 必须有一个**确定性**的回归测试。靠多跑几次撞运气不行——那是把 flaky 从 CI 搬到测试套件里。
- R4 — 该回归测试必须在没有修复时失败。做不到这一点的测试不算守卫。

## Acceptance Criteria

- AC1 — `heapGrowthBytes` 辅助函数存在，返回 `Math.max(0, process.memoryUsage().heapUsed - initialHeapBytes)`。
- AC2 — 三处调用点全部改用该函数，`grep` 确认没有残留的裸减法。
- AC3 — 新增回归测试 mock `process.memoryUsage`，让采样低于基线 800,000 字节，断言仍抛 `MEMORY_LIMIT_REACHED`。
- AC4 — 把 `heapGrowthBytes` 的 `Math.max(0, ...)` 去掉后，新测试失败且报错为 `promise resolved instead of rejecting`（与 CI 上的症状一致）。
- AC5 — 全量测试通过，数量从 555 增至 556。

## In Scope

- `cli/src/deep/local-doc/indexer.ts` — 新增 `heapGrowthBytes`，三处调用点改用
- `cli/test/unit/deep/local-doc.test.ts` — 新增一个回归测试

## Out of Scope

- **改变预算的阈值或算法本身。** `batchBytes * 4` 这个经验系数、`getIndexMemoryBudget()` 的取值，都不在本任务内。只修"负值把检查放松了"这一件事。
- **让测试变成确定性 GC 触发。** 用 `--expose-gc` 之类的手段能造出真 GC，但会增加运行器配置负担，且仍然依赖时序。mock 采样点更小、更准、更快。
- **`main` 上那次红的 run。** 已经过去了，不需要补绿，修复合并后新的 run 会绿。

## Risks / Deferred Items

- **风险：把真正的内存压力也当成 0。** 如果循环真的在释放内存（不是 GC 抖动而是稳定负增长），钳到 0 会让检查偏松。实际不可能——这个循环只插入不删除，净增长不可能持续为负。钳到 0 是诚实的下界，不是回避。
- **延后：预算判定的整体可靠性。** 用堆采样估计内存占用本身就是个近似，`* 4` 是拍的系数。要更准得换成显式的字节记账（累加已插入内容的字节数）而不是问运行时。那是设计变更，不是修 flaky。

## Open Questions

无。根因已实测确认，修法只有一种合理选择。

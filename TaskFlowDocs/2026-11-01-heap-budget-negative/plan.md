# Plan — 修复 local-doc 索引内存预算判定的 flaky：heapUsed 采样可能为负
> Task version: v1
> Status: planning

No spec required — small, self-contained task.

## Reference Pointers

- `cli/src/deep/local-doc/indexer.ts:246-296` — `buildIndexFromBatches`，含 `:264` 的缺陷点
- `cli/src/deep/local-doc/indexer.ts:299-344` — `buildIndexFromScannedFiles`，同一算法的副本
- `cli/src/deep/local-doc/indexer.ts:361-370` — `exceedsMemoryBudget`，第三个副本
- `cli/test/unit/deep/local-doc.test.ts:184` — 间歇失败的那条测试
- `CODE_STYLE.md` — 注释用英文写"为什么"，4 空格缩进，单引号
- CI 失败的 run：`41314315686`（main 上），job `124871031614`

## Related Tasks

- `2026-11-01-npm-automated-publish`（PR #21，已合并）— 该 PR 合并触发 main 的 CI，暴露了这个既有 flaky。两者没有代码关联：那个 PR 只新增 workflow 和文档。
- 本任务在 `main` @ `457f803` 之上，从 `fix/2026-11-01-heap-budget-negative` 分支进行。

## Skills / Tools Used

- [PRD] Unaided — considered: "requirements elicitation and framing"
- [Plan] Unaided — considered: "work breakdown and task decomposition"
- [Test] Unaided — considered: "testing strategy"

三份都走了 unaided。这个任务的所有决策都由测量确定：根因是实测出来的（30 次采样 4 次为负），修法是算术上唯一合理的选择（增量不能小于零），测试手段由"本地 20 次跑不出来"这一事实倒推（必须 mock 采样点，不能靠撞运气）。没有需要方法论收敛的空间。

## Preconditions

- 分支 `fix/2026-11-01-heap-budget-negative`，基于 `main` @ `457f803`（PR #21 合并后）
- 已 `npm ci`，`tsc --noEmit` 干净
- 基线测试数：555

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-01 22:12 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 修掉三处负值判定，并留下确定性回归测试

- Goal: 内存增量不再可能为负；有一个不依赖 GC 时序的回归测试，且它没有修复时必然失败。
- Dependencies: 无
- Files:
  - `cli/src/deep/local-doc/indexer.ts`
  - `cli/test/unit/deep/local-doc.test.ts`
- Implementation checklist:
  - [x] 新增 `heapGrowthBytes(initialHeapBytes)`，返回 `Math.max(0, heapUsed - initialHeapBytes)`，注释写清为什么需要下界（含实测数据）
  - [x] `buildIndexFromBatches` 改用该函数
  - [x] `buildIndexFromScannedFiles` 改用该函数
  - [x] `exceedsMemoryBudget` 改用该函数
  - [x] 新增测试 `rejects an oversized batch even when the heap sample swings negative`，mock `process.memoryUsage` 让每次采样比基线低 800,000 字节
- Acceptance: AC1–AC5
- Verification:
  - `npx tsc --noEmit` → 0
  - `npx vitest run test/unit/deep/local-doc.test.ts` → 32 passed（原 31 + 新增 1）
  - **回退验证**：把 `Math.max(0, ...)` 去掉重跑新测试，必须失败且报 `promise resolved` — 实测确认，见 Change Log
  - `npx vitest run` → 556 passed / 41 files
- Rollback: 还原两个文件。没有数据迁移，没有接口变化。
- Status: done

## Checkpoints

### Checkpoint — Step 1 完成

- [x] `tsc --noEmit` 干净
- [x] 全量测试 556/41 全绿
- [x] 回退修复后新测试确实失败（证明它守得住）
- [x] 三处调用点全部替换，无残留裸减法

## Verification / Review

- 2026-11-01 Step 1: tsc --noEmit 0；local-doc 32 passed；全量 556/41；回退验证新测试失败且报错与 CI 41314315686 逐字一致

- 全量：`npx vitest run` → 556 passed / 41 files（基线 555 + 新增 1）
- 类型：`npx tsc --noEmit` → 0
- 关键的一条不是"测试通过"，而是"**没修复时测试失败**"。本机连跑 20 次原测试都没能复现 flaky，所以通过率不构成证据；只有把负样本钉死，测试才有意义。

## Change Log

- 2026-11-01 — 根因实测确认。探针模拟 `indexer.ts` 的采样算法跑 30 次，4 次 `heapUsed` 为负，最小 -758,888 字节。代入测试参数验证判定失效。
- 2026-11-01 — 原测试本地连跑 20 次，0 次失败。确认"多跑几次"不是可行的验证手段，回归测试必须 mock 采样点。
- 2026-11-01 — 三处调用点改为 `heapGrowthBytes`。`grep -c "process.memoryUsage().heapUsed - initialHeapBytes"` 应为 1（只剩函数体内那一处）。
- 2026-11-01 — 回退验证：去掉 `Math.max(0, ...)` 后新测试失败，报错 `promise resolved "{ …(2) }" instead of rejecting`，与 CI run `41314315686` 上的症状逐字一致。修复已恢复。

## Follow-ups

- `* 4` 这个经验系数和堆采样估计内存的整体做法仍是近似。要更准得改成显式字节记账。本任务明确不做，见 PRD 的 Deferred Items。
- `main` 上那次红的 run（`41314315686`）不需要补绿；修复合并后新的 run 会绿。

## Version History

- v1 — planning.

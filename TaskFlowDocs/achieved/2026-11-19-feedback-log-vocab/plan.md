# Plan — 让反馈日志的词表与代码实际分类对齐
> Task version: v1
> Status: completed

No spec required — small, self-contained task; the PRD records the confirmed facts and scope.

## Reference Pointers

- `cli/src/feedback-log.ts` — 日志模块本体：事件、状态、provider、错误码四个白名单与写队列。
- `cli/src/errors.ts:22-65` — `SearchErrorCode`、`SearchProvider` 及其三个 `Record<SearchProvider, …>` 表。
- `cli/src/deep/session-lock.ts:5-9` — `SessionStateError` 的四个码。
- `cli/src/runCli.ts:541-603` — validation 阶段的五处失败记录。
- `cli/src/deep/extractor.ts:422-520` — 抽取三层 + 外部回退链。
- `cli/test/feedback-log.test.ts` — 既有日志测试：隐私、轮转、端到端。
- `TaskFlowDocs/achieved/2026-11-18-feedback-logging/` — 该模块的 PRD/spec，是本轮必须保持的契约来源。

## Related Tasks

- `TF-20261118-9bd13b`（已完成）— 反馈日志模块的原始设计。本轮不改它的契约（默认关闭、数据最小化、异步尽力、不损坏业务数据）。
- `TF-20261116-f8776d` — provider 请求 limit 的记录，不在本轮范围。

## Skills / Tools Used

- [PRD] Unaided — defect investigation; considered: defect investigation
- [Plan] Unaided — incremental implementation; considered: incremental implementation
- [Test] Unaided — testing strategy; considered: testing strategy

## Preconditions

- `cli/node_modules` 已安装（`npm ci`），否则 `tsc`/`vitest` 无法运行。
- 基线：`npx tsc --noEmit` 为 0，`npx vitest run` 全绿。

## Plan Review

- Verdict: sound
- Coverage: PRD 的 A1–A7 逐条落在下面四个步骤的 Acceptance 上。
- Verifiability: 每个验收都是可执行的断言；A4 用反向验证（删条目 → tsc 必须失败）。
- Layer ownership: 词表落在类型与日志两处，接线落在 `runCli.ts` 与 `extractor.ts`，测试落在 `cli/test/`。没有把运行时关注点塞进类型文件。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-19 21:48 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 把词表的运行时真源落到 `as const` 数组

- Goal: `SearchProvider`、`SearchErrorCode`、session 四码各有唯一的运行时清单，类型从清单派生。日志白名单直接复用清单，不再手抄。
- Dependencies: 无。
- Files: `cli/src/errors.ts`、`cli/src/deep/session-lock.ts`、`cli/src/feedback-log.ts`。
- Implementation checklist:
  - [x] `errors.ts`：把 `SearchErrorCode` 改成 `SEARCH_ERROR_CODES as const` + `export type SearchErrorCode = typeof SEARCH_ERROR_CODES[number]`；`SearchProvider` 同理。三个 `Record<SearchProvider, …>` 保持不变（它们是穷尽性检查的抓手）。
  - [x] `session-lock.ts`：导出 `SESSION_ERROR_CODES as const`，`SessionStateError.code` 从它派生。
  - [x] `feedback-log.ts`：`providers` 改为由 `SearchProvider` 运行时清单派生；`errors` 改为把 SEARCH_ERROR_CODES 白名单项、SESSION 四码、四个 validation 信封码、既有的 `'unknown'` 合并。删掉手写清单。
  - [x] 确认 `'validation'` 这个值只在白名单里被移除，不影响 `validation` 事件名。
- Acceptance: A1、A4。
- Verification: `npx tsc --noEmit` = 0；反向验证——临时删 `errors.ts` 的 `LABEL` 里一个 provider 条目，`tsc` 必须报错；恢复后为 0。
- Rollback: `git revert` 本步骤提交。
- Status: done

### Step 2 — validation 失败记录真实信封码

- Goal: `runCli.ts` 四处 `error: 'validation'` 改为该处实际返回的信封码。
- Dependencies: Step 1（白名单必须能容纳这些码）。
- Files: `cli/src/runCli.ts`、`cli/src/feedback-log.ts`。
- Implementation checklist:
  - [x] 543 → `INVALID_LIMIT`；550 → `MISSING_QUERY`；561 与 569 → `INVALID_ENGINES`。
  - [x] 589 原记 `CONFIG_MISSING`，但该处实际返回的信封码是 `PROVIDER_NOT_CONFIGURED`，一并订正。
  - [x] 确认这四个码都在 Step 1 的白名单里。
- Acceptance: A2。
- Verification: 新增测试断言 `-l -1` 与空查询各自写出可区分的 `error` 字段。
- Rollback: `git revert` 本步骤提交。
- Status: done

### Step 3 — 外部抽取回退链逐次记录 `extract_method`

- Goal: 回退链上每次真实 provider 尝试记录 `start` 与终态，带 provider 与 durationMs；未发生的尝试不记。
- Dependencies: Step 1。
- Files: `cli/src/deep/extractor.ts`。
- Implementation checklist:
  - [x] 在 `for (const provider of ['exa', …])` 循环内、每个真实调用点前后加 `feedbackLog('extract_method', 'start' | 'ok' | 'error', { provider, durationMs })`。
  - [x] 覆盖四个真实分支：已安装 tavily CLI、已安装 firecrawl CLI、`externalExtract` 成功、`externalExtract` 返回失败字符串。
  - [x] `supportsType` 跳过与无 key 跳过不记（未发生尝试）。
  - [x] 循环末尾的 jina 分支已经记了 start，补上终态或确认它在循环外已覆盖。
- Acceptance: A3。
- Verification: 新增测试 mock 一个失败的 provider，断言日志出现该 provider 的 `error` 记录且带 `durationMs`。
- Rollback: `git revert` 本步骤提交。
- Status: done

### Step 4 — 测试、文档与验证记录

- Goal: 补齐 A1–A7 的测试覆盖，确认既有隐私与轮转测试不退化，记录验证结果。
- Dependencies: Step 1–3。
- Files: `cli/test/feedback-log.test.ts`（或新增同目录测试）、`TaskFlowDocs/2026-11-19-feedback-log-vocab/plan.md`。
- Implementation checklist:
  - [x] 新增 `feedbackError()` 对四个 session 码的分类测试（A1）。
  - [x] 新增 validation 码可区分测试（A2）。
  - [x] 新增回退链记录测试（A3）。
  - [x] 反向验证 A4 并记录输出。
  - [x] 跑全量：`npx tsc --noEmit`、`npx vitest run`。
  - [x] 在本文件 Verification / Review 填写实测数字。
- Acceptance: A5、A6、A7。
- Verification: 全量测试输出。
- Rollback: `git revert` 本步骤提交。
- Status: done

## Checkpoints

- Step 1 与 Step 2 可合并提交（同属词表对齐），Step 3 单独提交（行为变化更大）。
- 每个提交前跑 `npx tsc --noEmit`。

## Verification / Review

### 静态检查

```
npx tsc --noEmit → 0
```

`tsc` 在 Step 1 完成后立刻报出 Step 2 的四条错误：

```
src/runCli.ts(543,46): error TS2322: Type '"validation"' is not assignable to type
'"CONFIG_MISSING" | "AUTH_FAILED" | … | undefined'.
（550、561、569 同形）
```

这正是要求的因果：白名单窄化后，旧的字面量不再合法。改完为 0。

### 全量测试

```
npx vitest run --testTimeout=30000 → 79 文件 / 892 通过 / 1 跳过（基线 881 → 893，本次 +12）
```

连跑三次结果一致。

### 反向验证（每项都把实现改坏，确认对应断言确实会红）

1. **词表回退**：把 `errors` 缩回 `[...SEARCH_ERROR_CODES, 'SESSION_BUSY', 'unknown']`：

```
× classifies SESSION_CORRUPTED as itself, not as unknown
× classifies SESSION_STORAGE_ERROR as itself, not as unknown
× classifies SESSION_MIGRATION_FAILED as itself, not as unknown
× records the envelope code instead of a single validation string
Tests  4 failed | 5 passed (9)
```

2. **回退链终态**：把 `externalExtract` 后的终态记录删掉（保留 `start`）：

```
× records a failed provider and keeps the failure facts bounded
× records a provider that succeeded
Tests  2 failed | 1 passed (3)
```

3. **validation 码**：把 `INVALID_LIMIT` 改回 `CONFIG_MISSING`：

```
× records the envelope code instead of a single validation string
Tests  1 failed | 8 passed (9)
```

4. **派生穷尽性**（A4）：删掉 `errors.ts` 中 `LABEL` 的 `jina` 条目：

```
src/errors.ts(77,7): error TS2741: Property 'jina' is missing in type
'{ searxng: string; deepseek: string; ollama: string; exa: string; tavily: string; firecrawl: string; }'
but required in type 'Record<"searxng" | "deepseek" | "ollama" | "exa" | "tavily" | "firecrawl" | "jina", string>'.
```

恢复后为 0。这条证明的是「新增/删除 provider 会被类型系统拦下」；它拦不住「忘了往日志白名单加一项」，那条仍靠显式编辑（PRD Risks 已记）。

### 两次自测不稳的修正

自测本身先后两次在并行负载下偶发失败，都是同一个模式——等待条件太宽：

- `feedback-log-vocab.test.ts` 只等 `INVALID_LIMIT` 落盘就读文件，`MISSING_QUERY` 可能还没写。改为同时等到两个码。
- `extract-fallback-log.test.ts` 的 `waitForCount` 只数 `extract_method` 总数，而前置的 defuddle 记录就已满足 2 条。改为按 provider 过滤。

修正后各自连跑 3 次与 5 次，全绿。

### 已知既有 flake（非本轮引入）

`test/feedback-log.test.ts > search and extraction record phases without storing inputs` 在 5s 默认超时下偶发超时。在**未修改的基线 `a24be45`**（main 上本轮开始前的提交）上同样复现：

```
cd /mnt/f/WorkSpace/Node/digdig/cli && npx vitest run test/feedback-log.test.ts
→ Tests  1 failed | 3 passed (4)
```

放宽到 30s 后 4/4 通过。是本机时序问题，与本轮改动无关，未在其中修。

## Change Log

- Step 1 + Step 2 合并为一个提交 `d56b97e`：`errors.ts`、`session-lock.ts`、`feedback-log.ts`、`runCli.ts`。
- Step 3 单独一个提交 `a843254`：`extractor.ts` 与两个新测试文件。
- 首批提交时 `extractor.ts` 误入第一个提交，用软重置拆正；未使用 `git reset --hard`。

## Follow-ups

- 给 `createErrorEnvelope` 的信封码建类型（PRD 已列为 Out of Scope）。

## Version History

- v1 — planning.

# Plan — 收敛融合排序的分数与位次
> Task version: v1
> Status: completed

No spec required — three changes in one function and its two call sites.

## Reference Pointers

- `cli/src/deep/fuse.ts` — 排序产物的唯一归属地。
- `cli/src/service.ts:243` — 被删除的重复过滤。
- `cli/src/runCli.ts:793` — 被删除的 `rank` 覆盖。
- `TaskFlowDocs/achieved/2026-10-28-result-identity-pipeline/spec.md:109,134` — 这两处改动的历史依据。

## Related Tasks

- `TF-20261028-fe548a`（已完成）— 引入了融合前置去重，并把 provider 端去重列为 Out of Scope；同 spec 3.5 节计划收口 `rank` 但未落地。
- `TF-20261102-*` result-explainability — 定下「`fusionScore` 保留」。

## Skills / Tools Used

- [PRD] Unaided — root cause; considered: root cause
- [Plan] Unaided — work breakdown; considered: work breakdown
- [Test] Unaided — testing strategy; considered: testing strategy

## Preconditions

- `cli/node_modules` 已安装。
- 基线：`npx tsc --noEmit` 为 0，全量测试 901 通过。

## Plan Review

- Verdict: sound
- Coverage: A1–A7 落在四个 Step 的 Acceptance 上。
- Verifiability: A2–A4 直接读 `fuseResults` 的返回；A5 用四条含噪声的输入看输出条数。
- Layer ownership: 三处改动都在排序流水线内，不触 `rrf.ts`，不触输出格式层。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-21 12:57 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — `rank` 收口到 `fuse.ts`

- Goal: 一个字段只有一个赋值点。
- Dependencies: 无。
- Files: `cli/src/deep/fuse.ts`、`cli/src/runCli.ts`、`cli/src/service.ts`。
- Implementation checklist:
  - [x] `fuse.ts` 的 `projected.push` 里按 `projected.length + 1` 赋 `rank`。
  - [x] 删除 `service.ts` 的 `rank: index + 1`（随过滤一并删除）。
  - [x] 删除 `runCli.ts:793` 的 `rank: index + 1` 覆盖。
- Acceptance: A4、A7。
- Verification: 单测断言 `rank` 在截断后仍是 1..N。
- Rollback: `git revert`。
- Status: done

### Step 2 — 删除 `service.ts` 的重复过滤去重

- Goal: 过滤去重只由 `fuse.ts` 承担。
- Dependencies: Step 1（`rank` 的下标来源正是这次过滤）。
- Files: `cli/src/service.ts`。
- Implementation checklist:
  - [x] 删除 `filterEmptyResults` 与 `dedupe` 调用，直接 `results.slice`。
  - [x] 删除因此变成死导入的 `import { dedupe, filterEmptyResults }`。
  - [x] 保留 provider 侧 `--limit`（那是 API 上限，不是显示策略）。
- Acceptance: A5、A7。
- Verification: 4 条含空标题/空正文/尾斜杠重复的输入，经 `fuseResults` 后只剩 1 条。
- Rollback: `git revert`。
- Status: done

### Step 3 — `fusionScore` 的缺席条件

- Goal: 没有融合时不写一个只是位置变换的数。
- Dependencies: 无。
- Files: `cli/src/deep/fuse.ts`。
- Implementation checklist:
  - [x] `rankings.length > 1` 时才带 `fusionScore`。
  - [x] 单 ranking 时不写该键（不是写 `undefined`、不是写 0）。
- Acceptance: A2、A3。
- Verification: 探针实测单 ranking 得 `undefined`、双 ranking 得数字，`rank` 均连续。
- Rollback: `git revert`。
- Status: done

### Step 4 — 文档

- Goal: Agent 读到这三个字段时知道各自何时可信。
- Dependencies: Step 3。
- Files: `skills/digdig/SKILL.md`、`README.md`、`README.zh-CN.md`。
- Implementation checklist:
  - [x] `SKILL.md` 新增「Reading the scores」：`score` 不可跨引擎比较、`fusionScore` 缺席不等于 0、`rank` 是唯一恒在的顺序信号。
  - [x] 两份 README 各补一句，口径一致。
- Acceptance: A6。
- Verification: 人工比对三处措辞不冲突。
- Rollback: `git revert`。
- Status: done

## Checkpoints

- Step 1 与 Step 2 必须按序：`rank` 的下标依赖那次过滤，先删过滤会让 Step 1 基于一个即将消失的下标。
- 每个提交前跑 `npx tsc --noEmit`。

## Verification / Review

### 静态检查与全量测试

```
npx tsc --noEmit                   → 0
npx vitest run --testTimeout=60000 → 80 文件 / 905 通过 / 1 跳过（基线 901，+4）
```

### 实测 `fuseResults` 的返回

```
单 ranking: fusionScore = undefined   | ranks = 1,2
双 ranking: fusionScore = number(0.016393, 0.016393, 0.016129, 0.016129) | ranks = 1,2,3,4
```

双 ranking 的两组同分说明每条结果各在两个查询里占同一位置，融合逻辑未变。

### 过滤仍由 fuse 独家承担

```
输入 4 条（含空标题、空正文、尾斜杠重复 URL）
→ fuse 输出 1 条：https://x.test/1
```

与删除前一致。`service.ts` 那次确实是重复。

### 反向验证

把 `const fusedScore = rankings.length > 1;` 改成 `= true`：

```
× omits fusionScore when a single ranking means nothing was fused
Tests  1 failed | 17 passed (18)
```

## Change Log

- `a6c53d5` `fix(cli)` —— 三处源码改动。
- `fcf267e` `test(cli)` —— 4 条用例。
- `01dfdc9` `docs` —— SKILL.md 与两份 README。

## Follow-ups

- `numberOfResults` 是死字段（只有写、没有读），清理它是独立任务。
- `graph.ts:172` 的 `rank` fallback 保留，它只服务非流水线构图路径。

## Version History

- v1 — planning.

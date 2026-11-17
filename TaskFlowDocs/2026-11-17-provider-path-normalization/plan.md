# Plan — provider 结果的空项过滤与内容去重收拢到融合入口
> Task version: v1
> Status: in_progress

No spec required — 单文件改动 + 一处实现迁移，无新接口、无新抽象。

## Reference Pointers

- `TaskFlowDocs/2026-11-17-provider-path-normalization/prd.md` — 需求与验收标准
- `cli/src/deep/fuse.ts:53-65` — `toRanking`，当前只做 URL 级去重
- `cli/src/deep/fuse.ts:77-121` — `fuseResults` 主体，落点
- `cli/src/service.ts:86-88` — `filterEmptyResults` 现有实现（SearXNG 路径）
- `cli/src/service.ts:241-249` — 现有调用顺序：先过滤，再 `dedupe`，最后截断
- `cli/src/deep/dedupe.ts:127-130` — `dedupe(items, threshold = 0.92)`
- `cli/src/runCli.ts:352,356` — 两个 provider 的唯一调用点
- `cli/test/unit/deep/fuse.test.ts` — 融合层单测，本次主要断言位置

## Related Tasks

| 方向 | 任务 | 关系 |
|---|---|---|
| 独立 | `TF-20261116-f8776d`（`--limit` 三层静默截断） | 同一批 review 发现，但改的是 provider 上限数值，与本任务的卫生处理无交集。本任务不碰 `ollama-service.ts:32` / `deepseek-service.ts:43`。 |
| 独立 | `TF-20261116-e1c513`（阈值散落） | 本任务复用 `dedupe` 的 0.92 默认值，不把它提到中心模块。阈值集中化在那边做。 |
| 前序 | `TaskFlowDocs/achieved/2026-10-28-result-identity-pipeline/` | 它把身份函数收拢到 `resultUrlKey` 并建了 `fuse.ts`，其 Follow-ups 记下了「providers 自身不过滤」但没进 todo。本任务补上这一条。 |

## Skills / Tools Used

- [PRD] Unaided — 需求由用户确定的缺陷条目，事实由 v0.0.10 发布产物实测复现；considered: defect investigation, requirements framing
- [Spec] No spec required — 单文件、无新接口
- [Plan] Unaided — 三个 Step，依赖线性；considered: work breakdown and task decomposition
- [Test] Unaided — 沿用仓库既有 vitest 单测结构，在 `fuse.test.ts` 内扩充；considered: testing strategy

## Preconditions

- 工作树 `.worktrees/2026-11-17-provider-path-normalization`，分支 `fix/2026-11-17-provider-path-normalization`
- 基线 `5c6fd8f`（= `origin/main` 0a4a0bd v0.0.10 + 一条 todo 补录提交）
- `cli/node_modules` 已符号链接到主 checkout
- 基线：`npm test` 全绿
- 用户已决定落点（`fuse.ts`）与空项规则（标题与正文都非空）

## Plan Review

- Verdict: sound
- Coverage: AC1/AC2/AC3 由融合层单测直接断言；AC4 由既有 `dedupe-results.test.ts` 与 `service` 测试保持；AC5 由既有 fuse 截断用例覆盖。
- Verifiability: 每条验收都对应一个可运行的 `expect`，不依赖真实 API key。
- Layer ownership: 卫生处理放在决定「哪些结果进入显示」的那一层（`fuse.ts`），不修改 provider 的返回映射，也不在 CLI 输出层补丁。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-17 23:09 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 把空项过滤提到共享位置

- Goal: `fuse.ts` 能复用 `filterEmptyResults`，而 `service.ts` 的现有调用不变。
- Dependencies: 无
- Files: `cli/src/service.ts`、`cli/src/deep/dedupe.ts`
- Implementation checklist:
  - [x] 把 `filterEmptyResults` 的实现移到 `cli/src/deep/dedupe.ts` 并导出；签名保持 `(results: T[]) => T[]`，约束为 `title`/`content` 为字符串。
  - [x] `cli/src/service.ts` 改为从 `dedupe.js` 导入，删掉本地实现；行为与调用点不变。
- Acceptance: 既有测试全绿（这一步不改变任何运行时行为）。
- Verification: `cd cli && npx vitest run test/unit/dedupe-results.test.ts test/unit/deep/dedupe.test.ts` → 25 passed；`npm test` → 797 passed。`npx tsc --noEmit` 与基线逐行 diff 为空（基线自带 14 个 `node:sqlite` 类型错误，非本次引入）。
- Rollback: 单文件级 revert
- Status: done

### Step 2 — 在 fuseResults 的入口做卫生处理

- Goal: 每份 response 的结果在进入排序前先过滤空项、再做内容去重。
- Dependencies: Step 1
- Files: `cli/src/deep/fuse.ts`
- Implementation checklist:
  - [x] 新增模块内函数 `sanitize(results)`：先 `filterEmptyResults`，再 `dedupe`，顺序固定并加注释说明为何不能反。
  - [x] 只对 `responses` 各份做 `sanitize`。`--merge` 在 PRD 的 Out of Scope 内（用户自己的导出文件，语义不同）；`sessionSnapshot` 的类型是 `{url, source}`，没有 `title`/`content` 可供判断，无从过滤。
  - [x] `originsByKey` / `currentKeys` 的构建循环同样只遍历 sanitize 后的结果，避免被丢弃的条目留下 origin。
- Acceptance: AC1/AC2/AC3 成立。
- Verification: `cd cli && npx vitest run test/unit/deep/fuse.test.ts` → 10 passed；`npm test` → 1 failed（`cli.test.ts:535` 的夹具缺 `content` 字段，`filterEmptyResults` 读 `content.trim()` 抛错）。已补该字段（类型上 `content` 本就是必填），复跑 797 passed。
- Rollback: 单文件级 revert
- Status: done

### Step 3 — 补测试并跑完整回归

- Goal: 三条验收各有断言，完整套件全绿。
- Dependencies: Step 2
- Files: `cli/test/unit/deep/fuse.test.ts`
- Implementation checklist:
  - [x] 空标题/空正文条目不出现在 `display`，也不出现在 `fused`。
  - [x] 正文逐字相同、URL 不同的两条只保留一条。
  - [x] 多条正文全空的结果全部被丢弃（不是塌缩成一条）——钉住「先过滤再去重」的顺序。
  - [x] `--limit` 截断与 `totalResults` 语义不受影响（既有 `truncates the display but leaves the fused ranking whole` 用例仍通过）。
  - [x] 运行完整测试与类型检查。
- Acceptance: AC1–AC5 全部通过。
- Verification: `npm test` → 801 passed（797 基线 + 4 新增）。反向验证：把 `sanitize` 临时改为 `return results` 后，4 条新用例全部失败，恢复后全绿。端到端：桩 provider 返回 4 条（1 条空标题、2 条正文逐字相同、1 条正常），`fuseResults` 后剩 2 条。
- Rollback: 分支内单独提交
- Status: done

## Checkpoints

- Step 1 后：无行为变化，既有测试全绿（这一步是纯搬迁，失败即说明改动越界）。
- Step 2 后：`fuse.test.ts` 既有用例可能因输入被过滤而失败——逐条确认是新断言需要调整，而不是掩盖真实回归。

## Verification / Review

- 2026-11-17 Step 3: npm test 801 passed; 4 new tests fail without the fix

- 2026-11-17 Step 2: fuse.test 10 passed; npm test 797 passed after fixture fix

- 2026-11-17 Step 1: npm test 797 passed; tsc delta empty

- 定向：`npx vitest run test/unit/deep/fuse.test.ts test/unit/dedupe-results.test.ts`
- 全量：`npm test`
- 类型：`npx tsc --noEmit`
- CI：推送后由 `test (node 20.x)` / `test (node 22.x)` 覆盖

## Change Log

- 2026-11-17 — Step 2 范围修正：原计划写「三处 `toRanking` 的输入都过 `sanitize`」，实施时对照 PRD 的 Out of Scope 收窄为只处理 `responses`。`--merge` 在 PRD Out of Scope 内；`sessionSnapshot` 类型无 `title`/`content`，技术上不可过滤。这是 work revision，未改变任务承诺。

## Follow-ups

- `service.ts` 的过滤现在与 `fuse.ts` 重复（SearXNG 结果会被过滤两次）。第二次是幂等的，无害；是否删掉 `service.ts` 那一份留待观察，删它会让 `SearXNGService.search()` 的直接调用者拿到未过滤结果。
- provider 侧 `--limit` 上限截断（`TF-20261116-f8776d`）。

## Version History

- v1 — 2026-11-17 — 初版，待批准。

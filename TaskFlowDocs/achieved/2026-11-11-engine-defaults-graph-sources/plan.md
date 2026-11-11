# Plan — 搜索引擎配置与图来源计数
> Task version: v1
> Status: completed

## Spec Pointers

- `spec.md`

## Reference Pointers

`TaskFlowDocs/repository-docs/index.md`、`CONTRIBUTING.md`、`CODE_STYLE.md`、`.github/pull_request_template.md`；现有 provider 路由、图遍历和 CLI 测试。

## Related Tasks

P11 `TF-20261103-0c810d` 为主项；D11 `TF-20261103-761aa5` 只处理来源计数，其他子项保留。P2/P5 为独立 PR #62。

## Skills / Tools Used

- [PRD] Unaided — 复核 CLI 配置和图遍历；considered: defect investigation。
- [Spec] Unaided — 使用现有路由和来源输出契约；considered: architecture and design。
- [Plan] Unaided — 按独立行为拆分；considered: work breakdown。
- [Test] Unaided — 实际调用及失败边界；considered: testing strategy。

## Preconditions

用户已确认两项口径及暂缓废弃命令采样；实施计划待批准。

## Plan Review

- Verdict: sound
- Coverage: Step 1 覆盖图来源唯一数和输出一致；Step 2 覆盖引擎优先级、允许列表及 provider；Step 3 覆盖文档、回归和交付。
- Verifiability: 图测试覆盖边和属性来源重叠，路由测试断言实际调用及无副作用；完整 CI 与现有测试验证回归。
- Layer ownership: 新断言验证公开输出和实际调用，不改已有预期；图遍历和命令路由分别负责各自事实。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-11 18:11 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — 图路径来源计数

- Goal: 数量与去重 ID 列表一致。
- Dependencies: 用户批准。
- Files: `cli/src/deep/graph-explore.ts` 和相关测试。
- Implementation checklist:
  - [x] 红测复现重复边、来源属性和仅属性来源。
  - [x] 从结果 ID 集合计算来源数，验证输出。
- Acceptance: resultCount 与 resultIds 长度一致。
- Verification: 图遍历测试及实际命令输出。
- Rollback: 修改限于任务分支。
- Status: done

### Step 2 — 默认引擎和允许列表

- Goal: 生效优先级及检验与用户决定一致。
- Dependencies: 用户批准。
- Files: `cli/src/runCli.ts`、provider 路由测试。
- Implementation checklist:
  - [x] 红测验证默认、允许列表、显式、无配置和拒绝行为。
  - [x] 在副作用前计算有效引擎并复用路由和允许列表检查。
- Acceptance: 路由到预期引擎，非法配置无请求或会话写入。
- Verification: CLI 测试及 provider 桩。
- Rollback: 修改限于任务分支。
- Status: done

### Step 3 — 回归和交付

- Goal: 完整验证并提交待审阅 PR。
- Dependencies: Steps 1–2。
- Files: README、CHANGELOG、Todo、测试及 PR。
- Implementation checklist:
  - [x] 更新用户文档和 D11 子项，保留其他未完成项。
  - [x] 运行定向、完整测试、类型检查、构建并核验 CI。
- Acceptance: 已确认行为及项目检查通过。
- Verification: 本地测试和 GitHub CI。
- Rollback: 工作树保留至合并。
- Status: done

## Checkpoints

计划批准后先构造失败回归。query-graph 的废弃原因仅能从 2026-06-08 的重构推测；四种采样能力没有验证到等价替代。

## Verification / Review

- 2026-11-11：确认 `cli/src/runCli.ts` 未使用 defaultEngine、仅校验显式 engines；`cli/src/deep/graph-explore.ts` 分别按边计数和按 ID 去重。
- 2026-11-11：查 Git 提交 `036e30f`，重构时标记 query-graph 废弃，但未找到明确的废弃理由。
- 2026-11-11：先以测试复现图来源重复计数和引擎默认值/允许列表未生效；修复后定向测试 74 项通过，包括真实会话图路径和缺密钥不创建会话。
- 2026-11-11：复核发现显式 `--engines ,,` 可绕过非空允许列表，新增失败回归后拒绝空引擎列表；已记录为已批准允许列表约束内的边界修复。
- 2026-11-11：首次完整测试 `vitest run --maxWorkers=2` 为 69 文件、782 项通过；补充空列表校验后重新运行全量测试。`tsc --noEmit` 和 `tsc` 通过。
- 2026-11-11：补充空列表后的完整回归为 69 文件、783 项通过，`tsc --noEmit` 和 `tsc` 通过。
- 2026-11-11：合入已合并 PR #62 的 main 时，仅 CHANGELOG 条目冲突；保留双方条目并检查自动合并后的 CLI 参数和引擎代码。
- 2026-11-11：合并后全量 `vitest run --maxWorkers=2` 70 文件、797 项通过，`tsc --noEmit` 通过。
- 2026-11-11：PR #63 最终提交四项 CI 全通过并以合并提交 `8ebc829` 合入。

## Change Log

## Follow-ups

D11 的 mixed 采样暂缓；图其他子项保留。

## Version History

- v1 — planning.

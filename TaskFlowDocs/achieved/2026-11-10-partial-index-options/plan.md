# D5 计划

> Task version: v1
> Status: completed

## Spec Pointers

`prd.md`、`spec.md`。

## Reference Pointers

`cli/src/deep/local-doc/indexer.ts`、`cli/test/unit/deep/local-doc.test.ts`、`CONTRIBUTING.md`、`CODE_STYLE.md`、`.github/pull_request_template.md`。

## Related Tasks

无。

## Skills / Tools Used

- [PRD] Unaided — 初版在未调查前直接撰写；considered: root cause investigation
- [Spec] Unaided — 初版未调用专门能力；considered: architecture and design
- [Plan] Unaided — 初版未调用专门能力；considered: work breakdown
- [Test] Unaided — 未调用专门测试能力；considered: testing strategy
- 调查阶段补读 `agent-skills:debugging-and-error-recovery`，复现并定位根因，随后补充本记录；Codex 不自动记录能力调用。

## Preconditions

用户要求三个独立项目内 worktree，分别修复并创建 PR。最初计划与阶段记录不完整，实际实施早于完整计划审核，属于流程偏差。

## Plan Review

- Verdict: sound
- Coverage: Step 1 覆盖实现及回归测试；Step 2 覆盖类型、全量测试、审查与交付准备。
- Verifiability: 定向测试检查实际行为，类型检查覆盖类型，全量测试与基线比较。
- Layer ownership: 在 `cli/src/deep/local-doc/indexer.ts` 修复生产行为；新增回归测试未调整既有期望。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-10 10:38 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — 复现、修复与回归

- Goal: 重建使用来源中记录的扩展名和当前内存预算；没有来源元数据时继续使用默认扩展名。
- Dependencies: 无。
- Files: `cli/src/deep/local-doc/indexer.ts`、`cli/test/unit/deep/local-doc.test.ts`。
- Implementation checklist:
  - [x] 复现并定位。
  - [x] 修复并运行定向测试。
- Acceptance: 先红后绿，验证 JSON 元数据、文件清单和实际检索结果。
- Verification: `vitest run test/unit/deep/local-doc.test.ts`：33 项通过。
- Rollback: 独立 worktree，可按需回退任务差异。
- Status: done

### Step 2 — 验证与交付准备

- Goal: 检查类型、全量测试和 PR 模板。
- Dependencies: Step 1。
- Files: 任务文档及 PR 描述。
- Implementation checklist:
  - [x] 类型检查及全量测试。
  - [x] 比较全量测试失败与基线。
  - [x] 完成 TaskFlow 阶段审核和交付准备。
- Acceptance: 记录验证结果及例外。
- Verification: `tsc --noEmit` 通过；`vitest run` 625 通过、4 失败；基线对应测试也出现相同 4 项失败。
- Rollback: 保留独立 worktree 和当前差异。
- Status: done

## Checkpoints

提交 PR 前核查模板中的背景、改动、验证、兼容性及范围。

## Verification / Review

- 2026-11-10 Step 2: 定向测试及类型检查通过；原有全量测试问题已由 PR 45 修复

先红后绿，验证 JSON 元数据、文件清单和实际检索结果。 33 项通过 类型检查通过。全量测试中 config-timeout 3 项、provider-routing 1 项失败，未修改的 main 上同样失败。

## Change Log

- 初始文档未经充分调查即生成；实际实现后补充根因、边界和验证。

## Follow-ups

按 TaskFlow 流程处理阶段审核；PR 等待用户审阅。

## Version History

- v1 — 当前工作记录。

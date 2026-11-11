# Plan — 搜索数量参数修复
> Task version: v1
> Status: in_progress

## Spec Pointers

- `spec.md`

## Reference Pointers

`TaskFlowDocs/repository-docs/index.md`、`CONTRIBUTING.md`、`CODE_STYLE.md`、`.github/pull_request_template.md`；CLI 入口及 `cli/test/integration/cli-format.test.ts`。

## Related Tasks

主项 P2 `TF-20261103-d06a7c`；关联 P5 `TF-20261103-bb3296`，两项修复共享数量参数入口，保留各自 Todo 并在验证完成后分别记录状态。D11 和 P11 是独立范围。

## Skills / Tools Used

- [PRD] Unaided — Commander 复现和代码追踪；considered: defect investigation。
- [Spec] Unaided — 依据现有 CLI 协议；considered: architecture and design。
- [Plan] Declared `agent-skills:planning-and-task-breakdown` — 在 TaskFlow 目录中拆分。
- [Test] Unaided — 通过真实 CLI 和服务桩验证；considered: testing strategy。

## Preconditions

用户已要求修复 P2/P5；实施计划待用户批准。P5 归属已说明，两个待办保留独立。

## Plan Review

- Verdict: sound
- Coverage: Step 1 覆盖实际图查询的数量与 CLI 短长选项；Step 2 覆盖非法输入和无副作用；Step 3 覆盖完整回归与交付。
- Verifiability: 对实际返回条数及真实命令输出断言；mock 后端调用及会话状态证明非法输入无副作用，完整回归与 CI 提供平台验证。
- Layer ownership: 测试只新增真实命令的约束，不修改既有断言或序列化中间值；解析与路由层负责各自行为。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-11 17:58 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — 参数归属

- Goal: graph-search 按用户指定数量返回结果。
- Dependencies: 用户批准。
- Files: `cli/src/runCli.ts`、CLI 集成测试。
- Implementation checklist:
  - [x] 真实 CLI 测试先复现根与子命令重复参数问题。
  - [x] 修正选项取值并验证默认值与短长参数。
- Acceptance: 实际结果数量符合输入。
- Verification: 图查询 CLI 集成测试。
- Rollback: 分支内单独提交。
- Status: done

### Step 2 — 数量参数校验

- Goal: 非法数量在副作用前被拒绝。
- Dependencies: Step 1。
- Files: `cli/src/runCli.ts`、CLI 测试。
- Implementation checklist:
  - [x] 先编写非法格式和无副作用回归。
  - [x] 在共享入口严格校验正安全整数，保留现有错误协议。
- Acceptance: 无效输入非零返回且不搜索、不创建会话。
- Verification: 真正解析流程和 mock 服务、临时会话。
- Rollback: 分支内单独提交。
- Status: done

### Step 3 — 回归与交付

- Goal: 交付已验证的修复并更新相关待办。
- Dependencies: Steps 1–2。
- Files: 文档、Todo、测试和 PR。
- Implementation checklist:
  - [x] 定向、类型、全量测试及构建通过，检查调用方。
  - [ ] 更新说明与 Todo，按仓库模板提交 PR，验证 CI。
- Acceptance: 已确认行为与测试、CI 一致。
- Verification: 本地测试和 GitHub CI。
- Rollback: 保留工作树至合并。
- Status: in_progress

## Checkpoints

计划获批后先复现红测；其他两个范围独立继续澄清。

## Verification / Review

- 2026-11-11：Commander 受控复现 `-l 2` 被根命令接收，子命令仍为默认 10。
- 2026-11-11：工作树依赖 `npm ci` 完成；尚未实施代码修复。
- 2026-11-11：新增真实 CLI 回归先复现 9 项失败，修复后覆盖图搜索、非法输入和无副作用；`tsc --noEmit` 通过，完整测试 `vitest run --maxWorkers=2` 70 文件、787 项通过。

## Change Log

## Follow-ups

D11 图计数/混合采样和 P11 引擎配置分别处理。

## Version History

- v1 — planning.

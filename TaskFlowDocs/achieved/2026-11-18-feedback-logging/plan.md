# Plan — 反馈日志
> Task version: v1
> Status: completed

## Spec Pointers

- `spec.md`

## Reference Pointers

- `TaskFlowDocs/repository-docs/index.md`：路由；`LICENSE`：MIT；`CONTRIBUTING.md`：分支及测试；`CODE_STYLE.md`：TypeScript 和测试约定；`README.md`、`README.zh-CN.md`：使用说明。
- `cli/src/runCli.ts`、`service.ts`、`commands/extract.ts`：现有搜索与抽取路径。

## Related Tasks

- TF-20261118-9bd13b：本任务来源；已归档 simple-bugs 任务仅登记此独立待办。

## Skills / Tools Used

- [PRD] Unaided — considered: divergent exploration；自主比较自由文本脱敏与字段白名单，参考 taskflow 和 agent-skills:spec-driven-development 梳理验收。
- [Spec] Unaided — considered: architecture and design；自主设计事件与隐私边界，参考 agent-skills:spec-driven-development。
- [Plan] Unaided — considered: work breakdown; 本任务三步可直接按现有仓库路径分解。
- [Plan Review] Unaided — considered: work breakdown; 按验收、验证和层责任逐项审阅。

- [Test] Unaided — considered: testing strategy；使用隔离测试覆盖成功、隐私、轮转和失败。

## Preconditions

等待用户批准本版本。开始前核对工作树和依赖；不得改动基础工作树现存用户文件。

## Plan Review

- Verdict: sound
- Coverage: A1 由步骤 1、2 覆盖；A2 由步骤 1、2 覆盖；A3 由步骤 1 覆盖；A4 由步骤 1、2、3 覆盖。
- Verifiability: 每步通过对应的隔离测试或文档核对验证，最终以全套测试和构建复核。
- Layer ownership: 测试验证生产事件与日志模块契约；不修改中间值或既有预期以掩盖缺陷。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-18 13:38 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — 本地日志与隐私边界

- Goal: 实现默认关闭的异步白名单日志、限额与故障隔离。
- Dependencies: 用户批准。
- Files: 日志模块及其测试。
- Implementation checklist:
  - [x] 实现结构化事件写入、轮转和无副作用的关闭路径。
  - [x] 检查隐私、并发锁争用、故障及大小边界。
- Acceptance: A2、A3。
- Verification: 隔离测试覆盖敏感输入、限额、并发和写入失败，并检查业务不受影响。
- Rollback: 回退本步骤改动，保留任务文档。
- Status: done

### Step 2 — 搜索及抽取流程接线

- Goal: 记录各实际关键阶段及成功、失败、数量和耗时。
- Dependencies: Step 1。
- Files: 搜索、provider、抽取及相关测试。
- Implementation checklist:
  - [x] 对搜索和抽取关键阶段接入受控事件。
  - [x] 验证成功、失败及输出兼容性。
- Acceptance: A1、A2。
- Verification: 模拟多 provider、融合、会话、抽取及失败；检查事件顺序、字段及敏感数据。
- Rollback: 回退接线和测试，保留前一检查点。
- Status: done

### Step 3 — 文档与最终验证

- Goal: 告知用户操作方式、限制并验证整体行为。
- Dependencies: Step 1、2。
- Files: CLI 文档、测试及任务计划。
- Implementation checklist:
  - [x] 文档写明启用、位置、轮转、字段、风险和手动分享。
  - [x] 运行相关测试与构建，检查差异并记录结果。
- Acceptance: A4 以及所有验收条件。
- Verification: 运行 `npm test`、`npm run build`，审阅文档及工作树差异。
- Rollback: 回退文档变更或恢复至前一检查点。
- Status: done

## Checkpoints

代码及用户文档回滚检查点：`decb0f4`；用户要求提交 PR、合并并发版，视为验收。

## PR 准备

- 目标：`https://github.com/hkwuks/digdig`，base 为 `main`；2026-11-18 远端 main 为 `a5fded0`，与本分支基线一致，当前用户为 ADMIN。
- `.github/pull_request_template.md`：背景对应问题及范围；改动列日志模块、接线和文档；验证列构建及测试结果；兼容性列默认关闭与无迁移；范围外列真实网络和并发压力测试。`.github/CODEOWNERS` 指定仓库所有者。
- PR 提交前复核 CI、目标和模板，合并使用 merge commit；不隐瞒异步日志丢失限制。

## Verification / Review

- `npm run build`：通过，Node v24.15.0，安装的 `@types/node` 为 24.19.2。
- `npm test`：71 个测试文件、814 个测试通过；新增测试覆盖关闭、白名单、五文件轮转、锁争用、搜索及抽取接线和错误脱敏。
- `git diff --check`：通过。日志基于显式固定字段，不输出原始文本；搜索和抽取原有输出由全套测试覆盖。
- 环境说明：最初复用的 Node 20 类型包导致构建失败，重新获取锁文件依赖后标准构建通过。
- 限制：争用或异常退出可丢失日志；崩溃后锁文件需用户确认无写入进程再手动移除。未对真实网络服务做端到端测试，也未做多进程压力测试。

## Change Log

- 2026-11-18：根据用户选择拟定默认关闭、环境变量启用、本地轮转及全流程脱敏事件方案。

- 2026-11-18：用户确认日志单文件 10 MiB，保留当前文件和四个轮转文件；用户随后批准完整方案。

- 2026-11-18：实现日志、接线及用户文档，验证隐私、保留数量、争用及成功/失败；标准构建和全套测试通过。

- 2026-11-18：代码与文档提交为回滚检查点 `decb0f4`，用户要求提交 PR、合并并发版，确认验收并按 TaskFlow 归档。

## Follow-ups

无。

## Version History

- v1 — planning.

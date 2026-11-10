# Plan — results.json 把三层存储混成一个文件
> Task version: v1
> Status: in_progress

## Spec Pointers

- `spec.md`

## Reference Pointers

`TaskFlowDocs/repository-docs/index.md`、`CONTRIBUTING.md`、`CODE_STYLE.md`、`.github/pull_request_template.md`、`cli/src/deep/session.ts`、`cli/src/claims/store.ts`、`cli/src/commands/session.ts`、`cli/src/commands/graph-obfuscate.ts`；官方 Node 24.15 和 SQLite 文档链接见 PRD。

## Related Tasks

主 Todo: TF-20261107-492224。关联 C11 TF-20261103-11b5ef、D11 TF-20261103-761aa5 的图写入项、快照 TF-20261107-024a82、状态拆分 TF-20261107-23d219；不自动关闭其他 Todo。用户确认以会话存储为主任务。

## Skills / Tools Used

- [PRD] Declared `agent-skills:spec-driven-development` — 划分领域、事务和用户验收；阶段以显式声明记录，非宿主自动捕获。
- [Spec] Declared `agent-skills:spec-driven-development` — 定义模块边界、迁移和恢复契约。
- [Plan] Declared `agent-skills:planning-and-task-breakdown` — 安排可验证步骤和依赖。
- [Test] Declared `agent-skills:test-driven-development` — 规划失败注入、真实进程和持久化验证。
- `get-api-docs`：已读取技能、执行 `chub.CMD --help` 和 `chub.CMD search 'node sqlite' --json`，无结果；以 Node 24.15 和 SQLite 官方文档作为来源。此前实际执行 Node 内存事务/外键原型。

## Preconditions

用户确认 Node >=24.15、内置 SQLite、旧会话首次访问自动迁移（含只读）、旧 JSON 保留且停止写入；用户已选择关联现有 Todo。执行时只使用独立工作树和隔离测试会话。

## Plan Review

- Verdict: sound
- Coverage: 三个存储领域、事务、自动迁移、读写入口、Node 和 CI、失败恢复及保留源数据均有步骤；不可用网络文件系统边界作为风险验证。
- Verifiability: 真实磁盘、多进程、注入中止、CLI 输出与旧文件字节对比，分别覆盖成功、失败和恢复；记录命令及输出。
- Layer ownership: 存储层管理事务、迁移和错误，业务层持有证据及图的领域规则；不得为通过测试修改中间值。

## Approval

- Status: approved
- Approved by: --user-approved
- Approved at: 2026-11-10 19:28 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — 运行时和存储原型

- Goal: 明确 Node/SQLite 基线，验证数据库事务、schema 领域映射及异常恢复可行性。
- Dependencies: 用户批准当前版本。
- Files: package/lock、CI、类型和新存储模块及测试。
- Implementation checklist:
  - [x] 更新 Node 最低版本及最低版本 CI，先编写事务与边界测试。
  - [x] 验证外键、锁、持久化配置、异常处理和独立领域 schema。
- Acceptance: 支持 Node 24.15，原型具备事务、错误与恢复测试。
- Verification: 定向 Vitest、类型检查和最低版本执行。
- Rollback: 独立工作树变更，可回退整步。
- Status: done

### Step 2 — 自动迁移和完整性

- Goal: 保留源文件，首次访问旧会话时安全导入并切换唯一写入源。
- Dependencies: Step 1。
- Files: 存储迁移、session 读写和集成测试。
- Implementation checklist:
  - [x] 覆盖旧格式所有字段和三种领域并先写迁移失败测试。
  - [x] 实现排他迁移、完成标记、损坏检测和安全重试。
  - [x] 测试并发首次访问、中断、损坏、旧文件字节和不存在会话。
- Acceptance: 全量正确导入或明确失败，不损坏原文件、不凭空生成数据。
- Verification: 多进程与真实 CLI/文件系统集成测试。
- Rollback: 保留旧 JSON；丢弃隔离工作树代码。
- Status: done

### Step 3 — 命令切换与跨领域事务

- Goal: 消除会话 JSON 直接写入口，并确保核心操作事务一致。
- Dependencies: Step 2。
- Files: session、graph、claim/evidence/review 命令和相关测试。
- Implementation checklist:
  - [x] 在审批/图与证据/审核路径写失败注入测试并改为单事务。
  - [x] 切换列表、只读、会话图和独立图入口，维持用户契约。
  - [x] 查找全部旧 JSON 调用，确认无双写和隐藏回退。
- Acceptance: 各 CLI 操作在成功、错误及进程中止后状态一致。
- Verification: 命令集成测试、多进程写入和故障注入。
- Rollback: 数据测试仅在隔离会话内；旧 JSON 留存。
- Status: done

### Step 4 — 完整验证与交付

- Goal: 验收所有需求、文档和可维护性，准备独立 PR。
- Dependencies: Step 3。
- Files: README、项目内 skill、测试、任务记录及 PR 模板。
- Implementation checklist:
  - [x] 补充自动迁移、Node 基线、旧版本与网络文件系统限制的说明。
  - [ ] 运行全量测试、类型检查、CI，审查 schema、迁移和失败处理。
  - [ ] 审核变更与现有 Todo 关联，记录不在范围内的后续。
- Acceptance: PRD 全部验收通过，行为变化和限制清楚。
- Verification: `npm.cmd test -- --maxWorkers=2`、`npx.cmd tsc --noEmit`、最低 Node 及其他目标平台 CI。
- Rollback: 未发布前保留代码分支与原 JSON，不写真实用户会话。
- Status: pending

## Checkpoints

每一阶段完成记录测试与数据状态；如果存在未经证明的迁移原子性或需修改约定，停止并更新计划。

## Verification / Review

- 2026-11-10 Step 3: Windows Node 24.15: transactional fault tests and full suite 718 passed

- 2026-11-10：Windows、Node 24.15.0，`npm.cmd test`：64 文件、718 测试通过；`npx.cmd tsc --noEmit` 和 `npm.cmd run build` 通过，编译后 `node dist/index.js --help` 可运行。Linux 及 CI 尚待验证。
- 编译后的 CLI 对隔离旧会话执行 `--quality --format json` 返回 `ok`，生成数据库，源 results.json 的 SHA-256 前后一致。尝试直接运行未编译 TypeScript 的子进程因项目已有的 axios 类型导入失败；发布入口使用编译产物，上述验证覆盖实际入口。
- 审核：旧会话文件只用于迁移读取；独立图文件使用临时文件原子替换；审批/图和证据相关更新在事务中回滚。测试中的旧 JSON 路径断言已改为检查 SQLite，虚构关联改为满足存储外键的有效数据；不改变领域规则。
- 范围限制：图仍是整体快照；历史快照生命周期、TTL 和关联 Todo 保持后续处理；WAL 不支持跨机器网络文件系统，也不支持新旧版本并发写同一会话。

- 2026-11-10 Step 2: 11 migration tests, including two processes, killed importer and source preservation

- 2026-11-10 Step 1: Node 24.15; five database prototype checks; typecheck; 694 full tests before CLI integration

- Step 1：`npx.cmd vitest run test/integration/session-db.test.ts`：5 项通过，包括外键、真实子进程中断回滚和竞争写锁；`npx.cmd tsc --noEmit` 通过。本机 Node v24.15.0。
- 中途全量回归：`npm.cmd test -- --maxWorkers=2`（隔离 HOME）59 文件、694 项通过；此时正式 CLI 尚未接入迁移。
- 已实测隔离原型中的首次导入、坏源文件和关联错误回滚、正文/来源与结果分表往返；尚需真实 CLI、多进程迁移、故障和全覆盖验证。
- Step 2：`npx.cmd vitest run test/integration/session-migrate.test.ts`：11 项通过，含真实 CLI 只读首次迁移、双进程迁移及写入、中途终止后回滚重试、全部 7 份源文件字节保留、损坏错误和锁竞争。
- Step 3 进行中：审批/图故障回滚测试、图混淆会话数据库写入和 SQLite 竞争锁分类已通过；中途全量测试 63 文件、705 项通过，需在全部修改后重跑。

## Change Log

## Follow-ups

## Version History

- v1 — planning.

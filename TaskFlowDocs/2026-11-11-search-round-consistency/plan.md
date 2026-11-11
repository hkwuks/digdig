# Plan — 搜索轮次和查询历史一致性（D2、D6、D9）
> Task version: v1
> Status: checking

## Spec Pointers

- `spec.md`

## Reference Pointers

`TaskFlowDocs/repository-docs/index.md`、`CONTRIBUTING.md`、`CODE_STYLE.md`、`.github/pull_request_template.md`；会话 SQLite 和快照任务 `TaskFlowDocs/achieved/2026-11-10-sqlite-session/`、`TaskFlowDocs/achieved/2026-11-11-evidence-snapshots/`；当前 `cli/src/deep/{session,session-db,session-migrate,coverage,search-strategy,iteration-data}.ts`、`cli/src/runCli.ts` 及相邻测试。PR 必填背景、改动、验证、兼容性和不在范围五节。origin 为 `https://github.com/hkwuks/digdig.git`，base 为 main；创建 PR 前重新核对远端和 CI。

## Related Tasks

三个独立缺陷按用户明确要求共用本工作树及本次交付：D2 `TF-20261103-7f63b3`、D6 `TF-20261103-0b46c5`、D9 `TF-20261103-ba958f`。保留各 Todo ID 与各自验收，不合并或取消问题记录。

## Skills / Tools Used

- [PRD] Declared `agent-skills:debugging-and-error-recovery`：读取实际存储、数据流及失败链路；能力记录是显式声明，非宿主自动捕获。
- [Spec] Declared `agent-skills:api-and-interface-design`：设计查询事件、轮次分配、部分失败和跨入口契约。
- [Plan] Declared `agent-skills:planning-and-task-breakdown`：按依赖拆为事实存储、轮次归因、策略和回归步骤；TaskFlow 文档位置优先。
- [Test] Declared `agent-skills:test-driven-development`：实现阶段按真实行为先写失败测试，再修复和回归。
- 本轮直接执行 `git worktree add`；沙箱拒绝写 `.git/refs`，获得权限后同一 Git 命令成功。工作树位于项目 `.worktree/` 内。

## Preconditions

用户已选择单 worktree、抽取沿用最早发现轮、成功零结果计入历史、批次保留前面成功项、旧 origins 可用于历史、旧错误轮次不自动重写、最新空轮按 0 比较。实施前批准 v1。

## Plan Review

- Verdict: sound
- Coverage: 查询事实及成功/失败覆盖 Step 1；D2 覆盖 Step 2；D9 与所有调用方覆盖 Step 3；并发、旧会话、文档和完整验收覆盖 Step 4。
- Verifiability: 使用真实 SQLite 和真实命令行为断言；先复现再修复。覆盖零结果、部分失败、历史及并发；历史不可还原处显式说明。
- Layer ownership: SQLite 负责会话事实与原子性，搜索编排负责执行成功与轮次，策略层负责从有效事实计算；不借图快照代替查询历史。

## Approval

- Status: approved
- Approved by: --user-approved
- Approved at: 2026-11-11 16:30 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — 查询事实与轮次事务（D6）

- Goal: 实际成功查询不依赖结果采信或图；空结果、部分失败和旧来源均按用户决定可追溯。
- Dependencies: 批准 v1。
- Files: session-db/migrate/store、runCli、查询历史及真实 SQLite/CLI 测试。
- Implementation checklist:
  - [x] 先复现未采信、空结果和批次部分失败；在会话库设计并实现带轮次查询记录及迁移。
  - [x] 统一一调用一轮、并发分配和结果入库，读取用户授权的旧 origins；失败/跳过不伪造成功。
- Acceptance: 搜索成功记录持久化，后续失败不回滚此前成功；冗余检测覆盖新旧历史。
- Verification: 真 CLI 和 SQLite 测试，包括空会话、旧会话、并发、重复和事务回滚。
- Rollback: 隔离测试库；SQLite 迁移和跨领域操作事务回滚，旧 JSON 保留。
- Status: done

### Step 2 — 正文归因（D2）

- Goal: 既有结果后续抽取不伪造新发现轮。
- Dependencies: Step 1 的轮次契约。
- Files: session.ts、results-add、coverage 相关测试。
- Implementation checklist:
  - [x] 先复现跨轮抽取误归因，保留真实新搜索和原有来源。
  - [x] 验证有/无已有轮、直接导入、重复来源、同批和历史未修改。
- Acceptance: 后续抽取按最早有效发现轮；coverage 不报告虚假重复。
- Verification: 真实会话持久化和 coverage 前后对照。
- Rollback: 不做历史回填；事务失败保留原会话。
- Status: done

### Step 3 — 增长策略（D9）

- Goal: 按实体最早有效发现轮统计，最后实际轮无新增时计 0。
- Dependencies: Step 1、2。
- Files: search-strategy、iteration-data、所有策略调用方及测试。
- Implementation checklist:
  - [x] 先复现跨轮实体误分桶及零新增轮被忽略。
  - [x] 同步 strategy-info、suggest-queries、session-report 和搜索建议入口，处理缺少有效来源与历史信息。
- Acceptance: 各入口一致；零增长和不足数据的处理可解释。
- Verification: 多轮、空轮、多来源、无效来源、现有 API 测试与 CLI。
- Rollback: 仅变更计算；不改旧事实。
- Status: done

### Step 4 — 回归、自审和交付

- Goal: 审核三项验收及存储边界，交付可审阅 PR。
- Dependencies: Step 1–3。
- Files: 测试、README、CHANGELOG、项目 skill、TaskFlow 文档。
- Implementation checklist:
  - [x] 验证旧数据、并发和中断场景，记录性能/历史限制；更新对外说明。
  - [x] 运行类型检查、全量测试、构建和 Node 24.15/24.x CI，按仓库模板创建 PR。
- Acceptance: 三项均可通过用户可观察结果验证，CI 通过，等待审阅。
- Verification: 定向/完整测试、真实 CLI、实际 SQLite、PR CI。
- Rollback: 不发布或合并，保留原始会话和工作树供审阅。
- Status: done

## Checkpoints

批准后依次执行；若用户重新审视整体架构导致范围或契约改变，先讨论并修订任务，不擅自重构。

## Verification / Review

- 2026-11-11 Step 4: PR 60 CI build and test pass on Node 24.15 and 24.x

- 2026-11-11 Step 4: 完整测试及代码审查，之后提交 PR 并验证 CI

- 2026-11-11 Step 3: 首次有效来源和最新空轮计算已验证，命令入口使用会话轮次

- 2026-11-11 Step 2: 跨轮抽取复现并修复，保留首次发现来源

- 2026-11-11 Step 1: 空结果、部分失败、v3升级、写入回滚及双进程轮次验证通过

- 2026-11-11 Step 1: 成功空结果和批量部分失败的失败测试已转绿，继续验证升级和并发

- 2026-11-11：读取现有代码，确认三个记录的核心路径仍存在；这是静态检查，尚未声明动态复现通过。
- 2026-11-11：`npm ci` 沙箱网络 EACCES；经授权联网在工作树内安装成功（127 packages）。
- 2026-11-11：D6 两项失败测试分别复现零结果查询被重复执行和批量部分失败丢失成功查询；D2 复现来源轮次错误 `[1,2]`；D9 两项失败测试复现零增长轮被忽略及来源被重分桶。修复后以上测试通过。
- 2026-11-11：真实 SQLite 测试覆盖 v3 升级、插入故障回滚和双进程并发分配不同轮；策略信息与会话报告一致。`npm test`：69 文件、758 测试通过；`npm exec -- tsc --noEmit` 通过（随后的小幅校验变更需要再次检查）。
- 2026-11-11：最终本地 `npm test` 69 文件、760 测试通过；`npm exec -- tsc` 通过。实际编译后的 CLI 在零结果历史中识别相同查询并 skip，退出码 0；v3→v4 升级中断后回滚并成功重试。PR #60 的 GitHub CI run 42990194397 中，Node 24.15 和 24.x 的 build/test 四项均通过。
- [Review] 以 `agent-skills:code-review-and-quality` 自查迁移、查询成功和部分失败、跨进程轮次分配、待确认来源、三个策略消费者与老数据限制；未做大规模性能基准。

## Change Log

## Follow-ups

单会话 SQLite 的图整体序列化、结果全量读写和当前正文与历史版本重复存储需要独立测量；本任务不作未经证据支持的性能宣称。

## Version History

- v1 — planning.

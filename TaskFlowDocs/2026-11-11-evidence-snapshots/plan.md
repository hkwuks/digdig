# Plan — SessionResult 没有 snapshot 概念，证据定位无法在重抽取后重新对齐
> Task version: v1
> Status: in_progress

## Spec Pointers

- `spec.md`

## Reference Pointers

`TaskFlowDocs/repository-docs/index.md`、`CONTRIBUTING.md`、`CODE_STYLE.md`、`.github/pull_request_template.md`；已归档 SQLite 任务 `TaskFlowDocs/achieved/2026-11-10-sqlite-session/`；`session-db.ts`、`session-store-results.ts`、`session.ts`、claims、证据/审核和图消费者。PR 模板五节依次对应问题、最终行为、本地和 CI 结果、schema/CLI 升级、未涵盖的 TTL 与其他 locator。

## Related Tasks

主 Todo：TF-20261107-024a82；关联 TF-20261107-23d219，用户选择联合设计，但另项不自动关闭；依赖已归档的 SQLite v1 任务 TF-20261107-492224。

## Skills / Tools Used

- [PRD] Declared `agent-skills:spec-driven-development` — 结合当前接口、事务及用户选择确定验收。
- [Spec] Declared `agent-skills:spec-driven-development` — 定义数据边界、迁移和审计契约。
- [Plan] Declared `agent-skills:planning-and-task-breakdown` — 按存储迁移、证据审核、图消费者和交付排序；计划存于任务目录。
- [Test] Declared `agent-skills:test-driven-development` — 先验证失败再实现，覆盖真实迁移和回滚。
- 命令：`rg` 定位调用方及测试；读取实际 schema、旧迁移、证据和图操作；此前 23 项针对 SQLite 的定向回归通过。

## Preconditions

用户已确认保留证据引用的快照、同正文复用、精确唯一定位、审核保留并重审、正文待采信、图事实待重确认、旧证据无法核对时保留标记。实施前须批准本版计划。

## Plan Review

- Verdict: sound
- Coverage: PRD 同正文与旧引用由 Step 1/2 验证；定位、采信与审核由 Step 2 验证；图确认和多来源由 Step 3 验证；迁移/回滚由 Step 1/2 验证，完整 CLI 与文档由 Step 4 验证。
- Verifiability: 每步要求真实数据库及对应消费者结果；异常、唯一性、引用与多来源均有负例，不能只以单元测试通过代替状态检查。最终需完整回归及 CI。
- Layer ownership: 数据库测试检查实际提交；CLI 检查其输出及存储结果；旧测试只按明确状态契约更新，不以修改中间值掩盖错误。

## Approval

- Status: approved
- Approved by: --user-approved
- Approved at: 2026-11-11 13:36 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — 正文快照与旧会话迁移

- Goal: 建立不可变正文版本、当前指针及 SQLite schema 升级。
- Dependencies: 用户批准本版计划。
- Files: session-db、session-migrate、session-store-results、迁移/存储测试。
- Implementation checklist:
  - [x] 实现同正文复用、最新抽取元数据独立保存以及被引用快照保留。
  - [x] 实现真实 v1/旧 JSON 升级、历史未知标记，验证原记录和事务恢复。
- Acceptance: 新旧会话均可读取；重复、异常、中断、并发不丢数据、不杜撰历史。
- Verification: 真实磁盘 v1 和 JSON fixture、故障注入、进程中断、重复与并发测试。
- Rollback: 测试使用隔离会话；迁移事务回滚，生产数据需按发布说明备份并禁止新旧程序并发。
- Status: done

### Step 2 — 证据定位和审核历史

- Goal: 按快照追踪证据、拆分采信和定位状态，保留历史审核。
- Dependencies: Step 1。
- Files: claims types/store/checks/policy、session、证据和审核命令及测试。
- Implementation checklist:
  - [x] 实现唯一精确定位、未匹配/多匹配待核对，保存旧出处并隔离待确认数据。
  - [x] 正文变化使结果待采信；审核保留并标待重审，新正文未采信不能参与审核。
- Acceptance: 同内容不误降级；跨版本证据和审核可审计，不能将旧审核呈为当前有效。
- Verification: 真实 CLI 与数据库验证匹配边界、UTF-16、多次变化、迁移异常、采信与重审。
- Rollback: 按事务回滚；开发测试不操作真实用户会话。
- Status: done

### Step 3 — 图确认和所有图消费者

- Goal: 保留受影响的图并逐来源标记待重新确认。
- Dependencies: Step 1、Step 2。
- Files: graph、session、graph-add、导航/采样/导出/预处理命令及测试。
- Implementation checklist:
  - [x] 实现来源与正文版本的确认、显式查看/重确认，保留仍有效来源。
  - [x] 检查全部图消费者和派生路径，确保待确认图事实不冒充有效结论。
- Acceptance: 没有破坏性删除；未确认事实不能进入默认有效输出，重新采信不隐式重新确认。
- Verification: 多来源、路径、图导航/查询/采样、重确认、数据库重启和异常回滚测试。
- Rollback: 保留测试数据快照；事务失败不写入。
- Status: done

### Step 4 — 完整回归与交付

- Goal: 核验全部 CLI 和 Agent 契约，准备可审阅 PR。
- Dependencies: Step 1–3。
- Files: README、CHANGELOG.md、项目 skill、全量测试及任务记录。
- Implementation checklist:
  - [x] 更新新状态、升级、历史审核与图确认的使用文档。
  - [x] 审查迁移完整性、测试调整、关联 Todo 和 PR 模板；运行全量检查。
- Acceptance: 用户确认的全部场景可观测，约束和未处理项清晰；本地主机和 CI 检查通过。
- Verification: 定向和全量 Vitest、TypeScript、build、实际 CLI、GitHub CI。
- Rollback: 不发布，保留迁移前 JSON；SQLite 生产备份与恢复步骤须先验证。
- Status: done

## Checkpoints

实现前需批准 v1；每步记录命令、结果和未决风险。若发现已批准数据契约无法实现，先更新任务版本并重新确认。

## Verification / Review

- 2026-11-11 Step 4: Windows 733 tests and Linux CI four checks passed; review pending

- 2026-11-11 Step 4: full local suite passed; CI and review pending

- 2026-11-11 Step 3: multi-source graph preservation and reconfirmation passed

- 2026-11-11 Step 2: evidence relocation, reapproval and review history passed

- 2026-11-11 Step 1: v1 recovery, killed upgrader and concurrent upgrades passed

- 2026-11-11：代码审查确认 `body_snapshots` 按 result 主键覆盖，审核按 claim 单行存储，图仅使用 result ID 溯源；当前清理代码会删除审核及裁剪图。
- 2026-11-11：上游 SQLite 回归 3 文件、23 项通过。本任务尚未实现，未宣称通过其验收。
- 2026-11-11：Node 24.15.0 / Windows，`npm.cmd test -- --maxWorkers=2`：65 文件、733 项通过；`npm.cmd exec tsc -- --noEmit`、`npm.cmd run build`、`git diff --check` 通过。真实 v1 升级被终止后回滚重试和双进程竞争测试通过；实际编译 CLI 返回待确认图、需定位证据和非当前审核历史。CI 待 PR。
- 复核：`session-migrate.test.ts` 旧结果恢复断言新增了设计所需的 approvedSnapshotId；原字段仍逐项相等。其余旧断言未因改变行为被弱化。新图路径测试覆盖标准目录与自定义路径，图查询及会话列表使用过滤后的有效图。
- GitHub Actions run 42973468568：Linux Node 24.15.0 和 24.x 的 build、test 四项通过；PR #58 等待用户审阅。原 PR #57 因按项目规范重命名源分支而被 GitHub 关闭；远端 main 新增 README 一行，已无冲突合入任务分支。

## Change Log

- 2026-11-11：用户要求增加项目更新日志；作为既有文档交付的工作修订，在根目录新增 CHANGELOG.md 并记录已发布的 0.0.9，实施完成后填写未发布变更。
- 2026-11-11：用户确认只有 graph.json 的旧会话按路径区分：标准会话目录下的文件视为会话；其他位置传目录视为会话、传文件视为独立图。作为图入口迁移的工作修订。

## Follow-ups

未引用快照清理及其他 locator 留给后续任务；关联的 TF-20261107-23d219 是否关闭由用户和完成结果决定。

## Version History

- v1 — planning.

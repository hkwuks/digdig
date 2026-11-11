# Plan — 来源簇只按 hostname 判断，转载被当成独立来源
> Task version: v1
> Status: in_progress

## Spec Pointers

- `spec.md`

## Reference Pointers

`TaskFlowDocs/repository-docs/index.md`、`CONTRIBUTING.md`、`CODE_STYLE.md`、`.github/pull_request_template.md`、`cli/src/claims/{policy,deterministic-checks,types,store}.ts`、`cli/src/commands/{evidence,review,json-input}.ts`、SQLite 和快照任务 `TaskFlowDocs/achieved/2026-11-11-evidence-snapshots/`；外部一手资料见 PRD。PR 模板五节分别填写问题、行为、本地/CI 验证、迁移/API 变化及不在范围内内容。

## Related Tasks

主 Todo：TF-20261107-ebc986。依赖 PR #58 的快照/历史审核；关联 TF-20261107-23d219 已经用户确认关闭，另有直接提交 `ef642b8`。任务分支需合入最新 main 后再提交 PR。

## Skills / Tools Used

- [PRD] Declared `agent-skills:debugging-and-error-recovery` — 溯源实际策略并复现两类误批准，非宿主自动捕获。
- [Spec] Declared `agent-skills:api-and-interface-design` — 设计三态关系、输入边界、快照作用域及审计语义。
- [Plan] Declared `agent-skills:planning-and-task-breakdown` — 拆解迁移、关系、policy、端到端验证；TaskFlow 指定文档位置优先。
- [Test] Declared `agent-skills:test-driven-development` — 每类缺陷先写失败测试，再实现和回归。
- `dg.CMD` 搜索因本机 SearXNG 拒绝连接失败；`web` 检索并阅读论文和 Google 官方资料，结论见 PRD。用 TypeScript 转译仓库实际模块，分别复现相同转载和无支持 verdict 的误批准。

## Preconditions

用户已决定未知不自动通过、完整性未知只标疑似、Agent 对 claim/快照对提供可审计判断、冲突拒绝、同域名可独立、旧自动审核保留但转待重审。实施需批准 v1。

## Plan Review

- Verdict: sound
- Coverage: 两类误批准和未知行为由 Step 1/3 覆盖；Agent 关系与冲突由 Step 2 覆盖；旧自动审核升级、JSON 和事务由 Step 1 覆盖；跨入口、文档和完整验收由 Step 4 覆盖。
- Verifiability: 每条验收均通过真实 SQLite、CLI 输出和存储状态验证；迁移需进程中断与并发，确认历史审核保留，不能用伪造中间状态充当通过。
- Layer ownership: 关系由来源模块与数据库保存，policy 基于验证后的证据和关系判定；CLI 只处理输入输出。测试断言真实用户可观察结果，旧断言只在批准的接口变更后同步修订。

## Approval

- Status: approved
- Approved by: --user-approved
- Approved at: 2026-11-11 15:17 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — 迁移与已批准审核安全降级

- Goal: SQLite v2 升级引入来源关系审计，旧域名自动批准转待重审并保留历史。
- Dependencies: 用户批准 v1。
- Files: session-db、session-migrate、review store、迁移测试。
- Implementation checklist:
  - [x] 为来源关系和历史提供原子存储，不丢现有快照及审核。
  - [x] 覆盖 v2、v1、旧 JSON 和只读访问路径，旧自动批准不继续冒充有效。
- Acceptance: 已有自动审核被安全标待重审、人工审核保留；失败或中断后可恢复或重试。
- Verification: 真实磁盘 fixture、并发、进程中断、失败注入、历史审核断言。
- Rollback: 迁移事务回滚；只对隔离测试会话操作，记录生产备份边界。
- Status: done

### Step 2 — 来源关系及 Agent 判断

- Goal: 建立 claim/正文快照对上的同源、独立、未知，提供记录、查看和撤销。
- Dependencies: Step 1。
- Files: 来源领域模块、claims types/store、输入校验、CLI 和测试。
- Implementation checklist:
  - [x] 对相同或相似抽取正文仅输出疑似同源线索，首版不自动认定同源。
  - [x] 实现 Agent 判断、依据、事务及审计；拒绝同源闭包内的独立冲突，正文变更使判断失效。
- Acceptance: 不会凭域名或未经证明的正文完整性断定关系；同域名可经 Agent 确认独立。
- Verification: 实际命令与数据库验证跨 claim/快照隔离、重复/撤销、冲突、同源传递、独立非传递与失败回滚。
- Rollback: 回滚事务；测试使用独立会话。
- Status: done

### Step 3 — 同一审核决策入口

- Goal: 修复域名误批准和无支持 verdict 来源凑数，跨两个审核入口一致。
- Dependencies: Step 2。
- Files: policy、deterministic-checks、commands/evidence、commands/review 和测试。
- Implementation checklist:
  - [x] 只计有效支持证据，未知/冲突不自动通过，保留反驳与 insufficient 处理。
  - [x] 改造 `--complete` 和 policy-aggregate 共用关系评估，并输出明确原因。
- Acceptance: 两个复现误批准的输入均待审核；经确认独立且均有支持的来源按规则可批准。
- Verification: 先运行失败回归；真实 CLI、不同风险等级、多 verdict、多证据及重试测试。
- Rollback: 保留原始审核在 history 中；写入事务回滚。
- Status: done

### Step 4 — 完整回归与交付

- Goal: 核验迁移、CLI、Agent 文档和 PR。
- Dependencies: Step 1–3。
- Files: README、项目 skill、CHANGELOG、测试和 TaskFlow 文档。
- Implementation checklist:
  - [x] 更新来源关系、未知和已有审核重审的 CLI/Agent 使用说明。
  - [x] 审查迁移安全、兼容和所有调用点；执行类型、构建、全量测试及 CI。
- Acceptance: 所有 PRD 场景可核验，已批准的范围完成，用户可审查 PR。
- Verification: Node 24.15、本地完整测试、真实 CLI、Linux CI 和 PR 模板。
- Rollback: 不发布；保留历史审计及隔离工作树。
- Status: done

## Checkpoints

批准 v1 后按步骤执行。若无法证明正文完整性，保守标未知；若需要改变已批准语义，先更新版本并重新取得用户选择。

## Verification / Review

- 2026-11-11 Step 4: GitHub CI build and test pass on Node 24.15 and 24.x

- 2026-11-11 Step 4: local checks pass, remote CI pending

- 2026-11-11 Step 3: both policy entry points and supported-source eligibility verified

- 2026-11-11 Step 2: judgments, conflicts, revocation and body changes tested

- 2026-11-11 Step 1: SQLite migration, rollback and concurrency verified

- 2026-11-11：使用仓库真实规则构造两域名相同转载、高风险 claim，实际输出 `approved / dualSourceSupport`；两个来源但只有第一个有 support verdict 时同样误批准。具体材料见本任务 PRD。
- 2026-11-11：`npm test`：68 文件、746 测试通过；类型检查及 `tsc` 编译通过。全量失败的旧域名假设已按新规则修订；实际锚点数据校正后重跑通过。
- 2026-11-11：真实 CLI 验证同域名两来源：未知时 `needsReview`，记录独立及依据后 `approved`。SQLite v2 升级中断、并发及旧 JSON 导入有真实数据库测试。
- 2026-11-11：按 `agent-skills:code-review-and-quality` 自审事务、历史、输入和性能；发现并修正关系类型校验，13 项相关测试及类型检查通过。正文相似提示最多比较 100 对和每份正文前 100,000 字符，输出 `hintsTruncated`。
- GitHub CI run 42983885102：Node 24.15.0 和 24.x 的 build/test 全部通过。首次 24.15 测试中两个既有测试超时，重跑该作业通过；具体环境原因未确定。

## Change Log

- 2026-11-11：补充有界相似提示和严格关系类型校验，属于批准范围内的实现细化。

## Follow-ups

跨语言和近似改写、外部来源知识图谱与权威性评级不纳入；未来若有可核验正文完整性来源，应明确证据格式再启用自动同源。

## Version History

- v1 — planning.

# Plan — 修复六项缺陷
> Task version: v2
> Status: completed

## Reference Pointers
- TaskFlowDocs/repository-docs/index.md、LICENSE：许可要求；CONTRIBUTING.md、CODE_STYLE.md：分支、测试及编码规范。
- cli/src/deep/graph-explore.ts、local-doc/searcher.ts、session.ts、pending-facts.ts、commands/claim.ts：修复所属层。
- https://docs.orama.com/docs/orama-js/search：公开搜索接口。

## Related Tasks
v2 承接用户确认的 TF-20261118-0d9dc4，保留 v1 交付；覆盖 TF-20261105-b1e4c7、TF-20261103-b636fb、TF-20261103-761aa5、TF-20261103-844d30、TF-20261103-097d13、TF-20261103-2a70e1 的用户确认范围。

## Skills / Tools Used
- [PRD] Unaided — considered: root cause; 追踪六项根因并参考 debugging-and-error-recovery。
- 文档调查 `get-api-docs` — purpose: Orama 文档; outcome: chub 无结果，查阅官方文档; incorporated: 公共查询接口。
- [Spec] Unaided — considered: architecture and design; 沿现有边界修复。
- [Plan] Unaided — considered: work breakdown; 分组验证六项。
- [Plan Review] Unaided — considered: plan review; 逐项核对覆盖及归属。
- [Build] `ponytail:ponytail` — purpose: 最小完整修复; outcome: 约束范围; incorporated: 测试与责任层修复。

- [Test] Unaided — considered: testing strategy; 添加端到端回归并运行全量测试。

## Preconditions
用户于 2026-11-18 同意补充文档、端到端测试并仔细核查关联更新；工作树 fix/2026-11-18-round-followup。

## Plan Review
- Verdict: sound
- Coverage: 保留已完成的 Step 1、2；Step 3 覆盖新增验收 7、8，并复核验收 6。
- Verifiability: 真实 CLI 搜索配合本地索引测试先本地、后网络及空结果；已有测试覆盖已有轮次；核对各文档字段。
- Layer ownership: 分别修改图查询、索引检索、会话存储、事实报告和命令校验的责任层；测试仅验证外部行为。

## Approval
- Status: approved
- Approved by: user
- Approved at: 2026-11-18 11:58 +0800
- Approved version: v2
- Approved scope: PRD / Spec / Plan

## Steps
### Step 1 — 修复并验证六项
- Goal: 满足验收 1–5。
- Dependencies: 已批准范围和根因调查。
- Files: cli/src/deep、cli/src/commands、cli/test、CLI help。
- Implementation checklist:
  - [x] 为六项行为添加回归测试并修复责任层。
  - [x] 运行针对性测试。
- Acceptance: 六项行为及边界正确。
- Verification: 对应 Vitest 测试。
- Rollback: 回退本任务代码和测试改动。
- Status: done

### Step 2 — 全量验证和待办
- Goal: 验证回归并更新对应待办。
- Dependencies: Step 1。
- Files: TaskFlowDocs/todo.md、plan.md。
- Implementation checklist:
  - [x] 类型检查及全量测试。
  - [x] 更新待办并记录验证与审查。
- Acceptance: 验收 6 或明确记录环境限制。
- Verification: npx tsc --noEmit；npm test；git diff 审查。
- Rollback: 回退本任务提交。
- Status: done

### Step 3 — 补齐轮次与来源说明及验证
- Goal: 覆盖本地文档与网络搜索的轮次衔接，修正文档来源字段。
- Dependencies: 用户同意 v2 补充范围。
- Files: README.md、README.zh-CN.md、cli/README.md、skills/digdig/references/SOP.md、cli/src/commands/doc-search.ts、cli/src/deep/local-doc/searcher.ts、cli/test/unit/deep/local-doc.test.ts。
- Implementation checklist:
  - [x] 核查今天六项修复相关的文档、调用和测试，记录额外发现。
  - [x] 添加真实 CLI 网络搜索与本地索引的会话轮次、来源回归测试。
  - [x] 更新项目文档和注释并运行验证。
- Acceptance: 空会话本地命中轮次 1、后续网络轮次 2、无命中仍为 0；来源与文档一致；原有顺序不回归。
- Verification: 针对性 Vitest、类型检查、全量测试和文档搜索。
- Rollback: 回退 v2 提交。
- Status: done

## Checkpoints
## Verification / Review
- v2 全面核查六项原修复的调用者、测试和项目文档；发现本地搜索首轮、local-index 来源和 sourceDiversity 旧字段的多处描述过时，按现有实现修正。
- 本地空会话命中后、CLI 网络搜索前后及本地无命中，两个新增测试通过；网络服务使用 mock，CLI 解析和 SQLite 均为实际实现。
- `node node_modules/typescript/bin/tsc --noEmit`：通过。
- `node node_modules/vitest/vitest.mjs run --maxWorkers=2`：70 文件、808 测试通过。
- 使用 rg 核查项目 README、项目 skill/SOP 和相关注释，无原旧描述残留；历史 TaskFlow 归档及旧 source 测试夹具保留。
- 其他 v1 修复未发现因 SQLite 迁移必须更改；旧目录锁竞态与图文件支持仍是独立待办，未修改生产逻辑。

- 回归测试先于修复运行，五组失败复现六项问题；修复后 5 文件 106 测试通过。
- `node node_modules/typescript/bin/tsc --noEmit`：通过（锁文件依赖）。
- `node node_modules/vitest/vitest.mjs run --maxWorkers=2`：70 文件、806 测试通过。
- 首次全并发运行：803 通过，来源字段原有路径回归 1 项（已修复），索引超时 2 项（降低并发后通过）。
- 审查：六项分别在图解析、索引输出、会话持久化、来源报告和命令输入校验层修复；未调整已有测试预期。保留原 source 回退，首次 origin 优先。
- evidence、graph-add、results-add 的输入形状校验均在初始化前；图的引用及碰撞验证依赖会话状态。
- Orama 兜底遍历全部索引记录，成本随索引规模增长；用户已有兜底方案原设计即全量遍历。

## Change Log
- v2：补充本地搜索及网络搜索顺序的 CLI 测试，修正项目文档和注释中的轮次与来源描述；完成验证。
- v2：保留 v1 结果，补充本地文档轮次、来源字段的说明和端到端验证。
- 2026-11-18 reopen — retrieved achieved task `2026-11-18-small-bug-fixes` for new work; re-approval required before core changes
- v1：记录用户确认的范围及设计。
## Follow-ups
- D11 的 mixed 采样及旧会话 graph.json 路径验证仍待处理。
## Version History
- v1 — completed.
- v2 — ready.

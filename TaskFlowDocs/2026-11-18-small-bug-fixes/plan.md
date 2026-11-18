# Plan — 修复六项缺陷
> Task version: v1
> Status: completed

## Reference Pointers
- TaskFlowDocs/repository-docs/index.md、LICENSE：许可要求；CONTRIBUTING.md、CODE_STYLE.md：分支、测试及编码规范。
- cli/src/deep/graph-explore.ts、local-doc/searcher.ts、session.ts、pending-facts.ts、commands/claim.ts：修复所属层。
- https://docs.orama.com/docs/orama-js/search：公开搜索接口。

## Related Tasks
覆盖 TF-20261105-b1e4c7、TF-20261103-b636fb、TF-20261103-761aa5、TF-20261103-844d30、TF-20261103-097d13、TF-20261103-2a70e1 的用户确认范围。

## Skills / Tools Used
- [PRD] Unaided — considered: root cause; 追踪六项根因并参考 debugging-and-error-recovery。
- 文档调查 `get-api-docs` — purpose: Orama 文档; outcome: chub 无结果，查阅官方文档; incorporated: 公共查询接口。
- [Spec] Unaided — considered: architecture and design; 沿现有边界修复。
- [Plan] Unaided — considered: work breakdown; 分组验证六项。
- [Plan Review] Unaided — considered: plan review; 逐项核对覆盖及归属。
- [Build] `ponytail:ponytail` — purpose: 最小完整修复; outcome: 约束范围; incorporated: 测试与责任层修复。

- [Test] Unaided — considered: testing strategy; 添加端到端回归并运行全量测试。

## Preconditions
用户于 2026-11-18 同意六项及来源、待办收尾方式；工作树 fix/2026-11-18-small-bug-fixes。

## Plan Review
- Verdict: sound
- Coverage: Step 1 覆盖验收 1–5；Step 2 覆盖 6。
- Verifiability: 针对性回归测试覆盖每个行为及边界，再进行全量测试。
- Layer ownership: 分别修改图查询、索引检索、会话存储、事实报告和命令校验的责任层；测试仅验证外部行为。

## Approval
- Status: approved
- Approved by: user
- Approved at: 2026-11-18 10:30 +0800
- Approved version: v1
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

## Checkpoints
## Verification / Review
- 回归测试先于修复运行，五组失败复现六项问题；修复后 5 文件 106 测试通过。
- `node node_modules/typescript/bin/tsc --noEmit`：通过（锁文件依赖）。
- `node node_modules/vitest/vitest.mjs run --maxWorkers=2`：70 文件、806 测试通过。
- 首次全并发运行：803 通过，来源字段原有路径回归 1 项（已修复），索引超时 2 项（降低并发后通过）。
- 审查：六项分别在图解析、索引输出、会话持久化、来源报告和命令输入校验层修复；未调整已有测试预期。保留原 source 回退，首次 origin 优先。
- evidence、graph-add、results-add 的输入形状校验均在初始化前；图的引用及碰撞验证依赖会话状态。
- Orama 兜底遍历全部索引记录，成本随索引规模增长；用户已有兜底方案原设计即全量遍历。

## Change Log
- 2026-11-18 reopen — retrieved achieved task `2026-11-18-small-bug-fixes` for new work; re-approval required before core changes
- v1：记录用户确认的范围及设计。
## Follow-ups
- D11 的 mixed 采样及旧会话 graph.json 路径验证仍待处理。
## Version History
- v1 — planning.

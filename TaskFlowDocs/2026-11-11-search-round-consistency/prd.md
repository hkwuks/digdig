# PRD — 搜索轮次和查询历史一致性（D2、D6、D9）
> Task version: v1
> Status: checking

## Goal

修复搜索轮次归因、无采信结果时的冗余查询检测、以及实体增长统计口径，三个既有 Todo 在同一 worktree 中交付。

## Task Kind

- Kind: defect

## Background / Confirmed Facts

- D2：`appendSessionResults` 对无轮次的抽取来源使用当前轮；已有结果的第 1 轮发现可能被补成第 2 轮来源。
- D6：`loadSessionQueryHistory` 只读图中的 query 节点，而图只注入已采信结果；零结果查询没有可读取的结果来源。
- D9：`entityCountsByRound` 使用最新来源轮；`computeGrowthRate` 只比较有实体的桶，丢失最后一轮零增长。
- 当前会话是单 SQLite 数据库；结果/来源、图快照、证据及审核是库内分表，不是各自独立数据库。图仍整体保存，结果读写也有全量路径，本任务不宣称解决整体性能。

## Requirements

- D2：对已有结果补充正文时，新来源沿用最早有效发现轮，保留原搜索来源。真正的新搜索仍记自己的搜索轮；不自动修复已有错误历史。
- D6：独立保存实际执行且成功的查询，包括零结果；批量执行中前项成功、后项失败时保留前项；失败和跳过的不记为成功。用户允许从旧结果来源读取历史查询；旧零结果查询不可补造。
- D9：按实体最早有效支持来源的发现轮统计；最新实际轮即使新增 0 也参与比较。对缺失或待确认来源不伪造轮次。
- 同一搜索调用的多个查询属于同一轮；已有其他会话调用和用户导入仍保持明确轮次边界，不能出现并发下的重复分配或遗失成功查询。

## Acceptance Criteria

- 第 1 轮发现、第 2 轮其他搜索、后续抽取第 1 轮结果时，coverage 不把抽取误认作第 2 轮发现。
- 未采信、零结果、批量部分失败及旧会话来源查询均按决策参与冗余检测；真实失败/跳过不误记。
- 重复出现的实体仍归其首次有效发现轮，最新轮无新增实体按 0 比较；三个策略消费者一致。
- 真实 SQLite 并发、重试、失败注入和升级、CLI 回归、类型检查、完整测试及 CI 通过；历史数据不被静默改写。

## External Facts

- Depends on external facts: no
- Why not: 既有行为及持久化边界由 `cli/src/deep/session.ts`、`cli/src/deep/session-db.ts`、`cli/src/deep/search-strategy.ts` 和真实会话测试确定，不依赖外部事实。

## In Scope

D2、D6、D9，必要的单会话 SQLite schema、查询历史迁移和策略调用方、测试和使用说明。

## Out of Scope

拆库、更换数据库、将图拆成节点表、广泛重构存储、自动改写历史错误轮次、自动补造历史零结果查询、其他 Todo。

## Risks / Deferred Items

已有 origins 仅证明结果曾带查询来源，不证明遗漏的零结果查询；旧错误轮次无法自动辨别。多进程分配轮次及部分失败必须验证；图整体快照和结果全量读写的成本需要单独测量。

## Open Questions

具体接口和持久化格式以 spec 的实际可行方案为准，涉及改变用户已确认语义必须先沟通。

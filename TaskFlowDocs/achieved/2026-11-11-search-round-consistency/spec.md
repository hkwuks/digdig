# Spec — 搜索轮次和查询历史一致性
> Task version: v1

## Objective and Success Criteria

在现有每会话 SQLite 内记录查询事实并统一首次发现轮口径，不把查询执行与结果采信、图注入混为一谈。

## Architecture Boundaries and Responsibilities

会话存储层管理查询、轮次、事务与升级；CLI 搜索编排逐个记录成功查询；策略层从可验证的结果来源和实际会话轮数计算。图保持 Graphology 快照，不新增图数据库。

## Project Structure / Affected Files

`cli/src/deep/session-db.ts`、`session-migrate.ts`、`session.ts`、`session-store*.ts`、`coverage.ts`、`search-strategy.ts`、`iteration-data.ts`、`runCli.ts`、结果导入、相关 CLI/SQLite/策略测试、README、CHANGELOG、项目 skill；补查所有调用方。

## Interfaces, Data Flow, and Contracts

- 每次搜索调用按一个会话轮分组；按用户决定只记录已成功完成的查询（包含零结果），批量中后项失败不抹除前项。实际调用发生前跳过的查询不记录。
- 在同一个会话 SQLite 中增加查询执行记录，按记录存储而非为每个查询或结果创建数据库/表；采用事务保护分配轮次与写入，避免并发重复。搜索结果入库须引用同一已分配轮，不得重复递增；提交失败明确报错而非声称保存成功。
- 旧会话迁移保留所有现存数据；新历史与已有结果 origins 的查询合并去重用于冗余判断。明确区分这类推导历史与实际新执行记录，不声称旧零结果可恢复。用户已授权此旧数据读取兼容处理。
- 新抽取来源对既有结果使用原始最早合法发现轮；新发现的外部正文及缺少轮次的导入须按现有语义处理，不伪造搜索来源。
- 同一实体的所有当前有效来源中取最早发现轮；最终增长计算使用最近两个实际连续轮并把空桶计 0，结果图和会话轮数来源须在 strategy-info、suggest-queries、session-report、警告建议等入口保持一致。
- 保持 SQLite 唯一写入源，事务失败回滚；未记录的历史不臆造。保留可读取旧 schema 和旧 JSON 会话的现有迁移能力。

## Invariants and Compatibility

同一会话内成功查询不可因后续查询或失败丢失；已存在的历史数据和来源不静默修改。旧结果中可观察来源可复用，但无法补出未记录的查询；旧数据中的错误轮不自动修复。新旧程序同时写同一会话不受支持。

## Validation and Error Semantics

覆盖同时两个进程成功搜索、重复查询、成功零结果、批次部分失败、查询调整/跳过、多结果来源、实体无有效来源、最后轮零增长及历史会话；验证独立策略入口输出与真实持久化。

## Code and Test Constraints

Node 24.15+，仓库现有内置 SQLite，不引入新依赖；先写失败测试，再修复，跑类型检查、定向/全量测试、构建和远端 CI。

## Design Decisions and Alternatives

查询是独立于结果和语义图的执行事实，单独按行保存在已有数据库；不将无界历史整体塞入 session_meta，也不把图快照当历史源。仅在关联确实存在时结合已有 result origins；不推断未记录事实。

## Open Questions

如实际并发或现有接口限制使上述事务边界无法成立，停下并报告，不降低已确认语义。

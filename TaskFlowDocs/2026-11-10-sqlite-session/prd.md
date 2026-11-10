# results.json 把三层存储混成一个文件
> Task version: v1
> Status: in_progress

## Goal

`results.json` 同时装着 `docs/agent_search_integrated_report_2026-10-27.md` 4.4 要求分开的三层：Search Cache（查询、候选摘要、后端状态）、Evidence Store（抓取快照、定位、哈希、出处）、Verified Knowledge（已审核且值得复用的结论）。报告要求三者各有不同的 TTL 与失效策略，混在一起就无法分别治理。现状后果可量化：`writeResults`（`cli/src/deep/session.ts:304`）每次全量重写整个文件，抽取正文后正文占比超过 90%，一个 200 条结果的会话就是数 MB；而 `loadSessionResults` 在 20 多处被调用，其中 `loadSessionGraph`、`mutateSessionGraph`、`mutateSessionState`、`approveResults` 每次还会附带跑一遍有副作用的 `repairInvalidDependents`。结论是**分层**而不是分片——分片只是手段，报告 4.4 要的是三层各自的生命周期。

## Task Kind

- Kind: capability

## Background / Confirmed Facts

- 结果、图、元数据与四份 claims 状态分别存文件；单文件原子替换不能保证跨文件事务。审批与图注入、证据核验各跨越多个写入。
- 会话列表及图命令存在直接读取 JSON 的路径；本机 Node 24.15 与其 SQLite 3.51.3 已验证内存回滚和外键约束。
- 历史 SQLite 设计稿是本地未跟踪资料，仅供参考；以本次用户确认的行为为准。

## Requirements

1. 使用 Node >=24.15 和内置 `node:sqlite`，同步包声明、类型、CI 和文档。
2. 每个会话一个数据库，分开建模搜索缓存、正文快照/证据、审核知识及图和元数据；同一事务覆盖审批+图、证据核验与相关失效处理。
3. 已有 JSON 会话首次访问（包括只读访问）自动迁移；源文件原路径原字节保留，迁移后数据库是唯一写入源。迁移失败或中断不损坏源数据，可安全重试或返回结构化错误。
4. 不存在会话的只读访问不创建目录；保持现有 CLI 输出和 Agent 输入契约，独立图文件行为单独处理。
5. 验证多进程首次迁移与写入、强制中断恢复、旧文件损坏、数据库错误与文件系统失败；不得将错误静默视作空数据。

## Acceptance Criteria

- 旧会话的结果、origin、轮次、正文、图和四类 claims 数据经真实 CLI 自动迁移，身份及关联保留，旧文件字节不变，后续仅写数据库。
- 测试证明跨状态写入全部提交或全部回滚；并发操作无丢失，进程中止后可恢复或明确报错。
- 不存在会话只读不创建；各命令、版本声明、文档、最低 Node 版本测试及完整回归通过。

## External Facts

- Depends on external facts: yes
- Source: https://nodejs.org/download/release/v24.15.0/docs/api/sqlite.html
- What it settled: 24.15 的 SQLite 为 release candidate，提供事务和备份接口。
- Source: https://www.sqlite.org/wal.html
- What it settled: WAL 同一时刻一个写者、不支持跨机器网络文件系统；3.51.3 修复 WAL-reset 缺陷。
- Source: https://www.sqlite.org/pragma.html#pragma_synchronous
- What it settled: WAL + FULL 比 NORMAL 对掉电后的提交持久性更强。

## In Scope

会话存储、自动迁移、现有读写入口、Node 基线、CI、回归测试和文档。

## Out of Scope

Orama 文档索引迁移、自动删除旧 JSON、跨会话关系、其他证据定位格式、自动 TTL 策略、发版。

## Risks / Deferred Items

内置模块为 release candidate；同步 API 可能增加延迟；WAL 不适用于跨机器网络共享。迁移后旧程序仍能写旧 JSON，新旧版本并发访问同一会话不受支持，必须在文档说明。

## Open Questions

设计细节见 Spec；网络文件系统的检测能力需验证，无法保障安全时须明确限制。

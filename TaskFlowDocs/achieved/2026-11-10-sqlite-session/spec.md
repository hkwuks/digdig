# Spec — results.json 把三层存储混成一个文件
> Task version: v1

## Objective and Success Criteria

单会话单数据库，分领域存储，并以事务保护跨领域写入；首次访问旧会话安全迁移。

## Architecture Boundaries and Responsibilities

顺序：运行时基线 → 数据库与迁移 → 搜索/正文/证据 → 图与审批 → claim/evidence/review 事务 → 全部入口与验证。存储层负责 schema、连接、事务及错误；业务层负责身份、修订和图规则。最终必须切换所有写入口。

推荐表：session_meta；results、origins；body_snapshots；claims、evidences、verdicts、verdict_evidence、reviews；graph_snapshot。三层使用独立表和读写边界；不凭空设定 TTL。保留 Graphology 算法和图快照，不宣称节点级外键约束。受控 JSON 字段承载扩展属性，逐项核对旧字段避免丢失。

## Project Structure / Affected Files

`cli/src/deep/session.ts`、`claims/store.ts`、`commands/session.ts`、`graph-obfuscate.ts`、`query-graph.ts`、claim/evidence/review 命令、`runCli.ts`、`entry.ts` 和对应测试；按需新增存储与迁移模块。同步 package/lock、CI、README 和项目内 skill。

## Interfaces, Data Flow, and Contracts

- 会话不存在且只读时不建目录；写入新会话建库。已有 JSON 会话先获得与旧实现兼容的会话排他锁，校验所有源文件，再用数据库事务完整导入、验证并写完成标记后提交。
- 并发首次访问者在锁内重新检查完成标记；空数据库或中断残留不是迁移成功。失败不修改源 JSON，重新打开安全重试或给出明确错误。
- 成功标记存在后，数据库为唯一写入源；不能因为读库失败回落到旧 JSON。审批+图、证据+verdict+claim+review、相关失效修复分别在单一事务内完成。
- 会话版 graph-obfuscate 走数据库事务；独立 graph 文件仍为独立输入，用原子替换写出。会话列表访问旧会话允许触发迁移。

## Invariants and Compatibility

事务提交前异常或中止不能留下部分逻辑结果；读库损坏必须报错。保留全部旧 JSON 字节，禁止新旧版本并发操作同一会话，不做双写。保留 ID、revision、来源、轮次、正文、hash、claims 和图结构；不补造不存在的事实。记录 schema 版本，未知版本拒绝写入。

## Validation and Error Semantics

连接启用外键；同机本地文件候选 WAL + synchronous FULL。SQLite 官方说明 WAL 不支持跨机器网络文件系统，需验证可检测性或明确受支持边界。锁竞争返回结构化错误。真实 CLI 与真实磁盘上测试并发迁移、并发写入、进程中断、源文件损坏、部分迁移、数据库损坏、锁超时及 I/O 故障；全程使用隔离测试数据。

## Code and Test Constraints

Node >=24.15、内置 `node:sqlite`、TypeScript、Vitest、Graphology；不得新增兼容代码或双写。先写失败测试；执行 `npx.cmd tsc --noEmit`、`npm.cmd test -- --maxWorkers=2` 和 Node 最低版本及 LTS 的 CI。

## Design Decisions and Alternatives

只迁图无法提供审批跨状态事务；将图快照放在同库可重用算法，但仍整体序列化，大图性能需测量。按领域分表并分别管理生命周期；不添加未验证的过期规则。独立文件仍支持其现有格式。

## Open Questions

最终字段映射、网络文件系统安全边界和异常恢复方案需经原型验证；若不能实现已批准行为，停止并调整方案。

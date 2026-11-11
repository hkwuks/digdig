# Spec — SessionResult 没有 snapshot 概念，证据定位无法在重抽取后重新对齐
> Task version: v1

## Objective and Success Criteria

分离正文版本、采信、定位、审核和图确认状态，正文变化后保持可追溯和安全重确认。

## Architecture Boundaries and Responsibilities

存储层负责 schema 迁移、正文及引用和事务；领域层负责准确定位与资格；CLI 向 Agent 展示待处理数据并提供确认入口。新旧证据位置及历史审核必须可审计。

## Project Structure / Affected Files

`cli/src/deep/session-{db,migrate,store-results,store-claims}.ts`、`session.ts`、图模型与读取；`claims/{types,store,deterministic-checks,policy}.ts`；证据、审核、graph-add、导航和图输出命令、调用方；对应测试、README、`skills/digdig`。实施前搜索全部消费者补齐范围。

## Interfaces, Data Flow, and Contracts

- 快照按结果与完整正文确定；同正文复用，抽取器与时间另存。hash 相同仍核对正文，旧证据的快照和偏移不可覆盖丢失。
- 准确重定位按实际原文、UTF-16 偏移与片段 SHA-256 验证；零次或多次匹配不自动定位；已 invalid 的旧证据不因迁移自动恢复。
- 正文变化：结果待采信，旧证据待定位；唯一匹配可记录新位置，但新正文未采信时不能参与审核。旧审核保留并标为非当前，重新审核才产生当前审核。
- 图按来源和对应正文版本记录确认状态，变化来源待重新确认；仍有其他有效来源时不误伤。无有效支持的实体、关系及路径不可在导航、采样、导出或聚合作为有效事实；可显式查看和重新确认。正文重新采信不自动确认语义事实。
- SQLite v1 到新版本在一个事务内升级；只为实际存在的当前正文建快照。旧证据的结果、偏移、引用和哈希全部匹配时可记录其当前锚点，标明历史快照未知，不能宣称这证明了原始完整正文；其他保留并待核对。旧 JSON 同样安全迁移；未知 schema 拒绝打开。
- 仅有 graph.json 的旧会话，标准会话目录内直接传文件路径时识别为会话；其他位置传入目录识别为会话，传文件路径按独立图处理。

## Invariants and Compatibility

每次跨领域变更原子提交；进程中断可重试。稳定保留结果、证据及关联 ID，保持现有 revision 乐观并发；未知历史不推断。新旧版本并发使用同一会话不受支持，公开状态变化须文档化。

## Validation and Error Semantics

验证原文、偏移、哈希，拒绝把无或多次匹配当成唯一；提供待核对原因。测试 UTF-16、surrogate pair、重叠匹配、失效旧证据、真实 v1 和旧 JSON、故障回滚、重复及并发。所有图消费者不得绕过有效性判断。

## Code and Test Constraints

Node >=24.15、内置 SQLite，不新增依赖。测试真实 CLI 和持久化结果；定向测试、类型检查、全量测试、构建与 CI。

## Design Decisions and Alternatives

按不同正文建快照而非每次抽取；使用精确匹配而非语义相似；图按来源确认而非误伤全部来源；审核保存历史。未引用正文清理不在本次范围。

## Open Questions

实现前细化 schema 与 Agent 重新确认接口，必须符合审计和待确认隔离契约。

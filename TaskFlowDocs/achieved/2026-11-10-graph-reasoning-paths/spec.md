# Spec — D10 — path 节点无生产路径，graph-traverse 恒失败
> Task version: v2

## Objective and Success Criteria

让已有路径提取能力成为可用生产链路，并保证异常路径可诊断。

## Architecture Boundaries and Responsibilities

graph-add 在会话锁内更新实体和语义边，路径提取只依赖该图；graph-traverse 检查路径并将可诊断错误映射为 JSON envelope。

## Project Structure / Affected Files

`cli/src/commands/graph-add.ts`、`cli/src/deep/path-extraction.ts`、`cli/src/deep/graph-explore.ts`、`cli/src/commands/graph-traverse.ts`、对应单元和集成测试。

## Interfaces, Data Flow, and Contracts

graph-add 验证来源 → 持锁写语义节点/边 → 计算可产生的路径并持久化；graph-traverse 加载并验证路径引用 → 输出结果或结构化错误和恢复提示。

每次生成最多持久化 1000 条候选路径，并限制搜索步骤为 20000；触碰任一限制而提前结束时，graph-add 返回 `pathsTruncated: true`。已有路径参与去重，重复写入保持原 ID。

## Invariants and Compatibility

同一语义结构的重复提交不产生重复路径；合法旧路径保持可读；不修改现有实体和证据来源；不将非法节点插入图。

## Validation and Error Semantics

真实命令链测试生成、重载、遍历、重复 graph-add；单元及命令级测试手工构造引用缺失实体的旧路径，验证错误 code、hint 和退出码。

## Code and Test Constraints

沿用会话锁及已有路径 ID 约定，考察生成算法规模和现有节点失效清理，不新增依赖。

## Design Decisions and Alternatives

用户选择在 graph-add 写入后生成，而不是读取时临时计算或新增子命令。具体去重需保留可用路径的可发现性和稳定 ID。

本机稠密图探测：10 个两两相连实体可生成 75960 条路径，约 1.7 秒。用户同意限制生成并报告截断；1000 条和 20000 步是初始固定安全上限，不新增配置。

## Open Questions

关系或路径实体失效后的重算边界、图规模影响须由实现前的测试与现有代码进一步验证。

# Spec — P7 — 只读命令对不存在的会话名创建目录
> Task version: v1

## Objective and Success Criteria

在只读命令加载图和获取锁之前识别空会话；错误和退出码对齐 coverage。

## Architecture Boundaries and Responsibilities

命令入口负责确定是否存在可报告结果；session 存储负责读取和有锁修复；不要以改变锁的创建语义影响其他调用者。

## Project Structure / Affected Files

`cli/src/runCli.ts`、必要的共享空会话处理位置、对应 CLI 集成测试；覆盖 graph-preprocess、session-report、suggest-queries、--quality。

## Interfaces, Data Flow, and Contracts

路径解析 → 只读加载结果 → 空结果则统一 EMPTY_SESSION，不调用会创建锁目录的图加载；非空时沿现有路径处理。

## Invariants and Compatibility

现有会话命令格式、结果、写操作和 session 锁契约不改变；报告错误而非静默创建不存在会话。

## Validation and Error Semantics

对不存在会话逐命令断言 JSON 错误、退出码 1 及目录不存在；对已有空会话与有效会话分别验证。覆盖 --quality 的批准和跳过选项。

## Code and Test Constraints

使用真实 CLI 调用及隔离 session 根目录；验证前后文件和目录状态，不依赖网络。

## Design Decisions and Alternatives

优先在命令边界做 coverage 风格检查，避免改变所有 `loadSessionGraph` 调用者的行为；实现前需确认特殊名字解析和读写混合选项。

## Open Questions

无；遇到与 coverage 契约不一致的已有用户场景须先记录并判断是否需要调整范围。

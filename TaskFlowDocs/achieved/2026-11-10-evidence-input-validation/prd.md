# C13 — 若干 CLI 参数未校验就原样存储
> Task version: v1
> Status: completed

## Goal

若干参数未校验就原样存储：evidence.ts:159 的 --stance 任意字符串入库（--stance bogus 也 exit 0）；evidence.ts:101 非字符串 contentHash 被丢弃而非拒绝；--confidence abc 得 NaN 被静默省略；results-add.ts:49 的 --kind 非 search 一律按 extracted 处理

## Task Kind

- Kind: defect

## Background / Confirmed Facts

`evidence-verify` 的 stance 未做运行时校验，非字符串 contentHash 被忽略；CLI 使用 parseFloat，可将非法前缀解析为有效数字。`results-add` 将 search 以外的 kind 当作 extracted。两个命令在输入校验前初始化会话。

## Requirements

- 仅接受 support、refute、insufficient 三种 stance；confidence 可省略，提供时必须是完整、有限的 0–1 数值。
- 仅接受 search、extracted 两种 kind；提供 contentHash 时必须是字符串。
- 对上述无效输入返回结构化错误、非零状态，并在验证前不修改会话文件；有效输入保持原有行为。

## Acceptance Criteria

- CLI 和直接命令调用覆盖各错误及 0、1 等合法边界，断言错误 envelope、状态及会话文件不变。
- 正常 evidence-verify 和两种 results-add 保持可用；类型检查与相关测试通过。

## External Facts

- Depends on external facts: no
- Why not: 用户确认行为；合法值和范围见 `cli/src/claims/types.ts` 和 `cli/src/runCli.ts` 的命令帮助。

## In Scope

四类参数的输入校验、调用链、回归测试及必要的命令说明。

## Out of Scope

其他命令的初始化写入问题 C12、会话存储迁移和历史数据清洗。

## Risks / Deferred Items

严格拒绝此前静默接受的输入；已有合法数据无需迁移。

## Open Questions

无；用户已确认拒绝无效输入、confidence 为 0–1。

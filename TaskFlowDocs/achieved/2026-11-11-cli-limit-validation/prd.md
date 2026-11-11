# PRD — 搜索数量参数修复
> Task version: v1
> Status: completed

## Goal

修复 P2 和 P5：graph-search 的数量参数生效；搜索数量非法时在执行搜索或写会话之前明确报错。

## Task Kind

- Kind: defect

## Background / Confirmed Facts

Commander 复现：`graph-search s -l 2` 时根命令得到 2，子命令仍为默认 10。根命令使用 parseInt，`abc`、负数等未受有效校验。

## Requirements

- graph-search 的 `-l` 和 `--limit` 使用用户实际指定的数量，未指定维持默认 10。
- 搜索数量须为严格的正安全整数；非法输入非零退出并解释原因，不执行网络搜索或写会话。
- 保持正常搜索、输出格式和参数默认值。

## Acceptance Criteria

- 短/长参数及位置（子命令前后）均通过真实 CLI 测试；实际图结果数量受限。
- 字母、负数、0、小数、混合数字字符串和超安全整数均被拒绝；有效输入正常。
- 通过定向测试、完整测试、类型检查、CI，提交 PR。

## External Facts

- Depends on external facts: no
- Why not: Commander 的锁定版本见 `cli/package-lock.json`，参数解析和调用路径在 `cli/src/runCli.ts`，可在本仓库直接复现。

## In Scope

P2、P5 的数量参数归属与验证、测试和说明。

## Out of Scope

其他数值参数、图采样、搜索引擎配置和本地文档搜索。

## Risks / Deferred Items

收紧非法输入会改变此前静默接受无效值的行为。

## Open Questions

无；错误协议沿用已有 CLI 约定。

# P10 — extract 全部失败仍 exit 0
> Task version: v1
> Status: completed

## Goal

extract 全部失败仍 exit 0：dg extract --urls <死链> 返回 status:ok、success:0/failed:1、退出码 0，Agent 据退出码会误判成功。全部失败时应非零退出

## Task Kind

- Kind: defect

## Background / Confirmed Facts

`runExtract` 记录每项失败后仍无条件构造成功 envelope 并返回 0。Jina 限流有单独错误分支。当前生产代码在批量混合成功和限流时也会整体返回限流错误。

## Requirements

- 有输入但全部抽取失败时返回非零及结构化错误，保留失败 URL、统计和 session 写入结果。
- 用户确认：至少一条成功时返回成功并报告失败列表，包括混合限流；不得丢失限流的重试时间。
- 无 URL 的既有处理、全部限流的 `JINA_RATE_LIMITED` 及成功结果去重保持明确且可验证。

## Acceptance Criteria

- 全失败、全成功、部分成功和含限流的混合批次，分别验证退出码、envelope、URL、统计及会话状态。
- 所有限流时保留现有错误码及重试信息；返回结果不隐藏已成功抽取的内容。

## External Facts

- Depends on external facts: no
- Why not: 当前行为与输出由 `cli/src/commands/extract.ts` 和 `cli/src/protocol.ts` 定义。

## In Scope

抽取命令的批量结果判定、错误输出、限流信息和测试；必要时更新项目内调用文档。

## Out of Scope

更换抽取引擎、改变失败预算或实现抽取插件。

## Risks / Deferred Items

重复 URL、抽取器返回空响应和部分成功夹带限流必须避免被当成全部失败或丢掉成功内容。

## Open Questions

用户已选择部分成功返回成功并报告失败。

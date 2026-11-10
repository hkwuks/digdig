# D7 Jina 限流消耗失败预算

> Task version: v1
> Status: completed

## Goal

带 retryAfterMs 的限流保留失败诊断但不增加失败计数；实际抽取失败保持原有次数上限。

## Task Kind

- Kind: defect

## Background / Confirmed Facts

本地限流未发送请求，但 recordExtractionOutcome 对所有失败递增 failureCount，第二次限流后结果退出待抽取列表。

## Requirements

- 带 retryAfterMs 的限流保留失败诊断但不增加失败计数；实际抽取失败保持原有次数上限。
- 不改变其他待办的行为。

## Acceptance Criteria

- 先红后绿，验证反复限流仍待重试、普通失败仍受预算限制。
- 类型检查通过；全量测试的失败与基线比较并记录。

## External Facts

- Depends on external facts: no
- Why not: 行为与测试均由 `cli/src/deep/session.ts` 和 `cli/test/unit/commands/extract.test.ts` 定义。

## In Scope

相关实现、回归测试及验证。

## Out of Scope

其他待办及全量测试中已复现的基线失败。

## Risks / Deferred Items

TaskFlow 初版草稿未按阶段调用能力，且代码在完整计划审核前已开始；如实记录，不将阶段门禁称为事前通过。

## Open Questions

无。

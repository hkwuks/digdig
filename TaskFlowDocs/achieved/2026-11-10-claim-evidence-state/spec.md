# Spec — C6 — 跳过最后来源使 claim 永久卡在 verifying
> Task version: v1

## Objective and Success Criteria

根据当前有效证据修复 claim 状态，保留审计记录并支持后续重新审核。

## Architecture Boundaries and Responsibilities

`repairInvalidDependents` 在会话锁内负责证据失效及 claim/review 一致性；`evidence-verify` 管理新增证据和 verdict；`policy-aggregate` 管理有效证据的审核。

## Project Structure / Affected Files

`cli/src/deep/session.ts`、必要时 `cli/src/commands/evidence.ts`；`cli/test/integration/session.test.ts` 和相关 claims 集成测试。

## Interfaces, Data Flow, and Contracts

来源跳过或正文变化 → 证据标记 invalid → 基于剩余有效证据更新 claim → 仅撤销失效前的 review；历史 verdict 保留且不能再由失效证据驱动聚合。

## Invariants and Compatibility

无有效证据为 pending；仍有有效证据时需要重新审核。历史数据格式和无关 claim 不变。相同修复重复执行不得撤销后续新 review。

## Validation and Error Semantics

测试唯一来源、多个来源、失效后重新验证及重复读取；检查 review 和 audit 记录。损坏存储仍按原约定保留。

## Code and Test Constraints

沿用已有 session 锁及 store API；不得用测试替身掩盖实际状态写入。

## Design Decisions and Alternatives

用户选择 pending 而非无有效证据时继续 verifying。需在测试中证明如何区分待修复的旧 review 和失效后新 review，再决定具体实现。

## Open Questions

旧数据缺失 invalidatedAt 时的恢复策略由现有存储实际形态和测试决定，不凭空伪造时间。

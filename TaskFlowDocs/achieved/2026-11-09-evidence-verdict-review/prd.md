# 证据判断与审核一致性
> Task version: v1
> Status: completed

## Task Kind
- Kind: defect

## 目标与验收
同一证据的新 stance、reason、confidence 更新原 verdict；新增或改变 verdict 后若不立即汇总，清除该 claim 旧 review 并置 verifying；complete 时重新聚合。相同重试维持幂等。

## External Facts
- Depends on external facts: no
- Why not: 语义由 `cli/src/commands/evidence.ts` 和用户确认决定。

# 收敛融合排序的分数与位次：单 ranking 时不写 fusionScore，rank
> Task version: v1
> Status: completed

## Goal

让排序的产物只有一个归属：`rank` 只在 `fuse.ts` 里按最终顺序赋一次，`fusionScore` 只在真的融合过时出现，provider 端不再做一遍融合处已经做过的过滤去重。

## Task Kind

- Kind: capability

## Background / Confirmed Facts

### 触发点

1. 一次单 provider 搜索的结果里，`fusionScore` 是 `0.01639344262295082`、`0.016129032258064516`、`0.015873015873015872` —— 依次为 `1/61`、`1/62`、`1/63`。
2. `deep/rrf.ts:17` 的 `score = 1 / (k + i + 1)`（`k=60`，`i` 为数组下标）。单 ranking 时它就是位置的双射变换，不含第二个意见。
3. 同一次输出里三条结果都没有 `Rank:` 行，而 `service.ts:246` 无条件赋值 `rank`。两者矛盾，说明 `rank` 的来源不唯一。

### 历史设计（本仓库自己的文档，非外部事实）

4. `TaskFlowDocs/achieved/2026-11-02-result-explainability/prd.md` 的 R4 明确要求「现有 `fusionScore` 保留（它是排序依据），新增字段是附加的」，Out of Scope 同时排除「改 RRF 算法本身」。所以本轮不删该字段、不改算法，只决定它在什么情形下不该出现。
5. `TaskFlowDocs/achieved/2026-10-28-result-identity-pipeline/spec.md:134` 记过 `rank` 的同一问题：「`rank` 从不因融合而重算。结果是一条 session 记录的 `rank` 可能仍是 provider 的原始位次，而它的 `fusionScore` 是 RRF 分 —— 两个字段描述不同的顺序。」该节计划「在写库前统一设定 `rank`」，但未落到代码。
6. 同 spec `:109` 说明了融合处的去重设计：「同一个 id 出现在多份 ranking 中会被累加 —— 跨 provider 去重由此自然完成，不需要额外的合并策略。」
7. 同 task 的 PRD `:93` 把「provider 端是否补过滤/去重」列为 Out of Scope，理由是「R3 在合并处统一处理，不在三个 provider 里各写一遍」。
8. `numberOfResults` 在全仓只有写、没有读：输出层用的是 `totalResults`（`fusion.fused.length`）与 `returnedResults`（`fusion.display.length`），见 `runCli.ts:822,843`。它不影响任何输出。

### 实现现状

9. `service.ts:243-246` 曾做 `filterEmptyResults` + `dedupe`，并在此结果上赋 `rank: index + 1`。
10. `fuse.ts:96` 的 `sanitize()` 对每份 provider 响应再做一次同样的过滤去重，因此 `service.ts` 那次是纯重复。
11. `runCli.ts:793` 在有会话时用 `rank: index + 1` 覆盖一次。

## Requirements

- R1 — `fusionScore` 仅在存在多于一份 ranking 时写入；单 ranking 时不出现。
- R2 — `rank` 全流程只在一个地方赋值，且反映调用者实际看到的顺序。
- R3 — 删除 `service.ts` 的过滤去重，行为由 `fuse.ts` 独家承担。
- R4 — 不删 `fusionScore` 字段本身，不改 `rrf.ts`（对齐事实 4）。
- R5 — `numberOfResults` 不动（对齐事实 8：它不影响输出，删除属于独立的清理）。
- R6 — 文档说明单 provider 时该读 `score` 与 `rank`，而不是 `fusionScore`。

## Acceptance Criteria

- A1 — `npx tsc --noEmit` 为 0；全量测试通过。
- A2 — 单 ranking 时每条结果的 `fusionScore` 为 `undefined`，`rank` 连续。
- A3 — 多 ranking 时 `fusionScore` 为数字且 `rank` 连续。
- A4 — `rank` 按已显示集合编号（`--limit` 截断后仍是 1..N）。
- A5 — 删掉 `service.ts` 的过滤后，含空标题、空正文、尾斜杠重复的输入仍被 `fuse.ts` 挡掉。
- A6 — `SKILL.md` 与两份 README 讲清三个字段各自何时可信。
- A7 — 既有测试全部继续通过。

## External Facts

- Depends on external facts: no
- Why not: 全部结论来自本仓库的代码与历史任务文档；`rrf` 是本地实现，无需外部契约。

## In Scope

- `cli/src/deep/fuse.ts`、`cli/src/runCli.ts`、`cli/src/service.ts`。
- `cli/test/unit/deep/fuse.test.ts`。
- `skills/digdig/SKILL.md`、`README.md`、`README.zh-CN.md`。

## Out of Scope

- 删除 `fusionScore` 字段或改 RRF 算法（R4）。
- 清理 `numberOfResults` 死字段（R5）：要动 6 个 provider 与数十处测试 mock，与本任务的排序议题无关。
- 修改 `graph.ts` 的 `rank` fallback（`graph.ts:172`）：它只在图由非流水线路径构建时生效。

## Risks / Deferred Items

- `rank` 收口后，任何依赖 `service.ts` 提供原始名次的调用方会看到融合位次。实测全仓无此依赖（`rank` 只在 `fuse.ts` 与 `graph.ts` 被消费）。
- 单 ranking 时 `fusionScore` 缺席会改变 JSON 形状。它是可选字段，且 R4 的历史要求是「保留字段」而非「总是出现」。

## Open Questions

无。用户已确认三件事全做，并确认 `rank` 因 JSON 消费者需要位置信号而保留。

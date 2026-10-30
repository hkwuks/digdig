# Spec — 质量层退场：CLI 只报可数事实，好坏交给 LLM

> Task version: v1
> Status: checking

## Objective and Success Criteria

质量判断层从 `cli/src/deep/` 完全移除。剩下的 `--quality` 是一个**待审批清单 + 计数事实现场**，`coverage` 是**历史事实**。两者不重叠，都不给结论。落地的判据是 PRD 的 AC1–AC10。

## Architecture Boundaries and Responsibilities

三层职责，本任务只改第一层的边界，不动后两层：

| 层 | 职责 | 本任务 |
| --- | --- | --- |
| 事实层 | `coverage.ts`、`session.ts` 的身份/状态函数、`dedupe.ts` 的 `resultUrlKey` | 保留，补 `sourceKey` |
| 判断层 | `quality-assess.ts`、`recovery-analysis.ts`、`query-suggest.qualityLastRound` | **删除** |
| 决策层 | LLM 读输出后自己决定 | 不涉及代码，只改文档 |

删除判断层后，`deep/` 里不再有任何函数返回"好/不好"。这是一条可以 grep 检查的性质：`verdict` 只应该出现在 `claims/`。

### 为什么删掉而不是修好

判断层的问题不是某个指标算错了，而是**它在原理上算不出来**。`coverage.ts` 的头注释已经论证过同一件事：word-bag 聚类无法把同一方面的两种说法归到一起（实测同方面 cosine 0.102、跨方面 0.012，没有任何一对过 0.3 阈值），embedding 对 CLI 太重。质量判断比 coverage 更难，因为它还要回答"够不够"，而够不够取决于用户问的是什么——这个信息 CLI 根本没有。所以修指标只是把错的数字换成另一个错的数字。

### 调研依据：为什么判断不该由 CLI 做

- **上下文预算**：Microsoft D365 的实测——只保留最近 5 次工具调用结果，准确率 79.0% vs 基线 71.0%，token 减少 63.9%；叠加摘要后升到 91.6%。也就是说，把原始事实压缩交给下游判断，比在工具层预先下结论更有效。
- **子代理汇报惯例**：Anthropic 的多代理实践中，子代理向主代理汇报的是 1,000–2,000 token 的压缩摘要，而不是结论标签。CLI 在这里的角色等价于子代理：交事实。
- **门槛与判断的分界**：`soothe-nano` 的 `LoopTerminationChecker` 保留了门槛型阈值（`min_results`、`min_source_diversity`），但那是**循环终止条件**，不是质量评价。本任务保留同类门槛（`hasVerifiedContent`、待审批计数），删除评价型阈值。

## Project Structure / Affected Files

### 删除

```
cli/src/deep/quality-assess.ts        198 行
cli/src/deep/recovery-analysis.ts     256 行
cli/test/calibrate-thresholds.ts      ~200 行
cli/test/unit/deep/quality-assess.test.ts
cli/test/unit/deep/recovery-analysis.test.ts
```

### 新增

`cli/src/deep/dedupe.ts` 内新增 `sourceKey`：

```ts
/**
 * The source a result came from, for counting distinct sources.
 *
 * Distinct from `resultUrlKey`, which identifies the result itself. A
 * `file:` URL has no host, and returning `''` for it — as the four
 * hand-rolled copies of this logic variously did — made a pure local
 * session report zero sources. A local document's source is its path.
 */
export function sourceKey(url: string): string | undefined {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'file:') return parsed.pathname || undefined;
        return parsed.hostname.replace(/^www\./, '').toLowerCase() || undefined;
    } catch {
        return undefined;
    }
}
```

`cli/src/deep/pending-facts.ts`（新文件，约 60 行）：

```ts
export interface PendingFact {
    id: string;
    revision: number;
    title?: string;
    url: string;
    source: string;
    /** `undefined` for a local document with no host. */
    domain?: string;
    contentLength: number;
    extracted: boolean;
    verified: boolean;
    /** First round that saw it; `undefined` on a session predating round tracking. */
    round?: number;
}

export interface PendingReport {
    total: number;
    extracted: number;
    unextracted: number;
    sources: number;
    sourceList: string[];
    pending: PendingFact[];
}
```

### 重写

`cli/src/deep/coverage.ts`：`domainFactsOf` 改为调用 `sourceKey`；`domainsSeen` 保留（它已经是来源计数的唯一实现）。

`cli/src/deep/query-suggest.ts`：删掉 `qualityLastRound` 字段与参数；`extractDomain` 改为调用 `sourceKey`。

`cli/src/deep/iteration-data.ts`：`SessionAnalysis` 从 4 个字段减到 3 个（`strategy` / `suggestions` / `pending`），删掉 `quality` 与 `recovery`。

## Interfaces, Data Flow, and Contracts

### `dg --quality` 契约

两种调用，一个数据流：

```
loadSessionResults(sessionDir)
  ├─ getPendingResults()  → 逐条事实（pending[]）
  └─ 全量 results           → 汇总计数（total / extracted / unextracted / sources）
                              ↓
                     PendingReport
                              ↓
        ┌─────────────────────┴─────────────────────┐
   --approve-file 分支                         无待审批分支
   （行为不变，只换 payload）                  （报全量计数）
```

JSON 输出：

```json
{
  "ok": true,
  "data": {
    "total": 10,
    "extracted": 3,
    "unextracted": 7,
    "sources": 4,
    "sourceList": ["arxiv.org", "github.com", "..."],
    "pending": [
      { "id": "r:...", "revision": 2, "title": "...", "url": "...",
        "source": "digdig", "domain": "arxiv.org",
        "contentLength": 4821, "extracted": true,
        "verified": true, "round": 2 }
    ],
    "hint": "Agent reviews content and approves with the id/revision objects returned here."
  }
}
```

`--approve-file` 成功时 payload 里的 `quality` 字段更名为 `facts`，同上形状（`pending` 换成 `selected`，逐条同样的字段）。错误信封里 `details.quality` 同样改为 `details.facts`。

### `dg coverage` 契约（不变）

`CoverageReport` 已经是纯事实，本任务只改 `domainFactsOf` 的内部实现与 `file://` 的计入方式，字段名与形状不动。

### 两个命令的边界

| 问题 | 命令 | 数据来源 |
| --- | --- | --- |
| 这一批待审批的有多厚？ | `--quality` | 当前 pending + 全局计数 |
| 整个 session 已经翻过哪些？ | `coverage` | 全部结果按轮次分组 |

不重叠的判据：`--quality` 不带 `byRound` / `repeated` / `distinctiveTerms`；`coverage` 不带 `pending`。

## Invariants and Compatibility

- **不写兼容代码**（用户明确规定）。删掉的字段不保留别名、不读旧配置、不做 fallback。
- **旧 session 必须能读**。`firstRound()` 在 `origins` 缺失时返回 `undefined`，`PendingFact.round` 因此为 `undefined`，JSON 序列化时省略该键。这不是兼容层，而是"这个事实不存在"的诚实表达。
- **`hasVerifiedContent` 是唯一门槛**，位置不变（`session.ts:328`，`approveResults` 内），本任务不动它。
- **`resultUrlKey` 不动**。它是身份，`sourceKey` 是来源，两者用途不相交。

## Validation and Error Semantics

错误码变化：

| 变化 | 说明 |
| --- | --- |
| 删除 `INVALID_THRESHOLD_OVERRIDE` | `--threshold-override` 一并删除，没有可校验的对象 |
| 保留 `RESULT_NOT_VERIFIED` / `RESULT_NOT_FOUND` / `RESULT_REVISION_CONFLICT` / `RESULT_SKIPPED` | 全部来自 `approveResults`，不受影响 |

`EMPTY_SESSION` 在 `coverage` 上保留。`--quality` 对空 session 不报错——它给全零计数，因为"这个 session 还什么都没有"本身就是一个有用的事实。

## Code and Test Constraints

- 测试框架 vitest，`include: ['test/**/*.test.ts', 'test/**/*.bench.ts']`。删掉 `calibrate-thresholds.ts` 后这个 include 才名副其实。
- 每个 Step 的 focused verification 用 `npx vitest run <file>`。
- 全量门槛：`npx tsc --noEmit` = 0，`npx vitest run` 全绿（基线 38 files / 541 tests）。
- 不新增依赖。
- 代码风格跟随既有文件：中文注释用于解释"为什么"，英文用于 API 文档注释；测试用 `it('...')` 描述行为。

## Design Decisions and Alternatives

### D1 删除 `recovery-analysis` 而不是重写

**备选**：改成 `{ canStop, gap, suggestion }` 语义，缺口产 `no_new_results` / `too_few_results`。

**否决理由**：这些缺口来自每轮结果数与重复数，而 `coverage.byRound` 已经有 `newResults` 与 `repeatedFromEarlier`。重写等于把同一批数字换个命令名再输出一次，制造第二个事实源。LLM 读 `coverage` 看到"第 3 轮 0 条新增"，不需要 CLI 再说一遍"你该 reformulate"。

**代价**：`dg recovery-analysis` 这个命令名消失。用户已确认接受。

### D2 `contentDepth` 换成 `extracted / total` 而不是修分母

**备选**：把 `contentDepth` 分母改成全部结果。

**否决理由**：改完之后它是一个"平均正文长度"，仍然需要阈值才能解读，而阈值已经被证明与真实数据不符（5 of 7 真实 session 低于 150）。`extracted / total` 不需要阈值就能读懂：3/10 意味着还有 7 条只有 snippet。

### D3 保留 `sourceDiversity` 作为计数，不保留为指标

**备选**：整个删掉，只看 `coverage.domainsSeen`。

**否决理由**：`--quality` 关心的是"这批待审批的"，`coverage` 关心的是"整个 session"。两者的来源计数不同，各自的数字都有用。但 `--quality` 只报数字，不报"够不够 3 个"。

### D4 `session-report` 保留，改为 `coverage` + strategy 的聚合

**备选**：直接删除。

**否决理由**：它的 `strategy` 与 `topEntities` 部分不来自 `coverage`，删掉会丢信息。但它的 quality/recovery 部分改成指向 `coverage` 与 `--quality`，不再自己算。

### D5 四个 `extractDomain` 收拢成 `sourceKey`

`quality-assess.ts:58`（`file://` → `''`）、`coverage.ts` 内联（`file://` → skip）、`query-suggest.ts:56`（`file://` 当 hostname `file`）、`runCli.ts` 内联。四种行为三种语义，纯本地 session 在其中一个上恒为 0。收拢到 `dedupe.ts`（身份模块已经在用 URL），一个新的导出，四处共用。

### D6 旧 session 退化策略：不分轮，只给总计

实测 9 个真实 `results.json`，7 个没有 `origins`（`test/research-bench/` 与 `.digdig/` 下的历史数据），2 个是当前格式。`firstRound()` 返回 `undefined` 时，`PendingFact.round` 省略该键；`coverage.byRound` 只含当前格式能归轮的结果，`rounds` 字段仍读 `results.json` 的 `rounds` 计数。

这不是兼容层：它是"这条记录没有这个事实"的表达。不写迁移脚本、不补造 `origins`。

## Open Questions

无。

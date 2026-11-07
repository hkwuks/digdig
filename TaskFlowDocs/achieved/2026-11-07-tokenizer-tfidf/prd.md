# tokenize() 把含 CJK 的混合 token 整体当 CJK 分支处理，ASCII 部分被切成碎片且原词丢失
> Task version: v1
> Status: completed

## Goal

`cli/src/deep/tfidf.ts:27` 的 `if (CJK_RANGE.test(cleaned))` 判断的是 token **含有** CJK，不是**全部由** CJK 组成。于是任何混入汉字的 token 整体走 bigram 分支，其中的 ASCII 段被切成两字片段，原词不输出。

```
github中文社区  ->  ["gi","it","th","hu","ub","b中","中文","文社","社区"]
rust异步运行时   ->  ["ru","us","st","t异","异步","步运","运行","行时"]   ← rust 整个丢失
```

三个模块共用这个函数：`tfidf.ts` 的 `computeTfIdf`、`coverage.ts` 的 `distinctiveTermsOf`、`co-occurrence.ts` 的 `buildCoOccurrence` / `computeCrossResultFrequency`。所以这个缺陷同时污染 `dg graph-preprocess` 与 `dg coverage` 两个命令。

修完之后，移除 `graph-preprocess` 的 `tfidfTerms` 字段——它按 `tfSum × idf` 排序，修完 tokenizer 后仍然把 `the` 和 URL 残留排进前十，而且它的 `tfidf` 浮点分数没有可比基准，`SOP.md:159` 让 Agent「选 tfidf > 阈值的词」这件事做不到。

## Background / Confirmed Facts

均在本工作树实测。

**缺陷的触发条件**

`\w` 匹配 ASCII 字母数字下划线，`CJK_RANGE` 匹配汉字与 CJK 标点。去掉标点后，一个 token 只要同时含两者，`CJK_RANGE.test()` 就为真，整串进 bigram 分支：

```ts
// cli/src/deep/tfidf.ts:27-38
if (CJK_RANGE.test(cleaned)) {
    for (let i = 0; i < cleaned.length - 1; i++) {
        const bigram = cleaned.slice(i, i + 2);
        if (bigram.length === 2) tokens.push(bigram);
    }
    if (cleaned.length === 1) tokens.push(cleaned);
}
```

ASCII 段被逐字符推进的 bigram 覆盖，原词从未输出。同一分支还吞掉了 `async-std` 这类纯 ASCII 词的既有行为（该词走 else 分支，被 `-` 去掉后成为 `asyncstd`，行为正确）。

**真实会话实测**（`ds_1784791971087_gb9ood`，10 条有正文的结果）

| | 现有 tokenize | 按 ASCII/CJK 分段 |
|---|---|---|
| 不同词项 | 501 | 404 |
| 纯 ASCII 碎片（长度 ≤2） | **71** | **0** |
| 短词+低 df 噪声 | 74 | **11** |

碎片样本：`co on nt te ex xt hu ub cu ur ra gi it th ap`。

**coverage 也受影响**

在临时目录建了一个 3 轮中文会话（每轮 3 条，正文含 `github中文社区` / `epoll` / `取消令牌` 等），用真实 `buildCoverage` 跑：

```
总词项: 40
纯 ASCII 碎片(<=2): 4 -> ep ll ol po
CJK+ASCII 跨边界碎片: 1 -> 与e
干净中文 bigram: 34
```

`epoll` 被切成 `ep`/`ol`/`ll`/`po` 四个碎片，因为在本轮三条结果里都出现（`docFreq=3`），按 `coverage.ts:236` 的 docFreq 降序排在 `distinctiveTerms` 最前。

**修完之后 tfidfTerms 仍然不能用**

用同一真实会话，把 tokenizer 换成分段版本后重跑 `computeTfIdf`：

| 排名 | 现有 | 修好后 |
|---|---|---|
| 1–3 | `hu` `ub` `gi` | `github` `context` `hub` |
| 4 | `it` | **`the`** |
| 9 | `the` | `andrewyngcontexthub` |

`the` 是停用词，`andrewyngcontexthub` 是 URL 残留。要压掉它们就得引入停用词表与更多规则——这正是 `achieved/2026-10-30-quality-facts/prd.md:16-22` 确立的原则：CLI 不做需要语义判断的事。

**`tfidfTerms` 没有实质消费者（已核实）**

| 位置 | 用途 | 移除影响 |
|---|---|---|
| `runCli.ts:176-185` | 渲染 md 表格（20 行） | 删表格 |
| `graph-preprocess.ts:13,60` | 类型与赋值 | 同步删 |
| `graph-preprocess.test.ts:37,53,65` | 3 条断言 | 删 |
| `skills/digdig/references/SOP.md:159` | 「Select terms with tfidf > threshold」 | 改指替代字段 |
| `cli/docs/AGENT-USAGE.md:53,111` | 同样说法 | 同步改 |

`--auto-entities` 降级路径**从未实现**：全仓库 grep `auto-entities|autoEntities|auto_entities` 为零，`graph-preprocess` 只有 `--top` / `--co-occurrence-threshold` / `--max-terms` / `--format` 四个选项，`graph-add` 只接受显式 `entities`/`edges`。`cli/docs/prds/PRD-001-kg-auto-construction.md:77,116` 里的 `{term, score, frequency}` 契约与实现 `{term, tf, idf, tfidf, docFreq}` 早已不一致，是未同步的设计稿。

**`coverage.ts` 的 `distinctiveTerms` 不动**

它按 `achieved/2026-10-28-result-identity-pipeline/spec.md:214` 实现——跨轮排他（`byRoundCount.size !== 1`）+ 同轮内 ≥2 条共用（`count < 2`）——并有测试断言（`coverage.test.ts:85-121`）。它是独立通道，只要求共享的 tokenizer 正确。

## Requirements

1. `tokenize()` 对混合 token 按 **ASCII 段 / CJK 段** 分别处理：ASCII 段整体保留（长度 ≥3），CJK 段按字符 bigram 展开。纯 ASCII 与纯 CJK 的行为保持不变。
2. 补回归测试，断言 `github中文社区` 产出 `github` 且不含 `gi`/`it`/`th`，`rust异步运行时` 产出 `rust`。
3. 移除 `computeTfIdf`、`TfIdfResult`、`TfIdfOutput`，以及 `graph-preprocess` 的 `tfidfTerms` 字段（类型与赋值）。
4. 移除 `runCli.ts` 的 TF-IDF 表格渲染。
5. 移除 `graph-preprocess.test.ts` 中三条 `tfidfTerms` 断言；`tokenizationStrategy` 字段若仅由 `computeTfIdf` 产出，一并移除。
6. 更新 `SOP.md:159` 与 `AGENT-USAGE.md:53,111`，把「选 tfidf > 阈值的词」改为使用 `resultProvenance[].title` 与 `termFrequencies`。

## Acceptance Criteria

- `tokenize('github中文社区')` 含 `github`、`中文`、`社区`，不含 `gi`/`it`/`th`/`hu`/`ub`。
- `tokenize('rust异步运行时')` 含 `rust`、`异步`、`运行`，不含 `ru`/`us`/`st`。
- `tokenize('Tokio async-std')` 仍产出 `tokio`、`asyncstd`（纯 ASCII 行为不变）。
- 真实会话上 `dg graph-preprocess --format json` 的输出不含 `tfidfTerms` 键，且不含任何长度 ≤2 的纯 ASCII 词项。
- 3 轮中文会话上 `dg coverage --format json` 的 `distinctiveTerms` 含 `epoll`，不含 `ep`/`ol`/`ll`/`po`。
- `cd cli && npm run build && npx vitest run` 全绿。

## External Facts

- Depends on external facts: no
- Why not: 缺陷的触发条件在 `cli/src/deep/tfidf.ts:27`，修复效果由 `cli/src/deep/coverage.ts:198-239` 的既有判据验证，两者都在本仓库内可读。

## In Scope

- `cli/src/deep/tfidf.ts`（tokenize 修复 + 移除 `computeTfIdf`）
- `cli/src/deep/graph-preprocess.ts`（移除 `tfidfTerms`）
- `cli/src/runCli.ts`（移除表格）
- `cli/test/unit/deep/tfidf.test.ts`、`cli/test/integration/graph-preprocess.test.ts`
- `skills/digdig/references/SOP.md`、`cli/docs/AGENT-USAGE.md`
- `cli/test/benchmark/performance.bench.ts`（引用了 `computeTfIdf`）

## Out of Scope

- **不改 `coverage.ts`**。`distinctiveTerms` 的逻辑与排序符合 spec 且有测试，只需共享的 tokenizer 正确。
- **不改 `co-occurrence.ts`**。它复用 `tokenize()`，修好后自动受益。
- **不引入停用词表或 `Intl.Segmenter`**。停用词要做到准确就得做语义判断；`Intl.Segmenter` 依赖 ICU 数据版本，`engines` 为 `node >=18`、CI 跑 18/20/22，切分结果不稳定，且会把 `async-std` 拆成两词。
- **不改历史文档**（`cli/docs/prds/`、`cli/docs/plans/`）。它们是未同步的设计稿，不在当前契约内。

## Risks / Deferred Items

- **`tfidfTerms` 是对外 JSON 契约的一部分**，移除会破坏读取该字段的调用者。已核实仓库内无此类调用者；外部使用者无法核实，需在 PR 描述中点明。
- **`tokenizationStrategy` 字段**（当前值 `'whitespace_min3_cjk_bigram'`）由 `computeTfIdf` 产出。移除 `computeTfIdf` 后该字段若无其他来源，一并移除；若保留则需换一个产出点。实施时确认。
- **`async-std` 的既有行为**是 `-` 被 `[^\w]` 去掉后成为 `asyncstd`，属于纯 ASCII 分支，本次不动。

## Open Questions

无。

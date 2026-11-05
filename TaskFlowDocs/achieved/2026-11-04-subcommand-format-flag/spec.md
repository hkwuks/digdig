# Spec — 子命令 -f/--format 归属与 md 输出契约
> Task version: v1
> Status: ready

## Objective and Success Criteria

让 `-f, --format` 在所有子命令上真正生效，并让 md 输出成为 agent 可用的消费格式，而不是「存在但不可达、可达但会崩、崩了还缺 identifier」的半成品。

### 背景事实（2026-11-03/04 实测）

1. Commander 15 的 flag 归属规则：同一 flag 在父命令与子命令重复声明时，**父命令获胜**，子命令 `opts.format` 恒为 `undefined`。
2. 实测矩阵（`cli/` 下用 commander 15 直接验证，**父子都声明、均无默认值**，与真实代码一致）：

   | 调用 | `opts.format` | `optsWithGlobals().format` | help 是否列 `-f` |
   |---|---|---|---|
   | `sub s1`（无 -f） | `undefined` | `undefined` | 是 |
   | `sub s1 -f md` | `undefined` | `"md"` | 是 |
   | `sub s1 -f json` | `undefined` | `"json"` | 是 |
   | `-f md sub s1` | `undefined` | `"md"` | 是 |
   | `sub s1 --format=md` | `undefined` | `"md"` | 是 |

   **结论：坏掉的只有 `opts.format` 这一个读法。`optsWithGlobals()` 在保留子命令声明的前提下已经全部正确。** 因此修复不需要动声明，只需要改 action 里的读取方式。
   - 只子声明（对照）：`-f md sub` 报 `unknown option '-f'`，会破坏根命令现有用法，不可取
3. 根命令 `runCli.ts:772` 与 18 个子命令各自声明了 `-f`。18 个中 13 个默认 json、5 个默认 md。
4. `coverage` 是唯一幸免者，靠 `subcommandFormat(argv, ...)`（`runCli.ts:437-447`）从原始 argv 刮值。
5. `graph-preprocess` 的 md 渲染器（`runCli.ts:166`）读 `result.rounds.join(', ')`，而 `resultProvenance` 项只有 `{id, revision, url, title, approval}` → 一旦可达即 TypeError。`roundsCovered` 又在 `deep/graph-preprocess.ts:61` 硬编码 `0`。
6. `policy-aggregate`（`commands/review.ts:78-81`）在 `newReviews.length === 0` 时提前 return 并输出 JSON，绕过下面的 md 分支。
7. `--quality` 的 md 渲染器（`runCli.ts:221` `formatFactsAsMarkdown`）表格只有 `#` 序号，不含 result `id` 与 `revision`，而输出末尾却写着「Agent writes ID/revision selections」。实测 `grep -c <resultId> q.md` = 0。
8. token 实测（tiktoken cl100k_base）：

   | 命令 | md | json | md/json |
   |---|---|---|---|
   | `--quality`（12 结果） | 1407 | 2239 | **62.8%** |
   | `coverage` | 357 | 775 | **46.1%** |

9. 全部 18 个子命令的 md 渲染器已逐个以真实数据执行过：16 个正常，`graph-preprocess` 崩溃，`policy-aggregate` 早退。`query-graph` 首次探测崩溃是我漏传 `seeds`/`depth` 所致，补齐后 exit 0，**不是缺陷**。

### Success Criteria

- SC1：`dg <cmd> -f md` 与 `dg -f md <cmd>` 两种位置对全部 18 个声明了 `-f` 的子命令均生效。
- SC2：不传 `-f` 时，各命令保持**现有默认**（13 个 json、5 个 md），行为零变化。
- SC2b：每个子命令的 `--help` 仍然列出 `-f, --format`。
- SC3：`dg graph-preprocess <session> -f md` 不崩溃，且 `Rounds` 显示真实轮次数而非恒 0。
- SC4：`dg policy-aggregate <session> -f md` 在无 claim 时输出 md 文本，而非 JSON。
- SC5：`dg --session <s> --quality -f md` 的表格包含 `id` 与 `revision` 两列，agent 可据其构造 `--approve-file`。
- SC6：`coverage` 不再需要 `subcommandFormat` 这个临时函数，与其余命令走同一路径。
- SC7：`npm test` 全量通过，且每个 SC 都有对应回归测试。

## Tech Stack

- TypeScript ESM，Commander.js `^15.0.0`，Vitest
- 现有依赖，不新增

## Commands

```
Build:  cd cli && npm run build
Test:   cd cli && npm test
单查:   cd cli && npx vitest run test/integration/<file>.test.ts
```

## Project Structure

```
cli/src/runCli.ts              → 命令声明与 action（主要改动点）
cli/src/commands/*.ts          → 各子命令实现（policy-aggregate 在此）
cli/src/deep/graph-preprocess.ts → roundsCovered 的来源
cli/test/unit/                 → 单元测试
cli/test/integration/          → 集成测试
```

## Code Style

沿用现有风格：4 空格缩进、单引号、分号、JSDoc 注释解释「为什么」而非「是什么」。

```ts
function subcommandFormat(...) { ... }   // 现有：读原始 argv
// 目标：删除它，改为
.action(async (session, opts, command) => {
    const format = command.optsWithGlobals().format as 'json' | 'md' | undefined;
})
```

## Interfaces, Data Flow, and Contracts

### 契约 1 — flag 归属

`-f, --format` **保持现状的声明结构**：根命令与 18 个子命令都继续声明它（`dg <cmd> --help` 必须继续列出 `-f`）。

只改**读取方式**：每处 action 从 `opts.format` 改为 `command.optsWithGlobals().format`。

理由（实测支撑）：
- 保留声明时，`sub -f md`、`-f md sub`、`--format=md` 三种写法 `optsWithGlobals()` 全部返回正确值
- 无 `-f` 时返回 `undefined`，正好交给各命令自身默认值兜底
- 删除子命令声明虽也能工作，但会让 `--help` 不再显示 `-f`，是功能退化，因此不做

### 契约 2 — 默认值

`format` 解析为 `optsWithGlobals().format ?? <命令自身默认>`，**不读 `config.defaultFormat`**。

各命令默认保持不变：

| 默认 md | 默认 json |
|---|---|
| graph-explore、graph-drill、graph-traverse、graph-search、query-graph | graph-obfuscate、graph-preprocess、coverage、suggest-queries、strategy-info、session-report、claim-add、claim-list、evidence-search、evidence-verify、evidence-list、verdict-list、policy-aggregate、review-list |

根命令路径（`runCli.ts:699,1438,1448`）继续使用 `options.format || config.defaultFormat`，不受本改动影响。

### 契约 3 — md 必须可消费

任何命令的 md 输出，若其后续操作需要引用某条记录，必须携带该记录的主键。

- `formatFactsAsMarkdown` 增加 `ID` 与 `Rev` 两列
- 其余渲染器的 id 保留现状（已实测均含 id 或仅作展示）

## Invariants and Compatibility

- **不改变**任何命令的默认输出格式
- **不删除**任何 md 渲染器
- **不删除**任何子命令的 `-f` 声明（`--help` 输出保持完整）
- `config.defaultFormat` 与 `DIGDIG_DEFAULT_FORMAT` 对根命令的语义不变
- 已发布的 `coverage` md/json 输出内容不变（只是取值路径变了）
- 旧调用方式 `dg -f md "query"` 继续可用

## Validation and Error Semantics

- `-f <非法值>`：保持现状（落到该命令默认），本次不新增校验
- `graph-preprocess` 在无结果时：`Rounds` 显示 `0`，`resultProvenance` 为空数组时不渲染该表

## Code and Test Constraints

- 不新增依赖
- 每个 SC 至少一条测试；flag 归属用集成测试（跑真实 CLI），渲染器用单元测试
- 测试不得依赖外部网络（SearXNG 不可用）

## Design Decisions and Alternatives

**选择「保留声明、改读取方式」的依据**：实测证明 `optsWithGlobals()` 在现有声明结构下已经能拿到正确值，所以最小改动就是只改读取。删声明是多余动作，还会让 `--help` 丢掉 `-f`。

**放弃 `subcommandFormat`**：它是绕过 commander 的补丁，维护成本高且只覆盖了 1 个命令。统一到 `optsWithGlobals()` 后可以删除。

**不统一到 `config.defaultFormat`**（用户已确认）：会让 13 个默认 json 的命令变成默认 md，打断现有 agent 工作流。

## Open Questions

无。

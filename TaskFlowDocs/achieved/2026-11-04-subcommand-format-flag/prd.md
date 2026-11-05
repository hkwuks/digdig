# 子命令 -f/--format 归属与 md 输出契约
> Task version: v1
> Status: completed

## Goal

`-f, --format` 在 18 个子命令上从未生效：根命令与子命令重复声明，Commander 把 flag 归给父命令，子命令 `opts.format` 恒为 `undefined`。修好可达性后又会暴露两个渲染器缺陷（`graph-preprocess` 崩溃、`policy-aggregate` 早退），且 `--quality` 的 md 不含 agent 审批所需的 id/revision。

## Background / Confirmed Facts

完整事实与实测数据见 `spec.md`「背景事实」。摘要：

1. Commander 15 中父子重复声明 `-f` → 子命令 `opts.format` 恒 `undefined`（实测）。
2. 保留现有声明结构时，`opts.format` 恒为 `undefined`，而 `optsWithGlobals().format` 在 `sub -f md`、`-f md sub`、`--format=md` 三种写法下全部返回正确值（实测）——所以修复只需改读取方式，不必动声明。
3. 18 个子命令声明了 `-f`：13 个默认 json，5 个默认 md。
4. `coverage` 靠 `subcommandFormat` 刮 argv 幸免，其余 17 个全失效。
5. `graph-preprocess` md 渲染器读不存在的 `result.rounds` → 必崩；`roundsCovered` 硬编码 0。
6. `policy-aggregate` 无 claim 时提前 return 输出 JSON，绕过 md 分支。
7. `--quality` 的 md 表格无 `id`/`revision`，agent 无法据此构造 approve 文件。
8. md 确实省 token：`--quality` 62.8%、`coverage` 46.1%（tiktoken 实测）。

## Requirements

- R1：18 个子命令的 action 改读 `command.optsWithGlobals().format` 取代 `opts.format`；**保留**全部 `-f` 声明不动（`--help` 必须继续列出它）。
- R2：不传 `-f` 时各命令保持现有默认输出格式（绝不改成统一 `config.defaultFormat`）。
- R3：`graph-preprocess` 的 md 渲染器读真实轮次数据，不崩溃。
- R4：`policy-aggregate` 无 claim 时也遵守 `-f md`。
- R5：`--quality` 的 md 表格增加 `id` 与 `revision` 列。
- R6：删除 `subcommandFormat`，`coverage` 与其他命令走同一路径。
- R7：根命令的 `-f` 与 `config.defaultFormat` 语义不变。

## Acceptance Criteria

- AC1：全部 18 个子命令在 `-f md` 与 `-f json` 下输出不同格式，且 `sub -f md` 与 `-f md sub` 两种位置均生效。
- AC1b：全部 18 个子命令的 `--help` 仍列出 `-f, --format`。
- AC2：不传 `-f` 时 13 个默认 json、5 个默认 md 与修改前逐字节一致。
- AC3：`dg graph-preprocess <session> -f md` 退出码 0，`Rounds` 显示真实轮次。
- AC4：`dg policy-aggregate <session> -f md`（无 claim 场景）输出 md 文本。
- AC5：`dg --session <s> --quality -f md` 输出含 result id 与 revision，可据此写出合法 `--approve-file` 并成功审批。
- AC6：`subcommandFormat` 已从代码中删除。
- AC7：`npm test` 全量通过；每条 AC 均有对应测试，且在撤销修复时失败。

## External Facts

- Depends on external facts: no
- Why not: 结论全部来自本仓库源码与本地实测：flag 归属规则在 `cli/src/runCli.ts:772` 与 18 个子命令声明处，行为用 `cli/node_modules/commander` 15 直接验证；渲染器缺陷在 `cli/src/runCli.ts:166` 与 `cli/src/commands/review.ts:78`。不依赖任何外部版本、规范或第三方文档。

## In Scope

- `cli/src/runCli.ts`：改 18 处 action 的读取方式（`-f` 声明保持不动）、删除 `subcommandFormat`、修 `formatPreprocessAsMarkdown`、修 `formatFactsAsMarkdown`
- `cli/src/deep/graph-preprocess.ts`：`roundsCovered` 返回真实值
- `cli/src/commands/review.ts`：`policy-aggregate` 早退分支遵守格式
- 对应测试

## Out of Scope

- `query-graph` 的 md 崩溃（已证实是我探测时漏参，不是缺陷）
- `graph-explore`/`graph-drill` 的 `--seed` 只认 label 不认 id（独立问题，另行记录）
- `-f` 非法值的校验
- 统一 `config.defaultFormat`（用户已明确否决）
- todo 中其余 34 条

## Risks / Deferred Items

- 风险：18 处 action 改动面较大，可能有遗漏。缓解：AC1 覆盖全部 18 个命令，测试逐个断言。
- 风险：`optsWithGlobals()` 会把根命令的所有选项都带给子命令，需确认不会误读其他同名选项。已确认当前只有 `format` 与 `limit` 存在父子同名，本次只改 `format`。
- 已暂缓：`--limit` 的同类冲突（P2）不在本任务。

## Open Questions

无。

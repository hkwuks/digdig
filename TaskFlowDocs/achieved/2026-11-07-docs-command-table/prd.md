# SKILL.md 命令表漏了 doc-index / doc-search，且没有任何校验
> Task version: v1
> Status: completed

## Goal

`skills/digdig/SKILL.md` 的 Command Reference 表是 Agent 发现能力的唯一入口，但它手抄的命令集合与 `cli/src/runCli.ts` 实际注册的命令集合不一致，且没有任何机制会发现这件事。本任务补上缺失项，并加一个测试让漂移在 CI 阶段就失败。

## Background / Confirmed Facts

1. **真实命令 27 个**：`grep -oP "\.command\('\K[a-z][a-z-]*" cli/src/runCli.ts | sort -u` 得到 27 个；`createProgram().commands.map(c => c.name())` 是同一集合（`cli/test/unit/cli.test.ts:33` 已用这种方式列举）。
2. **SKILL.md 表里 24 个**（`skills/digdig/SKILL.md:311-338`）。
3. **差集恰好 3 个**：`doc-index`、`doc-search`、`query-graph`。反向差集为空 —— 表里没有代码中不存在的幽灵命令。
4. **三者情况不同**：
   - `doc-index` / `doc-search`：在 `skills/digdig/references/SOP.md:398-430` 有完整章节（何时用、如何工作、结果如何进入 pending → approve → graph、Agent 决策表）。能力是真实且完整的，只是没进总表。
   - `query-graph`：`runCli.ts:809` 的描述已写明 `[DEPRECATED] Query subgraph via BFS. Use graph-explore + graph-drill instead.`，`appendix.md:75` 也有同样指引。不该进总表。
5. **`CLAUDE.md` 另有一套表**，列 13 个，缺 14 个。本任务只处理 `SKILL.md` —— 那是 Agent 读的那份，`CLAUDE.md` 是给维护者看的，性质不同。
6. **漂移是如何发生的**：`--help` 由 commander 从源码生成，`SKILL.md` 由人手抄，两者之间没有校验。新增命令时没人会记得回头改文档。

## Requirements

- R1：在 `skills/digdig/SKILL.md` 的 Command Reference 表中补 `doc-index` 与 `doc-search` 两行，位置放在文档检索相关命令附近，描述与 `runCli.ts` 的 `.description()` 及 SOP 的用法保持一致。
- R2：`query-graph` **不加入**总表。
- R3：新增一个测试，断言 `SKILL.md` 表里的命令集合与 `createProgram().commands` 的命令集合相同。
- R4：测试必须有一份**显式豁免清单**承载「已在代码中注册但不属于 Agent 能力面」的命令。当前只有 `query-graph` 一项，每条豁免带一行理由。
- R5：测试失败信息必须指名具体命令（缺哪个 / 多哪个），不能只报集合不相等。
- R6：测试从仓库读取 `SKILL.md`，不复制任何命令名常量；命令集合必须来自 `createProgram()`，不来自另一个手抄列表。

## Acceptance Criteria

- AC1：`skills/digdig/SKILL.md` 的表中包含 `doc-index` 与 `doc-search`。
- AC2：表中不包含 `query-graph`。
- AC3：`npx vitest run test/unit/skill-command-table.test.ts` 在未补文档时失败，补后通过（RED → GREEN 已验证）。
- AC4：往 `runCli.ts` 加一个假命令而不改 SKILL.md 时该测试失败，且失败信息指名该命令 —— 用临时改动验证后还原。
- AC5：`npm test` 全量通过。

## External Facts

- Depends on external facts: no
- Why not: 全部结论来自本仓库源码与 `createProgram()` 的运行时行为，不依赖任何外部版本、规范或第三方文档。

## In Scope

- `skills/digdig/SKILL.md`：补两行
- `cli/test/unit/skill-command-table.test.ts`：新增校验测试

## Out of Scope

- `CLAUDE.md` 的命令表（缺 14 个）—— 维护者文档，另行判断
- 其他 `references/*.md` 与 `--help` 的一致性
- 给 `query-graph` 加 deprecated 提示或删除它
- todo 中其余条目

## Risks / Deferred Items

- 风险：豁免清单会变成新的「忘记维护」的地方。缓解：每条豁免强制带理由，且 R5 要求失败信息指名命令，新增未豁免命令会立刻暴露。
- 已暂缓：把同样的校验推广到 `CLAUDE.md`。

## Open Questions

无。

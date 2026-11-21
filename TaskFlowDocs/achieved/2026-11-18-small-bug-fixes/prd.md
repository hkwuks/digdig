# 修复六项已记录缺陷
> Task version: v2
> Status: completed

## Goal
保留 v1 六项修复，并补齐本地文档首轮与来源行为的文档和端到端验证。

## Task Kind
- Kind: defect

## Background / Confirmed Facts
节点查找只比较标签；标题兜底读取错误的 Orama 数据结构；frontmatter 标题被重复添加；纯正文导入首轮不更新轮次；质量来源读取无写入字段；claim-add 提前创建会话。

## Requirements
支持精确实体 ID 优先；修复模糊标题和重复标题；首个纯导入产生一致的轮次；来源取首次 origin 的工具；输入无效不创建会话。覆盖所有调用者并更新帮助文本。

## Acceptance Criteria
1. explore 和 drill 可使用 ID，ID 与标签冲突时 ID 优先。
2. 标题拼写错误可触发兜底；frontmatter 标题不重复。

> **2026-11-21 补记** — 第 2 条当时只落实了一半：`searcher.ts` 加了 `headings[0] === title ? slice(1)` 的补偿，但源头 `scanner.ts` 仍在把 frontmatter 标题前插进 `headings`，于是「frontmatter 标题与 H1 同名」这种主流形态仍然输出 `My Title — My Title`。已由 `TF-20261121-567c56` 在源头修正（`headings` 只含章节标题），补偿逻辑随之删除。保留原文供追溯。
3. 首次纯导入的轮次与 origin 一致，后续导入不额外开轮。
4. 质量输出采用首次 origin 的工具。
5. claim-add 无效输入不创建会话，其他相关命令校验后创建。
6. 针对性及全量测试、类型检查通过；已解决待办更新，复合待办保留剩余项。
7. 空会话先执行本地文档搜索，首次命中初始化第 1 轮，之后网络搜索为第 2 轮；已有轮次的本地搜索不额外增加，无命中不创建轮次。
8. 项目 README、项目 skill 的 SOP 和代码注释准确描述轮次、本地来源与当前质量报告字段。

## External Facts
- Depends on external facts: no
- Why not: v2 说明和行为由 `cli/src/deep/session.ts`、`cli/src/deep/local-doc/searcher.ts`、`cli/src/deep/pending-facts.ts` 和项目测试确定；v1 的 Orama 官方资料保留在旧版记录。

## In Scope
保留六项修复，补充本地文档轮次和来源说明、必要测试。

## Out of Scope
其他待办、发布、远端合并。

## Risks / Deferred Items
纯导入轮次会影响覆盖统计；旧索引和多来源输出需回归验证。v2 用真实 CLI 会话路径验证本地搜索与网络搜索顺序，不修改已批准的轮次策略。

## Open Questions
无。

# 修复六项已记录缺陷
> Task version: v1
> Status: completed

## Goal
修复用户确认的六项缺陷并验证。

## Task Kind
- Kind: defect

## Background / Confirmed Facts
节点查找只比较标签；标题兜底读取错误的 Orama 数据结构；frontmatter 标题被重复添加；纯正文导入首轮不更新轮次；质量来源读取无写入字段；claim-add 提前创建会话。

## Requirements
支持精确实体 ID 优先；修复模糊标题和重复标题；首个纯导入产生一致的轮次；来源取首次 origin 的工具；输入无效不创建会话。覆盖所有调用者并更新帮助文本。

## Acceptance Criteria
1. explore 和 drill 可使用 ID，ID 与标签冲突时 ID 优先。
2. 标题拼写错误可触发兜底；frontmatter 标题不重复。
3. 首次纯导入的轮次与 origin 一致，后续导入不额外开轮。
4. 质量输出采用首次 origin 的工具。
5. claim-add 无效输入不创建会话，其他相关命令校验后创建。
6. 针对性及全量测试、类型检查通过；已解决待办更新，复合待办保留剩余项。

## External Facts
- Depends on external facts: yes
- Source: https://docs.orama.com/docs/orama-js/search
- What it settled: Orama 可通过无 term 的 search 查询全部文档，默认分页限制须显式设置。

## In Scope
六项及必要测试、文档、待办。

## Out of Scope
其他待办、发布、远端合并。

## Risks / Deferred Items
纯导入轮次会影响覆盖统计；旧索引和多来源输出需回归验证。

## Open Questions
无。

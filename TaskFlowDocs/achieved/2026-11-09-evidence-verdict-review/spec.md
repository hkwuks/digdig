# 证据审核契约
> Task version: v1

一个 claim 和 evidence 对应一个单证据 verdict。变化时更新其字段并清除旧 review；完全相同重试保留有效 review；complete 重新聚合，保存其结果。

# P7 — 只读命令对不存在的会话名创建目录
> Task version: v1
> Status: completed

## Goal

只读命令在会话名拼错时创建目录：session-report/suggest-queries/graph-preprocess/--quality 对不存在的会话 exit 0 且经 initSessionDir/mkdirSync 创建 .digdig/sessions/<name>/，session-list 随后以 createdAt:0 列出。coverage 表现正确（EMPTY_SESSION、exit 1、不建目录），其余应对齐

## Task Kind

- Kind: defect

## Background / Confirmed Facts

session-report、suggest-queries、graph-preprocess 和 --quality 会在无结果时调用 `loadSessionGraph`；该函数获取会话锁，而锁会先创建目录。coverage 在读取结果为空时先返回 EMPTY_SESSION，不创建目录。

## Requirements

- 对不存在或没有结果的会话，对齐 coverage：返回 EMPTY_SESSION、退出码 1，不能创建会话目录。
- 有现存结果的正常会话保持原来的报告、格式和修复机制；写入型搜索及明确的跳过、批准操作不应受无关改动影响。

## Acceptance Criteria

- 四条命令对不存在会话均返回 EMPTY_SESSION，且会话目录和列表保持不变。
- 已存在但无结果的会话遵循 coverage 的空会话行为；正常会话的命令输出和现有错误处理继续有效。
- 不因更改共享锁而破坏合法写入或读取期间的依赖修复。

## External Facts

- Depends on external facts: no
- Why not: 当前处理与期待由 `cli/src/runCli.ts`、`cli/src/deep/session.ts` 和 `cli/src/commands/coverage.ts` 给出。

## In Scope

四条所列命令的空会话检查和真实 CLI 回归测试。

## Out of Scope

重新设计整个 session 生命周期或改变 coverage 的现有契约。

## Risks / Deferred Items

`--quality` 还承载写操作选项，不能无差别改变合法批准/跳过流程；`new` 等特殊会话名可能在路径解析时创建根目录，测试需明确边界。

## Open Questions

用户已同意修复 P7；按待办记录对齐 coverage。

# 让反馈日志的词表与代码实际分类对齐
> Task version: v1
> Status: completed

## Goal

让反馈日志的词表与代码实际分类对齐：session 错误码、validation 失败原因、抽取回退链逐次记录。

## Task Kind

- Kind: defect

## Background / Confirmed Facts

1. `cli/src/feedback-log.ts:11` 的 `errors` 白名单是 `['CONFIG_MISSING', 'AUTH_FAILED', 'RATE_LIMITED', 'SERVER_ERROR', 'NETWORK_ERROR', 'BAD_REQUEST', 'BAD_RESPONSE', 'SESSION_BUSY', 'validation', 'unknown']`。
2. `cli/src/deep/session-lock.ts:6` 的 `SessionStateError.code` 有四个值：`SESSION_BUSY`、`SESSION_CORRUPTED`、`SESSION_STORAGE_ERROR`、`SESSION_MIGRATION_FAILED`。
3. 四个值在 `cli/src` 里都有实际抛出点（`session-lock.ts:14,38`、`session-migrate.ts:51,61,72`、`session.ts:327,399,815`、`session-store-*.ts`）。
4. 白名单只收录 `SESSION_BUSY`，所以 `SESSION_CORRUPTED`、`SESSION_STORAGE_ERROR`、`SESSION_MIGRATION_FAILED` 三个经 `feedbackError()`（`feedback-log.ts:73-76`）全部落成 `unknown`。会话损坏和会话存储故障在日志里与任意未知异常无法区分。
5. `cli/src/runCli.ts` 有 5 处 `feedbackLog('validation', 'error', ...)`，行号 543、550、561、569、589。
6. 这 5 处对应的错误信封码依次是 `INVALID_LIMIT`（543）、`MISSING_QUERY`（550）、`INVALID_ENGINES`（561）、`INVALID_ENGINES`（569）、`PROVIDER_NOT_CONFIGURED`（589）。
7. 前 4 处把日志的 `error` 字段硬写成 `'validation'`，只有 589 写的是真实码 `CONFIG_MISSING`。结果是 `INVALID_LIMIT`、`MISSING_QUERY`、`INVALID_ENGINES` 三类参数错误在日志里完全同构。
8. `cli/src/deep/extractor.ts:486-509` 是 0.1.0 新增的外部抽取回退链，依次尝试 `exa`、`tavily`、`firecrawl`、`ollama`、`deepseek`，其中 `tavily` 和 `firecrawl` 各有"已安装 CLI"分支。
9. 该回退链内零 `feedbackLog` 调用。`extract_method` 事件的现有记录点只有 `extractor.ts:426`（jina）、`:446`（defuddle）、`:470`（obscura），加上 `commands/extract.ts:61` 的批次级结果回放。
10. 因此外部回退链上任何一个 provider 失败，日志里都没有痕迹 —— 这是 0.1.0 引入的功能面与 0.0.13 引入的日志面之间的覆盖缺口。
11. `feedback-log.ts:10` 的 `providers` 与 `cli/src/errors.ts:44` 的 `SearchProvider` 是两份手写清单。`ca335c4`（2026-11-19）必须手工给日志白名单补 `exa`/`tavily`/`firecrawl` 才跟上 provider 扩容 —— 漂移已经发生过一次。
12. `cli/src/errors.ts:22` 的 `SearchErrorCode` 与日志白名单前七项同值，同样是两份手写清单。
13. `SearchProvider` 与 `SearchErrorCode` 均为字面量联合类型，没有运行时表达，所以日志无法在运行时从类型取值 —— 派生必须反过来：类型从 `as const` 数组派生。
14. `cli/src/deep/session-lock.ts:6` 的四个 session 码同样是内联字面量联合，没有运行时清单。
15. 现有测试 `cli/test/feedback-log.test.ts:71` 只断言事件名集合，不断言 `error` 字段取值；没有任何测试断言 `providers`/`errors` 数组内容，所以本轮改动不会与既有断言冲突。
16. 文档（`README.md:1343`、`README.zh-CN.md:1330`、`cli/README.md:459-461`）只描述"固定的阶段、时间、耗时、数量、提供商或抽取方法、受控错误类别"，不枚举具体值。本轮改动不改变这段描述的真伪。
17. `withSessionLock`（`session-lock.ts:19-46`）在崩溃后可安全恢复新一轮锁，`SESSION_BUSY` 仍是用户可见的正常路径 —— 它的白名单条目必须保留。

## Requirements

1. 反馈日志的 `provider` 白名单与 `errors` 白名单不得再是与类型分家手写的清单；词表的唯一真源必须是可被运行时读取的 `as const` 数组，类型从该数组派生。
2. `SessionStateError` 的四个错误码全部可被日志记录，不再有码落进 `unknown`。
3. `validation` 阶段的日志 `error` 字段记录该次失败的真实信封码，不再统一写 `'validation'`。
4. 外部抽取回退链上每一次真实 provider 尝试都记录 `extract_method` 的 `start` 与终态，携带该 provider 与耗时；未发生的尝试（类型不支持、无凭据）不记。
5. 日志的数据最小化不变：仍然只有白名单字段可写入，任何未列入白名单的 provider、错误码、自由文本一律不可序列化。
6. 默认关闭、异步尽力写入、失败不改变命令输出 —— 这三条既有契约不变。
7. 既有事件的记录点、字段语义和日志文件格式（JSON Lines、轮转、路径）不变。

## Acceptance Criteria

- A1：`SESSION_CORRUPTED`、`SESSION_STORAGE_ERROR`、`SESSION_MIGRATION_FAILED` 三个码经 `feedbackError()` 返回其自身，不再返回 `unknown`；`SESSION_BUSY` 仍返回自身。
- A2：一次 `INVALID_LIMIT` 失败与一次 `MISSING_QUERY` 失败写出的日志行，`error` 字段分别为 `INVALID_LIMIT` 与 `MISSING_QUERY`，可区分。
- A3：外部回退链在某个 provider 失败时，日志出现该 provider 的 `extract_method` `error` 记录；在某个 provider 成功返回时出现 `ok` 记录；两者都带 `durationMs`。
- A4：`providers` 与 `errors` 的运行时数组由 `as const` 源派生，新增 provider 或错误码时类型检查会强制覆盖（`Record<SearchProvider, ...>` 的穷尽性）。用反向验证证明：临时删掉 `errors.ts` 里某个 provider 在 `LABEL` 中的条目，`tsc --noEmit` 必须报错。
- A5：隐私测试保持通过 —— 含查询、URL、凭据、正文、路径、异常文本的输入不会进入日志；白名单外的 provider 名与错误码写不进日志。
- A6：关闭状态下无文件副作用；写入失败、锁争用不抛出不改变退出码 —— 既有测试继续通过。
- A7：`npx tsc --noEmit` 为 0，`npx vitest run` 全绿。

## External Facts

- Depends on external facts: no
- Why not: 全部验收针对本仓库可控的代码与日志行为。依据是 `cli/src/feedback-log.ts`、`cli/src/errors.ts`、`cli/src/deep/session-lock.ts`、`cli/src/deep/extractor.ts`、`cli/src/runCli.ts` 和 `cli/test/`，不依赖任何外部产品或服务事实。

## In Scope

- 把 `SearchProvider`、`SearchErrorCode`、四个 session 码的运行时清单落到 `as const` 数组，类型从数组派生。
- 日志白名单改为从这些数组派生。
- `runCli.ts` 四处 `validation` 失败改为传真实信封码，并把这四个信封码加入白名单。
- `extractor.ts` 外部回退链逐次记录 `extract_method`。
- 对应测试：错误码分类、validation 码可区分、回退链记录、派生关系的反向验证。

## Out of Scope

- 给全部信封码建立类型或统一清单（当前 `createErrorEnvelope` 的第一参是 `string`，82 处调用、25+ 个值、存在 `error.code` / `input.code` 这类多态传参；给它建类型是独立工程，不属本缺陷）。
- 新增日志事件、新增字段、改变日志格式或轮转策略。
- 给 `search`/`fusion`/`session` 等既有事件补充新阶段。
- 记录实际 provider 请求的 limit（`TF-20261116-f8776d` 的范围）。
- 改动文档措辞（见背景事实 16）。

## Risks / Deferred Items

- 回退链逐次记录会让单次抽取的日志行数随失败 provider 数量线性增长（最多 5 个 provider × 2 条）。这是为诊断可见性付出的代价，且日志本身限额轮转、默认关闭。
- `error` 字段从 `'validation'` 改为具体信封码，会改变已启用日志用户的历史可比性。由于日志从不上传、仅供手动排查，接受该变化。
- 派生关系只能保证"新增项被迫处理"，不能保证"新增项被加入日志白名单" —— 两者之间仍需一次显式编辑。反向验证只覆盖前者。

## Open Questions

无阻塞问题。scope 与记录粒度已由用户确认：范围取 1+2+3 加词表派生；回退链复用 `extract_method` 逐次记录，不新增事件也不新增字段。

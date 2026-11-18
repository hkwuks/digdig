# Spec — 反馈日志
> Task version: v1

## Objective and Success Criteria

提供覆盖搜索及正文抽取关键阶段的隐私受控本地诊断，验收见 PRD A1–A4。

## Architecture Boundaries and Responsibilities

- 搜索编排层负责校验、冗余、查询/provider、融合及会话阶段事件；provider 层报告请求及结果处理事实。
- 抽取编排层和抽取器报告批次、方法及结果分类。仅记录确实发生的阶段，不声称覆盖外部服务内部行为。
- 日志模块仅接受预先定义的事件和字段，负责异步本地写入、限额与故障隔离；不解析或保存业务对象。

## Project Structure / Affected Files

`cli/src/entry.ts`、`runCli.ts`、`service.ts`、provider 和 `commands/extract.ts`、`deep/extractor.ts` 中必要的接线；新增日志模块和测试；更新 CLI 文档。具体接线依据现有执行路径精简。

## Interfaces, Data Flow, and Contracts

- `DIGDIG_LOG=1` 启用；其他情况关闭。路径建议为用户主目录 `digdig/logs/feedback.jsonl`，单文件 10 MiB，保留当前文件及四个轮转文件，总计最多约 50 MiB。
- JSON Lines：时间、单次运行随机 ID、固定事件名、固定阶段/状态、耗时、数量、受控 provider/方法和受控错误码；每种事件采用明确 schema，未知字段不可序列化。
- 不传入原始输入、结果、路径或异常消息；未知异常仅输出固定分类。禁止自动网络上传。
- 异步文件操作不得阻塞业务逻辑；写入失败静默丢弃日志，不改变 CLI 的 stdout、stderr 或退出状态。并发轮转应有有界安全策略，无法取得写入权时丢弃而不等待业务。

## Invariants and Compatibility

禁用时无文件副作用；保留既有 CLI 返回、排序和行为。不得将哈希视为匿名化，也不保存可逆标识。日志不是审计记录，不保证异常退出或争用时完整。

## Validation and Error Semantics

对不可信字段采用事件级白名单而不是对任意文本做正则清洗；文件写入或轮转失败不影响搜索。单条记录应有大小限制，并防止并发轮转覆盖业务文件。

## Code and Test Constraints

Node 现有依赖和异步文件 API；不新增依赖，不使用同步日志 I/O 或等待日志完成阻塞搜索。测试使用隔离目录和模拟 provider，不访问真实网络；验证所有事件类别及隐私和故障路径。

## Design Decisions and Alternatives

通用日志消息替换方案不能可靠覆盖查询词、密钥和业务正文，采用结构化白名单；覆盖流程阶段不等同于记录原始流量。用户确认单文件 10 MiB、保留五个文件；实际可保留的搜索次数须在实现后测量。

## Open Questions

无；具体事件清单在实现时按实际执行路径列出并覆盖测试，不扩大已批准的数据范围。

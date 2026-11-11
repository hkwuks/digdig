# Spec — 真实抽取方法与正文保留
> Task version: v1

## Objective and Success Criteria

按实际抽取结果保存来源和正文长度，不因短正文或空摘要丢失已有信息；输出成功不等于证明内容完整或真实。

## Architecture Boundaries and Responsibilities

抽取器负责方法、正文和实际长度，命令层传递已确定事实及结构化成功/失败，会话层负责不丢失已有摘要并持久化；不依赖选项猜测实际方法。

## Project Structure / Affected Files

`cli/src/deep/extractor.ts`、`cli/src/commands/extract.ts`、`cli/src/deep/session.ts`、相关结果导入和可观察输出；`cli/test/unit/deep/extractor.test.ts`、`cli/test/unit/commands/extract.test.ts`、SQLite 会话/CLI 测试、文档与 CHANGELOG。实施前检查调用方。

## Interfaces, Data Flow, and Contracts

- `ExtractedContent.method` 真实值优先作为会话 `extractor`；取不到时不能错误归因为已有方法，应标为 unknown。Jina、默认 Defuddle、Obscura HTML/Markdown、回退由实际结果决定。
- Defuddle 短于现有回退门槛时，仅在启用 Obscura 时尝试该回退；若回退无法得到更好的非空正文，保留现有非空正文并成功。不可把网络、解析错误或空白正文当成功；异常/失败仍遵循原协议。
- 新摘要需 `trim()` 非空才能覆盖已有值；保留原字符串内容，不无故更改。
- 非空正文用 `content.length` 表达长度；emoji 按 UTF-16 两代码单元计算。统一 CLI 结果和新写入 session 的长度，不批量重算旧数据。搜索摘要、原始字节数、词数不得混为正文长度。
- 旧数据保留；变更属于新写入与输出行为，更新使用说明。

## Invariants and Compatibility

同一批部分成功与失败列表、速率限制和回退控制不变；输入和 I/O 失败仍返回现有结构化错误；不臆造旧正文来源或批量重写旧会话。

## Validation and Error Semantics

通过实际 `ContentExtractor.extract` 的受控 fetch、独立 CLI/命令和真实 SQLite 测试 1、49、50、99、100 长度、空白、空摘要、方法、回退、非 BMP 文本及失败；检查去重和多 URL；模拟回退必须实际覆盖调用路径而非只伪造最终命令结果。

## Code and Test Constraints

Node 24.15+、现有依赖；先红测，后修复；不删除用户文件或改变其他待办；运行定向、类型、全量测试和 Linux CI。

## Design Decisions and Alternatives

保留现有回退触发边界，不让 100 字符阈值充当成功判据；不通过参数倒推真实方法；不以历史字段不一致为理由对旧数据作不可逆更新。

## Open Questions

无；实现若发现新的行为分歧再报告。

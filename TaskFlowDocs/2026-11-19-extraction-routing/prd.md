# 按内容类型复用搜索与抽取工具
> Task version: v2
> Status: ready

## Goal

恢复 Agent 主导外部搜索和抽取：Agent 选用自身可用工具并导入同一 dg 会话；dg 保留原有搜索后端、本地抽取及显式选择的既有抽取能力，避免自动发起额外第三方请求。

## Task Kind

- Kind: capability

## Background / Confirmed Facts

- 当前抽取器默认 fetch + Defuddle，Jina 显式启用，Obscura 为可选回退；当前实现不检查 Content-Type。真实 PDF 和 JSON 样本的默认抽取失败。
- 当前会话已可调用 Exa MCP，Windows PATH 可发现 mcp2cli、agent-browser 和 tvly；tvly 启动时报 Python 路径错误，安装存在不代表可用。宿主工具不能假定自动暴露给独立 CLI。
- `results-add` 已支持外部搜索记录和正文导入；已有 Ollama、DeepSeek 搜索适配器。短非空正文、原文、摘要、来源和历史审批行为应保留。
- 现有 `--obscura` 路径未传递命令层选项，导致其显式 URL 检查失效；应纳入本任务对真实调用链的验证。

## Requirements

1. 移除 0.1.0 新增 Exa、Tavily、Firecrawl、Jina 的 dg 直连搜索；保留此前已有的 SearXNG、Ollama、DeepSeek 显式搜索。Agent 可调用自身工具并通过 results-add 导入同一会话。
2. dg 本地抽取失败时不自动调用任何新增第三方服务；由 Agent 决定并调用外部工具，正文和摘要分别正确导入。此前显式的 --jina、--obscura 保持可用。
3. 识别 HTML、PDF、Office、图片、结构化文本及未知类型，区分可支持、明确不支持、未知；不以扩展名当最终 MIME，不把未知误判为不支持。未知类型先有限、低成本探测，探测失败保持可解释。
4. 同时支持独立 CLI 可用的配置/API/工具和 Agent 宿主可用工具；宿主工具通过明确桥接或现有正文导入契约接入，不假定子进程继承宿主权限。
5. 结果保留 URL、实际工具、时间和全文/片段语义；不把摘要、搜索片段或被截断内容冒充完整正文。失败、部分成功、限流和不支持均可区分，不泄露密钥。
6. 保留现有 CLI 选项、会话和用户数据语义；禁止 shell 拼接执行用户输入，验证不消耗真实用户额度。

## Acceptance Criteria

- 默认提取不会因环境变量或已安装工具而发送第三方请求；Agent 可将正文或摘要分别导入。
- 0.1.0 中来自 Jina 直连搜索且被标记为已抽取的历史记录保留原文、状态和审核历史；以可见提示提醒核实完整性，不批量改写会话。
- 用户明确要求移除新增直连，因此这是有意的 0.1.0 行为变更；不增加兼容桥接。


- Agent 可读取工具的类型与适用范围并选择调用；dg 不再自动调用本次新增外部服务，原有显式后端保留。
- 对 HTML、动态页面、PDF、Office、图片、JSON、未知 MIME、误导后缀、重定向及未授权协议使用受控测试，包含不同工具的支持、未知和不支持分支。
- 外部搜索或抽取结果导入保持真实来源，摘要不冒充正文；默认路径不新增自动付费回退。
- Windows 和 Linux 验证 CLI/进程边界，宿主工具桥接至少验证一种真实可用接口与无宿主降级；不读取或打印用户凭据。
- 现有 `extract`、搜索与会话行为的回归、全量测试及类型检查通过；第三方线上有效性与计费测试结果和未测限制如实记录。

## External Facts

- Depends on external facts: no
- Why not: v2 restores the user's confirmed ownership boundary using `cli/src/commands/results-add.ts` and `cli/src/runCli.ts`; provider capability references and their earlier evidence are preserved in archived v1, not reasserted as new v2 implementation facts.

## In Scope

Agent 工具选择与导入指引、移除新增直连和自动回退、历史记录提示、必要文档和测试；保留类型判断及原有显式后端。

## Out of Scope

SearXNG 自动分页；自动安装第三方工具；绕过登录或验证码；自动兼容未明确支持的任意工具；重新设计会话数据库或图审核流程。

## Risks / Deferred Items

网页类型可能被错误 Content-Type、HEAD 不支持、重定向或认证影响；自动探测本身是请求。第三方接口、额度和输出会变化；已安装、已认证、可使用是不同事实。宿主 API 不一定从 CLI 可达。WSL 和 Windows PATH 是不同环境。

## Open Questions

无新的产品决策；具体桥接机制需以现有宿主契约、接口文档及测试证据确认，不能假定所有 Agent 宿主提供同一接口。

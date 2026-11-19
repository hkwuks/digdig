# 按内容类型复用搜索与抽取工具
> Task version: v1
> Status: completed

## Goal

让 digdig 根据已配置工具的实际能力、可用性和输入类型选择搜索与正文抽取路径，避免向明确不支持该类型的服务发送请求，复用用户已有能力。

## Task Kind

- Kind: capability

## Background / Confirmed Facts

- 当前抽取器默认 fetch + Defuddle，Jina 显式启用，Obscura 为可选回退；当前实现不检查 Content-Type。真实 PDF 和 JSON 样本的默认抽取失败。
- 当前会话已可调用 Exa MCP，Windows PATH 可发现 mcp2cli、agent-browser 和 tvly；tvly 启动时报 Python 路径错误，安装存在不代表可用。宿主工具不能假定自动暴露给独立 CLI。
- `results-add` 已支持外部搜索记录和正文导入；已有 Ollama、DeepSeek 搜索适配器。短非空正文、原文、摘要、来源和历史审批行为应保留。
- 现有 `--obscura` 路径未传递命令层选项，导致其显式 URL 检查失效；应纳入本任务对真实调用链的验证。

## Requirements

1. 首批覆盖现有 Defuddle、Obscura、Jina，以及 Exa、Tavily、Firecrawl、Ollama、DeepSeek 的已确认搜索/抽取能力，分别核实接口、格式、授权与平台，不把未验证能力当已支持。
2. 已配置的工具即允许调用；节省额度通过类型适配、复用现有正文、去重和避免无效请求实现。存在用户显式配置的限制时遵守，不强制引入额外预算或逐次确认。
3. 识别 HTML、PDF、Office、图片、结构化文本及未知类型，区分可支持、明确不支持、未知；不以扩展名当最终 MIME，不把未知误判为不支持。未知类型先有限、低成本探测，探测失败保持可解释。
4. 同时支持独立 CLI 可用的配置/API/工具和 Agent 宿主可用工具；宿主工具通过明确桥接或现有正文导入契约接入，不假定子进程继承宿主权限。
5. 结果保留 URL、实际工具、时间和全文/片段语义；不把摘要、搜索片段或被截断内容冒充完整正文。失败、部分成功、限流和不支持均可区分，不泄露密钥。
6. 保留现有 CLI 选项、会话和用户数据语义；禁止 shell 拼接执行用户输入，验证不消耗真实用户额度。

## Acceptance Criteria

- 每种首批工具有可检查的能力和可用性声明；已配置且与已识别输入相容时，实际请求可达；明确不支持的组合无外部工具调用。搜索和抽取分别验证，不以安装或配置字符串代替实际可用性。
- 对 HTML、动态页面、PDF、Office、图片、JSON、未知 MIME、误导后缀、重定向及未授权协议使用受控测试，包含不同工具的支持、未知和不支持分支。
- 外部搜索/抽取返回多项、部分失败、片段及错误时，规范化与会话导入保持真实来源，自动回退不重复扣费或误认成功。
- Windows 和 Linux 验证 CLI/进程边界，宿主工具桥接至少验证一种真实可用接口与无宿主降级；不读取或打印用户凭据。
- 现有 `extract`、搜索与会话行为的回归、全量测试及类型检查通过；第三方线上有效性与计费测试结果和未测限制如实记录。

## External Facts

- Depends on external facts: yes
- Source: https://exa.ai/docs/contents/quickstart
- What it settled: Exa 声称支持 JS 网页及 PDF；搜索内容和全文接口能力、计费分别核实。
- Source: https://docs.tavily.com/documentation/api-reference/endpoint/extract
- What it settled: Tavily 支持批量、分项失败及不同深度计费，片段和全文需区分。
- Source: https://docs.firecrawl.dev/features/scrape
- What it settled: Firecrawl 声明支持动态网页和 PDF；自托管、API 认证和参数以接口为准。
- Source: https://docs.ollama.com/capabilities/web-search
- What it settled: Ollama 具有独立 web_fetch，但未据此假定 PDF/登录等类型支持。
- Source: https://api-docs.deepseek.com/guides/search/
- What it settled: DeepSeek 具独立 Fetch，协议、错误和计费需按现行文档处理。
- Source: https://github.com/jina-ai/reader/blob/main/architecture.md
- What it settled: Jina Reader 服务支持网页、PDF 和 Office；不得把图像描述等同 OCR。

## In Scope

能力分类和路由、用户已配置工具发现与使用、首批搜索和抽取适配、明确宿主桥接、失败/来源语义、必要配置/文档和测试。

## Out of Scope

SearXNG 自动分页；自动安装第三方工具；绕过登录或验证码；自动兼容未明确支持的任意工具；重新设计会话数据库或图审核流程。

## Risks / Deferred Items

网页类型可能被错误 Content-Type、HEAD 不支持、重定向或认证影响；自动探测本身是请求。第三方接口、额度和输出会变化；已安装、已认证、可使用是不同事实。宿主 API 不一定从 CLI 可达。WSL 和 Windows PATH 是不同环境。

## Open Questions

无新的产品决策；具体桥接机制需以现有宿主契约、接口文档及测试证据确认，不能假定所有 Agent 宿主提供同一接口。

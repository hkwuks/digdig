# 能力与兼容性证据

核对日期：2026-11-19。这里的“支持”以供应商文档或当前代码为依据，不代表所有网站均能成功；未声明或未实测为 unknown。

| 工具 | 搜索 | 抽取及输入 | 证据与限制 |
|---|---|---|---|
| SearXNG | 当前已实现 | 不承担正文抽取 | 不同引擎分页支持不同；本任务不自动翻页。 |
| Defuddle | 无 | HTML；当前 dg 获取文本后解析 | 当前代码未检查 Content-Type；PDF/JSON 公开样本失败，HTML 样本成功。不能以一次实验断言所有情况。 |
| Obscura | 本项目作为可选网页渲染回退 | HTML、JS 页面；当前 dg 经 HTML 或 markdown 模式调用 | PDF、带登录状态的行为未证实；当前 find 可能自动下载安装，不可把它当作纯粹的已安装检查。 |
| Jina | 官方有 Search API | Reader 声明网页、JS、PDF、Office、图片描述 | [Reader](https://github.com/jina-ai/reader/blob/main/architecture.md)；当前 dg 是 Reader URL 路径，文件上传或 OCR 不能默认视为已实现。[Search](https://github.com/jina-ai/reader/blob/main/README.md)。 |
| Exa | Search API | Contents 声明支持 JS、PDF | [Contents](https://exa.ai/docs/contents/quickstart)、[search](https://exa.ai/docs/reference/search)。当前宿主的 `web_fetch_exa` 对公开官方页面实际返回正文；宿主可见不代表 CLI 可见。 |
| Tavily | Search API / CLI | Extract basic/advanced，批量最多 20，逐 URL 成功/失败 | [Extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract)。按 query 返回的 chunks 可不完整；PDF/图片能力未在本次证实。Windows PATH 有 `tvly.exe` 但启动提示 Python 不存在。 |
| Firecrawl | Search API | 声明动态网页、PDF、文件解析 | [Scrape](https://docs.firecrawl.dev/features/scrape)、[API](https://docs.firecrawl.dev/api-reference/endpoint/scrape)。自托管及服务版本差异、认证、实际 OCR 能力需分开验证。 |
| Ollama | 当前已有 web_search | web_fetch 读取网页 | [Web search/fetch](https://docs.ollama.com/capabilities/web-search)。PDF/Office/JS/认证内容未证明，保持 unknown。 |
| DeepSeek | 当前已有 Search API | Fetch 返回 Markdown | [Fetch](https://api-docs.deepseek.com/api/fetch/)、[Search & Fetch](https://api-docs.deepseek.com/guides/search/)。不允许带账号密码的 URL；PDF/JS 等未证明，保持 unknown。 |
| agent-browser | 浏览器交互，不假定为搜索引擎 | 根据浏览器和页面状态渲染网页 | 本机 Windows 版本 0.32.3 可运行；登录状态、PDF 和子进程互通未知，不能从存在直接推断认证或正文契约。 |
| mcp2cli | 根据显式连接到的 MCP server 能力而定 | 同左 | 本机 Windows 版本 3.9.0 可运行；CLI 的 MCP 配置/凭据与宿主连接并非自动共享。 |

## 共同证据边界

- `Content-Type`、URL 后缀、跳转与服务文档可能互相冲突；保留证据和 unknown，不能把 HEAD 失败解释成类型不支持。低成本探测仍是请求。
- 工具返回的搜索摘要或 query 定向 chunks 可能不完整，不能靠非空或长度阈值自动标为完整正文。
- 已配置工具被用户明确授权使用；本任务不会再为每次调用要求确认。若用户已有预算约束，应尊重；不新增隐含强制预算。
- 搜索与抽取可能在同次请求返回正文，提取能力/完整性须验证后再复用，避免对已得到的完整正文重复计费。
- 用户授权的是当前环境中已配置的可用工具，不包括静默安装缺失工具或擅自复制凭据。

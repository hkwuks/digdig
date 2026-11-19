# Spec — 按能力路由搜索与正文抽取
> Task version: v2

## v2 用户纠正（优先于下方 v1 的直连设计）

- 搜索：移除新增 Exa/Tavily/Firecrawl/Jina 直连路径；保留 v0.0.14 已有的 SearXNG、Ollama、DeepSeek 显式路径。Agent 外部搜索结果通过现有 results-add 导入。
- 抽取：不依据用户环境变量或已安装 CLI 自动调用第三方服务；Agent 外部抽取后导入。保留本地 Defuddle、原有显式 --obscura 与 --jina，保留内容类型保护。
- 历史：根据 Jina 搜索来源和抽取元数据保守提示可能不完整，不修改正文、审批、证据、修订号或数据库；提示不是对原文完整性的断言。
- 安全、已有 session 的兼容和不可确认输入类型的如实报告继续有效；不新建兼容 shim。

## Objective and Success Criteria

遵循 PRD 的首批工具和验收条件；类型不匹配时不调用工具，可用工具按明确能力与用户配置路由，保留既有结果语义。

## Architecture Boundaries and Responsibilities

1. 内容判断层：接受 URL、已有 HTTP 响应/元数据，报告 `html | pdf | office | image | structured | other | unknown`、证据及置信度。已知强证据优先；HEAD/GET 响应可能缺失、错误或重定向，未知不作支持判断。复用已有正文和已完成请求，不无条件先请求两次。
2. 能力/发现层：对每个 provider 按版本/可用性分别声明 search、extract、接受类型、文本完整性、认证和调用方式；配置、安装、运行成功分开。无工具、无凭据、不可用及类型不支持不能混成一种状态。
3. 适配层：保留现有 SearXNG/Ollama/DeepSeek 搜索及 Defuddle/Jina/Obscura；增加经官方接口核实的 Exa、Tavily、Firecrawl 及 Ollama/DeepSeek Fetch。Jina 搜索在官方接口认证和结构实证后接入。搜索响应进入现有融合，抽取响应进入现有 session outcome，不重复抽取已有正文。
4. 宿主/CLI 边界：优先复用现有 `results-add` 导入；独立进程的已安装工具使用经验证的 CLI 或 MCP 桥接，显式持有连接信息；仅有宿主上下文的工具由宿主桥接调用，不能伪称普通进程自动可见。Windows 和 Linux 检测及可执行文件调用分别测试。

## Project Structure / Affected Files

`cli/src/deep/extractor.ts`、`cli/src/commands/extract.ts`、`cli/src/runCli.ts`、`cli/src/config.ts`、搜索 provider 与 fusion 模块、`cli/src/deep/session.ts` / `results-add`、相关测试、README 与项目 `skills/digdig/SKILL.md`。按依赖拆小提交，不改用户配置目录下 skills。

## Interfaces, Data Flow, and Contracts

- 各工具必须返回实际 provider、原始 URL、时间、完整正文或标记为片段、失败分类；按结果逐项处理，HTTP 200 不代表所有 URL 成功。
- 使用现有 provider 错误/结果 envelope 与来源结构；对外新增字段必须具有清晰语义和兼容测试。尚未证明为正文的搜索摘要、分页截取、query 定向片段不能自动当做完整正文。
- 传入第三方的 URL、query 和认证只作为请求数据；只使用已有用户配置、环境变量、用户提供的工具连接，不打印密钥到命令、日志或 TaskFlow 文件。
- 用户配置即授权该工具，不能在成功抽取正文后继续无条件调用下一个计费工具；用户设置限额时应遵守该限额，未设置时不发明强制预算。

## Invariants and Compatibility

- 默认已支持行为和显式选项必须保持可用；避免改变不相关搜索行为及现有 JSON 字段含义。已有 session 数据不迁移、不丢失，结果进入 pending 审核流程。
- 对明确不支持输入禁止发送付费抽取请求；未知和不支持分开；服务的成功/失败计费规则以官方与版本实际情况为准，不承诺零成本探测。
- 同 URL/内容复用已获得的正文，避免重复请求；不得据字数或后缀单独宣称正文完整。
- 对未识别工具不推断 CLI 参数或接口；不得自动安装；工具缺失或不可执行时清楚报告并继续其他合适候选。

## Validation and Error Semantics

- URL 必须按各工具文档验证方案与长度；本地/私有和认证资源不向无法访问的第三方盲发。重定向、私有地址及网络访问遵循现有安全边界。
- 类型分类使用 MIME、已有来源元数据及有限探测；按字段可信度、重定向和内容冲突处理。HEAD 不支持或网络错误得到 unknown，不作为确定不支持。
- 保持分项失败、401/403、429、5xx、超时、错误响应和空结果的区别；仅在合理条件继续候选，不吞掉限流信息。

## Code and Test Constraints

受控 HTTP/mock 与假 CLI/MCP 覆盖真实编排路径，断言各类型能否调用、请求次数、参数、响应、身份及会话写入；没有真实 key 的默认测试不得联网或花费额度。Windows 和 Linux 使用独立 shell/可执行发现。运行项目 Vitest 全量、类型检查和相关 CLI 实测。

## Design Decisions and Alternatives

优先复用源码中的直接 HTTP 和 `results-add`，以适配器处理服务差异；不建设独立插件市场，也不为未知第三方接口编造通用参数。宿主内工具与 CLI 双路径需真实探测，不将某个 host 的实现写成跨宿主承诺。

## Open Questions

各适配器对未知内容和扫描件等细分类型只有在官方有明确证据或已实测时才赋确定值；其余保持 unknown，并在测试和用户说明中披露。各运行环境实际安装的工具仍由运行时探测。

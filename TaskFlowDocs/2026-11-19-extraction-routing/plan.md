# Plan — 按内容类型复用搜索与抽取工具
> Task version: v2
> Status: ready

## Spec Pointers
- `spec.md`：工具能力、发现、适配及结果契约。

## Reference Pointers
- `TaskFlowDocs/repository-docs/index.md`：路由记录；`LICENSE`、`CODE_STYLE.md`、`CONTRIBUTING.md`：许可、代码、验证及 PR 格式。
- `cli/src/deep/extractor.ts`、`commands/extract.ts`、`commands/results-add.ts`、`runCli.ts`、`config.ts`、`service.ts`、已有 provider 和对应测试。
- `README.md`、`README.zh-CN.md`、`skills/digdig/SKILL.md`：用户和 Agent 入口。
- 外部文档与能力取证详见 PRD 的 External Facts 和 `reference/capabilities.md`。

## Related Tasks
- `TF-20261110-a7e5c1`：原研究与当前实现；`TF-20261116-f8776d` 的分页研究独立，不在本任务中。
- `TaskFlowDocs/achieved/2026-11-11-extraction-provenance/`：短正文、摘要保护与提取来源契约，保持不回退。

## Skills / Tools Used
- [PRD] Declared `agent-skills:spec-driven-development` — 将用户确认的支持范围、费用与未知类型要求转为验收标准。
- [Spec] Declared `agent-skills:api-and-interface-design` — 区分能力、可用性、正文/片段、错误和宿主边界。
- [Plan] Declared `agent-skills:planning-and-task-breakdown` — 按类型判断、首批适配、宿主桥接和端到端验证排序。
- [Test] Declared `agent-skills:test-driven-development` — 先做受控失败验证，再覆盖类型门禁、计费请求数量、部分失败和会话。
- `get-api-docs`：chub 查得 Tavily JavaScript 文档；Exa、Firecrawl、Ollama、DeepSeek Fetch 未找到匹配条目，使用官方 API 文档交叉核实。
- Web / Exa：读取各厂商类型与接口文档；真实 Exa 宿主读取和本地 `dg` HTML/PDF/JSON 样本用于界定现状，不视为完整质量基准。

## v2 用户决定
- 用户于 2026-11-19 确认移除四家新增直连搜索，保留原有后端；外部抽取由 Agent 选择、调用和导入；历史 Jina 数据保留并提示核实。原 v1 直连及自动回退计划不再适用。
- 工作树 `D:/WorkSpace/Node/digdig/.worktrees/2026-11-19-agent-tool-boundary`，分支 `fix/2026-11-19-agent-tool-boundary`。保留旧工作树数据。

## Preconditions
- 用户已确认已配置工具允许使用、首批工具范围和未知类型先低成本探测；若已有用户预算配置则遵守。
- 用户已明确要求并确认实施范围、自动调用及未知类型处理；按该授权进入实现。工作树 `D:/WorkSpace/Node/digdig/.worktrees/2026-11-19-extraction-routing`，分支 `feat/2026-11-19-extraction-routing`。

## Plan Review
- Verdict: sound
- Notes: 已按用户决定核对首批工具、自动调用及未知类型处理，未将未知能力标成已支持。
- Coverage: Steps 1–4 对应类型门禁、首批工具、宿主/CLI 与会话集成，Step 5 覆盖全量验证。
- Verifiability: 分别断言不兼容请求为零、合适工具被调用、内容和来源可追溯、错误与限流完整传递。
- Layer ownership: 类型判断属于资源层；工具能力属于适配器；决策属于编排层；既有 session 层仍持有持久化和审核规则。

## Approval
- Status: approved
- Approved by: user
- Approved at: 2026-11-19 14:23 +0800
- Approved version: v2
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — 类型事实与现有工具
- Goal: 以证据判断类型并避免不兼容调用，修正现有特殊抽取路径。
- Dependencies: v1 批准。
- Files: 抽取器、命令和对应测试。
- Implementation checklist:
  - [x] 先复现 HTML、PDF、误导后缀、未知类型与 Obscura 入口问题。
  - [x] 引入必要类型判断与现有工具能力声明，保留已获正文、错误与限流语义。
- Acceptance: 明确不支持不调用；未知不误判；现有行为回归通过。
- Verification: 受控 HTTP、假抽取器及 session 单测。
- Rollback: 回退本步提交。
- Status: done

### Step 2 — 首批服务的搜索与抽取
- Goal: 基于官方 API 实现已配置工具的真实可调用路径与适配。
- Dependencies: Step 1 的分类和能力契约。
- Files: provider、config、CLI 路由和对应测试。
- Implementation checklist:
  - [x] 实现 Exa、Tavily、Firecrawl、Ollama、DeepSeek、Jina 经核实的搜索/抽取入口及适配。
  - [x] 验证 URL 类型、无认证、错误、限流、批量部分失败、请求数量及片段/正文边界。
- Acceptance: 每项首批工具的请求和返回有可执行契约测试；未验证类型保持 unknown。
- Verification: Mock HTTP、无网络无密钥测试，必要时对公开页面做无费用探测。
- Rollback: 按 provider 回退提交。
- Status: done

### Step 3 — 已安装工具与宿主复用
- Goal: 正确发现并复用运行环境支持的 CLI/MCP 或 Agent 宿主工具。
- Dependencies: Step 1–2。
- Files: 发现/桥接、CLI、结果导入与测试。
- Implementation checklist:
  - [x] 区分未安装、无法启动、未认证、可调用；测试 Windows / Linux 查找与调用，不自动安装。
  - [x] 复用宿主已得正文和已有导入契约，证明可用工具能按类型调用、不重复付费；不可见工具清楚报告。
- Acceptance: 本机可用能力和宿主能力不混淆，返回来源可追溯。
- Verification: 假 CLI/MCP、真实环境非付费只读调用及 session 集成。
- Rollback: 回退适配/桥接提交。
- Status: done

### Step 4 — 持久化和文档
- Goal: 搜索、正文和片段准确进入原工作流，用户知道能力与未知边界。
- Dependencies: Step 1–3。
- Files: 结果导入、会话、README、项目 skill 和测试。
- Implementation checklist:
  - [x] 测试同源结果去重、已有正文复用、部分失败、摘要不可冒充正文和用户额度控制。
  - [x] 更新中英文文档、项目 skill 与真实配置说明。
- Acceptance: 不破坏旧 session 和 CLI；来源、错误、局限对用户可见。
- Verification: 集成测试及文档命令表验证。
- Rollback: 回退本步提交。
- Status: done

### Step 5 — 完整验证与审查
- Goal: 核验所有验收条件、平台与无凭据情况。
- Dependencies: Steps 1–4。
- Files: 全部变更。
- Implementation checklist:
  - [x] 运行针对性测试、`npx tsc --noEmit`、项目全量测试与构建。
  - [x] 复核来源、接口、秘密、费用、未验证服务及结果；记录局限。
- Acceptance: 所有可验证验收项通过；网络/额度不可验证处如实说明。
- Verification: Windows、WSL Node 24；真实付费接口不作为默认测试。
- Rollback: 回退功能分支提交。
- Status: done

## Checkpoints
- 先测试真实 provider 的请求与 session 不变量，再完成每个适配器；类型不确定与失效认证不得伪装成功。

## Verification / Review
- 2026-11-19：第一批测试先重现 PDF/JSON/图片错误回退及 CLI 未传 Obscura 标志；修改后相关 58 项通过，`npx tsc --noEmit` 通过。类型适配与新 provider 尚未完成，不能视为整体验收。
- 规划阶段：当前 `dg` 普通 HTML 成功，PDF/JSON 样本失败；Exa 宿主读取成功；`tvly` PATH 启动失败。样本不代表质量或所有类型。

## Change Log
- 2026-11-19 reopen — retrieved achieved task `2026-11-19-extraction-routing` for new work; re-approval required before core changes
- 2026-11-19：基于用户选择将原研究待办扩展为首批多工具能力路由和兼容实现，不新建汇总 Todo。

## Follow-ups
- SearXNG 自动分页仍属独立研究项；本任务不更改。

## Version History
- v1 — 用户确认已配置工具可用、首批范围与未知类型探测。

### 2026-11-19 12:16 implementation checkpoint
- 已实现 MIME 门禁、Obscura 参数检查和 Exa / Tavily / Firecrawl / Ollama / DeepSeek 的初版正文回退；当前仍在开发，不能视为验收完成。
- 已通过 65 个相关单测及 TypeScript 检查，接口均使用模拟请求；服务错误、类型覆盖、搜索入口、已安装 CLI/MCP 复用、文档、跨平台与全量验证仍需完成。

### 2026-11-19 implementation and verification update
- 已实现 Exa、Tavily、Firecrawl、Jina 的显式搜索，Ollama/DeepSeek 沿用既有搜索；上述六者具备按类型的正文回退。Jina 搜索已返回的正文进入同一 session，不再重复抽取。
- Tavily CLI 仅在可启动且已认证时用于搜索或抽取；MCP/Agent 宿主工具通过项目 skill 和现有 `results-add` 契约复用。当前本机 `tvly` 指向不存在的 Python，无法做真实 CLI 端到端验证。
- 已做内网字面地址和 DNS 解析检查；解析失败或任一解析地址为内网时不向第三方发送。DNS 重绑定与第三方重定向仍不属于完整 SSRF 防护。
- Windows：构建及全量 852 项通过（全量超时设 30 秒）；WSL Node 24：类型检查和 66 项定向测试通过；随后增加的失败详情由定向测试验证。所有供应商请求测试均为 mock，未消耗真实额度。
- 待完成：最终全量复验最新失败详情改动、审查 API 真实可用性及 TaskFlow 验收；无凭据和本机损坏 CLI 限制不能当作真实端到端通过。当前维持 in_progress，未提交或合并。

### 2026-11-19 final verification and cleanup
- Windows：`npx vitest run --testTimeout 30000` 通过 852 项；`npm run build`、`npx tsc --noEmit` 和 `git diff --check` 通过。WSL Node 24：类型检查及 79 项定向测试通过。之后只修改测试 mock，单独回归通过。
- `test/unit/session-merge.test.ts` 未隔离 `recordSuccessfulQuery`，运行时创建了工作树 `cli/session`。已修正 mock；该目录及 `.migration-lock.sqlite` 因自动审批拒绝删除而保留，尚需用户决定。其余项目内临时测试目录已清理。
- 尚未进行真实付费 API 或本机失效 Tavily CLI 的端到端测试；DNS 校验无法防止后续重绑定或第三方重定向。未提交、未合并。

### 2026-11-19 Tavily update and release-rule scope
- 用户明确要求更新 Tavily CLI 并测试；官方 Python 包已弃用，迁移至官方 npm `@tavily/cli`。Windows 安装 1.0.1 后保留旧入口及原有认证；搜索、抽取及 digdig 适配器各完成真实请求验证。
- 用户要求更新仓库规则，下次发布带 GitHub Release，本次发布目标 0.1.0；沿用现有任务和分支，不登记汇总 Todo。实际发布须先完成当前功能、验证及合并，遵循现有版本/tag 流程。
- Windows 的 npm CLI 是 `.cmd` shim，Node 的 `execFile('tvly')` 会命中旧的损坏 Python `.exe`；以 Node 直接执行已确认的 npm 包入口，参数按数组传递，不经过 shell；新版状态用 `--status --json` 判定，支持官方无密钥模式。

### 2026-11-19 Tavily and release-rule verification
- Windows npm `@tavily/cli` 1.0.1：`tvly --version` 成功，`--status --json` 显示已认证；直接搜索及抽取公开页面成功。通过构建后的 digdig 适配器实测：可发现 CLI，搜索 1 条，抽取 example.com 正文 958 字符。测试使用用户已授权的真实工具调用。
- TypeScript 检查通过；Tavily 及 provider 路由定向测试 30 项通过，覆盖 Windows npm shim 和无密钥模式；`git diff --check` 通过。
- `CONTRIBUTING.md` 增加 npm 发布后创建并核对同 tag GitHub Release 的规则；修正 `publish.yml` 中与现行显式打 tag 流程冲突的旧注释。下一次实际发布目标为 0.1.0；本次没有打 tag、发布或合并。
- 旧 Python `tvly.exe` 仍在 PATH 的较后位置，未删除；当前 PowerShell 解析到新版。现有任务保持 in_progress，继续进行 TaskFlow 验收及后续提交。

### 2026-11-19 验收复核
- 原 v1 需求：已接入用户指定的服务并区分正文/片段；本地已有正文不重复付费，PDF、DOCX、图片/JSON 不会盲目送到不兼容工具。未知类型先尝试本地探测，外发前检查 DNS 和地址。
- 外部工具：Windows 实测 npm 版 Tavily 1.0.1 的状态、搜索、抽取和 digdig 适配器；WSL 使用模拟 CLI/API 验证。Agent 宿主沿用 `results-add`，不假设 MCP 可由子进程调用。Tavily 支持已认证和受限无密钥模式；不声称完整区分所有 CLI 安装故障。
- 验证：Windows 全量 854 项通过；之后新增 DOCX 及单项失败回退两个定向测试通过。WSL Node 24 定向 80 项通过、1 项仅 Windows 的测试跳过；TypeScript 和构建通过。非 Tavily 付费 API 以 mock/官方文档验证，未逐家真实扣费联调。
- 安全及兼容限制：检查 DNS 不防重绑定或第三方重定向；某些类型能力未核实，保守跳过；此前会写入测试会话的 mock 已修复。无已有测试期望被改成放宽产品行为。
- 范围补充：用户明确要求 Tavily 更新、发布规则和本次 0.1.0；分别已做和记录，待本分支合并及 CI 成功后发布，创建同 tag GitHub Release。

### 2026-11-19 最终验收及用户决定
- 用户确认完成并合并当前功能后发布 0.1.0，npm 发布成功后创建同 tag GitHub Release；旧 uv Tavily 已按用户要求卸载，npm 1.0.1 及已有认证复核正常。
- `--engines-list` 对 Tavily CLI 显示 authenticated、keyless、not_installed、unavailable；相关单测覆盖这些状态与 Windows npm 入口。Windows 最新全量 857 项通过，`npm run build`、`npx tsc --noEmit` 及 `git diff --check` 通过。WSL Node 24 定向 80 项通过、1 个 Windows 专属测试跳过。
- 本次真实 Tavily 搜索和抽取均成功；其他云服务使用官方契约和 mock 测试，未知类型、第三方接口变化、DNS 重绑定和重定向仍有前述边界。用户允许后已删除仅含测试数据的 `cli/session`，未删除任何用户会话。

## Todo Record

Moved verbatim from the TODO entry by `hooks/archive`, grouped by the field each block followed.

### `- Notes:`

- 2026-11-19 用户要求按内容类型及兼容性复用已配置工具，首批覆盖现有能力、Exa、Tavily、Jina、Firecrawl、Ollama、DeepSeek；未知类型先低成本探测，已配置工具可自动使用，若有用户配置预算则遵守。

### `- Notes:`

- 2026-11-19 用户追加要求：更新 Tavily CLI 并实测；完善仓库发布规则，发布时创建 GitHub Release；当前功能的下一次发布目标版本为 0.1.0。沿用同一分支和原任务，不新建汇总 Todo。

### Step 6 — 恢复 Agent 主导的工具边界
- Goal: 移除新增直连搜索及自动外部抽取，保留既有显式后端、类型保护和结果导入。
- [ ] 先验证默认不调用新增服务、已有搜索/抽取仍工作；再修改调用路径。
- [ ] 更新项目内 skill、README 和能力说明，明确 Agent 选择与导入。
- Status: pending

### Step 7 — 历史提示和验证
- Goal: 保留历史数据并提示核实 Jina 直连搜索内容完整性。
- [ ] 为待审核及已审核历史记录提供无副作用提示；避免误称所有 Jina 抽取都不完整。
- [ ] 验证现有 session、原有后端、Windows 与 WSL 兼容性和全量回归；记录限制。
- Status: pending

## v2 Change Log
- 用户指出原 Agent 工具导入策略被误改；其已确认三项纠正决定。未新建 Todo，未删除远端分支。

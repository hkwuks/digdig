# Plan — 真实抽取方法与正文保留
> Task version: v1
> Status: in_progress

## Spec Pointers

- `spec.md`

## Reference Pointers

`TaskFlowDocs/repository-docs/index.md`、`CONTRIBUTING.md`、`CODE_STYLE.md`、`.github/pull_request_template.md`；`cli/src/deep/extractor.ts`、`cli/src/commands/extract.ts`、`cli/src/deep/session.ts` 和现有抽取/会话/CLI 测试。PR 模板五节覆盖触发问题、最终行为、具体验证、兼容性及不在范围。远端 `origin` 为 `https://github.com/hkwuks/digdig.git`，base main；PR 前重新核对。

## Related Tasks

主 Todo C14 `TF-20261103-7bfb6a`；关联 D11 `TF-20261103-761aa5` 的三个抽取子项。D11 还包含其他图/文档问题，不因本任务完成而关闭。抽取优先级与插件方案 `TF-20261110-a7e5c1` 是研究任务，保持独立。

## Skills / Tools Used

- [PRD] Declared `agent-skills:debugging-and-error-recovery`：核对实际抽取器、命令和持久化链路；阶段能力为显式声明，非宿主捕获。
- [Spec] Declared `agent-skills:api-and-interface-design`：定义方法、短正文、摘要和长度的输出/持久化契约。
- [Plan] Declared `agent-skills:planning-and-task-breakdown`：按真实抽取→会话记录→验证拆解，TaskFlow 目录优先。
- [Test] Declared `agent-skills:test-driven-development`：先编写真实受控抽取器及命令失败测试，再修复。
- Git 创建项目 `.worktree/extraction-provenance`，分支 `fix/2026-11-11-extraction-provenance`；本地安装锁文件依赖。

## Preconditions

用户已确认三个关键口径：短非空正文在现有回退无更好结果时成功；空白摘要保留旧值；新长度以 UTF-16 代码单元计且不批量改旧记录。实施前需批准 v1。

## Plan Review

- Verdict: sound
- Coverage: C14 与短正文由 Step 1 覆盖，摘要与长度由 Step 2 覆盖；真实命令、跨平台、历史兼容和 CI 在 Step 3 复核。
- Verifiability: 先以真实 ContentExtractor 和受控 fetch/回退失败路径重现，再以 SQLite 和命令输出断言；不以模拟命令层测试代替真实抽取器。
- Layer ownership: 抽取器负责实际方法和正文，命令负责输出和传递，会话负责持久化及保护摘要；不更改与需求无关的图或检索架构。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-11 17:31 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — 抽取器结果与实际方法

- Goal: 实际方法可追溯，非空短正文不再被错误判为失败，既有回退边界保留。
- Dependencies: 用户批准 v1。
- Files: extractor.ts、commands/extract.ts、实际抽取器及命令测试。
- Implementation checklist:
  - [x] 对真实默认抽取器、短正文、失败回退和实际方法先构造失败回归。
  - [x] 使用实际 `method` 而非选项推断；非空短正文在回退无更好结果时保留；空或真实错误仍失败。
- Acceptance: 已获取的短正文不丢失；默认、Jina 和 Obscura 来源不误报。
- Verification: 受控真实 Defuddle、回退调用、错误及真实命令/会话读回。
- Rollback: 隔离测试会话；不修改历史数据。
- Status: done

### Step 2 — 摘要及正文长度

- Goal: 空摘要不覆盖既有摘要，长度单位统一为 UTF-16 代码单元。
- Dependencies: Step 1。
- Files: extractor.ts、session.ts、结果导入和会话测试。
- Implementation checklist:
  - [x] 先验证空/空白摘要覆盖和词数/字符长度不一致。
  - [x] 新结果输出及会话写入长度一致，包含中文/emoji，历史记录不批量更改。
- Acceptance: 空白摘要保留原值、非空正常更新；长度等于实际正文 `.length`。
- Verification: SQLite 读回、命令输出、不同抽取路径与非 BMP 文本。
- Rollback: 无历史批量改动；事务失败不改数据。
- Status: done

### Step 3 — 完整复核及交付

- Goal: 更新文档及 D11 子项状态，按仓库格式提交 PR 并通过 CI。
- Dependencies: Step 1–2。
- Files: README、CHANGELOG、测试、TaskFlow 文档与 Todo。
- Implementation checklist:
  - [x] 核对所有调用方、部分失败/限流及旧数据边界，更新说明；D11 未修子项保持开放。
  - [ ] 运行定向、全量测试、类型检查、构建和 CI，按仓库模板创建待审阅 PR。
- Acceptance: C14 和三项抽取细节可复现验证；其他 D11 不误关闭。
- Verification: 完整本地测试、真实编译 CLI、Node 24.15/24.x CI。
- Rollback: 不发布；保留工作树到审阅和合并。
- Status: in_progress

## Checkpoints

批准后先写失败回归；若不能达到已确认的失败/回退语义，先报告。

## Verification / Review

- 2026-11-11：核对当前提取器和会话代码，发现真实方法覆盖、短正文错误、空摘要覆盖及长度单位混用；此为静态检查，尚未宣称动态复现。
- 2026-11-11：worktree 内 `npm ci` 成功，安装 127 个锁文件依赖。
- 2026-11-11：修复前新增回归复现 6 项失败；修复后定向 26 项通过，`tsc --noEmit` 和 `tsc` 通过。全量默认并发 768 通过、2 项本地索引测试超时；`vitest run --maxWorkers=2` 69 文件、770 项通过（新增 3 个定向测试前）。
- 2026-11-11：最终 `vitest run --maxWorkers=2` 69 文件、773 项通过；编译后的 CLI 经本地 HTTP 服务验证短正文、真实方法及 UTF-16 长度。

## Change Log

## Follow-ups

抽取插件/优先级研究和 D11 其他子项不在此任务内。

## Version History

- v1 — planning.

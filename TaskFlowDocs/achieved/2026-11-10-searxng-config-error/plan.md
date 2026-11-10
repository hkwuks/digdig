# Plan — P6 — baseUrl 缺失时报错误导、retryable 判定错
> Task version: v1
> Status: completed

## Spec Pointers

- `spec.md`

## Reference Pointers

`cli/src/service.ts`、`cli/src/runCli.ts`、`cli/src/errors.ts`、`cli/test/unit/searxng-errors.test.ts`、`cli/test/unit/provider-routing.test.ts`、`CONTRIBUTING.md`、`CODE_STYLE.md`。

## Related Tasks

P10、C9 分别在独立工作区处理。

## Skills / Tools Used

- [PRD] Unaided — Codex 未自动捕获技能调用，按宿主声明阶段记录；considered: root cause investigation
- [Spec] Unaided — 未调用专门设计技能；considered: architecture and design
- [Plan] Unaided — Codex 未自动捕获技能调用，按宿主声明阶段记录；considered: work breakdown
- [Test] Unaided — Codex 未自动捕获技能调用，按宿主声明阶段记录；considered: testing strategy
- 实际读取并采用 `agent-skills:debugging-and-error-recovery`、`agent-skills:planning-and-task-breakdown`、`agent-skills:test-driven-development`：追踪多入口与提供商选择，规划并先复现边界；阶段声明不代表没有读取技能。

## Preconditions

用户确认只使用外部提供商时不要求 SearXNG baseUrl。

## Plan Review

- Verdict: sound
- Coverage: Step 1 覆盖四个 SearXNG 入口、外部和混合提供商以及合法 URL 错误；Step 2 覆盖全量回归。
- Verifiability: 模拟 HTTP 在真实 CLI/服务调用路径上检查错误、非零、提示和请求次数，验证不依赖当前用户配置。
- Layer ownership: 服务边界识别配置缺陷，CLI 将已识别错误按统一协议暴露，不通过改变错误文案掩盖请求已发出的事实。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-10 15:43 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps

### Step 1 — Implement and verify

- Goal: SearXNG 配置缺失或无效时在请求前统一失败，并保留外部提供商独立性。
- Dependencies: 无。
- Files: `cli/src/errors.ts`、`cli/src/service.ts`、`cli/src/runCli.ts`、相关测试。
- Implementation checklist:
- [x] 复现四入口、无效 URL 类型、仅外部及混合提供商边界。
- [x] 在正确边界实现配置检查和一致错误输出。
- [x] 验证合法配置错误分类和失败前无任何请求。
- Acceptance: PRD 的三项行为和所有入口通过。
- Verification: 运行 SearXNG 错误、引擎列表、提供商路由及 CLI 定向测试。
- Rollback: 独立工作区代码和测试差异。
- Status: done

### Step 2 — 验证和交付

- Goal: 全量验证及审查，准备独立 PR。
- Dependencies: Step 1。
- Files: 任务记录及 PR 模板。
- Implementation checklist:
- [x] 运行完整测试、类型检查和差异审查。
- Acceptance: 测试通过或明确记录可复现的基线问题。
- Verification: `npm.cmd test -- --maxWorkers=2`、`tsc --noEmit`。
- Rollback: 保留原始 main 和独立分支。
- Status: done

## Checkpoints

## Verification / Review

- 2026-11-10 Step 2: 7 targeted; 660 full; typecheck passed

- 2026-11-10 Step 1: 7 targeted; 660 full; typecheck passed

- 隔离用户配置运行 `npm.cmd test -- --maxWorkers=2`：56 文件、660 测试通过；`npx.cmd tsc --noEmit`：通过。
- 定向集成测试覆盖搜索、健康检查、引擎和分类入口，Ollama/DeepSeek 独立搜索，以及混合提供商请求前检查。
- 六组旧测试显式设置测试地址，避免使用运行者本机配置；审查未改变其错误断言。

## Change Log

## Follow-ups

## Version History

- v1 — planning.

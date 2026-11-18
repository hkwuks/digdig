# Plan — 修复简单缺陷
> Task version: v1
> Status: completed

## Spec Pointers
- `spec.md`

## Reference Pointers
- TaskFlowDocs/repository-docs/index.md、LICENSE、CONTRIBUTING.md、CODE_STYLE.md：按工作树、类型检查与完整测试执行。
- cli/test/benchmark/performance.bench.ts：四项门禁与单次测量；单独运行 4/4 通过。
- cli/src/runCli.ts、cli/src/commands/graph-input.ts、cli/src/deep/session-migrate.ts：CLI 空入口及旧会话路径行为。

## Related Tasks
- TF-20261107-97e119：性能门禁误报。
- TF-20261103-1350fc：无效 --graph，拟删除无效搜索选项。
- TF-20261103-761aa5：旧 graph-only 路由，保持独立图及迁移入口。
- TF-20261118-9bd13b：独立日志待办，仅登记。

## Skills / Tools Used
- [PRD] Unaided — considered: root cause; 调查性能断言及图路径，参考 debugging-and-error-recovery。
- [Spec] Unaided — considered: architecture and design; 测试测量与生产代码边界。
- [Plan] Unaided — considered: work breakdown; 分解实现及验证。
- [Test] Unaided — considered: testing strategy; 设计尖峰和持续退化测量检查。
- [Plan Review] Unaided — considered: plan review; 对照验收和归属层。
- 参考 performance-optimization 和 ponytail，先测基线并保持改动最小。

## Preconditions
用户要求保留性能门禁并改进测量；用户确认删除无效 --graph，保留旧入口，并保留性能阈值。

## Plan Review
- Verdict: sound
- Coverage: Step 1 覆盖验收 1、4、5；Step 2 覆盖验收 2、3、5。
- Verifiability: 测量检查需证明瞬时尖峰可忽略且持续退化导致失败；全量测试验证回归。
- Layer ownership: 测量误报在 benchmark 测试层修复；不修改基准阈值或生产输入来掩盖性能问题。

## Approval
- Status: approved
- Approved by: user
- Approved at: 2026-11-18 11:27 +0800
- Approved version: v1
- Approved scope: PRD / Spec / Plan

## Steps
### Step 1 — 稳定性能门禁
- Goal: 保持四项门禁及阈值，减少单次调度抖动。
- Dependencies: 完成方案审查和用户批准。
- Files: cli/test/benchmark/performance.bench.ts 及必要测试。
- Implementation checklist:
  - [x] 加入预热、多次测量及中位数并验证噪声和退化场景。
  - [x] 运行四项基准及全量测试、类型检查。
- Acceptance: 原阈值保留；噪声和持续退化判定符合预期。
- Verification: 针对性测试及完整套件。
- Rollback: 还原任务提交。
- Status: done

### Step 2 — 删除无效搜索选项
- Goal: 删除无效搜索 --graph，保留现有旧数据入口。
- Dependencies: 用户确认。
- Files: cli/src/runCli.ts、相关 CLI 测试。
- Implementation checklist:
  - [x] 删除选项及死参数并添加 CLI 回归测试。
  - [x] 验证原有独立图与迁移测试。
- Acceptance: 旧选项明确拒绝；既有图路径回归通过。
- Verification: CLI 与迁移回归测试。
- Rollback: 还原任务提交。
- Status: done

## Checkpoints
## Verification / Review
- 基线性能基准 4/4 通过；修复前 CLI 回归测试确认 `--graph` 被接受，修复后被拒绝。
- `node node_modules/vitest/vitest.mjs run test/benchmark/performance.bench.ts test/unit/cli.test.ts test/integration/graph-input-session.test.ts test/integration/graph-obfuscate-storage.test.ts test/integration/session-sqlite-integration.test.ts --maxWorkers=2`：5 文件、47 测试通过；新增模拟时钟测试后性能文件 5/5 通过。
- `node node_modules/typescript/bin/tsc --noEmit`：通过。
- `node node_modules/vitest/vitest.mjs run --maxWorkers=2`：70 文件、808 测试通过。
- 复核：四个原阈值不变；预热一次并取五次测量中位数。模拟时钟验证一次尖峰与持续超时；门禁仍对持续退化失败。CLI 移除旧参数注册、传递与类型，未改会话迁移或独立图处理。
- 其余候选经调查：锁竞态需并发设计；provider 限制需明确上游行为；阈值配置和 SimHash 清理非简单缺陷；CLAUDE.md 是主工作区用户未跟踪文件，未修改。D11 的 mixed 采样此前已决定暂缓。

- 基线：`node node_modules/vitest/vitest.mjs run test/benchmark/performance.bench.ts --maxWorkers=1`：4/4 通过。
## Change Log
- v1：按用户确认修正锁竞态待办的过时描述，明确 SQLite 事务、旧迁移目录锁及需验证的边界；未改锁实现。
- v1：按用户确认删除空选项、保留旧图路径并稳定性能测量；完成测试。
- v1：初步调查；用户确认删除无效搜索选项并保留旧图入口。
## Follow-ups
- 独立 graph.json 的后续支持范围需单独决定；连续高负载仍可影响性能门禁。
- 日志待办 TF-20261118-9bd13b：默认关闭、只在本地用于反馈、不上传远端。
## Version History
- v1 — planning.

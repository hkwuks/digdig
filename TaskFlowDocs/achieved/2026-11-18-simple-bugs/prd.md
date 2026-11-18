# 修复简单缺陷并记录日志待办
> Task version: v1
> Status: completed

## Goal
修复已确认的简单缺陷，保留性能门禁，并记录本地反馈日志需求。

## Task Kind
- Kind: defect

## Background / Confirmed Facts
`--graph` 原有自动写图逻辑在 00a12c2 被会话审核流程取代，选项仍接受但不工作。性能基准单次测量受调度噪声影响。SQLite 会话的旧 JSON 自动迁移已经存在，graph-only 自定义路径与独立图文件无法仅凭文件辨别。日志需求单独登记为 TF-20261118-9bd13b。

## Requirements
保留性能门禁与原阈值，通过预热及多次采样中位数降低瞬时抖动；确认门禁对持续超过阈值仍失败。删除无效 --graph 搜索选项；保留旧 JSON 迁移和独立图文件处理。

## Acceptance Criteria
1. 四项性能门禁保留，预热后多次测量取中位数，原阈值不放宽，稳定高于阈值的实现仍失败。
2. 搜索命令不再接受无效 --graph 选项，并有回归测试。
3. 旧 JSON 迁移和独立图文件处理保持现状，不影响现有 SQLite 会话。
4. 日志模块待办保留默认关闭、只供本地反馈、绝不上传远端的要求，不在本任务实现。
5. 针对性测试、类型检查及全量测试通过，准确更新相关待办。

## External Facts
- Depends on external facts: no
- Why not: 性能测试和迁移行为在 `cli/test/benchmark/performance.bench.ts`、`cli/src/runCli.ts` 和 `cli/src/deep/session-migrate.ts` 内确定。

## In Scope
已确认的性能基准与用户确认后的简单修复；日志需求登记。

## Out of Scope
日志实现、并发锁重设计、provider 接口策略、阈值配置功能；之前明确暂缓的 mixed 采样。

## Risks / Deferred Items
中位数不能消除持续负载或慢机器造成的误报；重复采样会增加测试时间。

## Open Questions
无。

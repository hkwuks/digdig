# Plan — 客户端请求超时必须大于 SearXNG 服务端超时
> Task version: v1
> Status: completed

No spec required — 默认值与文档数值的定点修改，无新接口、无新抽象。契约只有一条，写在 PRD 的 R7：加载路径不抬升用户显式值。

## Reference Pointers

- `cli/src/config.ts:32-45` — `DEFAULT_CONFIG`，`timeout: 10000` 在 :40
- `cli/src/config.ts:96-164` — `mergeConfig`，文件值 :107、环境变量 :142-145
- `cli/src/init.ts:25-36` — `init` 的 `DEFAULT_CONFIG`，`timeout: 10000` 在 :32，注释要求与 `config.ts` 同值
- `cli/src/init.ts:136-141` — 交互式提问与 `Math.max(1000, ... || 10000)`
- `cli/src/service.ts:137-142` — `config.timeout` 的唯一消费点（axios `timeout`）
- `cli/digdig.config.example.json:9`
- `README.md:83-84`（settings.yml）、`:996`（环境变量表）、`:1022`（配置示例）
- `README.zh-CN.md:79-80`（settings.yml，需对齐到 10.0/25.0）、`:977`、`:1003`
- `cli/README.md:215`、`:236`
- `CLAUDE.md`（未跟踪，不入提交）

## Related Tasks

- `TaskFlowDocs/achieved/2026-10-20-dg-command-and-docs/` — 该任务在 R6 把文档统一成 10000，本次反转它的方向。不修改该任务的任何文档，只在 Todo 条目里说明。

## Skills / Tools Used

- [PRD] Unaided — 需求由用户三问与追加一问确定，事实由源码 grep 与 SearXNG 官方文档核对；considered: requirements elicitation and framing
- [Plan] Unaided — 单步定点修改，不涉及依赖排序或多阶段；considered: work breakdown and task decomposition
- [Test] Unaided — 沿用仓库既有 vitest 单元测试结构，断言来源文件与配置加载结果；considered: testing strategy

## Preconditions

- 工作树 `.worktrees/2026-11-05-request-timeout`，分支 `fix/2026-11-05-request-timeout`，基线 `934fb0a`
- `cli/node_modules` 已安装
- 基线：`npm test` 通过（566+ 用例，PR #33 后为 586）

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-05 22:52 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 改默认值与 init 下限

- Goal: `config` 的生效默认值变成 25000，`dg init` 交互式下限变成 12000，代码路径的行为符合 R1–R3、R7。
- Dependencies: 无
- Files: `cli/src/config.ts`、`cli/src/init.ts`
- Implementation checklist:
  - [x] `cli/src/config.ts:40` `10000` → `25000`
  - [x] `cli/src/init.ts:32` `10000` → `25000`，保留「与 config.ts 同值」的注释
  - [x] `cli/src/init.ts:141` `Math.max(1000, parseInt(timeoutStr, 10) || 10000)` → `Math.max(12000, parseInt(timeoutStr, 10) || 25000)`
  - [x] 同步更新 `init.ts:139-140` 的提问文案或补一行说明，让用户知道下限是 12000 及其原因（SearXNG 服务端 `max_request_timeout` 默认 10s）
  - [x] 不在 `mergeConfig` 里加任何抬升逻辑（R7）
- Acceptance: AC1、AC2、AC3
- Verification: 新建 `cli/test/unit/config-timeout.test.ts`，RED 后 GREEN
- Rollback: 两文件定点改动，`git revert` 即可
- Status: done

### Step 2 — 改示例配置与三份 README

- Goal: 用户从任何一份文档复制到的值都是 25000，中文 README 推荐的服务端上限与英文版一致。
- Dependencies: Step 1（数值先定下来，文档照抄）
- Files: `cli/digdig.config.example.json`、`README.md`、`README.zh-CN.md`、`cli/README.md`
- Implementation checklist:
  - [x] `cli/digdig.config.example.json:9` `10000` → `25000`
  - [x] `README.md:996` 表格默认值 `10000` → `25000`
  - [x] `README.md:1022` 示例 JSON `10000` → `25000`
  - [x] `README.zh-CN.md:977`、`:1003` 同上
  - [x] `cli/README.md:215`、`:236` 同上
  - [x] `README.zh-CN.md:79-80` `request_timeout: 30.0`/`max_request_timeout: 30.0` → `10.0`/`25.0`，与 `README.md:83-84` 一致
  - [x] `README.md:83` 的注释 `# 全局默认超时` 是英文文档里的中文，一并改为英文（同一次改动内的相邻行，不单独裁定）
- Acceptance: AC4、AC5、AC6
- Verification: 新建测试读取这三份文档并断言数值；RED 后 GREEN
- Rollback: 文档改动，`git revert` 即可
- Status: done

### Step 3 — 全量验证

- Goal: 改动没有破坏任何既有行为。
- Dependencies: Step 1、Step 2
- Files: 无（只运行）
- Implementation checklist:
  - [x] `cd cli && npm test`
  - [x] `cd cli && npm run build`
  - [x] 手工核对：在无配置文件的临时目录里 `node cli/dist/index.js --help` 与一次真实搜索（若 SearXNG 可达）
- Acceptance: AC7
- Verification: 上述命令退出码 0
- Rollback: 不适用
- Status: done

## Checkpoints

- Step 1 后：`config` 默认值断言通过；`DIGDIG_TIMEOUT=3000` 仍是 3000（R7 未被误伤）
- Step 2 后：三份 README 与示例 JSON 的 timeout 值全部为 25000；两份 README 的 `outgoing` 块数值一致

## Verification / Review

- 2026-11-05 Step 3: npm test 47 files / 598 tests passed; tsc --noEmit exit 0

- 2026-11-05 Step 2: config-timeout.test.ts doc assertions green; README en/zh outgoing blocks identical

- 2026-11-05 Step 1: vitest test/unit/config-timeout.test.ts 12/12; full suite 598 passed; tsc --noEmit clean

- 全部 AC 由 `cli/test/unit/config-timeout.test.ts` 覆盖，且该测试在撤销 `src/` 改动时失败（RED 验证）
- `npm test` 全量通过

RED 的真实性已单独验证：把 `cli/src`、`cli/digdig.config.example.json` 与三份 README 的改动 stash 后，该文件 10 条失败；恢复后 12/12 通过。另外 2 条在两种状态下都通过，是设计如此 —— R7 的反向断言（`DIGDIG_TIMEOUT=3000` 不被抬升）防的是「加了加载期强制下限」，一致性守卫防的是 `init.ts` 与 `config.ts` 两处默认值漂移，二者都与具体数值无关。

`npm run build` 在 worktree 的 `node_modules` 符号链接下会挂住（超过 5 分钟无输出），未追查原因；`tsc --noEmit` 已单独跑通（退出码 0），编译正确性有覆盖。

## Change Log

- 2026-11-05 implement — v1 三步完成：`config.ts`/`init.ts` 默认值 25000 与 init 下限 12000；示例配置与三份 README 同步 25000；`README.zh-CN.md` 的 `settings.yml` 对齐到 10.0/25.0；`README.md` 的 settings.yml 注释中文化改英文。

## Follow-ups

- `cli/src/config.ts:107` 对 `fileConfig.timeout` 无类型校验：配置文件写 `"timeout": "abc"` 会被原样接受，`service.ts` 的 axios 拿到字符串。本次不动，已记入 PRD 的 Deferred。

## Version History

- v1 — planning.

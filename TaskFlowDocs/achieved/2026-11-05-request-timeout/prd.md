# 客户端请求超时必须大于 SearXNG 服务端超时
> Task version: v1
> Status: completed

## Goal

`DIGDIG_TIMEOUT` 的默认值 10000 小于本仓库自己推荐给用户的 SearXNG 服务端上限，客户端会在服务端仍在正常工作时先挂断。

2026-10-20 的 `TF-20261018-7c4e12` 修过一次，方向选反了：它发现 `README.md`/`README.zh-CN.md`/`cli/sxng.config.example.json` 写的是 `30000`、而 `DEFAULT_CONFIG` 是 `10000`，就把文档统一改成了 `10000`，没有论证哪个值对。本次反转这个结论。

## Background / Confirmed Facts

全部来自本仓库源码与 SearXNG 官方文档，逐条实测或引用：

1. **`config.timeout` 的唯一消费点**是 `cli/src/service.ts:141` 的 axios `timeout`，作用于 `/search` 与 `/config` 两个请求。全仓 `grep "config.timeout"` 只有这一处。
2. **当前默认值 10000** 出现在四处：`cli/src/config.ts:40`（`DEFAULT_CONFIG`）、`cli/src/init.ts:32`（`init` 的 `DEFAULT_CONFIG`）、`cli/src/init.ts:141`（`Math.max(1000, parseInt(...) || 10000)`）、`cli/digdig.config.example.json:9`。
3. **文档里同样是 10000**：`README.md:996`（环境变量表）、`README.md:1022`（配置示例）、`README.zh-CN.md:977`、`README.zh-CN.md:1003`、`cli/README.md:215`、`cli/README.md:236`，以及项目 `CLAUDE.md` 的环境变量表（未跟踪文件，不在 git 内）。
4. **SearXNG 上游默认**：`outgoing.request_timeout: 2.0`、`outgoing.max_request_timeout: 10.0`（来源见 External Facts）。`max_request_timeout` 是单个搜索请求服务端愿意等待的上限。
5. **本仓库推荐给用户的服务端配置**：`README.md:83-84` 是 `request_timeout: 10.0` / `max_request_timeout: 25.0`；`README.zh-CN.md:79-80` 是 `request_timeout: 30.0` / `max_request_timeout: 30.0`，两份 README 彼此不一致。
6. **后果**：客户端 10000 等于上游 `max_request_timeout` 上限、低于本仓库推荐的 25000/30000。服务端仍在等待引擎返回时客户端已断开，用户看到 `NETWORK_ERROR` / `timeout of 10000ms exceeded`（`cli/src/service.ts` 的 axios 错误分支），而服务端其实健康。
7. **现状只有配置过的人避开这个 bug**：本机 `~/digdig/digdig.config.json` 写的是 `25000`，所以本机从未复现；新用户按 README 默认值就会撞上。
8. **`init` 的下限是 1000**（`cli/src/init.ts:141`），允许交互式配置写出 3000 这类远小于服务端上限的值，同一个 bug 会以用户配置的形态复现。

## Requirements

- R1：`cli/src/config.ts` 的 `DEFAULT_CONFIG.timeout` 改为 25000。
- R2：`cli/src/init.ts` 的 `DEFAULT_CONFIG.timeout` 改为 25000，与 R1 保持一致（该文件现有注释明确要求两处同值）。
- R3：`cli/src/init.ts:141` 的交互式下限从 1000 提到 12000，使 `dg init` 无法写出低于 SearXNG 上游 `max_request_timeout`（10.0s）的值；`|| 10000` 的兜底同步改为 `|| 25000`。
- R4：`cli/digdig.config.example.json` 的 `timeout` 改为 25000。
- R5：三份 README（`README.md`、`README.zh-CN.md`、`cli/README.md`）的环境变量表默认值与配置示例 JSON 全部改为 25000。
- R6：`README.zh-CN.md` 推荐的 `settings.yml` 对齐到 `README.md`：`request_timeout: 10.0`、`max_request_timeout: 25.0`（用户 2026-11-05 决定）。
- R7：`config` 加载路径**不**对用户显式写入的值做强制抬升——只改默认值与 `init` 的交互下限，用户手写 3000 仍然是 3000。
- R8：项目 `CLAUDE.md` 的环境变量表默认值改为 25000（该文件未跟踪，改动不进提交，仅本地保持一致）。

## Acceptance Criteria

- AC1：cwd 无配置文件、无 `DIGDIG_TIMEOUT`/`SEARXNG_TIMEOUT` 时，`config.timeout === 25000`。
- AC2：`DIGDIG_TIMEOUT=3000` 时 `config.timeout === 3000`（不抬升，R7 的反向断言）。
- AC3：`cli/src/init.ts` 的 `DEFAULT_CONFIG.timeout === 25000`，且与 `config.ts` 的默认值相等（一个断言同时覆盖两处，防止未来只改一边）。
- AC4：`cli/digdig.config.example.json` 解析后 `timeout === 25000`。
- AC5：三份 README 的默认值单元格与示例 JSON 均为 `25000`。
- AC6：`README.zh-CN.md` 的 `outgoing` 块与 `README.md` 的 `request_timeout`/`max_request_timeout` 数值一致。
- AC7：`npm test` 全量通过。

## External Facts

- Depends on external facts: yes
- Source: https://docs.searxng.org/admin/settings/settings_outgoing.html
- What it settled: `outgoing.request_timeout` 默认 `2.0`、`max_request_timeout` 默认 `10.0`（原文注释 "the maximum timeout in seconds"）。这确定了「客户端默认值必须大于 10s」，也是 `init` 下限取 12000 的依据——不对照上游默认值就无从判断 10000 到底合不合理，只能继续在两份自家文档之间互相对齐。

## In Scope

- `cli/src/config.ts`、`cli/src/init.ts` 的默认值与下限
- `cli/digdig.config.example.json`
- `README.md`、`README.zh-CN.md`、`cli/README.md` 的 timeout 相关行
- `README.zh-CN.md` 的 `settings.yml` 示例块（R6）
- 新增配置默认值的回归测试
- 本地 `CLAUDE.md`（未跟踪，不入提交）

## Out of Scope

- 给 `config.timeout` 加加载期强制下限（R7 明确不做）
- 把 `timeout` 做成命令行 flag（当前只能经 `config` 或环境变量设置，改动面更大）
- `cli/src/deep/extractor.ts` 的 `DEFAULT_TIMEOUT_MS = 10_000`——那是抽取层的独立超时，与 SearXNG 请求超时无关，且 `extract` 命令从未把它接到 `config.timeout`
- todo 中其余 34 条

## Risks / Deferred Items

- 风险：25000 只是持平于推荐配置的 `max_request_timeout`，服务端跑满 25s 时客户端仍可能先断（还差网络回程）。不额外加余量：加余量意味着客户端要等到服务端已经放弃之后才报错，反而把失败延迟 25s 以上。此风险记录在案，不再扩大默认值。
- 风险：25000 与中文 README 原本推荐的 30.0s 服务端上限不匹配。已由 R6 一并对齐到 25.0 解决，而非抬高客户端。
- 已暂缓：`cli/src/config.ts` 对 `fileConfig.timeout` 无类型校验（写字符串会被原样接受）。

## Open Questions

无。三个决策点（默认值 25000、加 init 下限但不加加载期强制、条目级 reopen 而非 `hooks/reopen`）已由用户 2026-11-05 确认；中文 README 对齐方向由用户在 2026-11-05 追加确认。

## Implementation Notes

- AC7 已达成：`npm test` 47 文件 / 598 用例通过。
- R7 的反向断言在修复前后都通过，这是正确的：它守的是「不新增加载期强制下限」，而不是某个数值。
- R6 的注释修正（`README.md:83` 的中文注释改英文）是 Plan Step 2 的一部分，不是额外范围。

# 不再让 `process.exit()` 截断管道 stdout
> Task version: v1
> Status: completed

## Goal

No command's piped stdout is silently truncated. `process.exit()` terminates the process before Node flushes the stdout write buffer, so when stdout is a pipe the kernel keeps only what fits — 65,536 bytes on this machine — and a piping Agent receives cut-off, unparseable JSON. **Split out of `TF-20261017-d8f7b3` on 2026-10-18** (user decision): it was recorded there as that entry's "Defect 2", but its root cause is the shared exit mechanism, not search, and none of the field-mapping work touches it.

## Background / Confirmed Facts

### 缺陷可最小复现，与 dg 无关

```
$ node -e "console.log('x'.repeat(200000)); process.exit(0)" | wc -c
65536
$ node -e "console.log('x'.repeat(200000))" | wc -c
200001
```

同一条 `console.log`，唯一的差别是后面那句 `process.exit(0)`。管道输出的 buf 被截在 65,536 字节（Linux 管道容量），因为 `process.exit()` 立即终止进程，不等待 stdout 的写缓冲排空。重定向到文件时不受影响 —— 文件写入是同步的，只有管道/终端是异步的。这解释了为什么 `> out.json` 正常而 `| jq` 拿到坏 JSON。

### 本次实测（`main` @ `2fbc8ac`）

| 位置 | `process.exit(` 调用数 |
|---|---|
| `cli/src/runCli.ts` | 44 |
| `cli/src/entry.ts` | 2 |
| 合计 | 46 |

`cli/src/` 内**没有任何** `process.exitCode`、`flushStdout`、`process.stdout.write` 回压处理或 `setImmediate` —— 46 处全部是"立刻终止"。

### 44 处都是终止点，不是中途退出

逐点核对过每个调用点之后的第一条非空语句：全部是 `return`、`}`、`});`、`} catch (...)`，即该分支到此为止。所以把 `process.exit(n)` 换成"设退出码 + return"不会改变任何一条控制流。

### 自然退出不会被 keepAlive 挂住 —— 已实测，不是推断

担心的是 axios v1 默认开 `keepAlive`，换成自然退出后进程会在空闲 socket 上挂住。实测：进程内建本地 HTTP server、`keepAliveTimeout = 600000` 保持连接、`axios.create()` 发一次 GET，**不调用 exit**，进程在请求后 0 ms 正常退出。连接不阻止退出，因为没有 pending 的请求。

`cli/src/init.ts` 是唯一交互式入口，它在 `close()` 里正确关闭了 readline（`init.ts:75`）。`cli/src/` 内没有 `setInterval`，没有遗留 timer。

### 修好的判据是字节数，不是"看起来对"

缺陷的表现是输出被截断，所以验证必须是"完整拿到 N 字节"。`wc -c` 是本机最快、最不会骗人的判据。

## Requirements

1. `runCli.ts` 的 44 处 `process.exit(n)` 改为设置退出码并返回，不改变任何一条分支的语义。
2. `entry.ts` 的 2 处同理；`entry.ts` 已是 `main()` 的最后一步，改成 `process.exitCode` 即可。
3. 不引入兼容层、不引入 flush 辅助函数、不引入新依赖。
4. 不阻塞 —— 违背 CLAUDE.md 的"不要用阻塞方式输出日志"。
5. 退出码语义不变：原有每个分支的 0/1 保持。

## Acceptance Criteria

1. `grep -c 'process\.exit(' cli/src/` 在 `runCli.ts` 与 `entry.ts` 两个文件均为 0。
2. 200 KB 以上的管道输出完整到达：`dg ... --format json | wc -c` 等于重定向到文件的字节数。
3. `npx tsc --noEmit` 为 0。
4. 全量 `npx vitest run` 通过，测试数与改动前一致（当前基线 37 文件 / 519 测试）。
5. 各命令退出码不变：成功 0，失败 1。用 `--health` 对死服务器、`--engines-list` 对死服务器、正常搜索三条路径实测。
6. 交互式 `dg init` 仍能正常结束（readline 关闭后自然退出）。
7. 改动只落在 `runCli.ts` 与 `entry.ts` 两个文件。

## In Scope

- `cli/src/runCli.ts` — 44 处
- `cli/src/entry.ts` — 2 处

## Out of Scope

- 错误分类（`retryable` / `hint` 由错误类型推导）—— 那是 `TF-20261017-4f3dbb`，单独的任务。
- stdout 之外的流：`console.error` 走 stderr 且通常量小，不在本次。
- 限制输出长度、改变 `md` 格式 —— 用户此前已决定不改变现有长度。

## Risks / Deferred Items

- **风险：某处 `process.exit` 混在异步回调里，改成 return 后函数继续往下跑。** 已逐点核对过无此情况（见 Background）。若实施中发现例外，就地补 `return` 并在 Change Log 记录。
- **风险：自然退出被某个未发现的活动 handle 挂住。** 已实测 keepAlive 不挂（见 Background）；若实测出现挂起，改用 `process.exitCode` + 显式 drain 判据，不回到 `process.exit`。
- **既有基线**：`session-report` / `suggest-queries` / `strategy-info` 的 `--format md` 不生效（commander 父子同名 flag），与本任务无关，不在本次修。

## Open Questions

无。范围与方法都已由实测确定。

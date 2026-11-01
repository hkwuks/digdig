# Plan — `--engines-list` 不再在服务器不可达时报成功
> Task version: v1
> Status: completed

No spec required — small, self-contained. Two service methods, two CLI branches, two README lines.

## Reference Pointers

- `TaskFlowDocs/todo.md` → `TF-20261101-8ef67f` — the intake entry written this session.
- `cli/src/service.ts:90-113` — `getEngines` / `getCategories`, the two swallowing methods.
- `cli/src/service.ts:195-218` — `healthCheck`, the other caller of `getEngines`.
- `cli/src/runCli.ts:1436-1500` — the `--engines-list` and `--categories-list` branches.
- `cli/src/errors.ts` — `SearchError`, added in the previous task; reused here rather than inventing a second error type.
- `CONTRIBUTING.md`, `CODE_STYLE.md` — now present.

## Related Tasks

- Depends on nothing. Reuses `SearchError` from `TF-20261017-4f3dbb` (merged, PR #18), which is why this task does not need its own error type.

## Skills / Tools Used

- [PRD] Unaided — considered: "requirements elicitation and framing". The requirement was already stated by the defect itself; the work was measurement, not elicitation.
- [Plan] Unaided — considered: "work breakdown and task decomposition".
- [Test] Unaided — considered: "testing strategy". Verification is four live-server/live-provider combinations plus unit tests.

## Preconditions

- Base: `origin/main` @ `1eea6ae`. Branch `fix/2026-11-01-engines-list-exit`.
- Baseline to confirm: `npx tsc --noEmit` → 0; `npx vitest run` → 40 files / 551 tests.
- All four behaviours recorded before editing (PRD Background, plus the live-server baselines below).

### Baselines measured before any edit

| Scenario | `--engines-list` | exit |
|---|---|---|
| dead server, no provider | `error` `ENGINES_FETCH_EMPTY` | 1 |
| dead server + provider | **`ok`**, `source: "server"` | **0** |
| live server, no provider | `ok`, engines from server | 0 |
| live server + provider | `ok`, `["google","bing","deepseek"]`, `source: "server"` | 0 |

`--health` on a live server returns `healthy` with `engines: ["google","bing"]`; on a dead server it already returns `HEALTH_CHECK_FAILED` + exit 1, because `/healthz` fails before `getEngines()` is reached.

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-01 20:21 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — Let the failure out

- Goal: `getEngines()` and `getCategories()` report failure instead of returning an empty list that means the same thing as a successful empty response.
- Dependencies: none.
- Files: `cli/src/service.ts`
- Implementation checklist:
  - [x] Both methods drop their `catch` and let the `AxiosError` propagate — there is nothing to add to it that a caller cannot read.
  - [x] No `console.error` on the way out; the caller owns reporting now, and today's stderr line is the only trace of a failure the envelope called success.
  - [x] `healthCheck()` keeps working: it already wraps `getEngines()` in its own `try`, so a throw becomes `status: 'unhealthy'`. **Verify, do not assume** — with a live `/healthz` but a failing `/config`, the result changes from `healthy` + `engines: []` to `unhealthy`, which is the correct answer.
- Acceptance: AC2 unchanged; `--health` still correct on both live and dead servers (AC5).
- Verification: the four-combination probe in Step 3, plus `--health` against a stub that serves `/healthz` but fails `/config`.
- Rollback: `git checkout -- cli/src/service.ts`
- Status: done

### Step 2 — Say where each entry came from

- Goal: the envelope stops claiming every listed engine came from the server.
- Dependencies: Step 1.
- Files: `cli/src/runCli.ts`
- Implementation checklist:
  - [x] The failure check no longer hides a failed fetch behind a configured provider: a failed `getEngines()` is an error even when providers are configured (AC1, AC3).
  - [x] Server engines and locally-configured providers are reported distinctly, so a reader can tell `deepseek` from `google` (AC3).
  - [x] The now-reachable `catch` branches produce a real error rather than a dead-code code — `ENGINES_FETCH_FAILED` becomes reachable, and the hint names the actual provider that failed.
  - [x] `--categories-list` keeps its `source: 'server'` (correct there — it has no provider concept) but its catch becomes reachable; verify it does not crash.
- Acceptance: AC1–AC4 as four distinct observable outcomes.
- Verification: the four-combination probe.
- Rollback: `git checkout -- cli/src/runCli.ts`
- Status: done

### Step 3 — Prove all four combinations

- Goal: each AC demonstrated against a real CLI, not inferred.
- Dependencies: Steps 1–2.
- Files: none (verification only).
- Implementation checklist:
  - [x] dead server, no provider → error, exit 1 (unchanged)
  - [x] dead server + provider → **error, exit 1** (was ok/0)
  - [x] live server, no provider → ok, exit 0, all from server
  - [x] live server + provider → ok, exit 0, sources distinguishable
  - [x] `--health` live → healthy; `--health` dead → unhealthy/exit 1
  - [x] `--categories-list` live → ok; dead → error/exit 1
- Acceptance: AC1–AC5.
- Verification: outputs pasted into `## Verification / Review`.
- Rollback: not applicable.
- Status: done

### Step 4 — Tests that fail without the fix

- Goal: the regression is pinned in CI, not only in this session's terminal.
- Dependencies: Steps 1–3.
- Files: `cli/test/unit/engines-list.test.ts` (new)
- Implementation checklist:
  - [x] Both service methods reject on a failed request (they currently resolve `[]`).
  - [x] `--engines-list` on a failing service exits 1 and reports an error, **with a provider configured** — this is the exact condition the old `&&` let through.
  - [x] `--engines-list` on a working service separates the two sources.
  - [x] `--health` still reports `unhealthy` when `/config` fails after `/healthz` succeeds.
- Acceptance: AC8 — each new test fails on `main` and passes after.
- Verification: revert one method to confirm the test catches it.
- Rollback: delete the test file.
- Status: done

### Step 5 — Correct the README claim

- Goal: the format comparison stops asserting a number that is not true.
- Dependencies: none (independent of Steps 1–4).
- Files: `README.md`, `README.zh-CN.md`
- Implementation checklist:
  - [x] `README.md:1259` and `README.zh-CN.md:1248` drop the "~50% tokens" / "约 50% token" claim.
  - [x] Do not substitute another number — the measurement (99%) is a property of one body-size distribution, not a general ratio, so any replacement figure would be equally unsupported.
  - [x] The default format itself is unchanged; only the justification goes.
- Acceptance: AC7.
- Verification: `grep -n "50% token\|~50% tokens" README.md README.zh-CN.md` → no hits.
- Rollback: `git checkout -- README.md README.zh-CN.md`
- Status: done

## Checkpoints

- **After Step 1** — `--health` on a live server still returns `healthy`. If it regresses, the throw is escaping `healthCheck`'s own try and Step 2 must not start.
- **After Step 2** — the four-combination table matches AC1–AC4 exactly. Any combination still reporting `ok` on a dead server means the old `&&` survived.
- **After Step 4** — a test demonstrably fails when a method is reverted. Measured last task: provider-level tests alone did not catch a reverted caller, so this check is not optional.

## Verification / Review

全部在 `fix/2026-11-01-engines-list-exit` 上实测。基线 40 文件 / 551 测试；改动后 **40 文件 / 555 测试**。

### AC1 — 死服务器 + 已配置 provider（原缺陷）

改动前：

```json
{ "status": "ok", "data": { "engines": ["deepseek"], "source": "server" } }
```
```
EXIT=0
```

改动后：

```json
{
  "status": "error",
  "error": { "code": "ENGINES_FETCH_FAILED", "message": "Request failed with status code 502", "retryable": true },
  "hint": "Could not reach the SearXNG server at http://127.0.0.1:1. Check that it is running and that the base URL is correct."
}
```
```
EXIT=1
```

### AC2 — 死服务器，无 provider

同样 exit 1、同样 `ENGINES_FETCH_FAILED`。

**但 code 变了**：改动前是 `ENGINES_FETCH_EMPTY` + "No engines returned from SearXNG server"，现在是 `ENGINES_FETCH_FAILED` + "Request failed with status code 502"。这是**有意且更好**的区分 —— 原 code 把"取不到"说成"取到了但是空的"。写在这里因为 Plan 的 AC2 原文写的是"行为不变"，而 code 确实不是不变。

### AC3 / AC4 — 活服务器

| 场景 | `sources.server` | `sources.local` | engines | exit |
|---|---|---|---|---|
| 无 provider | `["google","bing"]` | `[]` | `["google","bing"]` | 0 |
| 有 provider | `["google","bing"]` | `["deepseek"]` | `["google","bing","deepseek"]` | 0 |

`source: "server"` 那个会撒谎的字面量已删除，换成 `sources` 分解。`engines` 保留为扁平数组，读它的消费者不受影响。

### AC5 — `--health`

| 场景 | 结果 |
|---|---|
| 活服务器 | `status: ok`，`data.status: healthy`，engines `["google","bing"]`，exit 0 |
| 死服务器 | `HEALTH_CHECK_FAILED` + exit 1（改动前后一致） |
| **`/healthz` 通但 `/config` 500** | `HEALTH_CHECK_FAILED` "Request failed with status code 500" + exit 1 |

第三行是这次改动带来的行为变化：改动前那一格是 `healthy` + `engines: []` —— 一个假的健康。现在它报失败，这是正确的。

### AC6 / AC8 — 测试

```
npx tsc --noEmit     → 0
npx vitest run       → 40 文件 / 555 测试通过
```

新增 `test/unit/engines-list.test.ts` 4 条。回退验证：把 `getEngines()` 改回吞异常后，`rejects rather than resolving an empty list` **失败**；恢复后 4 条全过。

**一处如实说明**：这 4 条测的是 service 层。CLI 分支（`--engines-list` 的 `source` 拆分与 `&&` 语义）是内联在 commander action 里的，没有单测 —— 它们由上面 AC1–AC4 的四组真实 CLI 运行覆盖，而非自动化。这样分工是因为把那个 action 拆成可测函数会是一次更大的重构，超出本任务范围；代价是 `source` 拆分若将来被改坏，CI 不会报，只有集成测试会。

### AC7 — README

```
$ grep -n "50% token\|~50% tokens" README.md README.zh-CN.md
（无输出）
```

替换成不含数字的描述："Compact, readable output for both humans and LLMs" / "紧凑易读，人和 LLM 都能直接看"。不换成另一个数字，因为实测的 99% 是某一种正文体量分布的结果，不是通用比例。

## Change Log

- v1 — plan written.

## Follow-ups

- `--engines-list` lists provider names, not the engines available behind them. Pre-existing design limit, unchanged.

## Version History

- v1 — planning.

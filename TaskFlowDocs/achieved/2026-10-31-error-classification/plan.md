# Plan — 按原因分类搜索错误，不再一律可重试
> Task version: v1
> Status: completed

No spec required — small, self-contained. Scope is one new module plus four call sites.

## Reference Pointers

- `TaskFlowDocs/todo.md` → `TF-20261017-4f3dbb` — the intake entry, with the 2026-10-18 verification that first recorded this defect.
- `cli/src/deep/session.ts:110` — `SessionStateError`, the existing precedent for a `code`-carrying error in this repo. The new type follows the same shape rather than inventing one.
- `cli/src/protocol.ts:29` — `createErrorEnvelope`, the consumer that turns a code, message, `retryable`, and `hint` into the envelope.
- `cli/src/deepseek-service.ts:54-61` and `cli/src/service.ts:180-183` — the two places the HTTP status is currently discarded.
- `CONTRIBUTING.md`, `CODE_STYLE.md` — now present, and this task follows them.

## Related Tasks

- None blocking. Sibling defect recorded but excluded: `--engines-list` returning exit 0 on a dead server (in `todo.md`, not this task).
- Builds on the now-merged `TF-20261018-282836` (stdout flush) only in that both touch `runCli.ts`'s top-level failure handling; that task changed the exit mechanism, this one changes what the error says. No file conflict — that one is merged.

## Skills / Tools Used

- [PRD] `agent-skills:debugging-and-error-recovery` — reproduce, localize, reduce, fix root cause.
- [Spec] `agent-skills:api-and-interface-design` — one error shape for three providers; consistent error semantics.
- [Plan] Unaided — considered: "work breakdown and task decomposition". The breakdown was written after `task unaided` recorded the stage in this worktree: the `planning-and-task-breakdown` Skill call went to the base checkout's capability store, because this session's cwd was there at the time, so no invocation exists for this tree.
- [Test] Unaided — considered: "testing strategy". Verification is real-endpoint probes plus unit tests on the classification table.

## Preconditions

- Base: `origin/main` @ `1b389f6`. Branch `fix/2026-10-31-error-classification` in `.worktrees/2026-10-31-error-classification`.
- Baseline to confirm before editing: `npx tsc --noEmit` → 0; `npx vitest run` → 37 files / 519 tests.
- The defect is reproduced on this exact commit (PRD Background): real DeepSeek 401 → `retryable: true`, hint names SearXNG; real Ollama 401 → same, with axios's raw message.
- `cli/node_modules` symlinked from the main checkout, git-excluded, not part of the change.

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-10-31 23:25 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — One error type that carries the facts

- Goal: a single error class that says what kind of failure this was, carrying the HTTP status when there is one, so no caller has to parse a message string.
- Dependencies: none.
- Files: `cli/src/errors.ts` (new)
- Implementation checklist:
  - [x] `class SearchError extends Error` with:
    - `readonly code` — one of `AUTH_FAILED` | `RATE_LIMITED` | `SERVER_ERROR` | `NETWORK_ERROR` | `BAD_REQUEST` | `BAD_RESPONSE`
    - `readonly status?: number` — the HTTP status, absent for transport failures
    - `readonly provider: string` — which provider produced it, so a hint can name the right one
  - [x] `retryable` is a **derived** getter, not a stored field: `true` only for `RATE_LIMITED`, `SERVER_ERROR`, `NETWORK_ERROR`. Nothing else can be retryable even by mistake.
  - [x] A `hint` getter per code. `AUTH_FAILED` names the provider's key variable; only the SearXNG path may mention SearXNG.
  - [x] A factory `searchErrorFromStatus(provider, status, message)` mapping the status to a code, so all three providers classify identically.
  - [x] `message` is passed through unchanged — the caller keeps the text it already produced (AC7).
- Acceptance: `npx tsc --noEmit` → 0. The type expresses the classification table from the PRD with no string parsing anywhere.
- Verification: unit tests in Step 4.
- Rollback: delete the file.
- Status: done

### Step 2 — Each provider throws it

- Goal: all three providers produce the same error shape, so the catch has one thing to read.
- Dependencies: Step 1.
- Files: `cli/src/service.ts`, `cli/src/deepseek-service.ts`, `cli/src/ollama-service.ts`
- Implementation checklist:
  - [x] `service.ts` (SearXNG): on `AxiosError`, throw `searchErrorFromStatus('searxng', status, message)` when a status exists, `NETWORK_ERROR` when it does not. Keep the existing message text exactly.
  - [x] `deepseek-service.ts`: same treatment; the three messages tests assert (`HTTP <status> <text>`, the transport message, `unexpected response body`) stay byte-identical. The last one becomes `BAD_RESPONSE`, which is not retryable.
  - [x] `ollama-service.ts`: **wrap the request** — it currently has no try/catch at all, so axios's raw error escapes. Add one that produces the same shape as the other two.
  - [x] Re-throw an already-`SearchError` unchanged, so a nested wrap cannot double-classify.
- Acceptance: AC1–AC6 (classification correct per provider); AC7 (messages unchanged for SearXNG and DeepSeek).
- Verification: `deepseek-service.test.ts`'s three existing `.rejects.toThrow(...)` assertions pass **without edits** — that is what proves AC7.
- Rollback: `git checkout -- cli/src/service.ts cli/src/deepseek-service.ts cli/src/ollama-service.ts`
- Status: done

### Step 3 — The catch reads the type instead of guessing

- Goal: `retryable` and `hint` in the envelope come from the error, not from a literal.
- Dependencies: Step 2.
- Files: `cli/src/runCli.ts` (the `runSearch` catch, ~line 685-700)
- Implementation checklist:
  - [x] `createErrorEnvelope` receives `retryable: error.retryable` and `hint: error.hint` when the error is a `SearchError`.
  - [x] A non-`SearchError` keeps today's behaviour — `retryable: false`, no hint claiming a subsystem. **Not** the old `retryable: true`: an unclassified failure is not known to be retryable.
  - [x] `code` comes from the error too, so `SEARCH_FAILED` stops swallowing the distinction.
- Acceptance: AC1–AC6 read correctly from the CLI's actual output.
- Verification: the real-endpoint probes in Step 5.
- Rollback: `git checkout -- cli/src/runCli.ts`
- Status: done

### Step 4 — Tests that fail without the fix

- Goal: the classification table is pinned by tests, not by the PR narrative.
- Dependencies: Steps 1–3.
- Files: `cli/test/unit/search-errors.test.ts` (new), plus additions to `test/unit/deepseek-service.test.ts`
- Implementation checklist:
  - [x] One test per code: 401/403 → `AUTH_FAILED`, 429 → `RATE_LIMITED`, 5xx → `SERVER_ERROR`, transport → `NETWORK_ERROR`, 400/404 → `BAD_REQUEST`, malformed body → `BAD_RESPONSE`.
  - [x] Assert `retryable` for each, positively and negatively — a test that only checks the `true` cases would pass with the old hardcoded behaviour.
  - [x] Assert the hint for `AUTH_FAILED` does **not** contain "SearXNG" when the provider is deepseek or ollama. This is the regression that started the task.
  - [x] Assert `BAD_RESPONSE` is not retryable.
- Acceptance: AC9 — each new test fails against `main`'s behaviour and passes after.
- Verification: run the new file, then temporarily revert one provider to confirm the test actually fails.
- Rollback: delete the new test file.
- Status: done

### Step 5 — Prove it against the real endpoints

- Goal: the three reproduced failures now report truthfully.
- Dependencies: Steps 1–4.
- Files: none (verification only).
- Implementation checklist:
  - [x] Real DeepSeek 401 (invalid key, real endpoint) → `retryable: false`, hint names the DeepSeek key, no "SearXNG".
  - [x] Real Ollama 401 (invalid key, real endpoint) → same, but naming Ollama.
  - [x] Dead SearXNG (`baseUrl` unreachable) → `retryable: true`, hint **does** name SearXNG.
  - [x] `npx tsc --noEmit` → 0; `npx vitest run` → all pass, count ≥ 519.
- Acceptance: AC1–AC8.
- Verification: outputs pasted into `## Verification / Review`.
- Rollback: not applicable.
- Status: done

## Checkpoints

- **After Step 1** — `tsc` clean. If `retryable` cannot be expressed as a derived value without a stored field, stop and reconsider before touching providers.
- **After Step 2** — the three existing DeepSeek assertions pass unedited. If they fail, the message text changed, which means AC7 is broken and the classification must be re-shaped.
- **After Step 4** — at least one test demonstrably fails when a provider is reverted. A test that passes both ways proves nothing.
- **After Step 5** — every AC demonstrated with a command and its output.

## Verification / Review

全部在 `fix/2026-10-31-error-classification` 上实测。基线：37 文件 / 519 测试；改动后 **40 文件 / 551 测试**（新增 3 个测试文件，32 条）。

### 编译与测试

```
npx tsc --noEmit     → 0
npx vitest run       → 40 文件 / 551 测试通过
```

### AC1 — 真实 DeepSeek 401 不再可重试

真实端点、无效 key：

```json
{
  "error": {
    "code": "AUTH_FAILED",
    "message": "DeepSeek search failed: HTTP 401 Unauthorized",
    "retryable": false,
    "details": { "provider": "deepseek", "status": 401 }
  },
  "hint": "DeepSeek rejected the API key. Set DEEPSEEK_API_KEY or update \"deepseekApiKey\" in digdig.config.json. Retrying will not help."
}
```

改动前同一条请求：`retryable: true`、`hint: "Check your network connection and SearXNG server status"`。

### AC2/AC3/AC6 — 429、5xx、网络失败

| 情形 | code | retryable | hint 指向 |
|---|---|---|---|
| SearXNG 429（桩服务器） | `RATE_LIMITED` | true | "SearXNG is rate limiting this client. Wait, then retry" |
| SearXNG 502（桩服务器） | `SERVER_ERROR` | true | "SearXNG returned a server error … retry later" |
| SearXNG 连接被拒（绕开代理） | `NETWORK_ERROR` | true | "Could not reach the SearXNG server … check your network" |

### AC1 — 真实 Ollama 401

```json
{
  "error": { "code": "AUTH_FAILED", "message": "Ollama search failed: HTTP 401 Unauthorized",
             "retryable": false, "details": { "provider": "ollama", "status": 401 } },
  "hint": "Ollama rejected the API key. Set OLLAMA_API_KEY or update \"ollamaApiKey\" in digdig.config.json. Retrying will not help."
}
```

改动前是 axios 原文 `Request failed with status code 401`，同样 `retryable: true` 且指向 SearXNG。

### AC5 — 响应格式错误不可重试

`deepseek-service.test.ts` 新增用例：无 `results` 数组 → `BAD_RESPONSE`、`retryable: false`。

### AC7 — 消息文本逐字未变

原有三条 `.rejects.toThrow(...)` 断言 **一字未改即通过**（`HTTP 429 Too Many Requests`、`timeout of 15000ms exceeded`、`unexpected response body`）。这是 AC7 的直接证据，不是推断。

### AC9 — 新测试确实能抓住回退

实测：把 `runCli.ts` 的 catch 回退成 `main` 行为后，`error-envelope.test.ts` **3 条失败**（retryable、hint 指向、code）。恢复修复后 5 条全过。

**这一步发现了原计划的漏洞**：先写的是 provider 级测试，回退 catch 时它们**全部通过** —— 因为 provider 级测试直接读错误对象，不经过 catch。原 Plan 的 Checkpoint 说"回退一个 provider 确认测试失败"，回退的其实是错误的地方。补写 `error-envelope.test.ts` 之后才有能守住 catch 的测试。这条记在这里而不是悄悄改掉。

### 一处环境限制，已绕过

本机所有出站请求走 `HTTP_PROXY`，所以 `http://127.0.0.1:1` 这类不可达地址返回的是 **502**（代理的回复），不是传输失败 —— 一开始测 `NETWORK_ERROR` 拿到的是 `SERVER_ERROR`。用 `env -u HTTP_PROXY ... NO_PROXY='*'` 绕开代理后才得到真实连接失败，上表那一行是绕开后的结果。同时补了 `searxng-errors.test.ts` 用 mock 覆盖该分支，使 CI 里不依赖本机是否配了代理。

### AC8 — 全量测试

40 文件 / 551 测试通过（基线 519 + 新增 32）。

## Change Log

- v1 — plan written.

## Follow-ups

- `commands/extract.ts:70,90` — two more hardcoded `retryable: true`. Same class of defect, different subsystem; excluded here.
- `PROVIDER_NOT_CONFIGURED` accepts any non-empty key string, so a mistyped key reaches the network. Excluded; it is input validation, not error classification.

## Version History

- v1 — planning.

## Todo Record

Moved verbatim from the TODO entry by `hooks/archive`, grouped by the field each block followed.

### `- Next action:`

### Verified 2026-10-18 against the merged `main` build
A real DeepSeek 401 (invalid key, live endpoint) returns:
```json
{ "status": "error", "error": { "code": "SEARCH_FAILED",
  "message": "DeepSeek search failed: HTTP 401 Authorization Required",
  "retryable": true },
  "hint": "Check your network connection and SearXNG server status" }
```
Two things wrong: an auth failure is not retryable, and SearXNG is not involved. A genuine network failure (unreachable `baseUrl`) returns the same envelope, so today the two are indistinguishable — which is the actual defect, not just the wording.
### The same path loses the provider name entirely for Ollama
`-e ollama` with an invalid key yields `message: "Request failed with status code 401"` — no provider named, and the hint again points at SearXNG. `DeepSeekService` wraps its errors (`DeepSeek search failed: …`, `deepseek-service.ts:58,60`); `OllamaService` does not wrap at all, so the caller gets raw axios text. Any fix that derives `retryable`/`hint` from a typed error should cover both providers, and the missing wrap on the Ollama side is part of the same change.

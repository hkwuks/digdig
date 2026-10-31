# 按原因分类搜索错误，不再一律可重试
> Task version: v1
> Status: completed

## Goal

No command reports an unrecoverable error as retryable, and no hint names a subsystem the request never touched. Today the `runSearch` catch (`runCli.ts:685-700`) marks **every** failure `retryable: true` with `hint: 'Check your network connection and SearXNG server status'`. A real DeepSeek 401 therefore reports itself as retryable and blames SearXNG — a server this invocation never contacted. An Agent reading that envelope retries forever, because nothing in it says the key is wrong.

## Background / Confirmed Facts

全部在 `.worktrees/2026-10-31-error-classification` @ `1b389f6`（即 `origin/main`）上实测。

### 真实 DeepSeek 401 被完整复现

真实端点 `https://api.deepseek.com/v1/tools/search` 对无效 key 返回 HTTP 401（`curl` 直接验证）。经 CLI 调用，输出是：

```json
{
  "status": "error",
  "error": {
    "code": "SEARCH_FAILED",
    "message": "DeepSeek search failed: HTTP 401 Authorization Required",
    "retryable": true
  },
  "hint": "Check your network connection and SearXNG server status"
}
```

消息里写着 `HTTP 401 Authorization Required`，`retryable` 却是 `true`，hint 指向 SearXNG —— 而配置里 SearXNG 是 `http://127.0.0.1:1`，根本没被访问。**一个永远不可能成功的错误被标成可重试，且提示指错子系统。**

### 根因不是 catch 写错，是状态码在下面被丢掉了

`runCli.ts:692` 只是症状所在地。真正的根因在 provider 层：HTTP 状态码被压成一句自然语言字符串，然后丢弃。

```typescript
// cli/src/deepseek-service.ts:54-61
if (axios.isAxiosError(error)) {
  const status = error.response?.status;
  if (status !== undefined) {
    throw new Error(`DeepSeek search failed: HTTP ${status}${statusText ? ` ${statusText}` : ''}`);
  }
  throw new Error(`DeepSeek search failed: ${error.message}`);
}

// cli/src/service.ts:180-183
if (axios.isAxiosError(error)) {
  throw new Error(`Search failed: ${error.response?.statusText || error.message}`);
}
```

`status` 只在拼字符串时用了一次，之后不存在。catch 拿到的 `error` 是一个普通 `Error`，唯一能读的信息是 `.message` 文本。**要分类就必须解析字符串** —— 那正是错误分类应该避免的做法。所以修在 catch 里是无解的，必须让 provider 层把状态码带出来。

### 三类错误需要不同的处置

| 情形 | 实测 | 应 retryable | 应 hint |
|---|---|---|---|
| **认证失败** 401/403 | DeepSeek 无效 key → 401 | **false** | 改 key，不是改网络 |
| **限流** 429 | 测试用 429 mock | **true** | 稍后重试 |
| **服务端错误** 5xx | 桩服务器 502 | **true** | 服务端问题，稍后重试 |
| **传输失败** 无响应 / 超时 / DNS | DNS 失败 → `Bad Gateway` | **true** | 检查网络 |
| **请求本身被拒** 400/404 | 未实测 | **false** | 请求或端点有问题 |
| **响应格式不合预期** | 无 `results` 数组 | **false** | 不做重试，重试也不会变对 |

### 三个 provider 的错误形状互不相同

| provider | 抛出的东西 |
|---|---|
| `SearXNGService` | `new Error('Search failed: <statusText \| message>')` —— 状态码丢失 |
| `DeepSeekService` | `new Error('DeepSeek search failed: HTTP <status> <statusText>')` 或 `... failed: <message>`，以及 `'DeepSeek search returned an unexpected response body'` |
| `OllamaService` | **什么都不抛** —— 没有 try/catch，axios 的原始 `AxiosError` 直接冒到 `runCli` |

第三种最值得注意：`ollama-service.ts` 全文没有任何 `throw` 或 `catch`（30 行 `search` 直接 `await this.client.post(...)`）。所以 Ollama 失败时，`runCli` 的 catch 拿到的是 axios 的原始错误。实测无效 Ollama key 的输出是：

```json
{
  "status": "error",
  "error": {
    "code": "SEARCH_FAILED",
    "message": "Request failed with status code 401",
    "retryable": true
  },
  "hint": "Check your network connection and SearXNG server status"
}
```

消息是 axios 的原文，不是本项目的措辞；`retryable` 与 hint 与 DeepSeek 那条一模一样地错。同一个缺陷，在三个 provider 上表现为三种不同的错误对象。

这决定了修复的形状：**不能只在 catch 里按字符串分类**，必须让三个 provider 都产出同一种可判别的错误。

### 一处相邻的既有缺陷，不在本任务内

`planProviderSearch`（`runCli.ts:346-353`）用 `Boolean(config.deepseekApiKey)` 判断 provider 是否可用。只要 key **非空**就算 configured，所以一个格式正确但已失效的 key 会走到真实请求并撞 401 —— 这没问题，正是本任务要正确报告的情形。但它也意味着 `DIGDEEPSEEK_API_KEY` 设成任意字符串就能绕过 `PROVIDER_NOT_CONFIGURED`。这是输入校验问题，不是错误分类问题，**不在本任务范围**。

## Requirements

1. **provider 层保留状态码**：`SearXNGService.search`、`DeepSeekService.search`、`OllamaService.search` 抛出的错误必须携带 HTTP 状态码（若有）与"是否传输层失败"的事实，而不是只有格式化好的文本。
2. **一个可区分的错误类型**：参照仓库已有的 `SessionStateError`（`session.ts:110`，带 `code` 字段），新增带 `code` 与可选 `status` 的错误类型。
3. **`retryable` 从错误推导**，不再写死：4xx（除 429）为 `false`；429、5xx、传输失败为 `true`；响应格式错误为 `false`。
4. **`hint` 从错误推导**，不再写死：认证失败指向 key 配置，限流指向重试，网络失败指向连通性，SearXNG 相关失败才提到 SearXNG。
5. **错误消息文本不变**：`DeepSeek search failed: HTTP 401 Authorization Required` 这类现有文本是测试断言的对象，也是用户能读到的最直接信息，保持不变。
6. **不写兼容层**：不保留旧的写死行为作为 fallback，不留双路径。

## Acceptance Criteria

1. 真实 DeepSeek 401（真实端点，无效 key）→ `retryable: false`，`hint` 提到 key，**不**提 SearXNG。
2. 429 → `retryable: true`，hint 提到稍后重试。
3. 5xx → `retryable: true`，hint 指向服务端。
4. 传输失败（DNS 不可达 / 超时）→ `retryable: true`，hint 提到网络连通性。
5. 响应格式错误（无 `results` 数组）→ `retryable: false`。
6. SearXNG 的连接失败仍指向 SearXNG —— 这是 hint 唯一应该提到它的情形。
7. 错误 `message` 文本与改动前逐字相同（`deepseek-service.test.ts` 现有的三条 `.rejects.toThrow(...)` 断言不改即通过）。
8. `npx tsc --noEmit` 为 0；`npx vitest run` 全绿，测试数不少于基线 37 文件 / 519 测试。
9. 新增测试覆盖上述分类，且在没有修复时失败。

## In Scope

- `cli/src/service.ts` — SearXNG 的错误构造
- `cli/src/deepseek-service.ts` — DeepSeek 的错误构造
- `cli/src/ollama-service.ts` — **已确认有搜索错误路径**（反向：它一条都没有，需补上与其他两个 provider 一致的错误构造）
- 新增错误类型模块（位置待定，倾向 `cli/src/errors.ts`）
- `cli/src/runCli.ts:685-700` — catch 改为读错误类型

## Out of Scope

- `PROVIDER_NOT_CONFIGURED` 的 key 有效性校验（见 Background 末段）
- `--engines-list` 对死服务器返回 exit 0 的既有缺陷（已在 `todo.md`）
- `extract.ts` 的 `retryable: true`（`commands/extract.ts:70,90`）—— 属于抽取路径，需单独判断，不在本次
- 错误重试机制本身：本任务只让 `retryable` 说实话，不实现自动重试

## Risks / Deferred Items

- **风险：provider 层改动波及现有测试。** `deepseek-service.test.ts` 有三条断言消息文本；消息不变则不受影响，已列为 AC7 的可验证条件。
- **风险：Ollama 的错误消息会变。** 它现在是 axios 原文 `Request failed with status code 401`，改成与其他 provider 一致的措辞后文本不同。**没有测试断言这条消息**，所以变更安全，但这属于可观测行为变化，需要写进 PR 的兼容性段。
- **风险：分类表在真实世界里不完全。** 400/404 未实测（需要一个会返回那些状态的端点）。按"非 429 的 4xx 不可重试"处理，并在 PRD 里标明这一条是推导而非实测。
- **延期**：`extract.ts` 的两处 `retryable: true` 同样写死，但抽取的失败原因与搜索不同，需要单独的分类判断。

## Open Questions

无。分类边界由实测的三种情形确定，其余按 HTTP 语义推导并已标注。

# `--engines-list` 不再在服务器不可达时报成功
> Task version: v1
> Status: completed

## Goal

`dg --engines-list` 在 SearXNG 不可达时不再返回 `status: "ok"` 与 exit 0，`source` 字段也不再声称每个条目都来自服务器。今天服务器挂掉时，错误只写到 stderr，stdout 的 envelope 报成功，调用方——尤其是一个只读 stdout 的 Agent——无法察觉查询失败。

## Background / Confirmed Facts

全部在 `.worktrees/2026-11-01-engines-list-exit` @ `1eea6ae` 上实测。

### 三个字段同时说谎

配置 `baseUrl` 指向死服务器，同时配置了一个 provider：

```json
{
  "status": "ok",
  "data": { "engines": ["deepseek"], "source": "server" },
  "error": null,
  "hint": null
}
```

```
EXIT=0
```

`deepseek` 是一个本地配置出来的 provider 名，**不是服务器返回的引擎**，却被列在 `source: "server"` 之下。而 `status: "ok"` 与 exit 0 让这次失败看起来像一次成功。

### 根因：`getEngines()` 把异常吞掉了

```typescript
// cli/src/service.ts:90-101
async getEngines(): Promise<string[]> {
    try {
        const response = await this.client.get('/config');
        ...
    } catch (error) {
        console.error(`Failed to fetch engines: ${error instanceof Error ? error.message : String(error)}`);
        return [];          // ← 失败与"服务器返回空列表"在返回值上完全相同
    }
}
```

`getEngines()` **永不抛出**（函数体内零个 `throw`）。它把失败压成 `[]`，唯一的痕迹是一行 stderr。

### 于是分支判断错了

```typescript
// cli/src/runCli.ts:1437-1454
const engines = await service.getEngines();
const configuredProviders = EXTERNAL_PROVIDERS.filter(p => PROVIDER_IMPLS[p].configured());
if (engines.length === 0 && configuredProviders.length === 0) {   // 只有两者都空才报错
    ...ENGINES_FETCH_EMPTY, exitCode = 1
}
engines.push(...configuredProviders);
const envelope = createSuccessEnvelope({ engines, source: 'server' });  // source 写死
```

两处错误叠在一起：

1. **`&&` 的语义错位。** 服务器取引擎失败（`engines` 为空）时，只要本地配了 provider，条件就为假，不报错。
2. **`source: 'server'` 是写死的字面量。** 它从来不看 `engines` 里哪些来自服务器、哪些是本地拼进去的。

### 一个可以确认的死代码

`runCli.ts:1455-1463` 的 `catch` 分支永远进不去 —— `getEngines()` 不抛出。`ENGINES_FETCH_FAILED` 这个 code 在引擎路径上不可达。（`--categories-list` 同理，`getCategories()` 也不抛。）

### 没有 provider 配置时行为是对的

同一个死服务器、不配 provider：

```json
{ "status": "error", "error": { "code": "ENGINES_FETCH_EMPTY", "retryable": false }, "hint": "..." }
```

```
EXIT=1
```

缺陷只在"取引擎失败 + 有本地 provider"这个组合下出现。这解释了它为何躲过此前验证：测死服务器时通常不会同时配 provider。

### 另一件事：README 的格式对比数字不成立

`README.md:1259` 与 `README.zh-CN.md:1248` 声称 markdown 格式比 JSON **节省约 50% token**。

实测（桩 SearXNG，10 条结果各 8.6KB 正文）：md 87,662 字节 / json 88,796 字节 = **99%**，只差 1%。正文原样写进两种格式，格式开销相对正文可忽略。这句是"针对 LLM 上下文窗口优化"的论据，论据不成立，结论也就没有支撑。

## Requirements

1. **`getEngines()` 与 `getCategories()` 失败时抛出**，不再把失败压成空数组。
2. **`--engines-list` 区分两种来源**：服务器实际返回的引擎，与本地配置出来的 provider 名。
3. **服务器取引擎失败时 `--engines-list` 报错并 exit 1**，即使本地有 provider。
4. **`source` 不再写死**，如实反映条目的真实来源。
5. **`healthCheck()` 不受影响**：它调用 `getEngines()`，后者改为抛错后必须仍然可用。
6. **README 的两种语言版本删除那句不成立的 token 对比**，不替换成另一个数字 —— 除非能给出可复现的测法。
7. 不写兼容层。

## Acceptance Criteria

1. 死服务器 + 配置了 provider：`status: "error"`，exit 1，错误里能看出服务器未被取到。
2. 死服务器 + 无 provider：行为不变（`ENGINES_FETCH_EMPTY`，exit 1）。
3. 活服务器 + 配置了 provider：`status: "ok"`，exit 0，且每个条目能看出它来自 server 还是本地配置。
4. 活服务器 + 无 provider：`status: "ok"`，exit 0，全部来自 server。
5. `--health` 对活服务器与死服务器均仍然正确（常态 `healthy`，异常态 `unhealthy`）。
6. tsc 0；全量测试通过，测试数不少于基线 40 文件 / 551 测试。
7. `README.md` 与 `README.zh-CN.md` 均无 "~50% tokens" 或"约 50% token" 的表述。
8. 新增测试覆盖 AC1–AC5，且在未修复时失败。

## In Scope

- `cli/src/service.ts` — `getEngines`、`getCategories`、`healthCheck` 的适配
- `cli/src/runCli.ts` — `--engines-list` 与 `--categories-list` 两个分支
- `README.md`、`README.zh-CN.md` — 删除不成立的 token 对比
- 对应测试

## Out of Scope

- `--categories-list` 的**来源标注**问题（它没有 provider 概念，`source: 'server'` 对它是成立的）；但它同样依赖 `getCategories()`，方法改为抛错后它的 catch 分支会**从死代码变成活代码**，需一并验证不炸。
- 修改 `source` 字段之外的其他 envelope 形状
- `--engines-list` 是否应列出 provider 名下可用的具体引擎（现在只给 provider 名，是既有设计）
- README 里其他性能声明

## Risks / Deferred Items

- **风险：`getEngines()` 改为抛错会影响 `healthCheck()`。** 它现在在 `try` 里调用 `getEngines()`，抛错会被自己的 `catch` 接住并报 `unhealthy` —— 行为上反而更准（现在的 `healthy` + 空 engines 是假的健康）。需实测确认，不能推断。
- **风险：`source` 字段改名会破坏既有消费者。** 倾向保留 `source` 但让它如实反映；若必须改结构，在 PR 的兼容性段写明。
- **风险：README 那句话删掉后，"为什么默认 md"就失去了论据。** 这是对的 —— 不成立的论据不该保留。默认值不改。
- **延期**：`--engines-list` 只给 provider 名而不给该 provider 下的引擎列表，是既有设计限制，不在本次。

## Open Questions

无。AC1–AC4 覆盖了 `source` 的四种组合，取值形状在实施时按最小改动决定并记录。

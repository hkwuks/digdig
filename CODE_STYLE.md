# Code Style

本仓库的代码规范。每条都是从现有代码里量出来的，不是设想。

**当前没有 lint 或格式化工具。** `cli/package.json` 里没有 `lint` / `format` 脚本，也没有 eslint / prettier 配置。下面这些规范靠人工 review 维持，不靠工具强制。若将来引入 lint，本文档需要跟着改，否则它会变成一份描述不存在检查的文档。

## TypeScript

### 缩进

4 个空格。不用 tab。

```typescript
export function buildPendingReport(
    results: SessionResult[],
    pending: SessionResult[]
): PendingReport {
    // 4 空格，逐层递增
}
```

YAML 用 2 空格 —— 不同语言不同惯例，见本文末尾的「其他文件」。

### 引号

单引号。双引号只出现在需要转义的场合，例如字符串里含单引号，或 JSON 字面量。

```typescript
import { sourceKey } from './dedupe.js';
const message = "it's configured";
```

### 分号

语句结尾写分号。

### 模块

ESM-only。`package.json` 是 `"type": "module"`，`tsconfig.json` 是 `module: NodeNext` / `moduleResolution: NodeNext`。相对导入**必须带 `.js` 后缀**，即使源文件是 `.ts`：

```typescript
import { runCli } from './runCli.js';
```

### 严格模式

`strict: true`。不留 `any` 逃生口；确需动态形状时（如 provider 原始响应）用 `unknown` 并在边界处收窄。

## 命名

只描述现有形式，不发明新规则。

| 种类 | 形式 | 实例 |
|---|---|---|
| 类 | PascalCase，领域名词 + 角色 | `SearXNGService`、`DeepSeekService`、`OllamaService` |
| 函数 | camelCase，动词开头 | `buildPendingReport`、`normalizeUrl`、`computeCrossResultFrequency` |
| 模块级常量 | UPPER_SNAKE | `EXTERNAL_PROVIDERS` |
| 文件名 | kebab-case | `query-redundancy.ts`、`pending-facts.ts` |
| 测试文件 | 同名 + `.test.ts` | `dedupe.test.ts` |

有两个身份函数值得记住，因为它们容易混：`resultUrlKey` 标识**结果本身**，`sourceKey` 标识**结果来自哪里**。两者的区别写在 `cli/src/deep/dedupe.ts` 的注释里。

## 注释

**写英文，写"为什么"，不写"是什么"。**

本仓库的注释密度偏高，且几乎全部在解释动机。一个典型例子 —— 它没有描述代码做了什么，而是记录了三轮排查的结论：

```typescript
/**
 * What this session has looked at, as countable facts.
 *
 * A search now shows only what it just found, so the shape of the whole session
 * has to come from somewhere. It does not come from the knowledge graph: graph
 * structure is built from *approved* results, so it is empty exactly while the
 * decision is still open ...
 *
 * It does not come from a topic model either. ... word-bag clustering cannot group
 * two phrasings of one aspect (measured cosine 0.102 same-aspect against 0.012
 * cross-aspect, and no pair cleared a 0.3 threshold) ...
 */
```

不用注释复述代码：

```typescript
// 差：把代码翻译成自然语言
// 把 hash 设为空
u.hash = '';

// 好：解释为什么这一行必须存在
// Trailing slash removal keeps `https://a.com/` and `https://a.com`
// from becoming two identities for one page.
u.pathname = u.pathname.replace(/\/$/, '') || '/';
```

不保留被注释掉的代码 —— git 有历史。

## 测试

`vitest`。配置在 `cli/vitest.config.ts`，include 是 `test/**/*.test.ts` 与 `test/**/*.bench.ts`。

```
cli/test/unit/          单个模块的行为
cli/test/integration/   跨模块协作（session + graph + commands）
cli/test/benchmark/     性能
cli/test/fixtures/      固定数据（如 session-tokio）
```

**测试不访问网络。** 涉及 HTTP 的模块（`deepseek-service`、`ollama-service`）在测试里用 `vi.mock('axios')` 打桩。新增的测试必须保持这一点 —— 一个需要真实网络的测试在 CI 里必然失败，而失败原因与代码无关。

断言用 `expect` 的具体匹配器（`toMatchObject`、`toEqual`、`toContain`），不用 `toBeTruthy` 代替结构比较。

## 命令

```bash
cd cli
npm run build        # tsc + 给 bin 加执行位；会先清空 dist
npm test             # vitest run，即 npx vitest run
npm run test:watch   # 监听模式
npx tsc --noEmit     # 只做类型检查，不产出
```

## 提交与分支

见 `CONTRIBUTING.md`。两件事各自权威，不在此重复。

## 其他文件

| 文件 | 约定 |
|---|---|
| YAML（`.github/workflows/`） | 2 空格缩进，GitHub Actions 的通行写法 |
| Markdown | ATX 标题（`##`）；代码块标注语言 |
| `package.json` | 依赖按字母序，版本用 `^` 范围 |
| 文档里的路径 | 仓库相对路径，不写本机绝对路径 |

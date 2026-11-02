# 修正 CONTRIBUTING.md 的发布流程：按 main 推送权限分层
> Task version: v1
> Status: completed

## Goal

`CONTRIBUTING.md` 的发布流程只写了「`cd cli && npm version patch` → `git push --follow-tags`」，这在有 `main` 推送权限时成立，但**对其他所有贡献者是错的** —— 它直接往 `main` 推提交，而同一份文档第 230 行明写「不要在 `main` 上直接提交」。

发布应当按权限分层：有 `main` 推送权限的人可以直接在 main 上改版本号打 tag；没有权限的人走分支 + PR，合并后再打 tag。

## Background / Confirmed Facts

**这个缺陷是我自己写进去的。** PR #21（`457f803`）新增「发布」小节时，只考虑了 owner 的使用场景。

**冲突的原文**（`CONTRIBUTING.md:230`，本任务前）：

```
- 不要在 `main` 上直接提交 —— 走分支和 PR。
```

**实测发现的经过**：发布 0.0.3 时，我按自己写的流程本该直推 main，但察觉这与上面的规矩冲突，改走了分支 + PR（PR #24）。两条路都成立，说明文档缺的不是「哪个对」，而是「什么权限走哪条」。

**两条路的实际差异**，来自 PR #24 的真实执行：

| | 有 main 推送权限 | 无 main 推送权限 |
|---|---|---|
| 版本号改动 | 直接在 main 提交 | 分支上提交，走 PR |
| `npm version` 参数 | 默认（会打 tag） | `--no-git-tag-version` |
| tag 打在哪 | 当前提交（就是 main） | **合并后**在 main 上单独打 |
| 为什么 | tag 天然落在 main | 分支提交上打 tag 会留下游离标签 |

**关键陷阱**：`npm version` 默认在当前 HEAD 上打 tag。在分支上用它，tag 就落在分支提交上 —— 那个提交合并后虽然内容进了 main，但 tag 指向的 commit 不在 main 的历史里（merge commit 是新的）。所以无权限路径必须用 `--no-git-tag-version`，等合并后再单独打。

## Requirements

- R1 — 发布小节按「有 main 推送权限 / 无 main 推送权限」分两条路写，各自给出可执行的完整命令。
- R2 — 说清无权限路径为什么必须用 `--no-git-tag-version`，以及 tag 为什么必须在合并后打。
- R3 — 「不要做的事」里那条一刀切的「不要在 main 上直接提交」必须加上发布这个例外，否则两份文档互相打脸。
- R4 — 保留原有且仍然正确的内容：一次性 npm 配置、workflow 步骤说明、失败处置表、为什么不用 token。这些与权限无关。

## Acceptance Criteria

- AC1 — 发布小节含两个明确标出权限条件的小节，各有完整命令序列。
- AC2 — 无权限路径的命令里出现 `--no-git-tag-version`，并解释其作用的注释或正文。
- AC3 — 无权限路径明确写出「合并之后再打 tag」，给出打 tag 的命令。
- AC4 — `CONTRIBUTING.md` 中不再存在未加例外的「不要在 `main` 上直接提交」。
- AC5 — 原有的一次性配置、workflow 说明、失败处置、不用 token 四段内容保持不变。

## In Scope

- `CONTRIBUTING.md` — 发布小节的「发一个版本」部分重写，「不要做的事」加例外说明

## Out of Scope

- **改 workflow。** `publish.yml` 只认 tag 事件，与用哪种方式产生 tag 无关。两条路径产生的 tag 对它完全等价。
- **分支保护规则。** 仓库目前没有配 protected branches，本任务不涉及。
- **`RELEASE.md`。** 索引里标 `optional`，不创建。
- **改 `CODE_STYLE.md` 或 PR 模板。**

## Risks / Deferred Items

- **风险：无权限路径的命令没人验证过完整走一遍。** `--no-git-tag-version` 的行为我实测过（在 0.0.3 发布时用过，改了 `package.json` 和 `package-lock.json` 两处版本字段且没打 tag），但「分支提交 → PR 合并 → 在 main 打 tag → workflow 触发」这条完整链路本次实际走的是有权限路径的变体。缓解：文档里每条命令都是本次真实执行过的，不是想象的。
- **延后：如果将来启用分支保护。** 那时「有权限」和「无权限」的界限会由 GitHub 的规则决定，而不是文档描述。届时这节需要重写，但分层结构仍然适用。

## Open Questions

无。用户已明确规则：有权限走 main，没权限走 PR。

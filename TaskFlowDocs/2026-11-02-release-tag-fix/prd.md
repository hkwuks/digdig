# 修正 CONTRIBUTING.md：npm version 在 cli/ 子目录打不出 tag
> Task version: v1
> Status: planning

## Goal

`CONTRIBUTING.md` 里写的两条发布路径都依赖 `npm version` 自己打 tag。实测证明**在这个仓库里它打不出来**，而且不报错、不警告，输出照常显示 `v0.0.4`，只是没有 tag。照文档操作的结果是：版本号改了、提交了、推送了，workflow 永远不触发，而且看不出哪里错了。

## Background / Confirmed Facts

2026-11-02 发布 `0.0.4` 时实测。

**现象**：在 `cli/` 下执行 `npm version patch`，输出 `v0.0.4`，但 `git tag -l` 仍然只有 `v0.0.3`。

**npm 自己的说法**（`--loglevel=verbose`）：

```
npm verbose version Not tagging: not in a git repo or no git cmd
```

**但 git 本身是好的**：

```
$ cd cli && git rev-parse --git-dir
/mnt/f/WorkSpace/Node/digdig/.git        exit=0
```

所以不是「没有 git」，是 npm 的检测在**子目录 + WSL 路径**这个组合下失败。`cli/` 是仓库的子目录，`package.json` 在那里，`.git` 在上一层。

**这是我在 PR #21 里写进 `CONTRIBUTING.md` 的流程**，写的时候没有实测这一步。后来 PR #25 又按「有权限/无权限」分层重写了一遍，两条路径都保留了 `npm version` 默认打 tag 的假设，所以两条都错。

**当前文档的两条路径**（`CONTRIBUTING.md:144-175`）：

- 有 `main` 推送权限：`npm version patch` → `git push --follow-tags`
- 无权限：`npm version patch --no-git-tag-version` → 分支 → PR → 合并后 `git tag v<version>`

**第二条其实是对的** —— 它本来就用 `--no-git-tag-version` 并显式打 tag。只有第一条坏。

## Requirements

- R1 — 有权限路径改为不依赖 `npm version` 的 tag 功能，显式打 tag。
- R2 — 说清为什么显式打：不是风格选择，是 `cli/` 子目录下 `npm version` 的检测会静默失败。
- R3 — 无权限路径无需改动，但要确认它描述的流程确实不依赖被禁用的功能。
- R4 — 两条路径产出的 tag 必须落在 `main` 的历史上，且与 `cli/package.json` 的 `version` 一致。

## Acceptance Criteria

- AC1 — 有权限路径的命令序列里出现显式的 `git tag v<version>`。
- AC2 — 有权限路径不再出现 `--follow-tags` 作为唯一的打 tag 手段。
- AC3 — 文档中有一段说明「为什么不用 `npm version` 自动打 tag」，包含实测到的 npm 行为。
- AC4 — 无权限路径保持不变（它已使用 `--no-git-tag-version` + 显式 tag）。
- AC5 — 两条路径的命令序列各自完整可执行，不依赖读者补全。

## In Scope

- `CONTRIBUTING.md` — 「发一个版本」的两个小节

## Out of Scope

- **修 npm 的检测问题。** 那是 npm 在 WSL + 子目录下的行为，不是本仓库能改的。也可能只影响某些版本，但无论如何文档不该依赖它。
- **加一个 release 脚本。** 现在两条路径各三五行命令，加脚本是为几行命令引入一个需要维护的入口。等命令真的复杂了再说。
- **改 `publish.yml`。** 它只认 tag 事件，与 tag 怎么打出来的无关。

## Risks / Deferred Items

- **风险：npm 以后可能修好这个检测。** 那时显式打 tag 仍然正确，只是不再是「必须」。文档里说明原因，让后来者能判断。
- **延后：如果将来加了 release 脚本或用了 release-please 之类的工具**，这一节会被替换掉。分层结构仍然适用。

## Open Questions

无。

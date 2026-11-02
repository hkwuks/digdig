# Plan — 修正 CONTRIBUTING.md：npm version 在 cli/ 子目录打不出 tag
> Task version: v1
> Status: completed

No spec required — small, self-contained task.

## Reference Pointers

- `CONTRIBUTING.md:144-175` — 「发一个版本」两个小节
- `.github/workflows/publish.yml` — 只认 `push` 到 `v*`，与 tag 如何产生无关
- 实测依据：`npm version patch --loglevel=verbose` → `npm verbose version Not tagging: not in a git repo or no git cmd`，而 `git rev-parse --git-dir` 在 `cli/` 下正常返回

## Related Tasks

- `2026-11-01-npm-automated-publish`（已归档）— PR #21 首次写入发布流程，缺陷来自这里
- `2026-11-01-release-permissions`（已归档）— PR #25 按权限分层重写，保留了同一个错误假设
- 本任务修正两者共同的假设

## Skills / Tools Used

- [PRD] Unaided — considered: "requirements elicitation and framing"
- [Plan] Unaided — considered: "work breakdown and task decomposition"
- [Test] Unaided — considered: "testing strategy"

三份 unaided。缺陷由实测确定，修法由实测倒推（改为不依赖那个会静默失败的功能），无设计空间。

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-02 22:44 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 有权限路径改为显式打 tag

- Goal: 命令序列不再依赖 `npm version` 自动打 tag。
- Dependencies: 无
- Files:
  - `CONTRIBUTING.md`
- Implementation checklist:
  - [x] `npm version patch` 改为 `npm version patch --no-git-tag-version`
  - [x] 补上 `git commit`（`--no-git-tag-version` 只改文件不改提交）
  - [x] 补上显式 `git tag v<version>`
  - [x] 推送命令改为 `git push origin main && git push origin v<version>` 或 `--follow-tags`
- Acceptance: AC1, AC2
- Verification: 逐条读命令，确认每一步存在且顺序正确
- Rollback: `git checkout -- CONTRIBUTING.md`
- Status: done

### Step 2 — 补一段说明为什么显式打 tag

- Goal: 后来者知道这不是风格选择，是踩过的坑。
- Dependencies: Step 1
- Files:
  - `CONTRIBUTING.md`
- Implementation checklist:
  - [x] 说明 `cli/` 是子目录，npm 的 git 检测在这里失败
  - [x] 引用实测到的 vevent 日志原文 `Not tagging: not in a git repo or no git cmd`
  - [x] 说明失败是静默的：输出照常显示版本号，不报错
  - [x] 说明 `git tag` 手动打不受影响
- Acceptance: AC3
- Verification: 读文本确认四点都在
- Rollback: `git checkout -- CONTRIBUTING.md`
- Status: done

### Step 3 — 检查无权限路径

- Goal: 确认它不受同一缺陷影响。
- Dependencies: Step 1
- Files:
  - `CONTRIBUTING.md`（可能无需改动）
- Implementation checklist:
  - [x] 确认已使用 `--no-git-tag-version`
  - [x] 确认已显式 `git tag v<version>`
  - [x] 若有遗漏则补齐
- Acceptance: AC4
- Verification: 读文本
- Rollback: 无需
- Status: done

## Checkpoints

### Checkpoint — 全部完成

- [x] 两条路径都含显式 `git tag`
- [x] 说明段落含实测的 npm 日志原文
- [x] 两条路径的命令都能独立执行

## Verification / Review

纯文档。验证靠逐条对照 AC 读文本，没有可执行测试。

关键不是「命令看起来对」，而是「**不依赖那个已证明会静默失败的功能**」。本任务存在的全部理由就是这一点。

## Change Log

- 2026-11-02 — 发布 0.0.4 时发现缺陷。npm 在 cli/ 子目录下静默跳过打 tag。
- 2026-11-02 — v1 建立。

## Follow-ups

- npm 若修好这个检测，显式打 tag 仍然正确，只是不再是必须。文档说明原因以便后来者判断。
- 若将来引入 release 脚本或 release-please，这节会被替换。

## Version History

- v1 — planning.

## 实现记录

- 2026-11-02 — Step 1–3 完成。有权限路径改为 `npm version --no-git-tag-version` + 显式 `git commit` / `git tag`；新增「为什么显式打 tag」小节，含 npm verbose 日志原文；无权限路径确认原本就用 `--no-git-tag-version` + 显式 tag，未改。

### 命令序列实测

在临时分支上用一个假版本号 `9.9.9` 走了一遍有权限路径：

```
npm version 9.9.9 --no-git-tag-version
→ 三处版本一致：pkg 9.9.9 / lock1 9.9.9 / lock2 9.9.9
→ HEAD 上未新增 tag（--no-git-tag-version 生效）

git commit -am "..."
git tag v9.9.9
→ tag 创建成功，rev-parse 的 HEAD 与 v9.9.9 都是 2371e67（指向同一提交）
→ tag 引用的包里 version 是 9.9.9（与 tag 名一致）
```

验证完已 `git tag -d v9.9.9` + `git reset --hard v0.0.4` 清理。

### 一次自我失误，记录备查

验证命令时直接在工作区跑，跑完用 `git reset --hard` 清理测试提交 —— 把我对 `CONTRIBUTING.md` 的修改一并回滚了。文档退回旧版，重做了一遍。

教训：**验证会改动工作区的命令序列，必须先提交再验证，或者验证前先备份。** 这次是「先改文档 → 后跑验证 → 用 reset 清理」，顺序错了。正确顺序是「先改文档并提交 → 在干净状态上验证 → 验证后清理测试产物」。

补记：重做后已验证 `grep -c "为什么显式打 tag"` = 1、`git tag v<version>` 两处（两条路径各一）、`no-git-tag-version` 三处，与回滚前一致。

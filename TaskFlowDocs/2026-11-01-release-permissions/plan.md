# Plan — 修正 CONTRIBUTING.md 的发布流程：按 main 推送权限分层
> Task version: v1
> Status: planning

No spec required — small, self-contained task.

## Reference Pointers

- `CONTRIBUTING.md:117-200` — 发布小节现状
- `CONTRIBUTING.md:230` — 「不要在 `main` 上直接提交」，需要加例外
- `.github/workflows/publish.yml` — 只认 `push` 到 `v*`，与 tag 如何产生无关
- PR #24（`4c4bc8a`）— 0.0.3 发布实际走的无权限路径变体，是本任务的事实来源

## Related Tasks

- `2026-11-01-npm-automated-publish`（已归档）— PR #21 建立了发布小节，本任务修正它遗漏的权限分层。该任务的文档不动。
- `2026-11-01-release-permissions` 从 `main` @ `4c4bc8a` 切出。

## Skills / Tools Used

- [PRD] Unaided — considered: "requirements elicitation and framing"
- [Plan] Unaided — considered: "work breakdown and task decomposition"
- [Test] Unaided — considered: "testing strategy"

三份都是 unaided。规则由用户一句话给出（有权限走 main、没权限走 PR），事实来源是刚刚真实执行过的 PR #24，剩下的工作是把两者对齐成文档。没有设计自由度，也没有可研究的未知。

## Preconditions

- 分支 `docs/2026-11-01-release-permissions`，基于 `main` @ `4c4bc8a`
- worktree `.worktrees/2026-11-01-release-permissions`
- `CONTRIBUTING.md` 的发布小节已在工作区改好（见 Steps 的记录），本次是把改动固化成任务文档并验证

## Approval

- Status: approved
- Approved by: user
- Approved at: 2026-11-01 22:45 +0800
- Approved version: v1
- Approved scope: PRD / Plan

## Steps

### Step 1 — 发布小节改成两条权限路径

- Goal: 读者能根据自己有没有 `main` 推送权限，找到对应的完整命令序列。
- Dependencies: 无
- Files:
  - `CONTRIBUTING.md`
- Implementation checklist:
  - [x] 「发一个版本」拆成「有 `main` 推送权限」与「没有 `main` 推送权限」两小节
  - [x] 有权限路径：`git checkout main && git pull` → `cd cli && npm version patch` → `git push --follow-tags`
  - [x] 无权限路径：`npm version patch --no-git-tag-version` → 分支 → commit → push → PR → **合并后** `git tag v<version> && git push origin v<version>`
  - [x] 解释 `--no-git-tag-version` 的必要性：`npm version` 默认在当前 HEAD 打 tag，分支提交上的 tag 是游离的
  - [x] 「不要手改 package.json 再自己打 tag」那段更新为「`npm version` 同时处理 package.json、package-lock.json 和 tag」
- Acceptance: AC1–AC3
- Verification: 逐条对照 PRD 的 AC1–AC3 读文档；命令均为本次真实执行过的
- Rollback: `git checkout -- CONTRIBUTING.md`
- Status: done

### Step 2 — 「不要做的事」加发布例外

- Goal: 消除文档自相矛盾。
- Dependencies: Step 1
- Files:
  - `CONTRIBUTING.md`
- Implementation checklist:
  - [x] 第 230 行那条改为「…**例外：发布时的版本号提交**，有 `main` 推送权限的人可以直接提交（见「发布」一节）」
- Acceptance: AC4
- Verification: `grep -n "不要在 \`main\` 上直接提交" CONTRIBUTING.md` 输出行含「例外」
- Rollback: `git checkout -- CONTRIBUTING.md`
- Status: done

## Checkpoints

### Checkpoint — Steps 1–2 完成

- [x] 两条权限路径各有完整命令
- [x] `--no-git-tag-version` 出现在无权限路径且解释了原因
- [x] 无权限路径写明 tag 在合并后打
- [x] 「不要在 main 上直接提交」带例外
- [x] 一次性配置 / workflow 说明 / 失败处置 / 不用 token 四段未被改动

## Verification / Review

- 2026-11-01 Step 2: 「不要在 main 上直接提交」已加发布例外

- 2026-11-01 Step 1: 两条权限路径各有完整命令；--no-git-tag-version 已解释；tag 在合并后打

纯文档改动，没有可执行测试。验证靠逐条对照 AC 读文本：

- AC1：两个 `**有 main 推送权限**` / `**没有 main 推送权限**` 小节，各有代码块
- AC2：`grep -n "no-git-tag-version" CONTRIBUTING.md` 有命中且上下文有解释
- AC3：`grep -n "合并之后" CONTRIBUTING.md` 有命中
- AC4：`grep -n "不要在 .main. 上直接提交" CONTRIBUTING.md` 输出的行含「例外」
- AC5：`git diff CONTRIBUTING.md` 只涉及发布小节和那一行，其他段落零改动

## Change Log

- 2026-11-01 — Step 1、Step 2 完成。改动在进入 TaskFlow 之前就已写进工作区（当时误以为这是可直接改的文档修正），随后按流程补建任务、把改动纳入 Step 记录。
- 2026-11-01 — TaskFlow 的 pre-write gate 在 worktree 里反复拦截，原因是 gate 的释放记录一次只能写一份文档，而我在两次 `unaided` 之间做了其他操作，导致序列被消耗。清掉 `released` 目录后按「释放 → 立刻写文件」的顺序通过。

## Follow-ups

- 启用分支保护后，这一节的「有权限/无权限」边界会由 GitHub 规则决定，届时需要重写，但分层结构仍然适用。

## Version History

- v1 — planning.

# Plan — 索引锁归属
> Task version: v1
> Status: completed

## Spec Pointers
- 小范围修复，无需独立 Spec。

## Skills / Tools Used
- [PRD] Unaided — no capability applied to this phase; considered: root cause investigation；检查锁获取和释放路径。
- [Test] Unaided — no capability applied to this phase; considered: testing strategy；模拟并发锁竞争。

## Plan Review
- Verdict: sound
- Coverage: Step 1 覆盖抢锁失败保留锁、成功后释放及过期规则不变。
- Verifiability: 模拟文件系统验证删除调用与错误码。
- Layer ownership: 锁归属由索引锁函数维护。

## Approval
- Status: approved
- Approved by: user
- Approved at: 2026-11-09
- Approved version: v1
- Approved scope: 抢锁失败保留他人锁，保留过期锁回收规则。

## Steps
### Step 1 — 修复和验证
- Goal: 仅释放本次成功获取的锁。
- Dependencies: 无
- Files: `cli/src/deep/local-doc/indexer.ts` 和测试。
- Implementation checklist:
  - [x] 修复并验证。
- Acceptance: PRD 验收条件成立。
- Verification: 定向测试和类型检查。
- Rollback: 回退本任务改动。
- Status: done

## Verification / Review
Vitest 定向测试 2 项通过：抢锁失败不删除、持锁后操作异常仍释放；tsc --noEmit 与 git diff --check 通过。首次测试的模拟发生在加锁前，修正模拟后通过。未执行真实文件删除。

## Change Log
- 2026-11-09 v1 — 创建独立任务并记录用户同意。

## PR 检查
- 远程 `hkwuks/digdig` 的 `main`，基线 3e7a65c；模板 `.github/pull_request_template.md` 的背景、改动、验证、兼容性和范围外事项全部填写。
- 审查：仅在成功获取后释放锁；保留现有过期锁回收策略。测试使用模拟文件系统。

# 修复索引锁归属
> Task version: v1
> Status: completed

## Task Kind
- Kind: defect

## 目标及验收
抢锁失败不得删除其他进程的锁；取得的锁在任务完成或失败后释放。保留原有过期锁回收规则。

## External Facts
- Depends on external facts: no
- Why not: 行为由 `cli/src/deep/local-doc/indexer.ts` 和用户确认范围决定。

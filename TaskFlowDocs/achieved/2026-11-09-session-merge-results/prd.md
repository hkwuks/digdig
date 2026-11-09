# 会话合并结果保留
> Task version: v1
> Status: completed

## Task Kind
- Kind: defect

## 目标与验收
--session 与 --merge 同用时，合并文件和本轮结果共同参与排序，选中的前 limit 条显示并写入 session；历史结果不因历史投票被单独显示。

## External Facts
- Depends on external facts: no
- Why not: 规则由 `cli/src/deep/fuse.ts` 和用户确认决定。

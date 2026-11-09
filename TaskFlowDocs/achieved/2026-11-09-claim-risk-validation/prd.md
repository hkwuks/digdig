# 修复 claim 风险等级
> Task version: v1
> Status: completed

## Task Kind
- Kind: defect

## 目标与验收
新输入的字符串风险等级转换为小写并校验，只接受 low、medium、high；缺省保持 medium。非法值报错，不保存批次。历史数据中非法等级在读取时阻止审核且报错，不自动修改文件。

## External Facts
- Depends on external facts: no
- Why not: 契约由 `cli/src/claims/policy.ts` 和用户决定确定。

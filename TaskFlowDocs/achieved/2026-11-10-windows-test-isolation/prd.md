# 修复 Windows 测试读取真实配置和 README 换行导致的四项失败
> Task version: v1
> Status: completed

## Goal

修复 Windows 测试读取真实配置和 README 换行导致的四项失败

## Task Kind

- Kind: defect

## Background / Confirmed Facts

Windows 上 `os.homedir()` 使用 USERPROFILE；仅覆盖 HOME 无法隔离真实用户配置。README 检查使用 LF 专用正则。provider-routing 测试使用未隔离的 defaultLimit。四项失败在 main 上复现。

## Requirements

- 隔离超时测试的 HOME 与 USERPROFILE，并在 provider 测试固定和恢复 defaultLimit。
- README 内容检查同时接受 LF 和 CRLF，保留原有数值断言。

## Acceptance Criteria

- 两个测试文件在存在个人配置时全部通过，且完整测试套件通过。
- 不修改产品配置、用户配置或产品逻辑；无测试被跳过或放宽数值断言。

## External Facts

- Depends on external facts: no
- Why not: 失败由本机测试和 `cli/src/legacy.ts` 的配置读取路径验证。

## In Scope

两个受影响测试文件及任务记录。

## Out of Scope

更改本机配置或默认产品参数；其他独立修复。

## Risks / Deferred Items

Windows 与其他平台的用户目录解析不同，需同时设置 HOME 和 USERPROFILE。

## Open Questions

无。

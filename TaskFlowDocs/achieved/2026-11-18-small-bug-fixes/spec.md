# 修复设计
> Task version: v2
> Status: ready

## Boundaries and contracts
图查询解析实体 ID 或标签，只允许 entity；索引查询使用 Orama 公共搜索接口；标题渲染去掉与文档标题相同的首段。会话结果写入层负责轮次，首批非空导入至少为 1，已有轮次不增加；来源报告取首个 origin 的 tool。命令层在输入校验后初始化会话。

## Data flow and invariants
保持已有结果及来源数据；只改变错误的派生显示和初始轮次。空导入不创建轮次，搜索分配轮次不受影响。现有数据无需迁移。空会话本地搜索有命中则建立第 1 轮，之后首次网络搜索分配第 2 轮；已有轮次的本地搜索及空结果均不新增轮次。质量报告中的 source 取第一个 origin 工具名，本地索引为 local-index；来源数按文件路径去重。

## Error semantics and verification
无效输入返回原有错误并不创建目录。使用现有测试框架验证实际命令、会话存储及索引行为，并执行类型检查与全量测试。

# Spec — 来源簇只按 hostname 判断，转载被当成独立来源
> Task version: v1

## Objective and Success Criteria

以 claim 和正文快照为单位管理来源关系，只在来源独立且有有效支持 verdict 的条件已确定时自动批准；其他情况解释并交 Agent 审核。

## Architecture Boundaries and Responsibilities

存储层持久化关系、审计和事务；确定性比较层提供完整正文一致性与疑似线索；Agent 提供带依据的来源关系判断；纯 policy 根据有效判断、证据和 verdict 决策。不得让 CLI 的内容相似度替代 Agent 推断来源独立性。

## Project Structure / Affected Files

`cli/src/claims/{types,deterministic-checks,policy,store}.ts`；`cli/src/deep/{session-db,session-migrate,session,session-store-claims,session-store-results}.ts`；`commands/{evidence,review,json-input}.ts`、新来源关系命令及 `runCli.ts`；真实迁移与命令测试；README、项目内 skill 和 CHANGELOG。实施前用 `rg` 补齐所有调用方。

## Interfaces, Data Flow, and Contracts

- 两来源关系仅绑定同一 claim 的两个稳定结果 ID 和当前正文快照 ID，关系为 `same`、`independent` 或 `unknown`；Agent 判断须有非空依据，可检查引用；必须验证来源属于当前会话、快照和合法 claim，不接受路径越界或空依据。
- 持久化 Agent 判断及历史（包括依据、快照、状态与时间），提供 `source-relations <session> --claim-id <id>` 查询与受会话 `agent-inputs` 边界保护的 JSON 写入；支持显式撤销错误判断并保留旧记录，再提交新判断。重复操作幂等，矛盾或同源闭包内声明独立时拒绝并返回结构化冲突；同源可传递，独立关系不可传递。
- 当前 `hasVerifiedContent` 不证明完整性；首版对完全相同或相似的抽取正文只显示疑似同源线索并保持未知，由 Agent 判断，不自动认定同源。未来有可核验的完整性来源时再设计自动判定；不凭 Agent 的裸布尔值或摘要断言完整。
- 同域名不是独立性的充分条件，也不是确定同源的唯一依据；Agent 可以有依据确认同域名两个一手来源独立。不同域名、canonical、相近文本、同 quote 和标题只能作为可解释线索，不可自动认定独立。
- 形成候选时只考虑当前有效且被采信的证据，并确保 verdict 的 `evidenceIds` 实际关联且 `stance=support`；没有支持 verdict 的来源不得凑数。每个参与判定的不同来源对须具备一致的确定同源或独立关系；存在未知或冲突不得自动通过并提供原因。保留先处理反驳和 insufficient 的安全语义，不能因为收紧来源条件掩盖反证。
- `evidence-verify --complete` 与 `policy-aggregate` 调同一个来源评估和 policy 函数；输出保留已确认/未知的来源事实、依据和不可自动通过的原因，JSON 与 Markdown 均明确未知。旧布尔字段的含义不得把未知描述为独立；如输出字段发生变更，更新项目所有消费者和文档，不引入未经授权的兼容 shim。
- 旧 SQLite schema 按事务升级：所有依赖旧域名规则的 `autoPass` 审核转待重审并移入既有 review_history，claim 相应回到待审；人工/非自动审核不因迁移被删除。旧 JSON 首次迁移的审核也必须走相同失效逻辑，不能通过导入顺序绕过；来源判断随快照变化失效，旧记录只供审计。

## Invariants and Compatibility

历史 evidence、snapshot、verdict、review 和判断记录不可丢失；读不存在会话不创建；新旧版本不可同时写同一会话。域名自动通过行为是有意改变；不得静默把旧自动批准继续视为当前有效。迁移未知 schema 拒绝操作；并发和崩溃后的状态全有或全无。

## Validation and Error Semantics

冲突、未知快照、被跳过/无效结果、重复输入、不同 claim、同域名、同源传递/独立非传递、相同正文但完整性未知均须有结构化结果。旧自动审核处理在有无多个 claim、JSON 首次迁移和失败回滚时均需真实数据库验证。无来源依据或无法证明完整时不得给出确定结论。

## Code and Test Constraints

Node >=24.15、内置 SQLite，不添加无必要依赖；先对两种已复现误批准写失败测试。验证生产 CLI 输入及数据库输出，覆盖中断、重试和双进程；跑定向、全量测试、类型、构建及 Linux CI。不得使用用户真实会话作为测试数据。

## Design Decisions and Alternatives

选择保守三态及可审计的 Agent 关系，而非按域名数或文本相似度猜测独立性；关系以 claim + 快照对限定，避免跨 claim 和正文版本传播。近似文本和 canonical 可用于提示，不建立未验证的自动阈值。

## Open Questions

自动同源不在首版范围；未来需先确认完整性证明格式。

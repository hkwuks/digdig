# 来源簇只按 hostname 判断，转载被当成独立来源
> Task version: v1
> Status: in_progress

## Goal

`computeSourceClusterId`（`cli/src/claims/deterministic-checks.ts:58-70`）把 publisher hostname 做 sha256 截 16 位当簇 ID。同一篇文章被 5 个站转载，5 个不同 hostname 就是 5 个「独立来源」，`policy.ts` 按来源域名数判定的规则（`dualSourceMixed`、`highRiskInsufficient`）因此会被骗过——`policy.ts:44` 的注释自己写的就是「Domain-level source independence」，即它知道这只是域名级而非内容级。`docs/agent_search_integrated_report_2026-10-27.md` 3.3 明写「证据数量不等于独立性：文章来源关系需要聚类；不能用 URL count 代替证据簇数」，2.6 节进一步要求「同一文章转载、共同通讯社稿、同一官方声明的多次改写应视作同一事实来源簇」。

## Task Kind

- Kind: defect

## Background / Confirmed Facts

- 根因：`computeSourceClusterId` 按域名散列；`aggregateClaim` 根据不同簇数而非真实来源关系自动审核。
- 2026-11-11 使用当前 `policy.ts` 和 `deterministic-checks.ts` 实测：不同域名的相同转载证据被归为两个簇，高风险 claim 返回 `approved / dualSourceSupport`；第二个来源无支持 verdict 时仍返回相同结果。
- `hasVerifiedContent` 只确认非空正文、抽取器和时间，不能证明抓取完整；当前没有 canonical 或转载链的可信完整记录。PR #58 已提供正文快照和审核历史。
- 用户决定：未知独立性不自动通过；当前没有可核验完整性的来源，首版相同正文只标疑似同源，未来有证明后再启用自动同源。Agent 显式记录同源/独立及依据，冲突判断拒绝并说明，同域名可经 Agent 确认独立；判断绑定 claim 和两份正文快照，正文变化后失效并保留历史；只有有效支持 verdict 的来源计入自动通过；已有域名规则自动批准记录升级或访问时转待重审并留历史。

## Requirements

1. 区分同源、独立和未知，不能把不同域名直接解释为独立；未知要说明原因并交由 Agent 判断。
2. 首版正文相同或相似均只提供疑似同源线索，不自动判同源。未来只有可核验完整正文的来源可启用自动判定。摘要一致、canonical 或域名等也只能作为线索，不能单独证明不同来源独立。
3. 提供 Agent 写入和查看同源/独立判断及理由的接口；判断绑定当前 claim、两个结果和它们的正文快照。旧判断随正文版本变化失效但可审计；拒绝与确定的同源证据或现有判断相矛盾的判断；允许有依据地确认同域名来源独立。
4. 审核只从当前有效、已采信且有有效 support verdict 的证据中计算独立来源；存在需要判断的未知关系时不得自动批准，需解释并保留反驳规则。
5. 升级或访问旧会话时，将依赖旧域名规则的自动批准转待重审并保留原审核；不丢证据、verdict、快照或历史审核。

## Acceptance Criteria

- 相同转载、不同正文但关系未知、只有一个 support verdict 的双来源均不能自动通过；两个经 Agent 确认独立且均有有效支持的来源可以走现有规则。
- 冲突、重复、同域名、快照变更、来源失效、旧审核升级和历史读取有清晰行为及真实 SQLite/CLI 测试。
- `evidence-verify --complete` 和 `policy-aggregate` 使用同一判断入口；多证据、多 verdict、人工审核、JSON/Markdown 输出一致，不出现无声回退至域名规则。
- 旧会话升级与并发、失败、进程中断可恢复；全量测试、类型检查、构建、真实 CLI 和 CI 通过。

## External Facts

- Depends on external facts: yes
- Source: https://developers.google.com/search/docs/crawling-indexing/canonicalization-troubleshooting
- What it settled: canonical 有可能被误配置或恶意注入，Google 也不推荐将其单独作为转载重复识别方案；它不能单独证明来源关系。
- Source: https://ijoc.org/index.php/ijoc/article/view/9904
- What it settled: 转载文本检测需要区分通讯社、新闻稿、互相复制和偶然重叠；重叠只能作为待解释的线索。
- Source: https://www.microsoft.com/en-us/research/publication/news-provenance-revealing-news-text-reuse-at-web-scale-in-an-augmented-news-search-experience/
- What it settled: 缺少明确引用会使新闻转载传播路径难以确定；近重复检测是溯源辅助而非自动证明独立性的万能方法。
- Local lookup: `dg.CMD` 先因沙箱 EPERM 失败，获权限重试后本机 SearXNG `127.0.0.1:3668` 拒绝连接；通过 web 搜索并阅读以上原始资料。

## In Scope

来源关系建模、Agent 可审计判断及查看、审核资格、原有自动批准重审、SQLite/JSON 迁移、CLI、项目 skill、回归和文档。与两类误批准直接相关的无 verdict 来源计数也纳入。

## Out of Scope

自动跨语言改写识别、自动证明正文完整性及自动同源、用相似度阈值证明独立性、外部图谱/数据库、联网爬取与来源可信度评级、清理旧历史、发版。

## Risks / Deferred Items

即使正文相似也可能共同引用公开材料或模板；正文不同也可能出自同一新闻稿。手工判断无法由算法保证真实，需要记录可检查依据；同源聚类具有传递性，独立关系不具传递性。

## Open Questions

自动同源需要的完整性证明格式留作后续；首版不假定正文完整。

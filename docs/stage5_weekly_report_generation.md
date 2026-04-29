# Stage 5 - Weekly Report Generation

Project: Roco Kingdom Vietnam Facebook Group weekly monitoring

Status: stage 5 draft for user confirmation.

## Input

Input file type: stage 4 structured weekly JSON.

Required source properties:

- `schemaVersion`: `stage4.structured_weekly.v1`
- `items`: cleaned, translated, classified, anonymized content
- `topicSummary`
- `sentimentSummary`
- `riskSummary`
- `lowConfidenceItems`
- `sourceStatus`

If input is marked `exampleOnly: true` or `readyForWeeklyReport: false`, the report generator must not produce a real market conclusion. It may only produce a report template or schema example.

## Report Positioning

The report is a market observation and future Vietnam launch reference document. It must not be framed as:

- customer service response
- immediate player issue handling
- Vietnam operations intervention
- confirmed official Vietnam publishing status

Recommended framing:

- natural player community signal
- pre-launch awareness monitoring
- overseas market interest observation
- localization demand discovery
- community and misinformation risk identification

## Required Report Title

```markdown
# Roco Kingdom 越南 Facebook Group 每周舆情监测报告
```

## Required Header Fields

- 报告周
- 统计时间范围
- 生成日期
- 已确认 Group 数
- 有效内容量
- 帖子数量
- 评论数量
- 主要语言分布
- 数据获取方式：浏览器自动化
- 数据完整性说明

## Required Sections

### 1. 本周总览

Use 5-8 Chinese sentences to summarize:

- what Vietnam players discussed this week
- whether natural interest is increasing
- whether there are potential risks
- whether there are future launch reference signals

### 2. 核心指标

Fields:

- 本周总讨论量
- 有效 Roco 相关内容量
- 高相关内容占比
- 正面占比
- 中性占比
- 负面占比
- 高风险内容数量
- 活跃 Group 数
- Top 5 热点
- 舆情健康度评分
- 未来发行参考价值评分

### 3. Group 监测源状态

Table columns:

- Group 名称
- 链接
- 访问状态
- 本周内容量
- 数据完整性
- 是否纳入正式监测
- 备注

### 4. 本周热点话题排行

Table columns:

- 排名
- 热点
- 内容量
- 情绪倾向
- 热度
- 环比变化
- 市场观察价值
- 代表 case 跳转
- 备注

### 5. 玩家情绪分析

Summarize:

- 正面玩家在期待什么
- 中性玩家在询问什么
- 负面玩家在担心什么
- 混合情绪背后的核心矛盾

### 6. 未来越南发行参考信号

Use market-observation language:

- 玩家自然兴趣点
- 高频疑问
- 潜在付费关注点
- 本地化关注点
- 社区自传播线索
- 可能影响未来发行的认知问题

### 7. 风险观察

Risk level: `P0`, `P1`, `P2`, `P3`.

Fields:

- 风险名称
- 风险等级
- 证据摘要
- 涉及内容量
- 影响判断
- 是否需要内部关注
- 建议观察动作
- 是否需要未来发行前处理
- 代表 case 跳转

### 8. 代表性玩家声音

Display only anonymized content:

- 越南语原文
- 中文翻译
- 情绪
- 主题
- 来源 Group
- 查看原帖链接
- 分析备注

Do not display real names, avatars, profile links, Facebook IDs, or member identity fields.

### 9. 趋势观察

Compare with previous weeks when history exists:

- 讨论量趋势
- 活跃 Group 趋势
- 正负面情绪趋势
- 热点变化
- 风险变化
- 越南玩家兴趣是否升温

If there is no prior week, state that trend comparison is unavailable for the first week.

### 10. 本周结论

Answer clearly:

- 越南自然玩家社区是否活跃
- 当前是否值得继续监控
- 是否出现未来发行机会信号
- 是否存在需要提前处理的认知或风险问题

## Metric Rules

Total discussion volume:

```text
totalDiscussionVolume = validPostCount + validCommentCount
```

High relevance rate:

```text
highRelevanceRate = highRelevanceItemCount / validItemCount
```

Sentiment rates:

```text
positiveRate = positiveCount / validItemCount
neutralRate = neutralCount / validItemCount
negativeRate = (negativeCount + highRiskNegativeCount) / validItemCount
```

Sentiment health score:

```text
base = 60
positiveBonus = positiveRate * 25
riskPenalty = min(highRiskCount * 4, 25)
negativePenalty = negativeRate * 25
sentimentHealthScore = clamp(base + positiveBonus - negativePenalty - riskPenalty, 0, 100)
```

Future launch signal score:

```text
futureLaunchSignalScore = weighted score from volume, high relevance, natural interest, localization questions, payment interest, and community self-spread signals.
```

Scores are directional monitoring indicators, not official business decisions.

## Source Link Rules

- Preserve post-level URL as `查看原帖`.
- Do not link to user profile URLs.
- If the post requires Facebook or Group permission, mark `需 Facebook / Group 权限`.
- If the post is unavailable, mark `不可访问` or `权限变化`.

## Data Integrity Rules

The report must include a visible data integrity note:

- whether all 6 Groups were accessible
- whether newest-first sorting was available
- whether comments were fully expanded
- whether posts/comments were partially missing
- whether any Group requires additional permission
- whether trend comparison is unavailable

## Stage 5 Boundary

This stage generates the weekly report structure and analysis rules. It does not build the Dashboard and does not perform long-term automation deployment.

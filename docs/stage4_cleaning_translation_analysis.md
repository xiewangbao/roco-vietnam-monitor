# Stage 4 - Cleaning, Translation, Classification, and Sentiment

Project: Roco Kingdom Vietnam Facebook Group weekly monitoring

Status: stage 4 draft for user confirmation.

## Input

Input file type: stage 3 weekly raw JSON.

Required source properties:

- `schemaVersion`: `stage3.weekly_raw.v1`
- `dataSource`: `browser_automation`
- `records`: raw post and comment records
- `failures`: crawl failure and gap records

If the weekly raw JSON is a schema example or contains no real records, stage 4 must not generate real insights. It may only produce a schema example and processing notes.

## Output

Output file type: structured weekly JSON for weekly report and Dashboard generation.

Target schema version: `stage4.structured_weekly.v1`

The structured output keeps:

- anonymous content ID
- anonymous author ID when needed for dedupe or repeat-pattern checks
- post URL for post-level review
- source Group
- original text
- Chinese translation
- language label
- topic labels
- sentiment label
- risk labels
- confidence
- low-confidence reason

The structured output must not include:

- real user names
- avatars
- user profile links
- Facebook IDs
- member lists
- any directly identifying personal fields

## Cleaning Rules

1. Deduplicate exact duplicate posts and comments.
2. Deduplicate cross-posted content when the same text and post URL appear in multiple source views.
3. Keep legitimate repeated discussion if different users independently raise the same issue.
4. Remove or mark as invalid:
   - pure emoji
   - blank text
   - unrelated game content
   - generic Facebook system text
   - obvious spam unrelated to Roco
5. Keep but risk-label:
   - scam links
   - private server promotion
   - cheat or exploit trading
   - account buying/selling
   - recharge fraud
   - fake official claims
6. Do not remove negative content if it is relevant to market observation.
7. Preserve post URL for representative cases and risk cases.

Cleaning decision values:

- `valid_relevant`
- `valid_low_relevance`
- `invalid_duplicate`
- `invalid_unrelated`
- `invalid_empty`
- `invalid_system_text`
- `risk_relevant`

## Translation Rules

1. Translate Vietnamese content into Chinese.
2. Preserve important Vietnamese original terms in parentheses when useful.
3. Preserve game-specific terms, pet names, slang, and abbreviations if translation may reduce meaning.
4. Do not smooth away player uncertainty or rumor language.
5. Mark machine translation uncertainty when context is insufficient.
6. Chinese and mixed Chinese/Vietnamese content should be normalized into Chinese analysis text but keep key original fragments when relevant.

Language labels:

- `vi`
- `zh`
- `en`
- `mixed`
- `unknown`

## Topic Taxonomy

Allowed topic labels:

- `游戏期待与预约兴趣`
- `国服内容讨论`
- `越南玩家自发讨论`
- `宠物、角色、养成`
- `玩法机制`
- `活动与福利`
- `充值、付费、礼包`
- `Bug、闪退、卡顿、登录问题`
- `服务器、延迟、维护`
- `账号、安全、封号`
- `PVP、平衡性`
- `剧情、美术、音乐`
- `攻略分享`
- `社群互动、组队、公会`
- `竞品比较`
- `越南本地化期待`
- `发行时间猜测`
- `负面舆情`
- `诈骗、外挂、私服、黑产风险`
- `其他`

Each item may have multiple topics, but the first topic is the primary topic.

## Sentiment Labels

Allowed sentiment labels:

- `正面`
- `中性`
- `负面`
- `混合`
- `高风险负面`

Guidance:

- Questions, help requests, and neutral guide-seeking are usually `中性`.
- Excitement, recommendation, sharing progress, and praise are usually `正面`.
- Bugs, crashes, payment anxiety, login failure, server complaints, and distrust are usually `负面`.
- Posts containing both strong interest and concern are `混合`.
- Scam, cheat, private server, account sale, impersonation, and serious misinformation are `高风险负面`.

## Risk Labels

Allowed risk labels:

- `假冒官方 Group`
- `诈骗链接`
- `私服宣传`
- `外挂交易`
- `账号买卖`
- `充值骗局`
- `玩家误以为越南区已正式发行`
- `对国服内容的负面传播`
- `竞品对比中的劣势认知`
- `本地化翻译或文化适配担忧`
- `其他`

Risk labels are optional for normal content. Risk evidence must include a short anonymized evidence summary and a post URL when available.

## Confidence Rules

Confidence is a number from 0 to 1.

- `0.85-1.00`: clear language, clear Roco relevance, clear topic/sentiment.
- `0.65-0.84`: relevant but slang, missing context, or media-dependent meaning.
- `0.40-0.64`: weak context, partial text, translation uncertainty, or unclear reference.
- `<0.40`: low confidence; include in low-confidence list and avoid strong conclusions.

## Representative Case Rules

Representative cases may be used in reports only when:

- content is relevant to Roco monitoring goals
- text has been anonymized
- no user identity fields are displayed
- post URL points to the post itself
- access requirement is shown if the post needs Facebook or Group permissions

## Low-Confidence List

The structured weekly JSON must include `lowConfidenceItems` with:

- anonymous content ID
- source Group
- post URL
- reason
- suggested handling

Common reasons:

- text truncated
- media-only post
- machine translation uncertain
- slang unclear
- comment context missing
- post unavailable after crawl

## Stage 4 Boundary

This stage defines and applies cleaning, translation, classification, sentiment, and risk-labeling logic. It does not generate the final weekly report and does not build the Dashboard.

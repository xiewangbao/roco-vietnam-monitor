# Roco Vietnam Monitor Project Memory

This file records the standing product/content rules for future weekly dashboard runs.

## Data Quality Gate

- Do not publish a weekly dashboard as a final result unless the data quality status is `pass`.
- If valid content, comment coverage, active Group coverage, or crawl completeness is weak, pause and tell the user before generating final-facing output.
- Comments are a required part of weekly opinion monitoring. If comments are incomplete, clearly show the limitation and discuss whether to rerun with deeper post-detail comment expansion.
- Reports must distinguish complete weekly runs from in-progress or partial-week runs.

## Content Positioning

- Write for overseas publishing, market research, and community observation teams.
- Do not frame output as customer service response or live Vietnam operations.
- Emphasize future Vietnam launch signals: natural interest, high-frequency questions, payment curiosity, localization friction, self-spread behavior, and pre-launch risk.
- Preserve post-level Facebook URLs only for case review. Do not expose user profile URLs, avatars, Facebook IDs, or real names in final display.
- Topic detail pages must show direct Chinese translation plus a separate opinion/market analysis. Do not show repetitive placeholder text such as "机器初译摘要".
- If a short post/comment cannot be translated confidently without image or thread context, say that it requires context review and still provide the market-research interpretation separately.

## Dashboard Information Design

- First screen must answer: data usable or not, this week's signal strength, risk level, and main discussion clusters.
- Keep high information density. Use status strips, KPI bands, tables, bars, trend rows, and topic drilldowns instead of marketing sections.
- Any topic with volume >= 10 should have a secondary detail page with co-occurring topics, sentiment split, source Group split, post/comment composition, and representative content.
- The hot topic table must show an aggregate, objective topic summary: what players are discussing within that topic, key subthemes, post/comment mix, and market observation meaning. Do not use a single representative post translation as the topic summary.
- Topic detail content tables should not include a per-row opinion analysis column because it becomes repetitive. Keep row-level fields focused on type, source, sentiment, original text, Chinese translation, and source post link.
- Group tables should visualize volume with bars, not only raw counts.
- Sentiment and post/comment mix should be shown with stacked bars.
- Data completeness notes must remain visible on the dashboard.
- The report selector should be a compact dropdown, not a row of large buttons.
- Do not show the standalone "Group 监测源" section on the main dashboard unless the user asks for source diagnostics.
- In the hot topic ranking table, do not show separate "热度" or "市场观察价值" columns. Keep the table focused on rank, topic summary, volume, sentiment, and analysis/case action.
- Do not show a large standalone "情绪分布" block if the same sentiment information already appears in core metrics and comment opinion. Keep only a compact sentiment summary where useful.
- Replace the old "代表性玩家声音" main section with "高互动帖子 Top 3". High interaction must mean `reactionCount + commentCount + shareCount`. If these fields are missing or unreliable, show a clear missing-field note and do not substitute visible discussion count, sampled comment count, or topic volume.
- The "本周总览" section must not be a long paragraph. It should render as structured summary cards containing only: one-sentence conclusion, 3-5 key findings, and 3-5 main discussion clusters.
- "本周总览" must let overseas publishing, market research, and community observation teams quickly understand: what Vietnamese players discussed this week, which discussions represent natural interest, which signals matter for future Vietnam launch, and what friction/risk/localization signals appeared.
- Each key finding must follow "finding + evidence + market meaning": what players discussed, what data supports it, and why it matters for future Vietnam publishing observation.
- Each discussion cluster must show: topic name, volume, post/comment split, sentiment, player question/focus, and market observation value.
- Keep risk details and data completeness details in their dedicated modules, not inside the "本周总览" narrative.

## Rerun And Data Review Rules

- If effective content drops materially from the previous comparable run, review data sources before accepting the result. Check whether the period is partial-week, whether any major Group was crawled shallowly, whether post-detail comments were merged, whether structure cleaning removed valid records, and whether time-window rules excluded valid posts.
- If a major Group drops sharply compared with the previous week, rerun that Group alone with newest-first sorting and compare raw record count, unique post URLs, comment gaps, and structured valid count.
- If a feed crawl reports `hasMoreComments` or comment-section failures, extract post URLs and run post-detail comment deep crawl. Merge the added comments, then rerun Stage 4, Stage 5, quality check, and Dashboard preview.
- If low-volume Groups remain low after targeted reruns and have no comment gaps, mark them as low-activity sources rather than silently treating them as complete.
- For W20 on 2026-05-11, the initial 53 effective items were not accepted. Review found shallow crawling in `Cong Hoi Roco Kingdom Viet Nam`; targeted reruns and comment deep crawl raised the run to 76 effective items, 28 posts, and 48 comments. Use this as the precedent for future suspicious drops.

## Visual Style

- Use an industrial/utilitarian research-console style.
- Preferred palette: `#f4f6f8` background, `#182230` text/header, `#2563eb` action blue, `#0f766e` signal teal, `#b45309` amber warning, `#b42318` high-risk red.
- Avoid landing-page hero sections, decorative gradients, and generic marketing cards.
- Use compact panels and tables with 8px radius or less.
- Text must remain readable in Chinese, English, and Vietnamese mixed content.

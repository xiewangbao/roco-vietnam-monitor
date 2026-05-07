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
- Group tables should visualize volume with bars, not only raw counts.
- Sentiment and post/comment mix should be shown with stacked bars.
- Data completeness notes must remain visible on the dashboard.

## Visual Style

- Use an industrial/utilitarian research-console style.
- Preferred palette: `#f4f6f8` background, `#182230` text/header, `#2563eb` action blue, `#0f766e` signal teal, `#b45309` amber warning, `#b42318` high-risk red.
- Avoid landing-page hero sections, decorative gradients, and generic marketing cards.
- Use compact panels and tables with 8px radius or less.
- Text must remain readable in Chinese, English, and Vietnamese mixed content.

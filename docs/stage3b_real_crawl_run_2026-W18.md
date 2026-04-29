# Stage 3B Real Crawl Run - 2026-W18

Run date: 2026-04-29

## Scope

This is the first real browser-automation crawl for the confirmed Roco Kingdom Vietnam Facebook Group monitoring project.

Because the run happened on Wednesday 2026-04-29, the default Friday-to-Thursday weekly reporting window has not ended yet. The output is therefore marked as an in-progress week crawl.

Actual range recorded in JSON:

- Start: 2026-04-24 00:00:00 Asia/Shanghai
- End: crawl execution time on 2026-04-29

## Browser State

- Browser: Safari
- Facebook state: logged in
- Group state: all 6 Groups joined
- Data source: browser automation
- Feed sort: `新帖子`

## Output Files

- Raw browser capture: `data/raw/stage3b_browser_capture_2026-W18_clean.json`
- Stage 3 weekly raw JSON: `data/raw/weekly_raw_2026-W18_stage3b_real.json`
- Failure and gap log: `logs/crawl_failures_2026-W18_stage3b_real.jsonl`

## Crawl Result

| Group | Captured records | Failure/gap records |
|---|---:|---:|
| Roco Kingdom Viet Nam | 27 | 3 |
| Cong Hoi Roco Kingdom Viet Nam | 35 | 2 |
| Roco Kingdom: World Viet Nam Official | 18 | 1 |
| ROCO KINGDOM VN | 21 | 1 |
| ROCO KINGDOM VIET NAM | 18 | 0 |
| Roco Kingdom Mobile Viet Nam | 11 | 1 |

Total records:

- Posts: 97
- Visible comments: 33
- Total: 130

Failure/gap records:

- Total: 8
- Main reason: `comment_collapsed`

## Data Completeness

This run is suitable as a first real raw dataset for stage 4 cleaning and classification, with the following limitations:

- The week is still in progress; it is not a complete Friday-to-Thursday report window.
- Comment capture is partial. The feed exposes some visible comments, but full comment threads require post-detail expansion.
- Some post times are relative labels such as `2小时`, `3小时`, or `1天`; absolute timestamp extraction needs a post-detail timestamp pass.
- Media-only posts may have low text completeness.
- The raw browser capture is kept for debugging, while the weekly raw JSON avoids user profile URLs, avatars, Facebook IDs, and real author fields.

## Privacy Handling

The stage 3 weekly raw JSON contains:

- anonymous content IDs
- anonymous author IDs
- post URLs
- source Group names and URLs
- visible text content
- relative time labels
- media flags
- crawl status and completeness notes

It does not intentionally include:

- user profile URLs
- avatars
- Facebook IDs
- member lists
- real author identity fields

## Next Step

After user confirmation, stage 4 can process `data/raw/weekly_raw_2026-W18_stage3b_real.json` into real structured weekly JSON using the approved cleaning, translation, topic, sentiment, and risk-labeling rules.

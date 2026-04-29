# Roco Kingdom Vietnam Facebook Group Weekly Monitor

Private repository for the Roco Kingdom / Roco Kingdom World Vietnam Facebook Group weekly monitoring workflow.

## Contents

- `site/` - static Dashboard output.
- `data/raw/` - browser automation raw JSON outputs.
- `data/structured/` - cleaned, translated, classified weekly JSON.
- `data/reports/` - weekly report JSON and Markdown.
- `docs/` - staged methodology and run notes.
- `scripts/` - Safari crawler and data transformation scripts.
- `logs/` - crawl failure and data gap logs.

## Current Dashboard

Open locally:

```bash
python3 -m http.server 4173 --directory site
```

Then visit:

```text
http://127.0.0.1:4173/
```

## Privacy Notes

The reporting and Dashboard layers avoid displaying user real names, avatars, profile links, Facebook IDs, and member lists. Post-level Facebook URLs are retained only for manual review of representative cases and risk cases.

This repository contains real crawl-derived monitoring data and should remain private.

## Current Run

Current real run: `2026-W18`, in-progress week.

The crawl covered available visible content from `2026-04-24` through the 2026-04-29 run time. The 2026-04-30 portion was intentionally not backfilled in this run and should be covered by the next scheduled weekly run.

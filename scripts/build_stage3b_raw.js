const crypto = require('crypto');
const fs = require('fs');

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const failuresPath = process.argv[4];

if (!inputPath || !outputPath || !failuresPath) {
  console.error('Usage: node scripts/build_stage3b_raw.js <browser-json> <weekly-raw-json> <failures-jsonl>');
  process.exit(1);
}

const groups = [
  ['Roco Kingdom Viet Nam', 'https://www.facebook.com/groups/1410112269781852/'],
  ['Cong Hoi Roco Kingdom Viet Nam', 'https://www.facebook.com/groups/roco.legend/'],
  ['Roco Kingdom: World Viet Nam Official', 'https://www.facebook.com/groups/1729046980837718/'],
  ['ROCO KINGDOM VN', 'https://www.facebook.com/groups/3072730653028573/'],
  ['ROCO KINGDOM VIET NAM', 'https://www.facebook.com/groups/947481474801675/'],
  ['Roco Kingdom Mobile Viet Nam', 'https://www.facebook.com/groups/3223551104630521/'],
];

const startedAt = new Date().toISOString();
const salt = process.env.ROCO_MONITOR_SALT || 'local-stage3b-salt-not-for-production';

function sha(value) {
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

function canonicalUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

function extractGroupUrl(pageUrl) {
  const found = groups.find(([, url]) => pageUrl.startsWith(url));
  return found ? found[1] : pageUrl;
}

function groupNameFor(url) {
  const canonical = extractGroupUrl(url);
  const found = groups.find(([, groupUrl]) => groupUrl === canonical);
  return found ? found[0] : 'Unknown Group';
}

function maybeCount(text, marker) {
  const pattern = new RegExp(`(\\d+)\\s*${marker}`);
  const match = text.match(pattern);
  return match ? Number(match[1]) : null;
}

function cleanVisibleText(text) {
  return (text || '')
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== '·' && line !== '关注')
    .filter((line) => !/^\d+\s*分钟$/.test(line))
    .filter((line) => !/^\d+\s*小时$/.test(line))
    .filter((line) => !/^\d+\s*天$/.test(line))
    .filter((line) => !/^[0-9]+$/.test(line))
    .join('\n')
    .trim();
}

const browserGroups = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const seen = new Set();
const records = [];
const failures = [];

for (const page of browserGroups) {
  const groupUrl = extractGroupUrl(page.pageUrl);
  const groupName = groupNameFor(groupUrl);
  const sortApplied = (page.sortLabels || []).some((label) => label.includes('新帖子') || /Newest|New posts/i.test(label));

  if (!page.records || page.records.length === 0) {
    failures.push({
      runId: '2026-W18-stage3b',
      reportWeek: '2026-W18',
      groupName,
      groupUrl,
      targetType: 'group',
      targetUrl: groupUrl,
      status: 'failed',
      failureReason: 'selector_changed',
      missingFields: ['records'],
      expectedCount: null,
      capturedCount: 0,
      impact: 'high',
      needsHumanPermission: false,
      crawlTime: startedAt,
      notes: 'No role=article records were captured from the visible feed.',
    });
  }

  for (const item of page.records || []) {
    const postUrl = canonicalUrl(item.postUrl || item.commentUrl || groupUrl);
    const recordType = item.inferredType === 'comment' ? 'comment' : 'post';
    const text = cleanVisibleText(item.contentText);
    const dedupeKey = `${recordType}:${postUrl}:${item.timeLabel || ''}:${text.slice(0, 300)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const anonymousContentId = sha(dedupeKey);
    const anonymousAuthorId = sha(`${groupUrl}:${postUrl}:author-redacted:${item.domIndex}`);

    records.push({
      recordType,
      groupName,
      groupUrl,
      postUrl,
      anonymousContentId,
      anonymousAuthorId,
      publishedAt: null,
      rawTimeLabel: item.timeLabel,
      text,
      contentLanguage: item.contentLanguage || 'unknown',
      reactionCount: null,
      commentCount: maybeCount(text, '评论'),
      shareCount: maybeCount(text, '分享'),
      hasImage: Boolean(item.hasImage),
      hasVideo: Boolean(item.hasVideo),
      hasLink: Boolean(item.hasLink),
      mediaTypes: [
        item.hasImage ? 'image' : null,
        item.hasVideo ? 'video' : null,
        item.hasLink ? 'link' : null,
      ].filter(Boolean),
      parentPostId: recordType === 'comment' ? sha(`post:${postUrl}`) : null,
      parentCommentId: null,
      commentDepth: recordType === 'comment' ? 1 : null,
      crawlTime: startedAt,
      dataSource: 'browser_automation',
      permissionStatus: 'joined_public_group',
      crawlStatus: item.captureQuality === 'has_post_url' ? 'success' : 'partial',
      failureReason: item.captureQuality === 'has_post_url' ? null : 'post_url_unavailable',
      dataCompleteness: {
        postUrl: item.captureQuality === 'has_post_url' ? 'complete' : 'missing',
        publishedAt: item.timeLabel ? 'relative_time_only' : 'missing',
        text: text ? 'visible_text_captured' : 'missing',
        comments: item.hasMoreComments ? 'partial_visible_feed_comments_only' : 'visible_comments_only',
        newestFirstSortObserved: sortApplied ? 'observed_or_selected' : 'not_confirmed',
      },
    });

    if (item.hasMoreComments) {
      failures.push({
        runId: '2026-W18-stage3b',
        reportWeek: '2026-W18',
        groupName,
        groupUrl,
        targetType: 'comment_section',
        targetUrl: postUrl,
        status: 'partial',
        failureReason: 'comment_collapsed',
        missingFields: ['full_comment_thread'],
        expectedCount: null,
        capturedCount: null,
        impact: 'medium',
        needsHumanPermission: false,
        crawlTime: startedAt,
        notes: 'Visible feed indicated additional comments or replies; full thread requires post-detail expansion.',
      });
    }
  }
}

const weeklyRaw = {
  schemaVersion: 'stage3.weekly_raw.v1',
  exampleOnly: false,
  reportWeek: '2026-W18',
  runType: 'stage3b_real_crawl_in_progress_week',
  timeRange: {
    start: '2026-04-24T00:00:00+08:00',
    end: startedAt,
    timezone: 'Asia/Shanghai',
    completenessNote: 'Current week is still in progress on 2026-04-29; this is not the final full Friday-to-Thursday weekly run.',
  },
  generatedAt: startedAt,
  dataSource: 'browser_automation',
  crawlMethod: {
    browser: 'Safari',
    accountState: 'logged_in_joined_groups',
    feedSortPreference: 'newest_first',
    feedSortUiLabelZh: '新帖子',
    scrollPassesPerGroup: 8,
    commentStrategy: 'visible_feed_comments_with_gap_logging',
  },
  sourceGroups: groups.map(([groupName, groupUrl]) => {
    const captured = records.filter((record) => record.groupUrl === groupUrl);
    const groupFailures = failures.filter((failure) => failure.groupUrl === groupUrl);
    return {
      groupName,
      groupUrl,
      permissionStatus: 'joined_public_group',
      crawlStatus: captured.length ? 'partial_success' : 'failed_or_no_visible_records',
      capturedRecordCount: captured.length,
      failureCount: groupFailures.length,
      failureReason: captured.length ? null : 'no_visible_records_or_selector_changed',
      dataCompleteness: 'partial_visible_feed_crawl',
    };
  }),
  records,
  failures,
};

fs.writeFileSync(outputPath, `${JSON.stringify(weeklyRaw, null, 2)}\n`);
fs.writeFileSync(failuresPath, failures.map((failure) => JSON.stringify(failure)).join('\n') + (failures.length ? '\n' : ''));

console.log(JSON.stringify({
  outputPath,
  failuresPath,
  recordCount: records.length,
  failureCount: failures.length,
  groups: weeklyRaw.sourceGroups.map((group) => ({
    groupName: group.groupName,
    capturedRecordCount: group.capturedRecordCount,
    failureCount: group.failureCount,
  })),
}, null, 2));

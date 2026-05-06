const crypto = require('crypto');
const fs = require('fs');

const rawPath = process.argv[2];
const deepPath = process.argv[3];
const outputPath = process.argv[4];

if (!rawPath || !deepPath || !outputPath) {
  console.error('Usage: node scripts/merge_deep_comments.js <weekly-raw-json> <deep-comments-json> <output-json>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const deepPages = JSON.parse(fs.readFileSync(deepPath, 'utf8'));
const salt = process.env.ROCO_MONITOR_SALT || 'local-stage3b-salt-not-for-production';

function sha(value) {
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

function cleanText(text) {
  return (text || '')
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== '关注' && line !== '·')
    .join('\n')
    .trim();
}

function groupForPostUrl(postUrl) {
  const match = (raw.sourceGroups || []).find((group) => postUrl.startsWith(group.groupUrl));
  return match || null;
}

const seen = new Set(raw.records.map((record) => `${record.recordType}:${record.postUrl}:${record.text}`));
let added = 0;
const resolvedCommentSections = new Set();

for (const page of deepPages) {
  const pagePostUrl = page.pageUrl || '';
  const pageAddedBefore = added;
  for (const item of page.records || []) {
    const text = cleanText(item.contentText);
    if (!text) continue;
    const group = groupForPostUrl(item.postUrl);
    if (!group) continue;
    const key = `comment:${item.postUrl}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const dedupeKey = `comment:${item.postUrl}:${item.commentUrl || ''}:${item.timeLabel || ''}:${text.slice(0, 300)}`;
    raw.records.push({
      recordType: 'comment',
      groupName: group.groupName,
      groupUrl: group.groupUrl,
      postUrl: item.postUrl,
      anonymousContentId: sha(dedupeKey),
      anonymousAuthorId: sha(`${group.groupUrl}:${item.commentUrl || item.postUrl}:author-redacted:${item.domIndex}`),
      publishedAt: null,
      rawTimeLabel: item.timeLabel,
      text,
      contentLanguage: item.contentLanguage || 'unknown',
      reactionCount: null,
      commentCount: null,
      shareCount: null,
      hasImage: Boolean(item.hasImage),
      hasVideo: Boolean(item.hasVideo),
      hasLink: Boolean(item.hasLink),
      mediaTypes: [item.hasImage ? 'image' : null, item.hasVideo ? 'video' : null, item.hasLink ? 'link' : null].filter(Boolean),
      parentPostId: sha(`post:${item.postUrl}`),
      parentCommentId: null,
      commentDepth: 1,
      crawlTime: new Date().toISOString(),
      dataSource: 'browser_automation_post_detail',
      permissionStatus: 'joined_public_group',
      crawlStatus: 'success',
      failureReason: null,
      dataCompleteness: {
        postUrl: 'complete',
        publishedAt: item.timeLabel ? 'relative_time_only' : 'missing',
        text: 'post_detail_comment_captured',
        comments: 'post_detail_expanded_visible_comments',
        newestFirstSortObserved: 'not_applicable_post_detail',
      },
    });
    added += 1;
  }
  if (added > pageAddedBefore && pagePostUrl) {
    resolvedCommentSections.add(pagePostUrl);
  }
}

for (const group of raw.sourceGroups || []) {
  group.capturedRecordCount = raw.records.filter((record) => record.groupUrl === group.groupUrl).length;
  group.failureCount = (raw.failures || []).filter((failure) => failure.groupUrl === group.groupUrl).length;
}

if (resolvedCommentSections.size) {
  raw.failures = (raw.failures || []).filter((failure) => {
    if (failure.targetType !== 'comment_section') return true;
    if (failure.failureReason !== 'comment_collapsed') return true;
    return !resolvedCommentSections.has(failure.targetUrl);
  });
  for (const group of raw.sourceGroups || []) {
    group.failureCount = (raw.failures || []).filter((failure) => failure.groupUrl === group.groupUrl).length;
  }
}

raw.commentDeepCrawl = {
  enabled: true,
  addedComments: added,
  pagesVisited: deepPages.length,
  resolvedCommentSections: resolvedCommentSections.size,
  remainingFailures: (raw.failures || []).length,
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(outputPath, `${JSON.stringify(raw, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, addedComments: added, totalRecords: raw.records.length }, null, 2));

const fs = require('fs');
const path = require('path');

const rawPath = process.argv[2];
const structuredPath = process.argv[3];
const dataOutDir = process.argv[4] || 'data/corpus';
const siteOutDir = process.argv[5] || 'site/corpus';

if (!rawPath || !structuredPath) {
  console.error('Usage: node scripts/build_corpus_archive.js <weekly-raw-json> <structured-json> [data-corpus-dir] [site-corpus-dir]');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const structured = JSON.parse(fs.readFileSync(structuredPath, 'utf8'));
const reportWeek = structured.reportWeek || raw.reportWeek;
const timeRange = structured.timeRange || raw.timeRange || {};
const generatedAt = new Date().toISOString();

fs.mkdirSync(dataOutDir, { recursive: true });
fs.mkdirSync(siteOutDir, { recursive: true });

function normalizeText(text = '') {
  return String(text)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const identityPatterns = [
  /^管理员$/,
  /^作者$/,
  /^最相关$/,
  /^小组专家$/,
  /^新秀贡献者$/,
  /^杰出贡献者$/,
  /^·\s*关注$/,
  /^关注$/,
  /^匿名互动者\s*\d+$/,
  /^@?[A-Za-z][A-Za-z0-9_.-]{3,}$/,
  /^[A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,3}回复了$/,
  /^[A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,3}\s*\)?$/,
];

function sanitizeText(text = '') {
  return String(text)
    .split(/\n|\|/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !identityPatterns.some((re) => re.test(line)))
    .filter((line) => !/回复了$/.test(line))
    .filter((line) => !/^Làm quen với đội ngũ quản trị viên/i.test(line))
    .filter((line) => !/^越南\s*·/.test(line))
    .map((line) => line.replace(/^匿名互动者\s*\d+/, '[匿名互动者]'))
    .map((line) => line.replace(/\bid\s*\d+\b/gi, 'id[已脱敏]'))
    .map((line) => line.replace(/\b\d{6,}\b/g, '[数字ID已脱敏]'))
    .map((line) => line.replace(/…\s*展开/g, ''))
    .map((line) => line.replace(/\b[A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,3}\b(?=\s+(được|mình|bạn|có|không|ko|k\b|đẹp|thấy|trồng|làm|chỉ|lụm|này))/g, '[用户名已脱敏]'))
    .join('\n')
    .trim();
}

function corpusKey(record) {
  return [
    record.recordType || '',
    record.postUrl || '',
    normalizeText(record.originalText || record.text || ''),
  ].join('::');
}

function countBy(records, key) {
  return records.reduce((acc, record) => {
    const value = typeof key === 'function' ? key(record) : record[key];
    acc[value || 'unknown'] = (acc[value || 'unknown'] || 0) + 1;
    return acc;
  }, {});
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function compact(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return value;
  return value || null;
}

const structuredByContentId = new Map();
const structuredByText = new Map();
for (const item of structured.items || []) {
  if (item.anonymousContentId) structuredByContentId.set(item.anonymousContentId, item);
  structuredByText.set(corpusKey(item), item);
}

const invalidByContentId = new Map();
const invalidByPostUrl = new Map();
for (const item of structured.invalidItems || []) {
  if (item.anonymousContentId) invalidByContentId.set(item.anonymousContentId, item);
  if (item.postUrl) invalidByPostUrl.set(item.postUrl, item);
}

function mergeRecord(rawRecord) {
  const structuredItem = structuredByContentId.get(rawRecord.anonymousContentId) || structuredByText.get(corpusKey(rawRecord));
  const invalidItem = invalidByContentId.get(rawRecord.anonymousContentId) || invalidByPostUrl.get(rawRecord.postUrl);
  const reactionCount = numberOrNull(structuredItem?.reactionCount ?? rawRecord.reactionCount);
  const commentCount = numberOrNull(structuredItem?.commentCount ?? rawRecord.commentCount);
  const shareCount = numberOrNull(structuredItem?.shareCount ?? rawRecord.shareCount);
  const hasReliableInteraction = reactionCount !== null || commentCount !== null || shareCount !== null;
  const originalText = sanitizeText(structuredItem?.originalText || rawRecord.text || '');

  return {
    reportWeek,
    timeRange,
    recordType: rawRecord.recordType,
    sourceGroup: structuredItem?.sourceGroup || rawRecord.groupName || invalidItem?.sourceGroup || null,
    groupUrl: structuredItem?.groupUrl || rawRecord.groupUrl || null,
    postUrl: structuredItem?.postUrl || rawRecord.postUrl || invalidItem?.postUrl || null,
    postAccessNote: structuredItem?.postAccessNote || 'requires_facebook_or_group_permission',
    anonymousContentId: rawRecord.anonymousContentId || structuredItem?.anonymousContentId || invalidItem?.anonymousContentId || null,
    anonymousAuthorId: rawRecord.anonymousAuthorId || structuredItem?.anonymousAuthorId || null,
    publishedAt: structuredItem?.publishedAt ?? rawRecord.publishedAt ?? null,
    rawTimeLabel: structuredItem?.rawTimeLabel || rawRecord.rawTimeLabel || null,
    originalText,
    translationZh: structuredItem?.translationZh || null,
    language: structuredItem?.language || rawRecord.contentLanguage || null,
    parentPostId: rawRecord.parentPostId || null,
    parentCommentId: rawRecord.parentCommentId || null,
    commentDepth: rawRecord.commentDepth ?? structuredItem?.commentDepth ?? null,
    cleaningDecision: structuredItem?.cleaningDecision || invalidItem?.cleaningDecision || 'raw_captured_unclassified',
    excludedReason: invalidItem?.reason || null,
    topics: compact(structuredItem?.topics) || [],
    primaryTopic: structuredItem?.primaryTopic || null,
    sentiment: structuredItem?.sentiment || null,
    riskLabels: compact(structuredItem?.riskLabels) || [],
    riskEvidenceSummary: structuredItem?.riskEvidenceSummary || null,
    confidence: structuredItem?.confidence ?? null,
    lowConfidenceReason: structuredItem?.lowConfidenceReason || null,
    reactionCount,
    commentCount,
    shareCount,
    interactionTotal: hasReliableInteraction ? (reactionCount || 0) + (commentCount || 0) + (shareCount || 0) : null,
    crawlTime: rawRecord.crawlTime || null,
    dataSource: rawRecord.dataSource || structured.dataSource || 'browser_automation',
    permissionStatus: rawRecord.permissionStatus || null,
    crawlStatus: rawRecord.crawlStatus || null,
    failureReason: rawRecord.failureReason || null,
    dataCompleteness: rawRecord.dataCompleteness || structuredItem?.dataCompleteness || null,
  };
}

const records = (raw.records || [])
  .map(mergeRecord)
  .filter((record) => record.postUrl && record.originalText);

const summary = {
  schemaVersion: 'corpus.archive.v1',
  reportWeek,
  generatedAt,
  sourceRawPath: rawPath,
  sourceStructuredPath: structuredPath,
  timeRange,
  visibility: {
    dataCorpus: 'internal_archive',
    siteCorpus: 'hidden_search_index_on_public_static_site',
    note: 'Not shown as a dashboard module; searchable only after user enters a query. Public static files are still technically accessible by URL.',
  },
  counts: {
    totalRecords: records.length,
    byRecordType: countBy(records, 'recordType'),
    byGroup: countBy(records, 'sourceGroup'),
    excludedOrUnclassified: records.filter((record) => record.cleaningDecision !== 'valid_relevant' && record.cleaningDecision !== 'risk_relevant').length,
  },
  completeness: {
    source: 'final_merged_visible_crawl',
    note: 'Corpus contains all captured visible post/comment text with post URLs from the merged crawl source. Facebook permission or comment expansion gaps remain marked in dataCompleteness.',
  },
};

const jsonlPath = path.join(dataOutDir, `corpus_${reportWeek}.jsonl`);
const summaryPath = path.join(dataOutDir, `corpus_${reportWeek}.json`);
const sitePath = path.join(siteOutDir, `corpus_${reportWeek}.json`);

fs.writeFileSync(jsonlPath, records.map((record) => JSON.stringify(record)).join('\n') + '\n');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
fs.writeFileSync(sitePath, JSON.stringify({
  schemaVersion: 'corpus.search.v1',
  reportWeek,
  generatedAt,
  timeRange,
  counts: summary.counts,
  completeness: summary.completeness,
  records,
}, null, 2));

const manifestPath = path.join(siteOutDir, 'manifest.json');
const existingManifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  : { schemaVersion: 'corpus.manifest.v1', reports: [] };
const nextEntry = {
  reportWeek,
  label: reportWeek,
  file: `corpus_${reportWeek}.json`,
  recordCount: records.length,
  postCount: summary.counts.byRecordType.post || 0,
  commentCount: summary.counts.byRecordType.comment || 0,
  timeRange,
};
const manifestReports = [
  ...existingManifest.reports.filter((entry) => entry.reportWeek !== reportWeek),
  nextEntry,
].sort((a, b) => a.reportWeek.localeCompare(b.reportWeek));
fs.writeFileSync(manifestPath, JSON.stringify({
  schemaVersion: 'corpus.manifest.v1',
  generatedAt,
  visibility: 'hidden_search_index_on_public_static_site',
  reports: manifestReports,
}, null, 2));

console.log(JSON.stringify({
  reportWeek,
  jsonlPath,
  summaryPath,
  sitePath,
  manifestPath,
  records: records.length,
}, null, 2));

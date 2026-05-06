const fs = require('fs');

const rawPath = process.argv[2];
const structuredPath = process.argv[3];
const reportPath = process.argv[4];
const jsonOut = process.argv[5];
const mdOut = process.argv[6];

if (!rawPath || !structuredPath || !reportPath || !jsonOut || !mdOut) {
  console.error('Usage: node scripts/check_data_quality.js <raw-json> <structured-json> <report-json> <quality-json> <quality-md>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const structured = JSON.parse(fs.readFileSync(structuredPath, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

const thresholds = {
  minValidItems: Number(process.env.MIN_VALID_ITEMS || 50),
  minCommentItems: Number(process.env.MIN_COMMENT_ITEMS || 20),
  minCommentRate: Number(process.env.MIN_COMMENT_RATE || 0.2),
  minRecordsPerActiveGroup: Number(process.env.MIN_RECORDS_PER_GROUP || 5),
  expectedGroups: Number(process.env.EXPECTED_GROUPS || 6),
};

const validItems = structured.items || [];
const commentItems = validItems.filter((item) => item.recordType === 'comment');
const groupStatuses = raw.sourceGroups || [];
const groupsBelowThreshold = groupStatuses.filter((group) => group.capturedRecordCount < thresholds.minRecordsPerActiveGroup);
const activeGroups = groupStatuses.filter((group) => group.capturedRecordCount > 0).length;
const failureCount = (raw.failures || []).length;
const issueList = [];

function addIssue(severity, code, title, detail, recommendedAction) {
  issueList.push({ severity, code, title, detail, recommendedAction });
}

if (validItems.length < thresholds.minValidItems) {
  addIssue(
    'high',
    'LOW_VALID_CONTENT',
    '有效内容量低于阈值',
    `本轮有效内容 ${validItems.length} 条，低于阈值 ${thresholds.minValidItems} 条。`,
    '先不要把本轮报告当作完整周结论；和用户确认是否按单 Group 重跑、加深滚动或接受可见样本。'
  );
}

if (commentItems.length < thresholds.minCommentItems) {
  addIssue(
    'high',
    'LOW_COMMENT_SAMPLE',
    '评论样本量不足',
    `本轮评论样本 ${commentItems.length} 条，低于阈值 ${thresholds.minCommentItems} 条。`,
    '优先执行帖子详情页评论加深抓取；如仍不足，向用户说明评论覆盖缺口后再决定是否出报告。'
  );
}

const commentRate = validItems.length ? commentItems.length / validItems.length : 0;
if (commentRate < thresholds.minCommentRate) {
  addIssue(
    'medium',
    'LOW_COMMENT_RATE',
    '评论占比偏低',
    `评论占比 ${(commentRate * 100).toFixed(1)}%，低于阈值 ${(thresholds.minCommentRate * 100).toFixed(1)}%。`,
    '检查评论展开按钮是否失效、是否需要进入 post permalink 抓完整线程。'
  );
}

if (activeGroups < thresholds.expectedGroups) {
  addIssue(
    'high',
    'INACTIVE_GROUPS',
    '活跃 Group 数不足',
    `本轮有内容 Group ${activeGroups}/${thresholds.expectedGroups}。`,
    '逐个打开无内容 Group 验证权限、排序、是否真的无新增内容。'
  );
}

if (groupsBelowThreshold.length) {
  addIssue(
    'medium',
    'LOW_GROUP_VOLUME',
    '部分 Group 内容量异常低',
    groupsBelowThreshold.map((group) => `${group.groupName}: ${group.capturedRecordCount}`).join('；'),
    '先向用户反馈低量 Group 清单；必要时按这些 Group 单独重跑。'
  );
}

if (failureCount > 0) {
  addIssue(
    'medium',
    'CRAWL_GAPS',
    '存在抓取缺口日志',
    `本轮失败/缺口记录 ${failureCount} 条。`,
    '查看 failure JSONL，确认是否评论折叠、权限变化、选择器变化或网络中断。'
  );
}

const needsUserReview = issueList.some((issue) => issue.severity === 'high' || issue.severity === 'medium');
const quality = {
  schemaVersion: 'data_quality.v1',
  reportWeek: report.reportWeek,
  generatedAt: new Date().toISOString(),
  status: needsUserReview ? 'needs_user_review' : 'pass',
  thresholds,
  summary: {
    validItems: validItems.length,
    postItems: validItems.filter((item) => item.recordType === 'post').length,
    commentItems: commentItems.length,
    commentRate: Number(commentRate.toFixed(3)),
    activeGroups,
    expectedGroups: thresholds.expectedGroups,
    failureCount,
  },
  groups: groupStatuses.map((group) => ({
    groupName: group.groupName,
    groupUrl: group.groupUrl,
    capturedRecordCount: group.capturedRecordCount,
    failureCount: group.failureCount,
    status: group.capturedRecordCount < thresholds.minRecordsPerActiveGroup ? 'low_volume' : 'ok',
  })),
  issues: issueList,
  userReviewRule: 'If status is needs_user_review, pause before treating the run as final and discuss remediation options with the user.',
};

fs.writeFileSync(jsonOut, `${JSON.stringify(quality, null, 2)}\n`);

const md = `# Data Quality Review - ${quality.reportWeek}

Status: ${quality.status}

## Summary

- Valid items: ${quality.summary.validItems}
- Posts: ${quality.summary.postItems}
- Comments: ${quality.summary.commentItems}
- Comment rate: ${(quality.summary.commentRate * 100).toFixed(1)}%
- Active Groups: ${quality.summary.activeGroups}/${quality.summary.expectedGroups}
- Failure/gap records: ${quality.summary.failureCount}

## Issues

${quality.issues.length ? quality.issues.map((issue) => `### [${issue.severity}] ${issue.title}

- Code: ${issue.code}
- Detail: ${issue.detail}
- Recommended action: ${issue.recommendedAction}
`).join('\n') : 'No blocking data quality issues.'}

## Group Volumes

| Group | Records | Failures | Status |
|---|---:|---:|---|
${quality.groups.map((group) => `| ${group.groupName} | ${group.capturedRecordCount} | ${group.failureCount} | ${group.status} |`).join('\n')}

## Rule

${quality.userReviewRule}
`;

fs.writeFileSync(mdOut, md);
console.log(JSON.stringify({
  jsonOut,
  mdOut,
  status: quality.status,
  issues: quality.issues.map((issue) => issue.code),
}, null, 2));

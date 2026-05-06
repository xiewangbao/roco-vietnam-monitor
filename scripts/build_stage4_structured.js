const fs = require('fs');
const crypto = require('crypto');

const inputPath = process.argv[2] || 'data/raw/weekly_raw_2026-W18_stage3b_real.json';
const outputPath = process.argv[3] || 'data/structured/structured_weekly_2026-W18_real.json';

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const generatedAt = new Date().toISOString();
const maxRelativeDays = Number(process.env.MAX_RELATIVE_DAYS || 5);
const rangeStart = process.env.RANGE_START || raw.timeRange?.start || '2026-04-24T00:00:00+08:00';
const startDateMatch = rangeStart.match(/2026-(\d{2})-(\d{2})/);
const startMonth = startDateMatch ? Number(startDateMatch[1]) : 4;
const startDay = startDateMatch ? Number(startDateMatch[2]) : 24;

const identityPatterns = [
  /^Yuexuan Peng$/i,
  /^管理员$/,
  /^小组专家$/,
  /^新秀贡献者$/,
  /^杰出贡献者$/,
  /^·\s*关注$/,
  /^关注$/,
  /^Yuexuan Peng · 原声$/,
];

function hash(value) {
  return crypto.createHash('sha256').update(`stage4:${value}`).digest('hex');
}

function normalizeText(text) {
  return (text || '')
    .split(/\n|\|/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !identityPatterns.some((re) => re.test(line)))
    .map((line) => line.replace(/\bid\s*\d+\b/gi, 'id[已脱敏]'))
    .map((line) => line.replace(/\b\d{6,}\b/g, '[数字ID已脱敏]'))
    .map((line) => line.replace(/…\s*展开/g, ''))
    .join('\n')
    .trim();
}

function inRange(rawTimeLabel, text) {
  if (/3年|2022年|2023年|2024年|2025年/.test(text)) return 'out_of_range';
  if (!rawTimeLabel) return text.trim().length > 15 ? 'unknown_keep_low_confidence' : 'unknown_drop';
  if (/^\d+\s*分钟$/.test(rawTimeLabel)) return 'in_range';
  if (/^\d+\s*小时$/.test(rawTimeLabel)) return 'in_range';
  const day = rawTimeLabel.match(/^(\d+)\s*天$/);
  if (day) return Number(day[1]) <= maxRelativeDays ? 'in_range' : 'out_of_range';
  const md = rawTimeLabel.match(/^(\d{1,2})月(\d{1,2})日/);
  if (md) {
    const month = Number(md[1]);
    const date = Number(md[2]);
    if (month > startMonth) return 'in_range';
    if (month === startMonth && date >= startDay) return 'in_range';
    return 'out_of_range';
  }
  if (/3月|2022年|3年|4月1日|4月15日|4月21日/.test(rawTimeLabel)) return 'out_of_range';
  return 'unknown_keep_low_confidence';
}

function language(text) {
  if (/[\u4e00-\u9fff]/.test(text) && /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text)) return 'mixed';
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
  if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text)) return 'vi';
  if (/[a-z]/i.test(text)) return 'en';
  return 'unknown';
}

function topics(text) {
  const t = text.toLowerCase();
  const out = [];
  if (/bắt ké|xin id|vô map|nhà ng|map ng|nắm tay|hạt|pass|battle pass|公会|share vàng|discord|fam vàng/.test(t)) out.push('社群互动、组队、公会');
  if (/pet|roco|thú cưng|tiến hoá|tiến hóa|dị màu|trứng|ấp trứng|skill|build|dimo|kỳ lân|tính cách|vương miện|cầu vua|cầu màu|hệ|boss|拉姆|翼王|cánh thánh|sổ pet/.test(t)) out.push('宠物、角色、养成');
  if (/nhiệm vụ|nvu|nv |mở cổng|gương|đánh|làm sao|cách|hướng dẫn|攻略|打败|leo top/.test(t)) out.push('玩法机制');
  if (/gift|event|sự kiện|mùa giải|s1|s2|quà|cuối tuần/.test(t)) out.push('活动与福利');
  if (/top up|monthly|gem|nạp|bán|mua|vé|battle pass|gift battle pass|pass/.test(t)) out.push('充值、付费、礼包');
  if (/máy|redmi|pc|máy tính|cấp quyền|app thay đổi thiết bị|đăng nhập|quên tên/.test(t)) out.push('Bug、闪退、卡顿、登录问题');
  if (/test|chính thức|bản chính thức|ra mắt|26\/03\/2026/.test(t)) out.push('发行时间猜测');
  if (/dịch|tiếng anh|không biết là con nào|本地化|翻译/.test(t)) out.push('越南本地化期待');
  if (/vay vốn|ngân hàng|hỗ trợ vay|ib|bán vé|acc|tài khoản|top up shop/.test(t)) out.push('诈骗、外挂、私服、黑产风险');
  if (/newbie|mới chơi|group nào giúp/.test(t)) out.push('攻略分享');
  if (!out.length) out.push('越南玩家自发讨论');
  return [...new Set(out)];
}

function riskLabels(text) {
  const t = text.toLowerCase();
  const risks = [];
  if (/vay vốn|ngân hàng|hỗ trợ vay/.test(t)) risks.push('诈骗链接');
  if (/bán vé|mua ib|nhiu b|bán kiểu gì/.test(t)) risks.push('账号买卖');
  if (/acc|tài khoản/.test(t)) risks.push('账号买卖');
  if (/top up shop|monthly gem pass|nạp/.test(t)) risks.push('充值骗局');
  if (/chính thức rồi|bản chính thức|official/.test(t)) risks.push('玩家误以为越南区已正式发行');
  if (/content temporarily|内容暂时无法显示/.test(t)) risks.push('其他');
  return [...new Set(risks)];
}

function sentiment(text, risks) {
  const t = text.toLowerCase();
  if (risks.length && risks.some((r) => ['诈骗链接', '账号买卖', '充值骗局'].includes(r))) return '高风险负面';
  if (/không biết|kẹt|quên|cứu|ko giải|không thể|bị|toxic|ích kỷ|k cấp quyền|sai|huhu/.test(t)) return '负面';
  if (/thank god|cuối cùng|đủ|ổn|hay|vui|hỗ trợ|hướng dẫn|chia sẻ/.test(t)) return '正面';
  if (/nhưng|mà|chưa|không phải lúc nào/.test(t)) return '混合';
  return '中性';
}

function translate(text, topicList, risks) {
  const t = text.toLowerCase();
  if (/đổi lại tính cách/.test(t)) return '玩家询问宠物性格是否可以重置、如何重置，以及重置后是随机还是可选择。';
  if (/vương miện/.test(t)) return '玩家询问这些王冠道具如何获得。';
  if (/tiến hoá|tiến hóa/.test(t)) return '玩家询问某个宠物如何进化；评论提到升到 40 级并提升到 2 阶可进化到最终形态。';
  if (/hạt.*pass|battle pass/.test(t)) return '玩家想借他人的 Battle Pass 相关宠物/道具来完成任务或图鉴。';
  if (/redmi|máy/.test(t)) return '玩家询问 Redmi Note 11 或电脑设备能否顺畅运行游戏。';
  if (/bắt ké|vô map|nhà ng|nắm tay/.test(t)) return '玩家询问如何进入好友地图或借好友宠物进行捕捉/完成任务。';
  if (/cấp quyền.*app|máy tính/.test(t)) return '玩家询问电脑端每次进入游戏是否都需要授权应用更改设备。';
  if (/nhiệm vụ|nvu|nv /.test(t)) return '玩家询问任务如何完成，包含要投放/使用哪类精灵或如何解锁机关。';
  if (/test|chính thức/.test(t)) return '玩家询问当前版本是测试版还是正式版；评论中有人误称已经正式。';
  if (/dị màu|trứng|ấp trứng/.test(t)) return '内容讨论异色宠物孵蛋条件、性别和蛋组等养成机制。';
  if (/event|sự kiện|mùa giải|s1|s2/.test(t)) return '内容讨论活动、赛季时间、奖励或宠物出现信息。';
  if (/top up|monthly|gem|nạp/.test(t)) return '玩家寻找充值或月卡购买渠道，存在支付/充值风险观察价值。';
  if (/vay vốn|ngân hàng/.test(t)) return '疑似贷款广告或引流内容，与游戏无关，属于诈骗/垃圾信息风险。';
  if (/bán vé|mua ib/.test(t)) return '玩家发布售卖/私聊交易信息，可能涉及账号或道具交易风险。';
  if (/quên tên/.test(t)) return '玩家表示忘记游戏名/账号名，询问是否有办法找回。';
  if (/如何|攻略|打败/.test(text)) return text;
  return `机器初译摘要：该内容主要涉及「${topicList[0]}」${risks.length ? `，并触发风险标签「${risks.join('、')}」` : ''}。原文需在重点引用前人工复核。`;
}

function marketValue(topicList, risks, text) {
  if (risks.length) return 'high';
  if (topicList.some((t) => ['充值、付费、礼包', '越南本地化期待', '发行时间猜测', 'Bug、闪退、卡顿、登录问题'].includes(t))) return 'high';
  if (text.length > 20) return 'medium';
  return 'low';
}

const items = [];
const lowConfidenceItems = [];
const invalidItems = [];
const seen = new Set();

for (const record of raw.records) {
  const cleaned = normalizeText(record.text);
  const rangeStatus = inRange(record.rawTimeLabel, cleaned);
  const itemLang = language(cleaned);
  const itemTopics = topics(cleaned);
  const risks = riskLabels(cleaned);
  const itemSentiment = sentiment(cleaned, risks);
  const dedupeKey = `${record.recordType}:${record.postUrl}:${cleaned}`;

  let cleaningDecision = 'valid_relevant';
  const lowReasons = [];
  if (!cleaned || cleaned.length < 3 || /^\+\d+$/.test(cleaned)) cleaningDecision = 'invalid_empty';
  if (rangeStatus === 'out_of_range') cleaningDecision = 'invalid_out_of_range';
  if (rangeStatus.startsWith('unknown')) lowReasons.push('时间标签缺失或无法确认是否在统计周期内');
  if (record.dataCompleteness?.comments?.includes('partial')) lowReasons.push('评论线程未完全展开');
  if (/内容暂时无法显示/.test(cleaned)) lowReasons.push('原帖或媒体内容部分不可见');
  if (/机器初译摘要/.test(translate(cleaned, itemTopics, risks))) lowReasons.push('自动翻译置信度较低，重点引用前需人工复核');
  if (seen.has(dedupeKey)) cleaningDecision = 'invalid_duplicate';
  seen.add(dedupeKey);
  if (risks.length && cleaningDecision === 'valid_relevant') cleaningDecision = 'risk_relevant';

  if (cleaningDecision.startsWith('invalid')) {
    invalidItems.push({
      anonymousContentId: record.anonymousContentId,
      sourceGroup: record.groupName,
      postUrl: record.postUrl,
      cleaningDecision,
      reason: cleaningDecision === 'invalid_out_of_range' ? '内容时间不在 2026-04-24 起的本次统计窗口内' : '空文本、纯媒体或重复内容',
    });
    continue;
  }

  const confidence = Math.max(0.45, Math.min(0.95, 0.9 - lowReasons.length * 0.12 - (record.publishedAt ? 0 : 0.05)));
  const item = {
    recordType: record.recordType,
    anonymousContentId: record.anonymousContentId,
    anonymousAuthorId: record.anonymousAuthorId,
    sourceGroup: record.groupName,
    groupUrl: record.groupUrl,
    postUrl: record.postUrl,
    postAccessNote: 'requires_facebook_or_group_permission',
    publishedAt: record.publishedAt,
    rawTimeLabel: record.rawTimeLabel,
    originalText: cleaned,
    translationZh: translate(cleaned, itemTopics, risks),
    language: itemLang,
    cleaningDecision,
    primaryTopic: itemTopics[0],
    topics: itemTopics,
    sentiment: itemSentiment,
    riskLabels: risks,
    riskEvidenceSummary: risks.length ? cleaned.slice(0, 180) : null,
    confidence: Number(confidence.toFixed(2)),
    lowConfidenceReason: lowReasons.length ? lowReasons.join('；') : null,
    marketObservationValue: marketValue(itemTopics, risks, cleaned),
    futureLaunchSignal: itemTopics.some((t) => ['越南本地化期待', '发行时间猜测', '充值、付费、礼包', 'Bug、闪退、卡顿、登录问题', '社群互动、组队、公会'].includes(t)),
    dataCompleteness: record.dataCompleteness,
  };
  items.push(item);
  if (lowReasons.length || confidence < 0.7) {
    lowConfidenceItems.push({
      anonymousContentId: item.anonymousContentId,
      sourceGroup: item.sourceGroup,
      postUrl: item.postUrl,
      reason: item.lowConfidenceReason || '低置信度',
      suggestedHandling: '进入报告引用前建议打开原帖人工复核。',
    });
  }
}

function countBy(arr, getKey) {
  const result = {};
  for (const item of arr) {
    const key = getKey(item);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

const topicCounts = {};
for (const item of items) {
  for (const topic of item.topics) topicCounts[topic] = (topicCounts[topic] || 0) + 1;
}

const topicSummary = Object.entries(topicCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([topic, itemCount]) => ({
    topic,
    itemCount,
    sentimentMix: countBy(items.filter((item) => item.topics.includes(topic)), (item) => item.sentiment),
  }));

const riskCounts = {};
for (const item of items) {
  for (const risk of item.riskLabels) riskCounts[risk] = (riskCounts[risk] || 0) + 1;
}

const riskSummary = Object.entries(riskCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([riskLabel, itemCount]) => {
    const first = items.find((item) => item.riskLabels.includes(riskLabel));
    return {
      riskLabel,
      itemCount,
      representativePostUrl: first?.postUrl || null,
      evidenceSummary: first?.riskEvidenceSummary || '',
    };
  });

const structured = {
  schemaVersion: 'stage4.structured_weekly.v1',
  exampleOnly: false,
  sourceSchemaVersion: raw.schemaVersion,
  reportWeek: raw.reportWeek,
  timeRange: raw.timeRange,
  generatedAt,
  dataSource: raw.dataSource,
  processingStatus: 'real_structured_in_progress_week',
  sourceStatus: {
    confirmedGroups: raw.sourceGroups.length,
    activeGroups: raw.sourceGroups.filter((g) => g.capturedRecordCount > 0).length,
    dataCompleteness: 'partial_in_progress_week_visible_feed_crawl',
    limitations: [
      `本次抓取从 ${rangeStart} 起算，结束于 ${raw.timeRange?.end || generatedAt}；如为周中执行，仍属于进行中周。`,
      '评论为可见评论和部分展开结果，完整评论线程仍有缺口。',
      '部分时间为 Facebook 相对时间标签，尚未全部转成绝对时间。',
      '部分内容为媒体或跨发帖，结构化时已列入低置信度或去重/剔除清单。',
    ],
  },
  cleaningRules: {
    identityFieldsRemoved: true,
    removedOutOfRange: true,
    redactedNumericIds: true,
    keptRiskContent: true,
  },
  items,
  invalidItems,
  topicSummary,
  sentimentSummary: countBy(items, (item) => item.sentiment),
  riskSummary,
  lowConfidenceItems,
  readyForWeeklyReport: true,
  readyForWeeklyReportReason: '真实 raw 数据已完成清洗、主题、情绪和风险结构化；报告需注明进行中周和评论缺口。',
};

fs.writeFileSync(outputPath, `${JSON.stringify(structured, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  validItems: items.length,
  invalidItems: invalidItems.length,
  lowConfidenceItems: lowConfidenceItems.length,
  topicSummary: topicSummary.slice(0, 8),
  sentimentSummary: structured.sentimentSummary,
  riskSummary,
}, null, 2));

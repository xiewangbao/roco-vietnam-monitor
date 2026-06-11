const fs = require('fs');

const inputPath = process.argv[2] || 'data/structured/structured_weekly_2026-W18_real.json';
const jsonOut = process.argv[3] || 'data/reports/weekly_report_2026-W18_real.json';
const mdOut = process.argv[4] || 'data/reports/weekly_report_2026-W18_real.md';

const structured = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const qualityPath = process.env.QUALITY_PATH || `data/quality/data_quality_${structured.reportWeek}.json`;
const quality = fs.existsSync(qualityPath) ? JSON.parse(fs.readFileSync(qualityPath, 'utf8')) : null;

function blockReport(reason, details = []) {
  console.error(JSON.stringify({
    status: 'blocked',
    stage: 'stage5',
    reportWeek: structured.reportWeek,
    reason,
    details,
  }, null, 2));
  process.exit(1);
}

if (structured.exampleOnly) {
  blockReport('Input is marked exampleOnly; refusing to generate a real weekly report.');
}

if (structured.readyForWeeklyReport === false) {
  blockReport('Stage4 quality gate blocked weekly report generation.', structured.qualityGate?.blockingReasons || [structured.readyForWeeklyReportReason].filter(Boolean));
}

if (quality && quality.status !== 'pass') {
  blockReport('Data quality status is not pass; refusing to generate a real weekly report.', (quality.issues || []).map((issue) => `${issue.code}: ${issue.detail}`));
}

const items = structured.items;
const posts = items.filter((item) => item.recordType === 'post');
const comments = items.filter((item) => item.recordType === 'comment');
const risks = structured.riskSummary || [];
const topics = structured.topicSummary || [];
const sentiment = structured.sentimentSummary || {};
const valid = items.length || 1;

function pct(value) {
  return Number(((value / valid) * 100).toFixed(1));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function countBy(arr, getKey) {
  return arr.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function groupStats() {
  return structured.sourceStatus.confirmedGroups
    ? [
        'Roco Kingdom Viet Nam',
        'Cong Hoi Roco Kingdom Viet Nam',
        'Roco Kingdom: World Viet Nam Official',
        'ROCO KINGDOM VN',
        'ROCO KINGDOM VIET NAM',
        'Roco Kingdom Mobile Viet Nam',
      ].map((name) => {
        const groupItems = items.filter((item) => item.sourceGroup === name);
        const first = groupItems[0];
        return {
          groupName: name,
          groupUrl: first?.groupUrl || '',
          accessStatus: '已加入 / 公开小组',
          weeklyContentVolume: groupItems.length,
          dataCompleteness: groupItems.length ? '可见帖子与可展开评论已抓取；受 Facebook 可见性限制，非保证全量评论' : '本轮未抓到有效内容',
          includedInFormalMonitoring: true,
          notes: name.includes('Official') ? '名称含 Official，但不默认认定为官方渠道。' : '正式监测源。',
        };
      })
    : [];
}

const positive = sentiment['正面'] || 0;
const neutral = sentiment['中性'] || 0;
const negative = (sentiment['负面'] || 0) + (sentiment['高风险负面'] || 0);
const highRisk = sentiment['高风险负面'] || 0;
const highRelevance = items.filter((item) => item.marketObservationValue === 'high' || item.futureLaunchSignal).length;
const healthScore = Math.round(clamp(60 + pct(positive) * 0.25 - pct(negative) * 0.25 - highRisk * 4, 0, 100));
const launchSignalScore = Math.round(clamp(45 + Math.min(valid, 120) * 0.18 + pct(highRelevance) * 0.25 + Math.min((topics[0]?.itemCount || 0), 50) * 0.2, 0, 100));
const completenessNote = `本报告基于 ${structured.timeRange?.start || '未知开始时间'} 至 ${structured.timeRange?.end || '未知结束时间'} 的可见内容。评论覆盖 feed 可见评论和 post-detail 补抓到的可见评论，未展开或不可见线程不纳入结论。`;

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function displayTopicName(topicName) {
  if (topicName === '越南玩家自发讨论') return '版本更新、找队友、外观确认与短互动';
  return topicName;
}

function topicDiscussionSummary(topicName, topicItems, topicMeta) {
  const text = topicItems.map((item) => `${item.originalText}\n${item.translationZh}`).join('\n').toLowerCase();
  const postCount = topicItems.filter((item) => item.recordType === 'post').length;
  const commentCount = topicItems.filter((item) => item.recordType === 'comment').length;
  const dominantSentiment = Object.entries(topicMeta.sentimentMix || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || '中性';
  const subthemes = [];

  const add = (label, patterns) => {
    if (includesAny(text, patterns)) subthemes.push(label);
  };

  if (topicName === '越南玩家自发讨论') {
    add('版本更新/补丁信息搬运', [/cập nhật|bản vá|update|phiên bản|补丁|更新/]);
    add('找队友、求 slot、一起玩', [/tìm bạn|slot|chơi cùng|xin 1 slot|vào với|一起玩|找人/]);
    add('shiny / 异色外观确认', [/shiny|异色|đen bạc|黑银|lấp lánh|闪光|con xanh/]);
    add('抓宠、出货、晒收获和运气分享', [/抓|捕捉|出货|运气|trộm vía|thank god|vận may|đẹp|好看|đc 2con|đủ/]);
    add('短评论、围观和跟帖确认', [/真的假的|太上头|hóng|ké|ok|ổn|mạnh|giúp với|đẹp trai/]);
    return `这不是一个“单点问题”话题，而是社区日常活跃池：${subthemes.slice(0, 4).join('、') || '版本搬运、找人一起玩、外观确认和短评论互动'}。共 ${topicItems.length} 条，包含 ${postCount} 帖 / ${commentCount} 评论，情绪以「${dominantSentiment}」为主。可用价值在于判断玩家是否还在主动搬运信息、约人协作、验证外观/进度和维持日常讨论；不适合作为单个产品问题处理，但适合观察社区留存温度和自传播素材类型。`;
  }

  if (topicName === '宠物、角色、养成') {
    add('宠物进化与阶段成长', [/进化|tiến hoá|tiến hóa|lv40|2 阶|最终形态/]);
    add('shiny / 异色与外观配色', [/shiny|异色|dị màu|màu|đen bạc|闪光|lấp lánh/]);
    add('技能、队伍、PVP 与强度搭配', [/skill|技能|team|队伍|pvp|build|boss|dps|sup|buff/]);
    add('宠物获取、借宠和图鉴补齐', [/xin|cho ké|借|抓|捕捉|地图|pet|thú cưng/]);
    return `玩家主要讨论：${subthemes.slice(0, 4).join('、') || '宠物获取、强度和养成路径'}。共 ${topicItems.length} 条，包含 ${postCount} 帖 / ${commentCount} 评论，说明越南玩家已经开始围绕宠物收藏、外观、强度和队伍搭配形成较细的经验交流。`;
  }

  if (topicName === '玩法机制') {
    add('任务如何完成', [/任务|nhiệm vụ|nhiện vụ|nv |làm sao|怎么做/]);
    add('机关、镜子、星星和地图解谜', [/gương|镜子|ngôi sao|星星|mở cổng|开门|cổng/]);
    add('NPC / Boss 打法攻略', [/npc|boss|đánh|tiêu diệt|击败/]);
    add('按钮、顺序和操作路径说明', [/button|nút|12341|顺序|hướng dẫn|指引/]);
    return `玩家主要在问：${subthemes.slice(0, 4).join('、') || '任务、机关和战斗机制怎么理解'}。共 ${topicItems.length} 条，包含 ${postCount} 帖 / ${commentCount} 评论，反映任务说明和机制学习成本较高，可作为未来越南本地化说明、FAQ 和新手引导的观察素材。`;
  }

  if (topicName === '社群互动、组队、公会') {
    add('借宠和蹭图鉴/任务', [/cho ké|ké|借|xin|pet|bắt ké/]);
    add('加好友、进地图和申请进入', [/好友|add|kb|map|地图|xin họ|icon/]);
    add('组队互助和带 Boss', [/boss|kéo|team|组队|solo/]);
    return `玩家主要围绕：${subthemes.slice(0, 3).join('、') || '借宠、好友地图和组队互助'}展开。共 ${topicItems.length} 条，包含 ${postCount} 帖 / ${commentCount} 评论，说明 Group 已经承担互助入口作用，社区自传播和玩家协作正在自然形成。`;
  }

  if (topicName === '充值、付费、礼包') {
    add('Battle Pass / 战令相关宠物或权益', [/battle pass|pass|战令/]);
    add('充值、月卡和 gem pass', [/nạp|top up|monthly|gem|充值|月卡/]);
    add('私下交易或付费借取', [/trả phí|bán|mua|多少钱|账号|acc/]);
    return `玩家主要讨论：${subthemes.slice(0, 3).join('、') || '付费入口、礼包和付费互助'}。共 ${topicItems.length} 条，包含 ${postCount} 帖 / ${commentCount} 评论；它既代表潜在付费兴趣，也需要继续观察第三方充值、私下交易和误导渠道风险。`;
  }

  if (topicName === 'Bug、闪退、卡顿、登录问题') {
    add('登录和权限设置', [/登录|đăng nhập|vpn|权限|cấp quyền/]);
    add('设备、PC 或手机兼容', [/pc|máy|redmi|电脑|手机/]);
    add('任务/玩法被误归因为异常', [/không chọn|不能选择|卡|kẹt/]);
    return `玩家主要讨论：${subthemes.slice(0, 3).join('、') || '登录、设备和操作异常'}。共 ${topicItems.length} 条，包含 ${postCount} 帖 / ${commentCount} 评论；这些内容更像早期使用门槛和技术预期信号，不等同于正式越南区线上问题。`;
  }

  if (topicName === '攻略分享') {
    add('新手强度与培养优先级', [/新手|mới chơi|mạnh|强|ưu tiên/]);
    add('宠物获取和 shiny 难度', [/shiny|khó kiếm|难刷|获取/]);
    add('通关、Boss 和机制攻略', [/攻略|boss|npc|hướng dẫn|cách/]);
    return `玩家主要在分享或索取：${subthemes.slice(0, 3).join('、') || '新手攻略、宠物强度和通关方法'}。共 ${topicItems.length} 条，包含 ${postCount} 帖 / ${commentCount} 评论，适合用于判断越南玩家内容学习曲线和发行前内容教育重点。`;
  }

  if (topicName === '诈骗、外挂、私服、黑产风险') {
    add('账号买卖或代练交易', [/acc|账号|bán|mua|cày|pass/]);
    add('充值或付费引流', [/top up|nạp|gem|充值|月卡/]);
    add('不可见/异常外链内容', [/内容暂时无法显示|tiktok|link|ib/]);
    return `该话题主要包含${subthemes.slice(0, 3).join('、') || '交易、引流或异常内容'}。共 ${topicItems.length} 条，包含 ${postCount} 帖 / ${commentCount} 评论，应作为社区风险样本持续观察，不宜与正常玩家需求混在一起解读。`;
  }

  return `该话题共 ${topicItems.length} 条，包含 ${postCount} 帖 / ${commentCount} 评论，情绪以「${dominantSentiment}」为主；主要用于观察越南玩家在该主题下的讨论密度、需求类型和潜在发行前信号。`;
}

const topTopics = topics.slice(0, 8).map((topic, index) => {
  const representative = items.find((item) => item.topics.includes(topic.topic));
  const topicItems = items.filter((item) => item.topics.includes(topic.topic));
  return {
    rank: index + 1,
    title: displayTopicName(topic.topic),
    sourceTopic: topic.topic,
    volume: topic.itemCount,
    sentiment: Object.entries(topic.sentimentMix || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || '中性',
    heatScore: Math.min(100, Math.round(topic.itemCount * 5)),
    weekOverWeekChange: '首个真实抓取周，暂无环比',
    marketSignalValue: topic.itemCount >= 10 ? '高' : '中',
    representativePostUrl: representative?.postUrl || '',
    notes: topicDiscussionSummary(topic.topic, topicItems, topic),
  };
});

function postCommentSplit(topicItems) {
  return {
    posts: topicItems.filter((item) => item.recordType === 'post').length,
    comments: topicItems.filter((item) => item.recordType === 'comment').length,
  };
}

function dominantSentiment(topicMeta) {
  return Object.entries(topicMeta.sentimentMix || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || '中性';
}

function clusterFocus(topicName, topicItems) {
  const summary = topicDiscussionSummary(topicName, topicItems, { sentimentMix: countBy(topicItems, (item) => item.sentiment) });
  return summary
    .replace(/^玩家主要(?:在问|讨论|围绕)：/, '')
    .replace(/^该话题主要是玩家的非单一机制讨论，集中在：/, '')
    .split('。')[0]
    .slice(0, 120);
}

function buildSummaryHeadline() {
  const top3 = topTopics.slice(0, 3).map((topic) => `「${topic.title}」`).join('、') || '核心话题';
  const commentRate = valid ? Math.round((comments.length / valid) * 100) : 0;
  const activeGroups = groupStats().filter((g) => g.weeklyContentVolume > 0).length;
  return `本周期越南玩家讨论集中在${top3}，评论占比 ${commentRate}% 且覆盖 ${activeGroups}/6 个 Group，说明玩家互助和攻略追问仍有自然热度，具备未来越南发行前的市场观察价值。`;
}

function buildKeyFindings() {
  const top3 = topTopics.slice(0, 3);
  const findings = [];

  for (const topic of top3) {
    const sourceTopic = topic.sourceTopic || topic.title;
    const topicItems = items.filter((item) => item.topics.includes(sourceTopic));
    const split = postCommentSplit(topicItems);
    findings.push({
      title: `${topic.title}是本周期核心讨论之一`,
      evidence: `${topic.title} ${topic.volume} 条，包含 ${split.posts} 帖 / ${split.comments} 评论，情绪以「${topic.sentiment}」为主。`,
      marketMeaning: topic.notes,
    });
  }

  if (comments.length) {
    const commentRate = Number(((comments.length / valid) * 100).toFixed(1));
    findings.push({
      title: '评论区承担玩家互助和二次追问功能',
      evidence: `本周期评论 ${comments.length} 条，占有效内容 ${commentRate}%；评论热点为 ${commentTopicSummary().slice(0, 3).map((topic) => `${topic.topic} ${topic.count}`).join('、')}。`,
      marketMeaning: '玩家会在评论区继续补充步骤、解释机制、讨论宠物和互相帮助，说明自然社区不是单向转帖，而是已有互动型知识传播。',
    });
  }

  return findings.slice(0, 5);
}

function buildDiscussionClusters() {
  return topTopics.slice(0, 5).map((topic) => {
    const sourceTopic = topic.sourceTopic || topic.title;
    const topicItems = items.filter((item) => item.topics.includes(sourceTopic));
    const split = postCommentSplit(topicItems);
    return {
      topic: topic.title,
      sourceTopic,
      volume: topic.volume,
      posts: split.posts,
      comments: split.comments,
      sentiment: dominantSentiment(topics.find((item) => item.topic === sourceTopic) || {}),
      playerFocus: clusterFocus(sourceTopic, topicItems),
      marketSignalValue: topic.marketSignalValue,
    };
  });
}

function buildDetailedWeeklySummary() {
  return [
    buildSummaryHeadline(),
    ...buildKeyFindings().map((finding) => `${finding.title}：${finding.evidence}${finding.marketMeaning}`),
  ].join('\n\n');
}

function reportCommentSentiment() {
  return comments.reduce((acc, item) => {
    acc[item.sentiment] = (acc[item.sentiment] || 0) + 1;
    return acc;
  }, {});
}

function commentTopicSummary() {
  return Object.entries(comments.reduce((acc, item) => {
    for (const topic of item.topics) acc[topic] = (acc[topic] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([topic, count]) => ({ topic, count }));
}

function buildNegativeOpinionAnalysis() {
  const negativeItems = items.filter((item) => item.sentiment === '负面' || item.sentiment === '高风险负面');
  const highRiskItems = items.filter((item) => item.sentiment === '高风险负面');
  const normalNegativeItems = items.filter((item) => item.sentiment === '负面');
  const negativeTopicCounts = {};
  const negativeGroupCounts = {};
  for (const item of negativeItems) {
    for (const topic of item.topics || []) negativeTopicCounts[displayTopicName(topic)] = (negativeTopicCounts[displayTopicName(topic)] || 0) + 1;
    negativeGroupCounts[item.sourceGroup] = (negativeGroupCounts[item.sourceGroup] || 0) + 1;
  }
  const topNegativeTopics = Object.entries(negativeTopicCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([topic, count]) => ({ topic, count }));
  const topNegativeGroups = Object.entries(negativeGroupCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([group, count]) => ({ group, count }));
  const riskLabelCounts = {};
  for (const item of negativeItems) {
    for (const label of item.riskLabels || []) riskLabelCounts[label] = (riskLabelCounts[label] || 0) + 1;
  }
  const riskMix = Object.entries(riskLabelCounts).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
  const baseline = `本期负面相关样本 ${negativeItems.length} 条，占有效内容 ${pct(negativeItems.length)}%；其中普通负面 ${normalNegativeItems.length} 条，高风险负面 ${highRiskItems.length} 条。负面并非集中在“游戏不好玩”，而主要集中在非官方交易、账号/代练、充值渠道风险，以及任务/机制理解成本。`;
  const reason = [
    '越南区尚未正式发行，玩家主要依赖中国区内容、民间攻略和 Group 转译，信息不完整会放大求助和误解。',
    '稀有宠物、shiny、Battle Pass 和账号进度具有可交易价值，容易催生代抓、账号买卖、私聊报价和充值引流。',
    '玩法任务、宠物名称和活动说明仍以中文/国服语境流通，越南玩家需要二次解释，因此负面更多表现为卡关、看不懂和找人帮忙。',
  ];
  const implication = '发行准备上应把负面舆情拆成两类处理：一类是可通过本地化 FAQ、任务说明、宠物/活动词表缓解的理解成本；另一类是需要社区规则、官方渠道声明和交易风险提示压制的黑产/灰产风险。';
  return {
    totalNegative: negativeItems.length,
    normalNegative: normalNegativeItems.length,
    highRiskNegative: highRiskItems.length,
    negativeRate: pct(negativeItems.length),
    topNegativeTopics,
    topNegativeGroups,
    riskMix,
    baseline,
    reason,
    implication,
  };
}

const riskObservations = risks.map((risk) => {
  let level = 'P3';
  if (['充值骗局', '账号买卖', '诈骗链接'].includes(risk.riskLabel)) level = risk.itemCount >= 3 ? 'P1' : 'P2';
  if (risk.riskLabel === '玩家误以为越南区已正式发行') level = 'P2';
  return {
    name: risk.riskLabel,
    level,
    evidenceSummary: risk.evidenceSummary,
    volume: risk.itemCount,
    impact: risk.riskLabel === '玩家误以为越南区已正式发行'
      ? '可能影响未来越南发行前的认知管理。'
      : '可能造成玩家交易/充值误导或社区信任风险。',
    internalAttentionNeeded: level === 'P1' || level === 'P2',
    observationAction: '继续观察相同关键词、重复发布者模式和跨 Group 传播情况。',
    preLaunchActionNeeded: level !== 'P3',
    representativePostUrl: risk.representativePostUrl,
  };
});

function pickVoice(predicate) {
  return items.find(predicate);
}

const representativeVoices = [
  pickVoice((item) => /đổi lại tính cách/.test(item.originalText)),
  pickVoice((item) => /bắt ké|vô map|nhà ng/.test(item.originalText)),
  pickVoice((item) => /bản chính thức|test/.test(item.originalText.toLowerCase())),
  pickVoice((item) => /top up|monthly gem/i.test(item.originalText)),
  pickVoice((item) => /dị màu|ấp trứng/.test(item.originalText)),
].filter(Boolean).map((item) => ({
  originalText: item.originalText,
  translationZh: item.translationZh,
  analysisZh: item.analysisZh,
  sentiment: item.sentiment,
  topic: item.primaryTopic,
  sourceGroup: item.sourceGroup,
  postUrl: item.postUrl,
  notes: item.lowConfidenceReason || '匿名化摘录，需 Facebook / Group 权限查看原帖。',
}));

const report = {
  schemaVersion: 'stage5.weekly_report.v1',
  exampleOnly: false,
  sourceSchemaVersion: structured.schemaVersion,
  reportTitle: 'Roco Kingdom 越南 Facebook Group 舆情监测报告',
  reportWeek: structured.reportWeek,
  dateGenerated: new Date().toISOString().slice(0, 10),
  timeRange: structured.timeRange,
  sourceStatus: {
    confirmedGroups: 6,
    activeGroups: groupStats().filter((g) => g.weeklyContentVolume > 0).length,
    dataAccessMethod: 'browser_automation',
    feedSortPreference: 'newest_first',
    feedSortUiLabelZh: '新帖子',
    dataCompleteness: structured.sourceStatus.dataCompleteness || '可见内容抓取，评论覆盖存在平台可见性限制。',
    limitations: structured.sourceStatus.limitations,
  },
  header: {
    confirmedGroupCount: 6,
    validContentCount: items.length,
    postCount: posts.length,
    commentCount: comments.length,
    mainLanguageDistribution: Object.entries(items.reduce((acc, item) => {
      acc[item.language] = (acc[item.language] || 0) + 1;
      return acc;
    }, {})).map(([language, count]) => ({ language, count })),
    dataCompletenessNote: completenessNote,
  },
  summaryHeadline: buildSummaryHeadline(),
  keyFindings: buildKeyFindings(),
  discussionClusters: buildDiscussionClusters(),
  summary: buildDetailedWeeklySummary(),
  metrics: {
    totalDiscussionVolume: items.length,
    validRocoRelatedContent: items.length,
    highRelevanceRate: pct(highRelevance),
    positiveRate: pct(positive),
    neutralRate: pct(neutral),
    negativeRate: pct(negative),
    highRiskCount: highRisk,
    activeGroupCount: groupStats().filter((g) => g.weeklyContentVolume > 0).length,
    top5HotTopics: topTopics.slice(0, 5).map((topic) => topic.title),
    sentimentHealthScore: healthScore,
    futureLaunchSignalScore: launchSignalScore,
  },
  commentOpinion: {
    commentCount: comments.length,
    sentimentSummary: reportCommentSentiment(),
    topCommentTopics: commentTopicSummary(),
    representativeComments: comments
      .filter((item) => item.originalText && item.originalText.length >= 4)
      .slice(0, 8)
      .map((item) => ({
        originalText: item.originalText,
        translationZh: item.translationZh,
        analysisZh: item.analysisZh,
        sentiment: item.sentiment,
        topic: item.primaryTopic,
        sourceGroup: item.sourceGroup,
        postUrl: item.postUrl,
        riskLabels: item.riskLabels,
      })),
    limitations: [
      '评论舆情基于 Facebook feed 中可见和已展开的评论。',
      '未完全展开的完整评论线程已进入缺口日志，因此评论舆情代表可见样本，不代表全量评论。',
    ],
  },
  groupSourceStatus: groupStats(),
  hotTopics: topTopics,
  sentimentAnalysis: {
    positivePlayersExpect: [
      '玩家对宠物获取、异色、进化和配招攻略有持续兴趣。',
      '部分玩家主动分享攻略、活动信息和宠物使用方式。',
    ],
    neutralPlayersAsk: [
      '大量内容是“任务怎么做”“这个宠物怎么抓/进化”“能不能借好友宠物”的求助。',
      '新手正在寻找可互助的 Group、地图进入方式和基础机制说明。',
    ],
    negativePlayersConcern: [
      '设备权限、账号/名称找回、任务翻译不清和机关解谜造成轻度挫败。',
      '少量充值/交易相关问题可能引出非官方渠道风险。',
    ],
    mixedSentimentContradictions: [
      '玩家兴趣强，但很多内容依赖国服/中文攻略转译，越南玩家理解成本偏高。',
      '玩家愿意互助，但“借宠、私聊、交易、充值”边界容易混在一起，未来发行前需要重点观察。',
    ],
  },
  futureVietnamLaunchSignals: {
    naturalInterestPoints: ['宠物养成', '异色/孵蛋', '任务攻略', '好友互助捕捉', 'Battle Pass 宠物'],
    frequentQuestions: ['任务如何完成', '宠物如何进化', '如何进入好友地图', '设备能否运行', '当前是否正式版'],
    potentialPaymentConcerns: ['Battle Pass、月卡、gem pass、充值渠道相关内容已出现，需要观察非官方渠道风险。'],
    localizationConcerns: ['任务说明、宠物名称、攻略翻译和中文内容转译是高频理解门槛。'],
    communitySelfSpreadSignals: ['攻略帖、视频/音频讲解、跨 Group 重复转发已出现。'],
    preLaunchAwarenessIssues: ['部分玩家可能误以为已有越南正式版本；需持续区分中国区正式发行与越南区未正式发行。'],
  },
  riskObservations,
  negativeOpinionAnalysis: buildNegativeOpinionAnalysis(),
  representativeVoices,
  trendObservation: {
    discussionVolumeTrend: '首个真实抓取周，暂无环比。',
    activeGroupTrend: '6 个 Group 均有可见内容，后续需按周比较活跃度。',
    sentimentTrend: '暂无历史趋势；本轮以中性求助为主。',
    topicTrend: '暂无历史趋势；本轮宠物养成和任务机制占比最高。',
    riskTrend: '暂无历史趋势；账号/道具交易、充值渠道和正式版认知混淆需持续观察。',
    interestHeatingUp: '从进行中周看已有自然讨论活跃迹象，但是否升温需至少两周数据确认。',
  },
  weeklyConclusion: {
    naturalCommunityActive: '活跃，且讨论主要来自玩家自发求助、攻略和互助需求。',
    continueMonitoring: true,
    futureLaunchOpportunitySignal: '存在。宠物养成、攻略、互助和本地化理解需求可作为未来越南发行前市场观察信号。',
    preLaunchRiskOrAwarenessIssue: '存在。重点是非官方交易/充值风险、账号买卖边界，以及玩家误以为越南区已正式发行。',
  },
  readyForDashboard: true,
};

fs.writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);

const md = `# ${report.reportTitle}

报告周：${report.reportWeek}
统计时间范围：${report.timeRange.start} 至 ${report.timeRange.end}
生成日期：${report.dateGenerated}
已确认 Group 数：6
有效内容量：${items.length}
帖子数量：${posts.length}
评论数量：${comments.length}
数据获取方式：浏览器自动化
数据完整性说明：${report.header.dataCompletenessNote}

## 1. 本周总览
${report.summary}

## 2. 核心指标
- 本周总讨论量：${report.metrics.totalDiscussionVolume}
- 有效 Roco 相关内容量：${report.metrics.validRocoRelatedContent}
- 高相关内容占比：${report.metrics.highRelevanceRate}%
- 正面占比：${report.metrics.positiveRate}%
- 中性占比：${report.metrics.neutralRate}%
- 负面占比：${report.metrics.negativeRate}%
- 高风险内容数量：${report.metrics.highRiskCount}
- 活跃 Group 数：${report.metrics.activeGroupCount}
- Top 5 热点：${report.metrics.top5HotTopics.join('、')}
- 舆情健康度评分：${report.metrics.sentimentHealthScore}
- 未来发行参考价值评分：${report.metrics.futureLaunchSignalScore}

## 3. Group 监测源状态
${report.groupSourceStatus.map((g) => `| ${g.groupName} | ${g.weeklyContentVolume} | ${g.dataCompleteness} | ${g.notes} |`).join('\n')}

## 4. 本周热点话题排行
${report.hotTopics.map((t) => `${t.rank}. ${t.title}：${t.volume} 条，情绪倾向 ${t.sentiment}，市场观察价值 ${t.marketSignalValue}`).join('\n')}

## 5. 玩家情绪分析
正面：${report.sentimentAnalysis.positivePlayersExpect.join(' ')}

中性：${report.sentimentAnalysis.neutralPlayersAsk.join(' ')}

负面：${report.sentimentAnalysis.negativePlayersConcern.join(' ')}

混合：${report.sentimentAnalysis.mixedSentimentContradictions.join(' ')}

## 5.1 评论舆情
评论样本量：${report.commentOpinion.commentCount}

评论情绪：${Object.entries(report.commentOpinion.sentimentSummary).map(([k, v]) => `${k} ${v}`).join('；')}

评论热点：${report.commentOpinion.topCommentTopics.map(t => `${t.topic} ${t.count}`).join('；')}

代表评论：
${report.commentOpinion.representativeComments.map((v) => `- ${v.originalText}（${v.sentiment} / ${v.topic}）`).join('\n')}

## 6. 未来越南发行参考信号
${Object.entries(report.futureVietnamLaunchSignals).map(([k, v]) => `- ${k}：${Array.isArray(v) ? v.join('；') : v}`).join('\n')}

## 7. 风险观察
${report.riskObservations.map((r) => `- ${r.level} ${r.name}：${r.evidenceSummary}。影响判断：${r.impact}`).join('\n')}

## 7.1 负面舆情分析
${report.negativeOpinionAnalysis.baseline}

主要负面主题：${report.negativeOpinionAnalysis.topNegativeTopics.map((item) => `${item.topic} ${item.count}`).join('；')}

形成原因：${report.negativeOpinionAnalysis.reason.join(' ')}

发行准备含义：${report.negativeOpinionAnalysis.implication}

## 8. 代表性玩家声音
${report.representativeVoices.map((v) => `- 原文：${v.originalText}\n  翻译：${v.translationZh}\n  来源：${v.sourceGroup}；主题：${v.topic}；情绪：${v.sentiment}；原帖：${v.postUrl}`).join('\n')}

## 9. 趋势观察
${Object.values(report.trendObservation).join('\n\n')}

## 10. 本周结论
越南自然玩家社区是否活跃：${report.weeklyConclusion.naturalCommunityActive}

当前是否值得继续监控：${report.weeklyConclusion.continueMonitoring ? '是' : '否'}

是否出现未来发行机会信号：${report.weeklyConclusion.futureLaunchOpportunitySignal}

是否存在需要提前处理的认知或风险问题：${report.weeklyConclusion.preLaunchRiskOrAwarenessIssue}
`;

fs.writeFileSync(mdOut, md);

console.log(JSON.stringify({
  jsonOut,
  mdOut,
  metrics: report.metrics,
  riskCount: report.riskObservations.length,
  representativeVoices: report.representativeVoices.length,
}, null, 2));

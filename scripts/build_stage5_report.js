const fs = require('fs');

const inputPath = process.argv[2] || 'data/structured/structured_weekly_2026-W18_real.json';
const jsonOut = process.argv[3] || 'data/reports/weekly_report_2026-W18_real.json';
const mdOut = process.argv[4] || 'data/reports/weekly_report_2026-W18_real.md';

const structured = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
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
          dataCompleteness: groupItems.length ? '进行中周可见内容已抓取，评论不完整' : '本轮未抓到有效内容',
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

const topTopics = topics.slice(0, 8).map((topic, index) => {
  const representative = items.find((item) => item.topics.includes(topic.topic));
  return {
    rank: index + 1,
    title: topic.topic,
    volume: topic.itemCount,
    sentiment: Object.entries(topic.sentimentMix || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || '中性',
    heatScore: Math.min(100, Math.round(topic.itemCount * 5)),
    weekOverWeekChange: '首个真实抓取周，暂无环比',
    marketSignalValue: topic.itemCount >= 10 ? '高' : '中',
    representativePostUrl: representative?.postUrl || '',
    notes: representative?.translationZh || '',
  };
});

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
  reportTitle: 'Roco Kingdom 越南 Facebook Group 每周舆情监测报告',
  reportWeek: structured.reportWeek,
  dateGenerated: new Date().toISOString().slice(0, 10),
  timeRange: structured.timeRange,
  sourceStatus: {
    confirmedGroups: 6,
    activeGroups: groupStats().filter((g) => g.weeklyContentVolume > 0).length,
    dataAccessMethod: 'browser_automation',
    feedSortPreference: 'newest_first',
    feedSortUiLabelZh: '新帖子',
    dataCompleteness: '进行中周数据；评论线程不完整；4/30 不补跑，后续周跑覆盖。',
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
    dataCompletenessNote: '本报告基于 2026-04-24 至 2026-04-29 的进行中周可见内容。评论仅覆盖可见/部分展开内容。',
  },
  summary: '本次进行中周抓取显示，越南玩家社区已经出现持续的自然讨论，核心集中在宠物养成、任务攻略、好友地图/借宠完成任务、Battle Pass 相关宠物和设备/权限问题。讨论多为玩家互助和攻略询问，说明当前社区有自发学习和传播动力。负面内容主要不是大规模口碑崩坏，而是任务理解、账号/名称找回、设备权限和本地化理解上的摩擦。风险侧出现少量账号/道具交易、充值渠道询问，以及“是否正式版/已经正式”的认知混淆。由于 Roco Kingdom 尚未在越南正式发行，这些讨论更适合作为未来发行前的兴趣、认知和风险观察信号，而不是即时运营响应对象。',
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

## 6. 未来越南发行参考信号
${Object.entries(report.futureVietnamLaunchSignals).map(([k, v]) => `- ${k}：${Array.isArray(v) ? v.join('；') : v}`).join('\n')}

## 7. 风险观察
${report.riskObservations.map((r) => `- ${r.level} ${r.name}：${r.evidenceSummary}。影响判断：${r.impact}`).join('\n')}

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

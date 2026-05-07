const fs = require('fs');

const reportPath = process.argv[2] || 'data/reports/weekly_report_2026-W18_real.json';
const structuredPath = process.argv[3] || 'data/structured/structured_weekly_2026-W18_real.json';
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const structured = JSON.parse(fs.readFileSync(structuredPath, 'utf8'));
const outputDir = process.env.OUTPUT_DIR || 'site';
const dashboardTheme = process.env.DASHBOARD_THEME || 'default';
fs.mkdirSync(`${outputDir}/topics`, { recursive: true });
fs.mkdirSync(`${outputDir}/reports`, { recursive: true });
const qualityPath = `data/quality/data_quality_${report.reportWeek}.json`;
const quality = fs.existsSync(qualityPath) ? JSON.parse(fs.readFileSync(qualityPath, 'utf8')) : null;

function blockPublish(reason, details = []) {
  console.error(JSON.stringify({
    status: 'blocked',
    stage: 'stage6',
    reportWeek: report.reportWeek,
    reason,
    details,
  }, null, 2));
  process.exit(1);
}

if (report.readyForDashboard === false) {
  blockPublish('Report is not marked ready for dashboard publishing.');
}

if (structured.readyForWeeklyReport === false) {
  blockPublish('Structured data is not eligible for formal weekly report publishing.', structured.qualityGate?.blockingReasons || [structured.readyForWeeklyReportReason].filter(Boolean));
}

if (quality && quality.status !== 'pass') {
  blockPublish('Data quality status is not pass; refusing to publish dashboard/latest artifacts.', (quality.issues || []).map((issue) => `${issue.code}: ${issue.detail}`));
}

const availableReports = fs.readdirSync('data/reports')
  .filter((file) => /^weekly_report_.*_real\.json$/.test(file))
  .map((file) => {
    const data = JSON.parse(fs.readFileSync(`data/reports/${file}`, 'utf8'));
    return {
      week: data.reportWeek,
      file: `reports/${data.reportWeek}.html`,
      valid: data.header?.validContentCount || 0,
      posts: data.header?.postCount || 0,
      comments: data.header?.commentCount || 0,
      health: data.metrics?.sentimentHealthScore || 0,
      launch: data.metrics?.futureLaunchSignalScore || 0,
      risk: data.metrics?.highRiskCount || 0,
    };
  })
  .sort((a, b) => a.week.localeCompare(b.week));

const latestMaxTopicVolume = Math.max(...(report.hotTopics || []).map((topic) => topic.volume), 1);
const latestMaxGroupVolume = Math.max(...(report.groupSourceStatus || []).map((group) => group.weeklyContentVolume), 1);
const maxReportValid = Math.max(...availableReports.map((item) => item.valid), 1);
const isAppleTheme = dashboardTheme === 'apple';

function interactionDock() {
  if (!isAppleTheme) return '';
  return `<aside class="command-dock" aria-label="Dashboard controls">
    <div class="dock-section">
      <span class="eyebrow">Report</span>
      <strong>${escapeHtml(report.reportWeek)}</strong>
      <p>${escapeHtml(report.timeRange.start)} - ${escapeHtml(report.timeRange.end)}</p>
    </div>
    <label class="dock-search">
      <span>全局搜索</span>
      <input id="globalSearch" type="search" placeholder="搜索 topic / group / 风险 / 玩家声音" autocomplete="off" />
    </label>
    <div class="segmented" role="group" aria-label="Content filter">
      <button type="button" data-filter="all" class="active">全部</button>
      <button type="button" data-filter="comment">评论</button>
      <button type="button" data-filter="risk">风险</button>
      <button type="button" data-filter="topic">Topic</button>
    </div>
    <button class="density-toggle" type="button" id="densityToggle">紧凑视图</button>
  </aside>`;
}

function appleScript() {
  if (!isAppleTheme) return '';
  return `<script>
    const search = document.getElementById('globalSearch');
    const densityToggle = document.getElementById('densityToggle');
    const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
    let activeFilter = 'all';

    function searchableRows() {
      return Array.from(document.querySelectorAll('tbody tr, .voice, .signal-row, .topic-brief'));
    }

    function applyFilters() {
      const q = (search?.value || '').trim().toLowerCase();
      searchableRows().forEach((el) => {
        const text = el.textContent.toLowerCase();
        const bucket = el.dataset.bucket || '';
        const filterOk = activeFilter === 'all' || bucket === activeFilter || el.closest('#' + activeFilter + 's') || el.closest('#comments') && activeFilter === 'comment';
        const searchOk = !q || text.includes(q);
        el.hidden = !(filterOk && searchOk);
      });
    }

    search?.addEventListener('input', applyFilters);
    filterButtons.forEach((btn) => btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      filterButtons.forEach((b) => b.classList.toggle('active', b === btn));
      applyFilters();
    }));
    densityToggle?.addEventListener('click', () => {
      document.body.classList.toggle('comfortable');
      densityToggle.textContent = document.body.classList.contains('comfortable') ? '舒展视图' : '紧凑视图';
    });
  </script>`;
}

function topicSlug(topic) {
  return Buffer.from(topic).toString('base64url');
}

function topicDetailPath(topic) {
  return `topics/${report.reportWeek}_${topicSlug(topic)}.html`;
}

function topicDetailHref(topic) {
  return topicDetailPath(topic);
}

function buildTopicDetail(topicRow) {
  const topic = topicRow.title;
  const topicItems = structured.items.filter((item) => item.topics.includes(topic));
  const coTopics = {};
  const sentiment = {};
  const recordTypes = {};
  const groups = {};
  for (const item of topicItems) {
    sentiment[item.sentiment] = (sentiment[item.sentiment] || 0) + 1;
    recordTypes[item.recordType] = (recordTypes[item.recordType] || 0) + 1;
    groups[item.sourceGroup] = (groups[item.sourceGroup] || 0) + 1;
    for (const t of item.topics) {
      if (t !== topic) coTopics[t] = (coTopics[t] || 0) + 1;
    }
  }
  const rows = topicItems.slice(0, 80).map((item, index) => `<tr><td>${index + 1}</td><td>${item.recordType === 'comment' ? '评论' : '帖子'}</td><td>${escapeHtml(item.sourceGroup)}</td><td><span class="tag ${sentimentClass(item.sentiment)}">${escapeHtml(item.sentiment)}</span></td><td>${escapeHtml(item.originalText)}</td><td>${escapeHtml(item.translationZh)}</td><td><a class="btn" href="${item.postUrl}" target="_blank" rel="noreferrer">查看原帖</a></td></tr>`).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(topic)} - Topic 分析</title>
  <style>${baseCss()}</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(topic)} - Topic 分析</h1>
    <div class="meta"><span>报告周：${report.reportWeek}</span><span>内容量：${topicItems.length}</span><span>阈值：内容量超过 10 自动生成</span></div>
  </header>
  <main>
    <p><a class="btn" href="../reports/${report.reportWeek}.html#topics">返回本周 Dashboard</a></p>
    <section><h2>概览</h2><div class="grid metrics">
      ${metric('内容量', topicItems.length, `${recordTypes.post || 0} 帖 / ${recordTypes.comment || 0} 评论`)}
      ${metric('主要情绪', Object.entries(sentiment).sort((a,b)=>b[1]-a[1])[0]?.[0] || '无', '该 topic 内')}
      ${metric('活跃 Group', Object.keys(groups).length, '涉及来源数')}
      ${metric('代表 case', topicRow.representativePostUrl ? '有' : '无', '原帖需权限')}
    </div></section>
    <section><h2>二级 Topic / 共现标签</h2><div class="panel tag-cloud">${Object.entries(coTopics).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `<span class="tag blue">${escapeHtml(k)} ${v}</span>`).join('') || '<span class="muted">暂无明显共现标签</span>'}</div></section>
    <section><h2>情绪与来源</h2><div class="grid two"><div class="panel">${Object.entries(sentiment).map(([k,v]) => `<p><strong>${escapeHtml(k)}</strong> ${v}</p><div class="bar ${sentimentClass(k)}"><span style="width:${Math.min(100, v / topicItems.length * 100)}%"></span></div>`).join('')}</div><div class="panel">${Object.entries(groups).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `<div class="mini-row"><span>${escapeHtml(k)}</span><strong>${v}</strong></div><div class="bar"><span style="width:${Math.min(100, v / topicItems.length * 100)}%"></span></div>`).join('')}</div></div></section>
    <section><h2>内容明细</h2><table><thead><tr><th>#</th><th>类型</th><th>来源</th><th>情绪</th><th>越南语原文</th><th>中文翻译</th><th>原帖</th></tr></thead><tbody>${rows}</tbody></table></section>
  </main>
</body>
</html>`;
}

for (const topic of report.hotTopics || []) {
  if (topic.volume >= 10) {
    fs.writeFileSync(`${outputDir}/${topicDetailPath(topic.title)}`, buildTopicDetail(topic));
  }
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Roco Kingdom 越南 Facebook Group 周度舆情监测</title>
  <style>
    ${baseCss()}
  </style>
</head>
<body>
  <header>
    <h1>${report.reportTitle}</h1>
    <div class="meta">
      <span>报告周：${report.reportWeek}</span>
      <span>生成日期：${report.dateGenerated}</span>
      <span>统计范围：${report.timeRange.start} 至 ${report.timeRange.end}</span>
      <span>数据方式：浏览器自动化</span>
    </div>
  </header>
  <nav>
    <a href="#latest">最新周报</a>
    <a href="#groups">Group</a>
    <a href="#topics">热点</a>
    <a href="#comments">评论</a>
    <a href="#risks">风险</a>
    <a href="#voices">玩家声音</a>
    <a href="#trends">趋势</a>
  </nav>
  ${interactionDock()}
  <main>
    <section class="status-strip">
      <div>
        <span class="eyebrow">监测状态</span>
        <strong>${qualityStatusText()}</strong>
        <p>${escapeHtml(report.sourceStatus.dataCompleteness)}</p>
      </div>
      <div>
        <span class="eyebrow">统计窗口</span>
        <strong>${escapeHtml(report.reportWeek)}</strong>
        <p>${escapeHtml(report.timeRange.start)} 至 ${escapeHtml(report.timeRange.end)}</p>
      </div>
      <div>
        <span class="eyebrow">采集方式</span>
        <strong>browser_automation</strong>
        <p>新帖子排序，按周增量抓取，原帖链接保留用于复核。</p>
      </div>
    </section>
    ${quality && quality.status !== 'pass' ? `<div class="notice"><strong>数据质量需要复核：</strong>${quality.issues.map((issue) => issue.title).join('；')}。本轮不应直接视为完整成品，请先确认是否重跑、加深评论或接受可见样本。</div>` : ''}

    <section id="latest">
      <h2>本周总览</h2>
      <div class="grid cockpit">
        <div class="panel summary-panel">${paragraphs(report.summary)}</div>
        <div class="panel">
          <h3>周选择</h3>
          <div class="filters">${availableReports.map((r) => `<a class="btn" href="${r.file}">${r.week}</a>`).join('')}</div>
          <div class="trend-list">${availableReports.map((r) => `<div class="trend-row"><span>${r.week}</span><div class="bar"><span style="width:${pct(r.valid, maxReportValid)}%"></span></div><strong>${r.valid}</strong></div>`).join('')}</div>
          <p class="small muted">当前展示 ${report.reportWeek}。历史周页面已生成，可按周查看。</p>
        </div>
      </div>
    </section>

    <section>
      <h2>核心指标</h2>
      <div class="grid metrics">
        ${metric('有效内容', report.metrics.validRocoRelatedContent, `${report.header.postCount} 帖 / ${report.header.commentCount} 评论`)}
        ${metric('高相关占比', `${report.metrics.highRelevanceRate}%`, '未来发行参考信号')}
        ${metric('正面占比', `${report.metrics.positiveRate}%`, '玩家期待/分享')}
        ${metric('中性占比', `${report.metrics.neutralRate}%`, '求助和询问为主')}
        ${metric('负面占比', `${report.metrics.negativeRate}%`, '含高风险负面')}
        ${metric('发行参考分', report.metrics.futureLaunchSignalScore, `健康度 ${report.metrics.sentimentHealthScore}`)}
      </div>
      <div class="panel composition">
        <div><strong>内容构成</strong><span>${report.header.postCount} 帖 / ${report.header.commentCount} 评论</span></div>
        ${stackedBar([
          ['帖子', report.header.postCount, 'blue'],
          ['评论', report.header.commentCount, 'teal'],
        ])}
        <div><strong>情绪结构</strong><span>正面 ${report.metrics.positiveRate}% / 中性 ${report.metrics.neutralRate}% / 负面 ${report.metrics.negativeRate}%</span></div>
        ${stackedBar([
          ['正面', report.metrics.positiveRate, 'green'],
          ['中性', report.metrics.neutralRate, 'blue'],
          ['负面', report.metrics.negativeRate, 'red'],
        ], 100)}
      </div>
    </section>

    <section id="groups">
      <h2>Group 监测源</h2>
      <table>
        <thead><tr><th>Group</th><th>本周内容量</th><th>访问状态</th><th>数据完整性</th><th>备注</th></tr></thead>
        <tbody>
          ${report.groupSourceStatus.map(g => `<tr><td><a class="btn" href="${g.groupUrl}" target="_blank" rel="noreferrer">查看 Group</a><br>${escapeHtml(g.groupName)}</td><td><div class="volume-cell"><strong>${g.weeklyContentVolume}</strong><div class="bar"><span style="width:${pct(g.weeklyContentVolume, latestMaxGroupVolume)}%"></span></div></div></td><td>${escapeHtml(g.accessStatus)}</td><td>${escapeHtml(g.dataCompleteness)}</td><td>${escapeHtml(g.notes)}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>

    <section id="topics">
      <h2>热点排行</h2>
      <table>
        <thead><tr><th>排名</th><th>热点</th><th>内容量</th><th>情绪</th><th>热度</th><th>市场观察价值</th><th>分析 / case</th></tr></thead>
        <tbody>
          ${report.hotTopics.map(t => `<tr data-bucket="topic"><td>${t.rank}</td><td><strong>${escapeHtml(t.title)}</strong><p class="small muted">${escapeHtml(t.notes || '')}</p></td><td><div class="volume-cell"><strong>${t.volume}</strong><div class="bar"><span style="width:${pct(t.volume, latestMaxTopicVolume)}%"></span></div></div></td><td><span class="tag ${sentimentClass(t.sentiment)}">${escapeHtml(t.sentiment)}</span></td><td><div class="bar"><span style="width:${t.heatScore}%"></span></div></td><td>${escapeHtml(t.marketSignalValue)}</td><td>${t.volume >= 10 ? `<a class="btn strong" href="${topicDetailHref(t.title)}">查看二级分析</a>` : (t.representativePostUrl ? `<a class="btn" href="${t.representativePostUrl}" target="_blank" rel="noreferrer">查看原帖</a>` : '无')}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>

    <section>
      <h2>情绪分布</h2>
      <div class="grid two">
        <div class="panel">
          ${sentimentBar('正面', report.metrics.positiveRate, 'green')}
          ${sentimentBar('中性', report.metrics.neutralRate, 'blue')}
          ${sentimentBar('负面', report.metrics.negativeRate, 'red')}
        </div>
        <div class="panel">
          <h3>未来越南发行参考信号</h3>
          ${Object.entries(report.futureVietnamLaunchSignals).map(([k, v]) => `<div class="signal-row"><strong>${label(k)}</strong><p>${escapeHtml(Array.isArray(v) ? v.join('；') : v)}</p></div>`).join('')}
        </div>
      </div>
    </section>

    <section id="comments">
      <h2>评论舆情</h2>
      <div class="grid two">
        <div class="panel">
          <h3>评论情绪</h3>
          ${Object.entries(report.commentOpinion?.sentimentSummary || {}).map(([k, v]) => `<p><strong>${k}</strong> ${v}</p>`).join('')}
          <h3>评论热点</h3>
          ${(report.commentOpinion?.topCommentTopics || []).map(t => `<span class="tag blue">${t.topic} ${t.count}</span>`).join('')}
          <p class="small muted">${(report.commentOpinion?.limitations || []).join(' ')}</p>
        </div>
        <div class="panel">
          <h3>代表评论</h3>
          ${(report.commentOpinion?.representativeComments || []).map(v => `<div class="voice" data-bucket="comment"><span class="tag">${v.sentiment}</span><span class="tag blue">${v.topic}</span><blockquote>${escapeHtml(v.originalText)}</blockquote><p><strong>翻译：</strong>${escapeHtml(v.translationZh)}</p>${v.analysisZh ? `<p><strong>分析：</strong>${escapeHtml(v.analysisZh)}</p>` : ''}<a class="btn" href="${v.postUrl}" target="_blank" rel="noreferrer">查看原帖</a></div>`).join('')}
        </div>
      </div>
    </section>

    <section id="risks">
      <h2>风险观察</h2>
      <table>
        <thead><tr><th>风险</th><th>等级</th><th>证据摘要</th><th>数量</th><th>影响判断</th><th>代表 case</th></tr></thead>
        <tbody>
          ${report.riskObservations.map(r => `<tr data-bucket="risk"><td>${r.name}</td><td><span class="tag ${r.level === 'P1' ? 'red' : 'amber'}">${r.level}</span></td><td>${escapeHtml(r.evidenceSummary)}</td><td>${r.volume}</td><td>${r.impact}</td><td>${r.representativePostUrl ? `<a class="btn" href="${r.representativePostUrl}" target="_blank" rel="noreferrer">查看原帖</a>` : '无'}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>

    <section id="voices">
      <h2>代表性玩家声音</h2>
      <div class="panel">
        ${report.representativeVoices.map(v => `<div class="voice" data-bucket="topic"><span class="tag blue">${v.topic}</span><span class="tag">${v.sentiment}</span><span class="tag">${v.sourceGroup}</span><blockquote>${escapeHtml(v.originalText)}</blockquote><p><strong>翻译：</strong>${escapeHtml(v.translationZh)}</p>${v.analysisZh ? `<p><strong>分析：</strong>${escapeHtml(v.analysisZh)}</p>` : ''}<a class="btn" href="${v.postUrl}" target="_blank" rel="noreferrer">查看原帖</a> <span class="small muted">需 Facebook / Group 权限</span></div>`).join('')}
      </div>
    </section>

    <section id="trends">
      <h2>趋势观察</h2>
      <div class="grid two">
        <div class="panel trend-list">
          ${availableReports.map((r) => `<div class="trend-row"><span>${r.week}</span><div class="bar"><span style="width:${pct(r.valid, maxReportValid)}%"></span></div><strong>${r.valid}</strong><em>健康 ${r.health} / 发行 ${r.launch}</em></div>`).join('')}
        </div>
        <div class="panel">
          ${Object.values(report.trendObservation).map(x => `<p>${escapeHtml(x)}</p>`).join('')}
        </div>
      </div>
    </section>

    <section>
      <h2>数据完整性说明</h2>
      <div class="panel">
        <p>${report.header.dataCompletenessNote}</p>
        ${quality ? `<p>数据质量状态：<strong>${quality.status}</strong>。有效内容 ${quality.summary.validItems} 条，评论 ${quality.summary.commentItems} 条，活跃 Group ${quality.summary.activeGroups}/${quality.summary.expectedGroups}。</p>` : ''}
        <p>有效结构化内容 ${structured.items.length} 条；剔除窗口外、空文本、重复或纯媒体内容 ${structured.invalidItems.length} 条；低置信度待复核 ${structured.lowConfidenceItems.length} 条。</p>
        <p>最终展示不包含用户真实姓名、头像、主页链接或 Facebook ID。原帖按钮仅指向帖子 URL。</p>
      </div>
    </section>
  </main>
  ${appleScript()}
</body>
</html>`;

function baseCss() {
  if (dashboardTheme === 'apple') return appleCss();
  if (dashboardTheme === 'awesome') return awesomeCss();
  return `
    :root {
      --bg: #f4f6f8;
      --ink: #182230;
      --muted: #667085;
      --line: #d6dde8;
      --panel: #ffffff;
      --blue: #2563eb;
      --green: #18864b;
      --amber: #b45309;
      --red: #b42318;
      --teal: #0f766e;
      --slate: #344054;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: var(--bg);
      color: var(--ink);
      letter-spacing: 0;
    }
    header {
      background: #182230;
      color: white;
      padding: 18px 28px 16px;
      border-bottom: 4px solid var(--teal);
    }
    header h1 { margin: 0 0 8px; font-size: 24px; line-height: 1.25; }
    header .meta { display: flex; flex-wrap: wrap; gap: 10px 18px; color: #d1d5db; font-size: 13px; }
    nav {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      gap: 4px;
      align-items: center;
      padding: 10px 28px;
      background: rgba(244,246,248,.96);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(8px);
    }
    nav a {
      color: var(--ink);
      text-decoration: none;
      padding: 7px 10px;
      border-radius: 6px;
      font-size: 14px;
    }
    nav a:hover { background: #e8edf7; }
    main { padding: 22px 28px 40px; max-width: 1480px; margin: 0 auto; }
    section { margin-bottom: 26px; }
    h2 { font-size: 18px; margin: 0 0 12px; }
    h3 { font-size: 15px; margin: 0 0 8px; }
    .notice {
      border-left: 4px solid var(--amber);
      background: #fff8e6;
      padding: 10px 12px;
      color: #5f430b;
      margin-bottom: 18px;
      line-height: 1.55;
    }
    .grid { display: grid; gap: 12px; }
    .metrics { grid-template-columns: repeat(6, minmax(130px, 1fr)); }
    .cockpit { grid-template-columns: minmax(0, 1.45fr) minmax(320px, .55fr); }
    .metric, .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .status-strip {
      display: grid;
      grid-template-columns: 1fr 1.2fr 1fr;
      gap: 1px;
      background: var(--line);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 18px;
    }
    .status-strip > div {
      background: #fff;
      padding: 13px 14px;
      min-width: 0;
    }
    .status-strip strong { display: block; margin: 3px 0; font-size: 15px; }
    .status-strip p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
    .eyebrow {
      display: block;
      color: var(--teal);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .summary-panel p { margin: 0 0 10px; line-height: 1.7; }
    .summary-panel p:last-child { margin-bottom: 0; }
    .metric .label { color: var(--muted); font-size: 12px; }
    .metric .value { font-size: 24px; font-weight: 700; margin-top: 6px; }
    .metric .sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
    .two { grid-template-columns: 1.3fr .7fr; }
    .composition {
      display: grid;
      grid-template-columns: 180px minmax(0, 1fr);
      gap: 10px 16px;
      align-items: center;
      margin-top: 12px;
    }
    .composition strong, .composition span { display: block; }
    .composition span { color: var(--muted); font-size: 12px; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; font-size: 13px; }
    th { background: #eef2f7; color: #344054; font-weight: 700; }
    tr:last-child td { border-bottom: 0; }
    .tag { display: inline-flex; align-items: center; min-height: 22px; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--line); background: #f9fafb; font-size: 12px; margin: 2px 4px 2px 0; }
    .tag.green { color: var(--green); border-color: #a8d5bd; background: #eefaf3; }
    .tag.red { color: var(--red); border-color: #f0b6b2; background: #fff1f1; }
    .tag.blue { color: var(--blue); border-color: #bdd3ff; background: #f0f5ff; }
    .tag.amber { color: var(--amber); border-color: #ead19b; background: #fff8e6; }
    .tag.teal { color: var(--teal); border-color: #99d5cd; background: #eefaf8; }
    .bar { height: 9px; background: #edf0f5; border-radius: 999px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--blue); }
    .bar.green span { background: var(--green); }
    .bar.red span { background: var(--red); }
    .bar.amber span { background: var(--amber); }
    .bar.teal span { background: var(--teal); }
    .stacked {
      display: flex;
      height: 14px;
      background: #edf0f5;
      border-radius: 999px;
      overflow: hidden;
    }
    .stacked span { min-width: 2px; }
    .stacked .green { background: var(--green); }
    .stacked .blue { background: var(--blue); }
    .stacked .red { background: var(--red); }
    .stacked .teal { background: var(--teal); }
    .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; color: var(--muted); font-size: 12px; }
    .legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; }
    .legend .green i { background: var(--green); }
    .legend .blue i { background: var(--blue); }
    .legend .red i { background: var(--red); }
    .legend .teal i { background: var(--teal); }
    .volume-cell { min-width: 110px; }
    .volume-cell strong { display: inline-block; margin-bottom: 5px; }
    .mini-row, .trend-row {
      display: grid;
      grid-template-columns: minmax(120px, 1fr) minmax(90px, 2fr) 42px;
      gap: 8px;
      align-items: center;
      margin: 8px 0;
      font-size: 13px;
    }
    .trend-row em { color: var(--muted); font-style: normal; font-size: 12px; grid-column: 2 / 4; }
    .signal-row {
      border-top: 1px solid var(--line);
      padding: 10px 0;
    }
    .signal-row:first-of-type { border-top: 0; padding-top: 0; }
    .signal-row p { margin: 4px 0 0; color: var(--slate); line-height: 1.55; }
    .tag-cloud { line-height: 2; }
    .voice { border-top: 1px solid var(--line); padding: 12px 0; }
    .voice:first-child { border-top: 0; padding-top: 0; }
    .voice blockquote { margin: 8px 0; padding-left: 10px; border-left: 3px solid var(--cyan); color: #344054; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 9px;
      border-radius: 6px;
      background: #eef4ff;
      color: var(--blue);
      text-decoration: none;
      font-size: 12px;
      border: 1px solid #bdd3ff;
    }
    .btn.strong {
      color: white;
      background: var(--blue);
      border-color: var(--blue);
    }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    select, input {
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 6px 8px;
      background: white;
      color: var(--ink);
    }
    .muted { color: var(--muted); }
    .small { font-size: 12px; }
    @media (max-width: 980px) {
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .two, .cockpit, .status-strip { grid-template-columns: 1fr; }
      .composition { grid-template-columns: 1fr; }
      main, header, nav { padding-left: 16px; padding-right: 16px; }
      table { display: block; overflow-x: auto; }
    }
`;
}

function appleCss() {
  return `
    :root {
      --bg: #f5f5f7;
      --ink: #1d1d1f;
      --muted: rgba(0, 0, 0, 0.56);
      --soft: rgba(0, 0, 0, 0.34);
      --line: rgba(0, 0, 0, 0.08);
      --panel: rgba(255, 255, 255, 0.86);
      --panel-solid: #ffffff;
      --blue: #0071e3;
      --blue-text: #0066cc;
      --green: #128a43;
      --amber: #b25f00;
      --red: #c9271f;
      --teal: #007d75;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
      background: var(--bg);
      color: var(--ink);
      letter-spacing: 0;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    header {
      min-height: 164px;
      padding: 52px 32px 28px;
      background: #000;
      color: #fff;
    }
    header h1 {
      margin: 0 auto 12px;
      max-width: 1180px;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "PingFang SC", sans-serif;
      font-size: clamp(30px, 4vw, 54px);
      line-height: 1.08;
      font-weight: 650;
      text-align: center;
    }
    header .meta {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 8px 16px;
      max-width: 1180px;
      margin: 0 auto;
      color: rgba(255, 255, 255, 0.72);
      font-size: 12px;
      line-height: 1.33;
    }
    nav {
      position: sticky;
      top: 0;
      z-index: 20;
      height: 48px;
      display: flex;
      justify-content: center;
      gap: 2px;
      align-items: center;
      padding: 0 20px;
      background: rgba(0, 0, 0, 0.78);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      backdrop-filter: saturate(180%) blur(20px);
      overflow-x: auto;
    }
    nav a {
      color: rgba(255, 255, 255, 0.82);
      text-decoration: none;
      padding: 8px 10px;
      border-radius: 980px;
      font-size: 12px;
      white-space: nowrap;
    }
    nav a:hover { color: #fff; background: rgba(255, 255, 255, 0.12); }
    main {
      width: min(100%, 1440px);
      margin: 0 auto;
      padding: 18px 24px 56px;
    }
    section { margin-bottom: 16px; scroll-margin-top: 150px; }
    h2 {
      margin: 0 0 8px;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "PingFang SC", sans-serif;
      font-size: 20px;
      line-height: 1.14;
      font-weight: 650;
    }
    h3 {
      margin: 0 0 8px;
      font-size: 14px;
      line-height: 1.25;
      font-weight: 650;
    }
    .command-dock {
      position: sticky;
      top: 48px;
      z-index: 18;
      display: grid;
      grid-template-columns: minmax(210px, .72fr) minmax(260px, 1fr) auto auto;
      gap: 10px;
      align-items: center;
      padding: 10px 24px;
      background: rgba(245, 245, 247, 0.78);
      border-bottom: 1px solid var(--line);
      backdrop-filter: saturate(180%) blur(20px);
    }
    .dock-section strong {
      display: block;
      font-size: 15px;
      line-height: 1.2;
      font-weight: 650;
    }
    .dock-section p {
      margin: 2px 0 0;
      color: var(--muted);
      font-size: 12px;
    }
    .dock-search {
      display: grid;
      grid-template-columns: auto minmax(160px, 1fr);
      gap: 8px;
      align-items: center;
      height: 36px;
      padding: 0 12px;
      border-radius: 980px;
      background: rgba(255, 255, 255, 0.72);
      border: 1px solid var(--line);
    }
    .dock-search span {
      color: var(--soft);
      font-size: 12px;
      white-space: nowrap;
    }
    .dock-search input {
      min-height: 0;
      width: 100%;
      border: 0;
      background: transparent;
      color: var(--ink);
      outline: 0;
      font-size: 13px;
    }
    .segmented {
      display: inline-flex;
      align-items: center;
      padding: 2px;
      border-radius: 980px;
      background: rgba(0, 0, 0, 0.06);
      white-space: nowrap;
    }
    .segmented button,
    .density-toggle {
      min-height: 32px;
      border: 0;
      border-radius: 980px;
      padding: 0 12px;
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .segmented button.active,
    .density-toggle {
      background: #fff;
      color: var(--ink);
      box-shadow: 0 1px 10px rgba(0, 0, 0, 0.08);
    }
    .eyebrow {
      display: block;
      color: var(--soft);
      font-size: 11px;
      line-height: 1.2;
      font-weight: 600;
    }
    .notice {
      border-radius: 12px;
      background: #fff4dc;
      color: #5d3500;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 13px;
      line-height: 1.45;
    }
    .grid { display: grid; gap: 10px; }
    .status-strip,
    .metrics {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 10px;
    }
    .status-strip { grid-template-columns: 1fr 1fr 1fr; margin-bottom: 14px; }
    .status-strip > div,
    .metric,
    .panel {
      background: var(--panel);
      border: 0;
      border-radius: 12px;
      padding: 12px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 10px 30px rgba(0, 0, 0, 0.035);
    }
    .status-strip strong {
      display: block;
      margin: 3px 0;
      font-size: 15px;
      line-height: 1.2;
      font-weight: 650;
    }
    .status-strip p {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
    }
    .cockpit { grid-template-columns: minmax(0, 1.25fr) minmax(300px, .75fr); }
    .two { grid-template-columns: minmax(0, 1fr) minmax(320px, .72fr); }
    .summary-panel p {
      margin: 0 0 8px;
      color: rgba(0, 0, 0, 0.76);
      font-size: 14px;
      line-height: 1.55;
    }
    .summary-panel p:last-child { margin-bottom: 0; }
    .metric .label {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.2;
    }
    .metric .value {
      margin-top: 4px;
      font-size: 28px;
      line-height: 1.05;
      font-weight: 650;
      letter-spacing: 0;
    }
    .metric .sub {
      margin-top: 4px;
      color: var(--soft);
      font-size: 12px;
      line-height: 1.25;
    }
    .composition {
      display: grid;
      grid-template-columns: 170px minmax(0, 1fr);
      gap: 8px 12px;
      align-items: center;
      margin-top: 10px;
    }
    .composition strong,
    .composition span { display: block; }
    .composition span {
      margin-top: 2px;
      color: var(--muted);
      font-size: 12px;
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      background: var(--panel-solid);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 10px 30px rgba(0, 0, 0, 0.03);
    }
    th, td {
      text-align: left;
      padding: 8px 10px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      font-size: 12px;
      line-height: 1.38;
    }
    th {
      background: rgba(250, 250, 252, 0.94);
      color: rgba(0, 0, 0, 0.54);
      font-weight: 600;
    }
    tr:last-child td { border-bottom: 0; }
    tr:hover td { background: rgba(0, 113, 227, 0.035); }
    td strong { font-weight: 650; }
    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 2px 8px;
      border-radius: 980px;
      border: 0;
      background: rgba(0, 0, 0, 0.055);
      color: var(--ink);
      font-size: 12px;
      line-height: 1.1;
      margin: 1px 4px 1px 0;
      white-space: nowrap;
    }
    .tag.green { color: var(--green); background: rgba(18, 138, 67, 0.1); }
    .tag.red { color: var(--red); background: rgba(201, 39, 31, 0.1); }
    .tag.blue { color: var(--blue-text); background: rgba(0, 113, 227, 0.1); }
    .tag.amber { color: var(--amber); background: rgba(178, 95, 0, 0.1); }
    .tag.teal { color: var(--teal); background: rgba(0, 125, 117, 0.1); }
    .bar {
      height: 6px;
      background: rgba(0, 0, 0, 0.07);
      border-radius: 980px;
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--blue);
      border-radius: inherit;
    }
    .bar.green span { background: var(--green); }
    .bar.red span { background: var(--red); }
    .bar.amber span { background: var(--amber); }
    .bar.teal span { background: var(--teal); }
    .stacked {
      display: flex;
      height: 10px;
      background: rgba(0, 0, 0, 0.07);
      border-radius: 980px;
      overflow: hidden;
    }
    .stacked span { min-width: 2px; }
    .stacked .green { background: var(--green); }
    .stacked .blue { background: var(--blue); }
    .stacked .red { background: var(--red); }
    .stacked .teal { background: var(--teal); }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 5px;
      color: var(--muted);
      font-size: 11px;
    }
    .legend i {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      margin-right: 4px;
    }
    .legend .green i { background: var(--green); }
    .legend .blue i { background: var(--blue); }
    .legend .red i { background: var(--red); }
    .legend .teal i { background: var(--teal); }
    .volume-cell { min-width: 92px; }
    .volume-cell strong { display: inline-block; margin-bottom: 4px; }
    .mini-row, .trend-row {
      display: grid;
      grid-template-columns: minmax(92px, 1fr) minmax(88px, 1.5fr) 38px;
      gap: 7px;
      align-items: center;
      margin: 6px 0;
      font-size: 12px;
    }
    .trend-row em {
      color: var(--muted);
      font-style: normal;
      font-size: 11px;
      grid-column: 2 / 4;
    }
    .signal-row {
      border-top: 1px solid var(--line);
      padding: 8px 0;
    }
    .signal-row:first-of-type { border-top: 0; padding-top: 0; }
    .signal-row p {
      margin: 3px 0 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .tag-cloud { line-height: 1.9; }
    .voice {
      border-top: 1px solid var(--line);
      padding: 10px 0;
    }
    .voice:first-child { border-top: 0; padding-top: 0; }
    .voice blockquote {
      margin: 7px 0;
      padding-left: 10px;
      border-left: 2px solid var(--blue);
      color: rgba(0, 0, 0, 0.82);
      font-size: 13px;
      line-height: 1.48;
    }
    .voice p {
      margin: 5px 0;
      color: rgba(0, 0, 0, 0.72);
      font-size: 13px;
      line-height: 1.45;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 28px;
      gap: 6px;
      padding: 5px 11px;
      border-radius: 980px;
      background: transparent;
      color: var(--blue-text);
      text-decoration: none;
      font-size: 12px;
      border: 1px solid rgba(0, 102, 204, 0.26);
      white-space: nowrap;
    }
    .btn:hover { text-decoration: underline; }
    .btn.strong {
      color: #fff;
      background: var(--blue);
      border-color: var(--blue);
      text-decoration: none;
    }
    .filters { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 8px; }
    select, input {
      min-height: 32px;
      border: 1px solid var(--line);
      border-radius: 11px;
      padding: 6px 9px;
      background: rgba(255, 255, 255, 0.78);
      color: var(--ink);
    }
    .muted { color: var(--muted); }
    .small { font-size: 11px; line-height: 1.35; }
    [hidden] { display: none !important; }
    body.comfortable main { padding-top: 28px; }
    body.comfortable section { margin-bottom: 28px; }
    body.comfortable th,
    body.comfortable td { padding: 13px 14px; font-size: 13px; }
    body.comfortable .panel,
    body.comfortable .metric,
    body.comfortable .status-strip > div { padding: 16px; }
    body.comfortable .summary-panel p,
    body.comfortable .voice p,
    body.comfortable .voice blockquote { font-size: 14px; line-height: 1.6; }
    @media (max-width: 1120px) {
      .command-dock { grid-template-columns: 1fr; }
      .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .cockpit, .two, .status-strip { grid-template-columns: 1fr; }
      .composition { grid-template-columns: 1fr; }
    }
    @media (max-width: 760px) {
      header { padding: 38px 16px 22px; }
      header h1 { text-align: left; }
      header .meta { justify-content: flex-start; }
      nav { justify-content: flex-start; padding: 0 12px; }
      main { padding: 14px 12px 40px; }
      .command-dock { padding: 10px 12px; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      table { display: block; overflow-x: auto; }
    }
  `;
}

function awesomeCss() {
  return `
    :root {
      --bg: #070807;
      --ink: #f4f7ec;
      --muted: #9aa392;
      --line: rgba(245, 255, 92, 0.18);
      --panel: #111310;
      --panel-2: #171a16;
      --volt: #f5ff5c;
      --volt-soft: #eef6a4;
      --green: #5dd97b;
      --teal: #40d0b2;
      --amber: #ffbd4a;
      --red: #ff6b5e;
      --slate: #c9d0c0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
      background:
        linear-gradient(90deg, rgba(245,255,92,.035) 1px, transparent 1px) 0 0 / 42px 42px,
        linear-gradient(0deg, rgba(245,255,92,.025) 1px, transparent 1px) 0 0 / 42px 42px,
        radial-gradient(circle at 82% -10%, rgba(245,255,92,.16), transparent 34rem),
        var(--bg);
      color: var(--ink);
      letter-spacing: 0;
    }
    header {
      min-height: 118px;
      padding: 24px 32px 18px;
      background: #050605;
      border-bottom: 1px solid var(--line);
      box-shadow: inset 0 -1px 0 rgba(245,255,92,.22);
    }
    header h1 {
      margin: 0 0 14px;
      max-width: 1080px;
      font-size: 30px;
      line-height: 1.12;
      font-weight: 900;
      color: var(--ink);
    }
    header .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    header .meta span {
      border: 1px solid rgba(245,255,92,.16);
      background: rgba(245,255,92,.04);
      padding: 5px 8px;
      border-radius: 4px;
    }
    nav {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      gap: 4px;
      align-items: center;
      padding: 10px 32px;
      background: rgba(7,8,7,.88);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(14px) saturate(160%);
    }
    nav a {
      color: var(--muted);
      text-decoration: none;
      padding: 8px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    nav a:hover { color: var(--volt); background: rgba(245,255,92,.08); }
    main { padding: 24px 32px 44px; max-width: 1600px; margin: 0 auto; }
    section { margin-bottom: 24px; }
    h2 {
      font-size: 17px;
      margin: 0 0 12px;
      color: var(--ink);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    h3 { font-size: 14px; margin: 0 0 10px; color: var(--volt-soft); }
    .notice {
      border-left: 3px solid var(--amber);
      background: rgba(255,189,74,.08);
      padding: 10px 12px;
      color: #ffe0a3;
      margin-bottom: 18px;
      line-height: 1.55;
      border-radius: 4px;
    }
    .grid { display: grid; gap: 12px; }
    .metrics { grid-template-columns: repeat(6, minmax(130px, 1fr)); }
    .cockpit { grid-template-columns: minmax(0, 1.35fr) minmax(340px, .65fr); }
    .metric, .panel {
      background: linear-gradient(180deg, rgba(245,255,92,.035), rgba(255,255,255,0) 42px), var(--panel);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 14px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
    }
    .status-strip {
      display: grid;
      grid-template-columns: 1fr 1.2fr 1fr;
      gap: 1px;
      background: var(--line);
      border: 1px solid var(--line);
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 18px;
    }
    .status-strip > div {
      background: var(--panel-2);
      padding: 14px;
      min-width: 0;
    }
    .status-strip strong {
      display: block;
      margin: 5px 0;
      font-size: 17px;
      color: var(--volt);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .status-strip p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
    .eyebrow {
      display: block;
      color: var(--muted);
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .14em;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .summary-panel p { margin: 0 0 10px; line-height: 1.75; color: var(--slate); }
    .summary-panel p:last-child { margin-bottom: 0; }
    .metric .label {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .08em;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .metric .value {
      font-size: 30px;
      font-weight: 900;
      margin-top: 8px;
      color: var(--volt);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .metric .sub { color: var(--muted); font-size: 12px; margin-top: 5px; }
    .two { grid-template-columns: 1.25fr .75fr; }
    .composition {
      display: grid;
      grid-template-columns: 180px minmax(0, 1fr);
      gap: 10px 16px;
      align-items: center;
      margin-top: 12px;
    }
    .composition strong, .composition span { display: block; }
    .composition strong { color: var(--volt-soft); }
    .composition span { color: var(--muted); font-size: 12px; margin-top: 3px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 6px;
      overflow: hidden;
    }
    th, td {
      text-align: left;
      padding: 12px 13px;
      border-bottom: 1px solid rgba(245,255,92,.12);
      vertical-align: top;
      font-size: 13px;
      color: var(--slate);
    }
    th {
      background: rgba(245,255,92,.075);
      color: var(--volt);
      font-weight: 900;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      text-transform: uppercase;
      letter-spacing: .05em;
      font-size: 11px;
    }
    tr:last-child td { border-bottom: 0; }
    tr:hover td { background: rgba(245,255,92,.035); }
    td strong { color: var(--ink); }
    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 2px 7px;
      border-radius: 999px;
      border: 1px solid rgba(245,255,92,.22);
      background: rgba(245,255,92,.06);
      color: var(--volt-soft);
      font-size: 12px;
      margin: 2px 4px 2px 0;
    }
    .tag.green { color: var(--green); border-color: rgba(93,217,123,.35); background: rgba(93,217,123,.08); }
    .tag.red { color: var(--red); border-color: rgba(255,107,94,.35); background: rgba(255,107,94,.08); }
    .tag.blue { color: var(--teal); border-color: rgba(64,208,178,.34); background: rgba(64,208,178,.08); }
    .tag.amber { color: var(--amber); border-color: rgba(255,189,74,.36); background: rgba(255,189,74,.08); }
    .tag.teal { color: var(--teal); border-color: rgba(64,208,178,.34); background: rgba(64,208,178,.08); }
    .bar { height: 8px; background: rgba(255,255,255,.08); border-radius: 0; overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--volt); }
    .bar.green span { background: var(--green); }
    .bar.red span { background: var(--red); }
    .bar.amber span { background: var(--amber); }
    .bar.teal span { background: var(--teal); }
    .stacked { display: flex; height: 14px; background: rgba(255,255,255,.08); overflow: hidden; }
    .stacked span { min-width: 2px; }
    .stacked .green { background: var(--green); }
    .stacked .blue { background: var(--teal); }
    .stacked .red { background: var(--red); }
    .stacked .teal { background: var(--teal); }
    .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 7px; color: var(--muted); font-size: 12px; }
    .legend i { display: inline-block; width: 9px; height: 9px; border-radius: 1px; margin-right: 4px; }
    .legend .green i { background: var(--green); }
    .legend .blue i { background: var(--teal); }
    .legend .red i { background: var(--red); }
    .legend .teal i { background: var(--teal); }
    .volume-cell { min-width: 110px; }
    .volume-cell strong { display: inline-block; margin-bottom: 5px; color: var(--volt); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .mini-row, .trend-row {
      display: grid;
      grid-template-columns: minmax(120px, 1fr) minmax(90px, 2fr) 42px;
      gap: 8px;
      align-items: center;
      margin: 8px 0;
      font-size: 13px;
    }
    .trend-row em { color: var(--muted); font-style: normal; font-size: 12px; grid-column: 2 / 4; }
    .signal-row { border-top: 1px solid rgba(245,255,92,.12); padding: 10px 0; }
    .signal-row:first-of-type { border-top: 0; padding-top: 0; }
    .signal-row p { margin: 4px 0 0; color: var(--slate); line-height: 1.55; }
    .tag-cloud { line-height: 2; }
    .voice { border-top: 1px solid rgba(245,255,92,.12); padding: 12px 0; }
    .voice:first-child { border-top: 0; padding-top: 0; }
    .voice blockquote {
      margin: 8px 0;
      padding-left: 10px;
      border-left: 3px solid var(--volt);
      color: var(--ink);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 9px;
      border-radius: 4px;
      background: rgba(245,255,92,.08);
      color: var(--volt);
      text-decoration: none;
      font-size: 12px;
      font-weight: 800;
      border: 1px solid rgba(245,255,92,.28);
    }
    .btn:hover { background: var(--volt); color: #111310; }
    .btn.strong {
      color: #111310;
      background: var(--volt);
      border-color: var(--volt);
      box-shadow: 0 0 0 1px rgba(245,255,92,.22), 0 0 22px rgba(245,255,92,.12);
    }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    select, input {
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 6px 8px;
      background: #090a09;
      color: var(--ink);
    }
    .muted { color: var(--muted); }
    .small { font-size: 12px; }
    @media (max-width: 980px) {
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .two, .cockpit, .status-strip { grid-template-columns: 1fr; }
      .composition { grid-template-columns: 1fr; }
      main, header, nav { padding-left: 16px; padding-right: 16px; }
      table { display: block; overflow-x: auto; }
    }
  `;
}

function metric(label, value, sub) {
  return `<div class="metric"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
}

function sentimentBar(name, value, tone) {
  return `<p><strong>${name}</strong> ${value}%</p><div class="bar ${tone}"><span style="width:${value}%"></span></div>`;
}

function stackedBar(rows, forcedTotal) {
  const total = forcedTotal || rows.reduce((sum, row) => sum + Number(row[1] || 0), 0) || 1;
  return `<div><div class="stacked">${rows.map(([name, value, tone]) => `<span class="${tone}" style="width:${Math.max(0, Number(value || 0) / total * 100)}%" title="${escapeHtml(name)} ${value}"></span>`).join('')}</div><div class="legend">${rows.map(([name, value, tone]) => `<span class="${tone}"><i></i>${escapeHtml(name)} ${value}</span>`).join('')}</div></div>`;
}

function sentimentClass(value) {
  if (String(value).includes('正面')) return 'green';
  if (String(value).includes('高风险') || String(value).includes('负面')) return 'red';
  if (String(value).includes('混合')) return 'amber';
  return 'blue';
}

function qualityStatusText() {
  if (!quality) return '未生成质量门禁';
  return quality.status === 'pass' ? '质量门禁通过' : '需要人工复核';
}

function analysisFallback(item) {
  const topic = item.primaryTopic || item.topics?.[0] || '越南玩家自发讨论';
  return `该内容归入「${topic}」，情绪为「${item.sentiment || '中性'}」。它主要用于判断越南玩家在该主题下的自然兴趣、疑问密度和未来发行前需要持续观察的认知点。`;
}

function pct(value, total) {
  if (!total) return 4;
  return Math.max(4, Math.round(Number(value || 0) / Number(total) * 100));
}

function paragraphs(text) {
  const sentences = String(text || '').split(/(?<=。)/).filter(Boolean);
  if (sentences.length <= 3) return `<p>${escapeHtml(text)}</p>`;
  const first = sentences.slice(0, 3).join('');
  const rest = sentences.slice(3).join('');
  return `<p>${escapeHtml(first)}</p><p>${escapeHtml(rest)}</p>`;
}

function label(key) {
  return ({
    naturalInterestPoints: '自然兴趣点',
    frequentQuestions: '高频疑问',
    potentialPaymentConcerns: '潜在付费关注点',
    localizationConcerns: '本地化关注点',
    communitySelfSpreadSignals: '社区自传播线索',
    preLaunchAwarenessIssues: '发行前认知问题',
  })[key] || key;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const reportHtml = html
  .replaceAll('href="reports/', 'href="../reports/')
  .replaceAll('href="topics/', 'href="../topics/');
fs.writeFileSync(`${outputDir}/reports/${report.reportWeek}.html`, reportHtml);
fs.writeFileSync(`${outputDir}/index.html`, html);
fs.copyFileSync(reportPath, `${outputDir}/weekly_report_${report.reportWeek}_real.json`);
fs.copyFileSync(structuredPath, `${outputDir}/structured_weekly_${report.reportWeek}_real.json`);
fs.copyFileSync(reportPath, `${outputDir}/weekly_report_latest.json`);
fs.copyFileSync(structuredPath, `${outputDir}/structured_weekly_latest.json`);

console.log(JSON.stringify({
  html: `${outputDir}/index.html`,
  reportJson: `${outputDir}/weekly_report_${report.reportWeek}_real.json`,
  structuredJson: `${outputDir}/structured_weekly_${report.reportWeek}_real.json`,
}, null, 2));

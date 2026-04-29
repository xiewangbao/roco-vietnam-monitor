const fs = require('fs');

const report = JSON.parse(fs.readFileSync('data/reports/weekly_report_2026-W18_real.json', 'utf8'));
const structured = JSON.parse(fs.readFileSync('data/structured/structured_weekly_2026-W18_real.json', 'utf8'));

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Roco Kingdom 越南 Facebook Group 周度舆情监测</title>
  <style>
    :root {
      --bg: #f7f8fb;
      --ink: #17202c;
      --muted: #667085;
      --line: #d9dee8;
      --panel: #ffffff;
      --blue: #1f6feb;
      --green: #18864b;
      --amber: #b7791f;
      --red: #c2413b;
      --cyan: #087990;
      --violet: #7254b6;
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
      background: #111827;
      color: white;
      padding: 20px 28px 18px;
      border-bottom: 4px solid var(--blue);
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
      background: rgba(247,248,251,.96);
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
    main { padding: 22px 28px 40px; max-width: 1440px; margin: 0 auto; }
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
    .metric, .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .metric .label { color: var(--muted); font-size: 12px; }
    .metric .value { font-size: 24px; font-weight: 700; margin-top: 6px; }
    .metric .sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
    .two { grid-template-columns: 1.3fr .7fr; }
    table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; font-size: 13px; }
    th { background: #eef2f7; color: #344054; font-weight: 700; }
    tr:last-child td { border-bottom: 0; }
    .tag { display: inline-flex; align-items: center; min-height: 22px; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--line); background: #f9fafb; font-size: 12px; margin: 2px 4px 2px 0; }
    .tag.green { color: var(--green); border-color: #a8d5bd; background: #eefaf3; }
    .tag.red { color: var(--red); border-color: #f0b6b2; background: #fff1f1; }
    .tag.blue { color: var(--blue); border-color: #bdd3ff; background: #f0f5ff; }
    .tag.amber { color: var(--amber); border-color: #ead19b; background: #fff8e6; }
    .bar { height: 9px; background: #edf0f5; border-radius: 999px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--blue); }
    .bar.green span { background: var(--green); }
    .bar.red span { background: var(--red); }
    .bar.amber span { background: var(--amber); }
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
      .two { grid-template-columns: 1fr; }
      main, header, nav { padding-left: 16px; padding-right: 16px; }
      table { display: block; overflow-x: auto; }
    }
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
    <a href="#risks">风险</a>
    <a href="#voices">玩家声音</a>
    <a href="#trends">趋势</a>
  </nav>
  <main>
    <div class="notice">${report.sourceStatus.dataCompleteness}</div>

    <section id="latest">
      <h2>本周总览</h2>
      <div class="grid two">
        <div class="panel">${report.summary}</div>
        <div class="panel">
          <h3>周选择</h3>
          <select aria-label="选择周报"><option>${report.reportWeek}</option></select>
          <p class="small muted">当前仅有首个真实抓取周。后续周报会自动进入历史列表。</p>
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
    </section>

    <section id="groups">
      <h2>Group 监测源</h2>
      <table>
        <thead><tr><th>Group</th><th>本周内容量</th><th>访问状态</th><th>数据完整性</th><th>备注</th></tr></thead>
        <tbody>
          ${report.groupSourceStatus.map(g => `<tr><td><a class="btn" href="${g.groupUrl}" target="_blank" rel="noreferrer">查看 Group</a><br>${g.groupName}</td><td>${g.weeklyContentVolume}</td><td>${g.accessStatus}</td><td>${g.dataCompleteness}</td><td>${g.notes}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>

    <section id="topics">
      <h2>热点排行</h2>
      <table>
        <thead><tr><th>排名</th><th>热点</th><th>内容量</th><th>情绪</th><th>热度</th><th>市场观察价值</th><th>代表 case</th></tr></thead>
        <tbody>
          ${report.hotTopics.map(t => `<tr><td>${t.rank}</td><td>${t.title}</td><td>${t.volume}</td><td><span class="tag blue">${t.sentiment}</span></td><td><div class="bar"><span style="width:${t.heatScore}%"></span></div></td><td>${t.marketSignalValue}</td><td>${t.representativePostUrl ? `<a class="btn" href="${t.representativePostUrl}" target="_blank" rel="noreferrer">查看原帖</a>` : '无'}</td></tr>`).join('')}
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
          ${Object.entries(report.futureVietnamLaunchSignals).map(([k, v]) => `<p><strong>${label(k)}：</strong>${Array.isArray(v) ? v.join('；') : v}</p>`).join('')}
        </div>
      </div>
    </section>

    <section id="risks">
      <h2>风险观察</h2>
      <table>
        <thead><tr><th>风险</th><th>等级</th><th>证据摘要</th><th>数量</th><th>影响判断</th><th>代表 case</th></tr></thead>
        <tbody>
          ${report.riskObservations.map(r => `<tr><td>${r.name}</td><td><span class="tag ${r.level === 'P1' ? 'red' : 'amber'}">${r.level}</span></td><td>${escapeHtml(r.evidenceSummary)}</td><td>${r.volume}</td><td>${r.impact}</td><td>${r.representativePostUrl ? `<a class="btn" href="${r.representativePostUrl}" target="_blank" rel="noreferrer">查看原帖</a>` : '无'}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>

    <section id="voices">
      <h2>代表性玩家声音</h2>
      <div class="panel">
        ${report.representativeVoices.map(v => `<div class="voice"><span class="tag blue">${v.topic}</span><span class="tag">${v.sentiment}</span><span class="tag">${v.sourceGroup}</span><blockquote>${escapeHtml(v.originalText)}</blockquote><p>${escapeHtml(v.translationZh)}</p><a class="btn" href="${v.postUrl}" target="_blank" rel="noreferrer">查看原帖</a> <span class="small muted">需 Facebook / Group 权限</span></div>`).join('')}
      </div>
    </section>

    <section id="trends">
      <h2>趋势观察</h2>
      <div class="panel">
        ${Object.values(report.trendObservation).map(x => `<p>${x}</p>`).join('')}
      </div>
    </section>

    <section>
      <h2>数据完整性说明</h2>
      <div class="panel">
        <p>${report.header.dataCompletenessNote}</p>
        <p>有效结构化内容 ${structured.items.length} 条；剔除窗口外、空文本、重复或纯媒体内容 ${structured.invalidItems.length} 条；低置信度待复核 ${structured.lowConfidenceItems.length} 条。</p>
        <p>最终展示不包含用户真实姓名、头像、主页链接或 Facebook ID。原帖按钮仅指向帖子 URL。</p>
      </div>
    </section>
  </main>
</body>
</html>`;

function metric(label, value, sub) {
  return `<div class="metric"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
}

function sentimentBar(name, value, tone) {
  return `<p><strong>${name}</strong> ${value}%</p><div class="bar ${tone}"><span style="width:${value}%"></span></div>`;
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

fs.writeFileSync('site/index.html', html);
fs.copyFileSync('data/reports/weekly_report_2026-W18_real.json', 'site/weekly_report_2026-W18_real.json');
fs.copyFileSync('data/structured/structured_weekly_2026-W18_real.json', 'site/structured_weekly_2026-W18_real.json');

console.log(JSON.stringify({
  html: 'site/index.html',
  reportJson: 'site/weekly_report_2026-W18_real.json',
  structuredJson: 'site/structured_weekly_2026-W18_real.json',
}, null, 2));

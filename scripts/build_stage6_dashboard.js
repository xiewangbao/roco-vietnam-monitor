const fs = require('fs');

const reportPath = process.argv[2] || 'data/reports/weekly_report_2026-W18_real.json';
const structuredPath = process.argv[3] || 'data/structured/structured_weekly_2026-W18_real.json';
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const structured = JSON.parse(fs.readFileSync(structuredPath, 'utf8'));
const outputDir = process.env.OUTPUT_DIR || 'site';
const dashboardTheme = process.env.DASHBOARD_THEME || 'default';
const allowDraftDashboard = process.env.ALLOW_DRAFT_DASHBOARD === '1';
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

if (quality && quality.status !== 'pass' && !allowDraftDashboard) {
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
const maxReportValid = Math.max(...availableReports.map((item) => item.valid), 1);
const isAppleTheme = dashboardTheme === 'apple';
const topInteractivePosts = getTopInteractivePosts();

function interactionDock() {
  if (!isAppleTheme) return '';
  return `<aside class="command-dock" aria-label="Dashboard controls">
    <div class="dock-section report-switcher">
      <div class="report-copy">
        <span class="eyebrow">Report</span>
        <strong>${periodFullLabel(report.reportWeek)}</strong>
        <p>${escapeHtml(report.timeRange.start)} - ${escapeHtml(report.timeRange.end)}</p>
      </div>
      <details class="report-menu">
        <summary>切换报告</summary>
        <div class="report-popover">
          <div class="report-popover-head">
            <strong>历史报告</strong>
            <span>按有效内容量排序展示</span>
          </div>
          ${availableReports.map((r) => `<a class="report-option ${r.week === report.reportWeek ? 'active' : ''}" href="${r.file}" ${r.week === report.reportWeek ? 'aria-current="page"' : ''}><span>${periodFullLabel(r.week)}</span><div class="bar"><span style="width:${pct(r.valid, maxReportValid)}%"></span></div><strong>${r.valid}</strong></a>`).join('')}
        </div>
      </details>
    </div>
    <label class="dock-search">
      <span>全局搜索</span>
      <input id="globalSearch" type="search" placeholder="搜索 topic / group / 风险 / 隐藏语料" autocomplete="off" />
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
    const corpusSection = document.getElementById('corpusSearch');
    const corpusMeta = document.getElementById('corpusSearchMeta');
    const corpusResults = document.getElementById('corpusSearchResults');
    const densityToggle = document.getElementById('densityToggle');
    const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
    const reportMenu = document.querySelector('.report-menu');
    let activeFilter = 'all';
    let corpusRecords = null;
    let corpusLoading = null;

    const corpusBasePath = location.pathname.includes('/reports/') || location.pathname.includes('/topics/')
      ? '../corpus/'
      : 'corpus/';

    function searchableRows() {
      return Array.from(document.querySelectorAll('tbody tr, .voice, .top-post, .signal-row, .topic-brief'));
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
      applyCorpusSearch(q);
    }

    async function loadCorpusRecords() {
      if (corpusRecords) return corpusRecords;
      if (corpusLoading) return corpusLoading;
      corpusLoading = fetch(corpusBasePath + 'manifest.json')
        .then((res) => res.ok ? res.json() : Promise.reject(new Error('manifest_missing')))
        .then(async (manifest) => {
          const reports = manifest.reports || [];
          const datasets = await Promise.all(reports.map((entry) => fetch(corpusBasePath + entry.file)
            .then((res) => res.ok ? res.json() : { records: [] })
            .catch(() => ({ records: [] }))));
          corpusRecords = datasets.flatMap((dataset) => dataset.records || []);
          return corpusRecords;
        })
        .catch(() => {
          corpusRecords = [];
          return corpusRecords;
        });
      return corpusLoading;
    }

    function corpusText(record) {
      return [
        record.reportWeek,
        record.recordType,
        record.sourceGroup,
        record.originalText,
        record.translationZh,
        record.primaryTopic,
        ...(record.topics || []),
        ...(record.riskLabels || []),
        record.sentiment,
      ].filter(Boolean).join(' ').toLowerCase();
    }

    function corpusPreview(text, q) {
      const raw = String(text || '').replace(/\\s+/g, ' ').trim();
      if (!raw) return '';
      const index = raw.toLowerCase().indexOf(q.toLowerCase());
      const start = index > 24 ? index - 24 : 0;
      const preview = raw.slice(start, start + 180);
      return (start > 0 ? '...' : '') + preview + (raw.length > start + 180 ? '...' : '');
    }

    function renderCorpusResults(q, records) {
      if (!corpusSection || !corpusResults || !corpusMeta) return;
      if (!q || q.length < 2) {
        corpusSection.hidden = true;
        corpusResults.innerHTML = '';
        corpusMeta.textContent = '';
        return;
      }
      const hits = records
        .filter((record) => corpusText(record).includes(q))
        .slice(0, 30);
      corpusSection.hidden = false;
      corpusMeta.textContent = hits.length
        ? '显示前 ' + hits.length + ' 条命中；语料库为隐藏检索索引，不在页面默认外显。'
        : '未在隐藏语料库中找到匹配内容。';
      corpusResults.innerHTML = hits.map((record) => {
        const type = record.recordType === 'comment' ? '评论' : '帖子';
        const topics = (record.topics || []).slice(0, 2).map((topic) => '<span class="tag blue">' + escapeHtmlJs(topic) + '</span>').join('');
        const risks = (record.riskLabels || []).slice(0, 2).map((risk) => '<span class="tag red">' + escapeHtmlJs(risk) + '</span>').join('');
        return '<article class="corpus-hit" data-bucket="' + (record.recordType === 'comment' ? 'comment' : 'topic') + '">'
          + '<div class="corpus-hit-meta"><span class="tag">' + escapeHtmlJs(record.reportWeek) + '</span><span class="tag">' + type + '</span><span class="tag">' + escapeHtmlJs(record.sourceGroup || '未知 Group') + '</span>' + topics + risks + '</div>'
          + '<blockquote>' + escapeHtmlJs(corpusPreview(record.originalText, q)) + '</blockquote>'
          + (record.translationZh ? '<p><strong>翻译：</strong>' + escapeHtmlJs(record.translationZh) + '</p>' : '')
          + '<div class="corpus-hit-foot"><span>' + escapeHtmlJs(record.sentiment || '未分类') + '</span><a class="btn" href="' + encodeURI(record.postUrl || '#') + '" target="_blank" rel="noreferrer">查看原帖</a></div>'
          + '</article>';
      }).join('');
    }

    function escapeHtmlJs(value) {
      return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function applyCorpusSearch(q) {
      if (!q || q.length < 2) {
        renderCorpusResults('', []);
        return;
      }
      loadCorpusRecords().then((records) => renderCorpusResults(q, records));
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
    document.addEventListener('click', (event) => {
      if (reportMenu && !reportMenu.contains(event.target)) reportMenu.open = false;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && reportMenu) reportMenu.open = false;
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

function genericTranslation(text = '') {
  return /该内容|直译需结合|可用于判断|短句\/昵称式|疑似风险内容|内容讨论活动|玩家询问任务如何完成/.test(text);
}

function normalizedText(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function displayTranslation(item) {
  const original = String(item.originalText || '').trim();
  const current = String(item.translationZh || '').trim();
  const t = normalizedText(original);
  const directRules = [
    [/con nao cung duoc.*dk|con nao cung dc/, '哪只都可以，对吧？'],
    [/lan dau dung bong lang kinh.*khong can suy nghi/, '第一次用棱镜球，不用犹豫。'],
    [/giai cuu|cuu em|cứu/i, '救救我/帮帮我。'],
    [/than lua.*ib/, '我有火神，私信我。'],
    [/ai co 2 con nay.*cho minh ke|co 2 con nay.*cho.*ke/, '谁有这两只，能让我蹭一下吗？'],
    [/ai co con nay.*cho minh ke|ai co.*cho minh ke/, '谁有这只，能让我蹭一下吗？'],
    [/co ca 2 ne ban|co ca 2/, '这两只我都有，朋友。'],
    [/cho tui xin 1 qua.*add fr/, '给我一个吧，我已经加好友了。'],
    [/may cho nay.*kiem.*khong ra|may cho nay.*kiem ko ra/, '这些地方我找不到，大家帮帮我。'],
    [/mac do truong.*len tau/, '穿上学校服装，然后上船，兄弟。'],
    [/ko a ban|khong a ban/, '不是哦/没有哦，朋友。'],
    [/where can i get this purple token/i, '这个紫色代币在哪里获得？'],
    [/only buy/i, '只能购买。'],
    [/no bi loi|bi loi/, '它出 bug 了吗？'],
    [/ai giup san shiny|san shiny/, '谁能帮我刷闪光？赛季快结束了我还没有刷到。'],
    [/cai nay kiem o dau|kiem o dau|hoa nay.*o dau|lay o dau/, '在问这个东西在哪里获得。'],
    [/con lai chac.*biet roi/, '剩下的你应该知道了。'],
    [/como fazer.*quest/i, '这个任务怎么做？'],
    [/meu nick.*add/i, '我的游戏昵称是这个，想加我一起玩可以来找我。'],
    [/minh co nay.*bat|mình có/i, '我有这个，你要抓吗？'],
    [/ai giup.*vs|giup mik|giup minh/, '谁能帮帮我？'],
    [/map nay mo sao/, '这个地图怎么开启？'],
    [/loi nay la sao/, '这个错误是怎么回事？'],
    [/nem gi.*xin chi/, '要扔什么？请教一下。'],
    [/trong balo.*cong thuc/, '进背包打开配方就能制作。'],
    [/sk nay la sao|skill nay la sao/, '这个技能是什么意思？'],
    [/quest xanh la cay/, '做绿色任务。'],
    [/o nui tuyet|len nui tuyet/, '在雪山，绕一绕/去采就能找到。'],
    [/co nha ap.*trong hoa/, '有孵化屋的话可以进去种花；没有的话可能需要看攻略找位置。'],
    [/nang sao len/, '升星就可以。'],
    [/dang 2 con tho/, '在问兔子的二形态/星级。'],
    [/trong o nha/, '种在他家里。'],
    [/ngoi sao xanh|ngoi sao mau xanh/, '去拿蓝色星星。'],
    [/gui kb|da gui kb/, '已经发送好友申请了。'],
    [/long vu/, '在问这个羽毛在哪里获得。'],
    [/pokemon.*toan chay|cu.*chay/, '在问为什么自己的宠物总是逃跑。'],
    [/chia khoa.*lay o dau/, '在问这些钥匙在哪里获得。'],
    [/tinh the xanh.*cu meo/, '在问开启猫头鹰所需的蓝色晶体在哪里。'],
    [/an du trai cay.*lv/, '吃够水果就能升级。'],
    [/xuong rong.*chay/, '在问为什么仙人掌使用技能后总是逃跑。'],
    [/dr ong.*chi ap trung|chi ap trung thoi/, '对，只需要孵蛋。'],
    [/thiet ko|thiet khong/, '真的假的？'],
    [/xin no\b|xin n[oơ]\b/, '求一个/想要这个，具体物品需结合原帖上下文确认。'],
    [/hat soi.*cho minh bat ke|cho minh bat ke/, '谁有这个宠物/道具，让我蹭一下捕捉吧。'],
    [/vo map|nha ng|nha nguoi|bat ke/, '想进别人地图或借好友资源来捕捉/完成任务。'],
    [/nhiem vu|nvu| nv |lam sao|lam nhu nao/, '在问任务怎么做或下一步该怎么完成。'],
    [/tien hoa|tien hoá/, '在问宠物怎么进化。'],
    [/di mau|shiny|ap trung|trung/, '在聊异色/闪光、孵蛋或宠物培育。'],
    [/battle pass|gem pass|monthly|nap|top up/, '在问 Battle Pass、月卡、充值或付费渠道。'],
    [/dang nhap|login/, '在问怎么登录游戏。'],
    [/cap quyen|quyen app|may tinh/, '在问电脑/设备授权或权限提示。'],
    [/qu[eê]n ten|quen ten/, '在问忘记名称或账号信息怎么找回。'],
    [/ban ve|mua ib|ban acc|mua acc/, '在发布或询问私下交易，需要作为风险内容复核。'],
  ];
  const matched = directRules.find(([pattern]) => pattern.test(t) || pattern.test(original));
  const translation = matched
    ? matched[1]
    : (!genericTranslation(current) && current ? current : `大意：${conversationBrief(item)}`);
  return {
    translation,
    brief: conversationBrief(item),
  };
}

function conversationBrief(item) {
  const text = normalizedText(item.originalText || '');
  const topics = item.topics || [item.primaryTopic].filter(Boolean);
  if (/ban ve|mua ib|ban acc|mua acc|nap|top up/.test(text) || topics.includes('诈骗、外挂、私服、黑产风险')) return '交易、充值或非官方渠道，需作为风险样本复核。';
  if (/giai cuu|cuu em|giup|help|lam sao|nhiem vu|nvu/.test(text) || topics.includes('玩法机制')) return '求助任务步骤、机制规则或完成方法。';
  if (/bat ke|vo map|add fr|friend|cho tui xin|cho minh ke/.test(text) || topics.includes('社群互动、组队、公会')) return '借宠、加好友、进地图和互助完成任务。';
  if (/tien hoa|di mau|shiny|ap trung|trung|con nay|pet/.test(text) || topics.includes('宠物、角色、养成')) return '宠物获取、进化、异色/闪光和养成搭配。';
  if (/dang nhap|cap quyen|redmi|may tinh|may /.test(text) || topics.includes('Bug、闪退、卡顿、登录问题')) return '登录、设备兼容或权限提示。';
  if (topics.includes('充值、付费、礼包')) return '付费、礼包、Battle Pass 或充值入口。';
  return item.recordType === 'comment' ? '简短求助、确认或跟帖互动。' : '发起问题、求助或分享。';
}

function topicCommentSummary(topicItems) {
  const comments = topicItems.filter((item) => item.recordType === 'comment');
  const base = comments.length ? comments : topicItems;
  const counts = {};
  for (const item of base) {
    const key = conversationBrief(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  const parts = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!parts.length) return '暂无足够文本判断评论区讨论重点。';
  const source = comments.length ? `评论区共 ${comments.length} 条可见评论，` : '该 topic 可见内容中，';
  return `${source}主要在聊：${parts.map(([k, v]) => `${k}（${v} 条）`).join('；')}。`;
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
  const rows = topicItems.slice(0, 80).map((item, index) => {
    const translated = displayTranslation(item);
    return `<tr><td>${index + 1}</td><td>${item.recordType === 'comment' ? '评论' : '帖子'}</td><td>${escapeHtml(item.sourceGroup)}</td><td><span class="tag ${sentimentClass(item.sentiment)}">${escapeHtml(item.sentiment)}</span></td><td>${escapeHtml(item.originalText)}</td><td class="translation-cell"><p>${escapeHtml(translated.translation)}</p><span>${escapeHtml(translated.brief)}</span></td><td><a class="btn" href="${item.postUrl}" target="_blank" rel="noreferrer">查看原帖</a></td></tr>`;
  }).join('');
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
    <section><h2>评论区在聊什么</h2><div class="panel"><p>${escapeHtml(topicCommentSummary(topicItems))}</p></div></section>
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
    <a href="#topics">热点</a>
    <a href="#comments">评论</a>
    <a href="#risks">风险</a>
    <a href="#top-posts">高互动帖子</a>
    <a href="#trends">趋势</a>
  </nav>
  ${interactionDock()}
  <main>
    ${quality && quality.status !== 'pass' ? `<div class="notice"><strong>数据质量需要复核：</strong>${quality.issues.map((issue) => issue.title).join('；')}。本轮不应直接视为完整成品，请先确认是否重跑、加深评论或接受可见样本。</div>` : ''}

    <section id="corpusSearch" class="corpus-search" hidden>
      <h2>隐藏语料库检索结果</h2>
      <div class="panel">
        <p class="small muted" id="corpusSearchMeta"></p>
        <div class="corpus-results" id="corpusSearchResults"></div>
      </div>
    </section>

    <section id="latest">
      <h2>本周总览</h2>
      <div class="panel summary-panel">${summaryOverview(report)}</div>
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

    <section id="topics">
      <h2>热点排行</h2>
      <table>
        <thead><tr><th>排名</th><th>热点</th><th>内容量</th><th>情绪</th><th>分析 / case</th></tr></thead>
        <tbody>
          ${report.hotTopics.map(t => `<tr data-bucket="topic"><td>${t.rank}</td><td><strong>${escapeHtml(t.title)}</strong><p class="small muted">${escapeHtml(t.notes || '')}</p></td><td><div class="volume-cell"><strong>${t.volume}</strong><div class="bar"><span style="width:${pct(t.volume, latestMaxTopicVolume)}%"></span></div></div></td><td><span class="tag ${sentimentClass(t.sentiment)}">${escapeHtml(t.sentiment)}</span></td><td>${t.volume >= 10 ? `<a class="btn strong" href="${topicDetailHref(t.title)}">查看二级分析</a>` : (t.representativePostUrl ? `<a class="btn" href="${t.representativePostUrl}" target="_blank" rel="noreferrer">查看原帖</a>` : '无')}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>

    <section>
      <h2>未来越南发行参考信号</h2>
      <div class="panel">
        ${Object.entries(report.futureVietnamLaunchSignals).map(([k, v]) => `<div class="signal-row"><strong>${label(k)}</strong><p>${escapeHtml(Array.isArray(v) ? v.join('；') : v)}</p></div>`).join('')}
      </div>
    </section>

    <section id="comments">
      <h2>评论舆情</h2>
      <div class="panel comments-panel">
        <div class="comment-head">
          <div>
            <h3>评论情绪</h3>
            <div class="comment-stats">${Object.entries(report.commentOpinion?.sentimentSummary || {}).map(([k, v]) => `<span><strong>${escapeHtml(k)}</strong>${v}</span>`).join('')}</div>
          </div>
          <div>
            <h3>评论热点</h3>
            <div class="tag-cloud compact-tags">${(report.commentOpinion?.topCommentTopics || []).map(t => `<span class="tag blue">${escapeHtml(t.topic)} ${t.count}</span>`).join('')}</div>
          </div>
        </div>
        <p class="small muted comment-limit">${(report.commentOpinion?.limitations || []).join(' ')}</p>
        <h3>代表评论</h3>
        <div class="comment-list">
          ${(report.commentOpinion?.representativeComments || []).map((v) => {
            const translated = displayTranslation({
              ...v,
              recordType: 'comment',
              topics: [v.topic].filter(Boolean),
              primaryTopic: v.topic,
            });
            return `<div class="voice compact-voice" data-bucket="comment"><div><span class="tag">${escapeHtml(v.sentiment)}</span><span class="tag blue">${escapeHtml(v.topic)}</span></div><blockquote>${escapeHtml(v.originalText)}</blockquote><p><strong>翻译：</strong>${escapeHtml(translated.translation)}</p><p class="small muted">${escapeHtml(translated.brief)}</p>${v.analysisZh ? `<p><strong>分析：</strong>${escapeHtml(v.analysisZh)}</p>` : ''}<a class="btn" href="${v.postUrl}" target="_blank" rel="noreferrer">查看原帖</a></div>`;
          }).join('')}
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

    <section id="top-posts">
      <h2>高互动帖子 Top 3</h2>
      <div class="top-posts">
        ${topInteractivePosts.length
          ? topInteractivePosts.map((v, index) => {
            const translated = displayTranslation({
              ...v,
              recordType: 'post',
              topics: [v.topic].filter(Boolean),
              primaryTopic: v.topic,
            });
            return `<article class="top-post" data-bucket="topic"><div class="top-post-head"><span class="rank-badge">#${index + 1}</span><span class="tag blue">${escapeHtml(v.topic)}</span><span class="tag">${escapeHtml(v.sentiment)}</span><span class="tag">${escapeHtml(v.sourceGroup)}</span><strong>${v.interactionTotal} 总互动</strong></div><div class="interaction-line"><span>赞/反应 ${v.reactionCount}</span><span>评论 ${v.commentCount}</span><span>分享 ${v.shareCount}</span></div><blockquote>${escapeHtml(v.originalText)}</blockquote><p><strong>翻译：</strong>${escapeHtml(translated.translation)}</p><p class="small muted">${escapeHtml(translated.brief)}</p><p><strong>分析：</strong>${escapeHtml(v.analysisZh)}</p><a class="btn" href="${v.postUrl}" target="_blank" rel="noreferrer">查看原帖</a> <span class="small muted">需 Facebook / Group 权限</span></article>`;
          }).join('')
          : `<div class="panel empty-state"><strong>当前期缺少可验证的转赞评字段</strong><p>高互动帖子按 reaction + comment + share 排序。当前结构化数据中这三个字段为空，因此不展示替代排名，避免把“可见讨论量”误当作互动量。下次抓取补齐互动字段后，本模块会自动展示 Top 3 原帖翻译和分析。</p></div>`}
      </div>
    </section>

    <section id="trends">
      <h2>趋势观察</h2>
      <div class="grid two">
        <div class="panel trend-list">
          ${availableReports.map((r) => `<div class="trend-row"><span>${periodFullLabel(r.week)}</span><div class="bar"><span style="width:${pct(r.valid, maxReportValid)}%"></span></div><strong>${r.valid}</strong><em>健康 ${r.health} / 发行 ${r.launch}</em></div>`).join('')}
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
      grid-template-columns: minmax(360px, .9fr) minmax(260px, 1fr) auto auto;
      gap: 10px;
      align-items: center;
      padding: 10px 24px;
      background: rgba(245, 245, 247, 0.78);
      border-bottom: 1px solid var(--line);
      backdrop-filter: saturate(180%) blur(20px);
    }
    .report-switcher {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      min-width: 0;
    }
    .report-copy {
      min-width: 0;
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
    .report-menu {
      position: relative;
      justify-self: end;
    }
    .report-menu summary {
      list-style: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 32px;
      padding: 0 13px;
      border-radius: 980px;
      background: var(--blue);
      color: #fff;
      font-size: 12px;
      font-weight: 650;
      cursor: pointer;
      user-select: none;
      box-shadow: 0 8px 20px rgba(0, 113, 227, 0.22);
      white-space: nowrap;
    }
    .report-menu summary::-webkit-details-marker {
      display: none;
    }
    .report-menu[open] summary {
      background: #005bb5;
    }
    .report-popover {
      position: absolute;
      top: calc(100% + 10px);
      right: 0;
      z-index: 60;
      width: min(420px, calc(100vw - 32px));
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.16);
      backdrop-filter: saturate(180%) blur(20px);
    }
    .report-popover::before {
      content: "";
      position: absolute;
      top: -6px;
      right: 28px;
      width: 12px;
      height: 12px;
      background: rgba(255, 255, 255, 0.96);
      border-left: 1px solid var(--line);
      border-top: 1px solid var(--line);
      transform: rotate(45deg);
    }
    .report-popover-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding: 4px 4px 8px;
      border-bottom: 1px solid var(--line);
      margin-bottom: 6px;
    }
    .report-popover-head strong {
      font-size: 13px;
      line-height: 1.2;
    }
    .report-popover-head span {
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
    }
    .report-option {
      display: grid;
      grid-template-columns: minmax(118px, 1fr) minmax(104px, 1.1fr) 42px;
      gap: 8px;
      align-items: center;
      padding: 9px 8px;
      border-radius: 10px;
      color: var(--ink);
      text-decoration: none;
      font-size: 12px;
    }
    .report-option:hover,
    .report-option.active {
      background: rgba(0, 113, 227, 0.08);
    }
    .report-option span {
      font-weight: 650;
      white-space: nowrap;
    }
    .report-option strong {
      text-align: right;
      font-size: 13px;
      font-weight: 700;
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
    .summary-headline {
      padding: 10px 12px;
      border-radius: 11px;
      background: rgba(0, 113, 227, 0.08);
      color: var(--ink);
      font-size: 15px;
      line-height: 1.45;
      font-weight: 650;
      margin-bottom: 10px;
    }
    .summary-block {
      border-top: 1px solid var(--line);
      padding-top: 10px;
      margin-top: 10px;
    }
    .summary-findings {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .summary-finding {
      min-width: 0;
      padding: 9px;
      border-radius: 10px;
      background: rgba(245, 245, 247, 0.72);
      border: 1px solid var(--line);
    }
    .summary-finding strong {
      display: block;
      font-size: 13px;
      line-height: 1.3;
      margin-bottom: 5px;
    }
    .summary-finding p {
      font-size: 12px;
      line-height: 1.45;
    }
    .summary-clusters {
      display: grid;
      gap: 6px;
    }
    .summary-cluster {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(220px, .72fr);
      gap: 10px;
      align-items: start;
      padding: 8px 0;
      border-top: 1px solid var(--line);
    }
    .summary-cluster:first-child { border-top: 0; padding-top: 0; }
    .summary-cluster strong {
      display: block;
      font-size: 13px;
      margin-bottom: 3px;
    }
    .summary-cluster p {
      font-size: 12px;
      line-height: 1.4;
    }
    .cluster-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      justify-content: flex-end;
    }
    .cluster-meta span {
      min-height: 22px;
      padding: 3px 7px;
      border-radius: 980px;
      background: rgba(0, 0, 0, 0.055);
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
    }
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
    .translation-cell p {
      margin: 0 0 4px;
      color: var(--ink);
      font-size: 12px;
      line-height: 1.42;
    }
    .translation-cell span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.35;
    }
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
    .comments-panel {
      overflow: hidden;
    }
    .comment-head {
      display: grid;
      grid-template-columns: minmax(220px, .45fr) minmax(0, 1fr);
      gap: 12px;
      align-items: start;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--line);
      margin-bottom: 8px;
    }
    .comment-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .comment-stats span {
      display: inline-flex;
      align-items: baseline;
      gap: 5px;
      min-height: 28px;
      padding: 4px 10px;
      border-radius: 980px;
      background: rgba(0, 0, 0, 0.055);
      color: var(--muted);
      font-size: 13px;
    }
    .comment-stats strong {
      color: var(--ink);
      font-size: 14px;
      font-weight: 650;
    }
    .compact-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      line-height: 1.2;
    }
    .compact-tags .tag {
      margin: 0;
      max-width: 100%;
    }
    .comment-limit {
      margin: 4px 0 10px;
    }
    .comment-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .top-posts {
      display: grid;
      gap: 10px;
    }
    .top-post {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 13px;
      background: rgba(255, 255, 255, 0.74);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
    }
    .top-post-head {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      margin-bottom: 8px;
    }
    .top-post-head strong {
      margin-left: auto;
      color: var(--ink);
      font-size: 13px;
    }
    .rank-badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 3px 8px;
      border-radius: 999px;
      background: var(--ink);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
    }
    .interaction-line {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-bottom: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .interaction-line span {
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.055);
    }
    .top-post blockquote {
      margin: 7px 0;
      padding-left: 10px;
      border-left: 2px solid var(--blue);
      color: rgba(0, 0, 0, 0.82);
      font-size: 13px;
      line-height: 1.5;
    }
    .top-post p {
      margin: 6px 0;
      color: rgba(0, 0, 0, 0.72);
      font-size: 13px;
      line-height: 1.48;
    }
    .empty-state {
      color: var(--muted);
    }
    .empty-state strong {
      color: var(--ink);
      display: block;
      margin-bottom: 5px;
    }
    .compact-voice {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 9px;
      background: rgba(245, 245, 247, 0.62);
      min-width: 0;
    }
    .compact-voice:first-child {
      border-top: 1px solid var(--line);
      padding-top: 9px;
    }
    .compact-voice blockquote,
    .compact-voice p {
      overflow-wrap: anywhere;
    }
    .corpus-search {
      scroll-margin-top: 150px;
    }
    .corpus-results {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 8px;
    }
    .corpus-hit {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 9px;
      background: rgba(245, 245, 247, 0.66);
    }
    .corpus-hit-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 6px;
    }
    .corpus-hit blockquote {
      margin: 6px 0;
      padding-left: 10px;
      border-left: 2px solid var(--blue);
      color: rgba(0, 0, 0, 0.82);
      font-size: 13px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .corpus-hit p {
      margin: 5px 0;
      color: rgba(0, 0, 0, 0.68);
      font-size: 12px;
      line-height: 1.42;
    }
    .corpus-hit-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
      margin-top: 6px;
    }
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
      .report-switcher { grid-template-columns: minmax(0, 1fr) auto; }
      .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .cockpit, .two, .status-strip { grid-template-columns: 1fr; }
      .summary-findings, .summary-cluster { grid-template-columns: 1fr; }
      .cluster-meta { justify-content: flex-start; }
      .comment-head, .comment-list, .corpus-results { grid-template-columns: 1fr; }
      .composition { grid-template-columns: 1fr; }
    }
    @media (max-width: 760px) {
      header { padding: 38px 16px 22px; }
      header h1 { text-align: left; }
      header .meta { justify-content: flex-start; }
      nav { justify-content: flex-start; padding: 0 12px; }
      main { padding: 14px 12px 40px; }
      .command-dock { padding: 10px 12px; }
      .report-switcher { grid-template-columns: 1fr; }
      .report-menu { justify-self: stretch; }
      .report-menu summary { width: 100%; }
      .report-popover { left: 0; right: auto; width: min(100%, calc(100vw - 24px)); }
      .report-popover::before { right: auto; left: 28px; }
      .report-option { grid-template-columns: minmax(110px, 1fr) minmax(80px, .8fr) 34px; }
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

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getTopInteractivePosts() {
  const posts = (structured.items || [])
    .filter((item) => item.recordType === 'post' && item.postUrl)
    .map((item) => {
      const reactionCount = numberOrNull(item.reactionCount);
      const commentCount = numberOrNull(item.commentCount);
      const shareCount = numberOrNull(item.shareCount);
      if (reactionCount === null && commentCount === null && shareCount === null) return null;
      return {
        originalText: item.originalText,
        translationZh: item.translationZh,
        analysisZh: item.analysisZh || analysisFallback(item),
        sentiment: item.sentiment,
        topic: item.primaryTopic || item.topics?.[0] || '其他',
        sourceGroup: item.sourceGroup,
        postUrl: item.postUrl,
        reactionCount: reactionCount || 0,
        commentCount: commentCount || 0,
        shareCount: shareCount || 0,
        interactionTotal: (reactionCount || 0) + (commentCount || 0) + (shareCount || 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.interactionTotal - a.interactionTotal);
  return posts.slice(0, 3);
}

function periodLabel(week) {
  const labels = {
    '2026-W18': '第 1 期',
    '2026-W19': '第 2 期',
    '2026-P3': '第 3 期',
  };
  return labels[week] || week;
}

function periodFullLabel(week) {
  const label = periodLabel(week);
  return label === week ? escapeHtml(week) : `${escapeHtml(label)} / ${escapeHtml(week)}`;
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

function summaryOverview(data) {
  if (!data.summaryHeadline && !Array.isArray(data.keyFindings) && !Array.isArray(data.discussionClusters)) {
    return paragraphs(data.summary);
  }
  const findings = (data.keyFindings || []).slice(0, 5).map((finding) => `
    <article class="summary-finding">
      <strong>${escapeHtml(finding.title)}</strong>
      <p>${escapeHtml(finding.evidence)}</p>
      <p class="muted">${escapeHtml(finding.marketMeaning)}</p>
    </article>
  `).join('');
  const clusters = (data.discussionClusters || []).slice(0, 5).map((cluster) => `
    <div class="summary-cluster" data-bucket="topic">
      <div>
        <strong>${escapeHtml(cluster.topic)}</strong>
        <p>${escapeHtml(cluster.playerFocus)}</p>
      </div>
      <div class="cluster-meta">
        <span>${cluster.volume} 条</span>
        <span>${cluster.posts} 帖 / ${cluster.comments} 评论</span>
        <span>${escapeHtml(cluster.sentiment)}</span>
        <span>${escapeHtml(cluster.marketSignalValue)}</span>
      </div>
    </div>
  `).join('');
  return `
    <div class="summary-headline">${escapeHtml(data.summaryHeadline || '')}</div>
    <div class="summary-block">
      <h3>关键发现</h3>
      <div class="summary-findings">${findings || paragraphs(data.summary)}</div>
    </div>
    <div class="summary-block">
      <h3>主要讨论聚类</h3>
      <div class="summary-clusters">${clusters || '<p class="muted">暂无稳定聚类</p>'}</div>
    </div>
  `;
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
  .replaceAll('href="topics/', 'href="../topics/')
  .replaceAll('value="reports/', 'value="../reports/');
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

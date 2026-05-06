set groupUrls to {"https://www.facebook.com/groups/1410112269781852/", "https://www.facebook.com/groups/roco.legend/", "https://www.facebook.com/groups/1729046980837718/", "https://www.facebook.com/groups/3072730653028573/", "https://www.facebook.com/groups/947481474801675/", "https://www.facebook.com/groups/3223551104630521/"}

on jsString(s)
	set AppleScript's text item delimiters to "\\"
	set parts to text items of s
	set AppleScript's text item delimiters to "\\\\"
	set s to parts as text
	set AppleScript's text item delimiters to "\""
	set parts to text items of s
	set AppleScript's text item delimiters to "\\\""
	set s to parts as text
	set AppleScript's text item delimiters to linefeed
	set parts to text items of s
	set AppleScript's text item delimiters to "\\n"
	set s to parts as text
	set AppleScript's text item delimiters to ""
	return "\"" & s & "\""
end jsString

set collectorJs to "
(() => {
  const canonical = (href) => {
    try {
      const u = new URL(href, location.href);
      u.search = '';
      u.hash = '';
      return u.href;
    } catch (_) {
      return href || '';
    }
  };
  const isPostUrl = (href) => /\\/groups\\/[^/]+\\/posts\\/[^/?#]+/.test(href || '');
  const isCommentUrl = (href) => isPostUrl(href) && /[?&]comment_id=/.test(href || '');
  const controlWords = new Set([
    '赞', '回复', '分享', '查看翻译', '隐藏翻译', '留下心情', '发表公开评论…',
    '输入回答…', '查看更多评论', '查看全部', '展开', '写点什么...', '匿名发帖',
    '感受/活动', '投票'
  ]);
  const noisy = (line) => {
    const t = line.trim();
    if (!t) return true;
    if (controlWords.has(t)) return true;
    if (/^\\d+$/.test(t)) return true;
    if (/^\\d+条回复$/.test(t)) return true;
    if (/^(\\d+\\s*分钟|\\d+\\s*小时|\\d+\\s*天|昨天|星期|4月|5月|6月|7月|8月|9月|10月|11月|12月)/.test(t)) return true;
    if (/^(邀请|分享|已加入|简介|讨论|用户|活动|影音内容|文件|精选)$/.test(t)) return true;
    if (/可对这篇帖子执行的操作/.test(t)) return true;
    return false;
  };
  const getTimeLabel = (text) => {
    const m = text.match(/(^|\\n)(\\d+\\s*分钟|\\d+\\s*小时|\\d+\\s*天|昨天|星期[^\\n]*|[0-9]{1,2}月[0-9]{1,2}日[^\\n]*)/);
    return m ? m[2].trim() : null;
  };
  const getLanguage = (text) => {
    if (/[\\u4e00-\\u9fff]/.test(text) && /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text)) return 'mixed';
    if (/[\\u4e00-\\u9fff]/.test(text)) return 'zh';
    if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text)) return 'vi';
    if (/[a-z]/i.test(text)) return 'en';
    return 'unknown';
  };
  const articles = [...document.querySelectorAll('[role=article]')];
  return JSON.stringify({
    pageTitle: document.title,
    pageUrl: location.href,
    sortLabels: [...document.querySelectorAll('[role=button],button')]
      .map(b => (b.innerText || b.getAttribute('aria-label') || '').trim())
      .filter(Boolean)
      .filter(t => /排序|最相关|新帖子|近期动态|Newest|Recent|Relevant/.test(t))
      .slice(0, 10),
    records: articles.map((a, idx) => {
      const text = a.innerText || '';
      const links = [...a.querySelectorAll('a[href]')].map(x => x.href);
      const postUrl = canonical((links.find(h => isPostUrl(h) && !isCommentUrl(h)) || links.find(h => isPostUrl(h)) || ''));
      const commentUrl = canonical((links.find(h => isCommentUrl(h)) || ''));
      const rawLines = text.split('\\n').map(x => x.trim()).filter(Boolean);
      const looksLikePost = text.includes('发表公开评论') || text.includes('输入回答') || text.includes('查看更多评论') || rawLines.includes('·') || rawLines.includes('  ·');
      const contentLines = [];
      for (const line of rawLines.slice(1)) {
        if (looksLikePost && /^(查看更多评论|发表公开评论|输入回答|查看.*回复|赞|回复|分享)$/.test(line)) break;
        if (looksLikePost && /^\\d+$/.test(line)) break;
        if (!noisy(line) && line !== '·' && line !== '  ·') contentLines.push(line);
      }
      const contentText = contentLines.join('\\n').slice(0, 4000);
      const hasMoreComments = /查看更多评论|查看.*评论/.test(text);
      return {
        domIndex: idx,
        inferredType: looksLikePost ? 'post' : 'comment',
        postUrl,
        commentUrl,
        timeLabel: getTimeLabel(text),
        contentText,
        contentLanguage: getLanguage(contentText),
        hasImage: !!a.querySelector('img'),
        hasVideo: !!a.querySelector('video'),
        hasLink: links.some(h => !h.includes('facebook.com') && !h.includes('fbcdn.net')),
        visibleTextLength: text.length,
        hasMoreComments,
        captureQuality: postUrl ? 'has_post_url' : 'missing_post_url'
      };
    }).filter(r => r.contentText || r.postUrl)
  });
})();
"

set sortJs to "
(() => {
  const buttons = [...document.querySelectorAll('[role=button],button')];
  const sortButton = buttons.find(b => ((b.innerText || b.getAttribute('aria-label') || '').trim()).startsWith('小组动态排序方式'))
    || buttons.find(b => /最相关|近期动态|新帖子|Relevant|Recent|Newest/.test((b.innerText || b.getAttribute('aria-label') || '').trim()));
  if (!sortButton) return 'sort_button_not_found';
  sortButton.click();
  return 'sort_button_clicked';
})();
"

set newestJs to "
(() => {
  const candidates = [...document.querySelectorAll('[role=menuitemradio], [role=menuitem], [role=option], [role=button], span, div')];
  const target = candidates.find(el => {
    const t = (el.innerText || el.getAttribute('aria-label') || '').trim();
    const role = el.getAttribute('role') || '';
    return (role === 'menuitemradio' && t.startsWith('新帖子')) || t === '新帖子' || /Newest|New posts/i.test(t);
  });
  if (!target) return 'newest_option_not_found';
  target.click();
  return 'newest_option_clicked';
})();
"

set expandJs to "
(() => {
  let clicked = 0;
  const labels = /查看更多|展开|查看更多评论|查看.*回复|See more|View more|Xem thêm/i;
  for (const el of [...document.querySelectorAll('[role=button],button,span,div')]) {
    const t = (el.innerText || el.getAttribute('aria-label') || '').trim();
    if (labels.test(t) && clicked < 12) {
      try { el.click(); clicked++; } catch (_) {}
    }
  }
  return 'expanded_' + clicked;
})();
"

tell application "Safari"
	activate
	if (count of documents) = 0 then make new document
	set output to "["
	set firstItem to true
	repeat with u in groupUrls
		set URL of front document to (u as text)
		delay 8
		try
			do JavaScript "window.scrollTo(0, 0); 'top';" in front document
			delay 1
		end try
		try
			do JavaScript sortJs in front document
			delay 1
			do JavaScript newestJs in front document
			delay 4
		end try
		repeat with i from 1 to 8
			try
				do JavaScript expandJs in front document
			end try
			delay 1
			try
				do JavaScript "window.scrollBy(0, Math.floor(window.innerHeight * 1.2)); 'scrolled';" in front document
			end try
			delay 2
		end repeat
		try
			do JavaScript expandJs in front document
		end try
		delay 2
		set payload to do JavaScript collectorJs in front document
		if firstItem is false then set output to output & ","
		set output to output & payload
		set firstItem to false
	end repeat
	set output to output & "]"
	return output
end tell

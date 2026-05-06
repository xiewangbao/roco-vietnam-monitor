on splitText(theText, theDelimiter)
	set oldDelimiters to AppleScript's text item delimiters
	set AppleScript's text item delimiters to theDelimiter
	set theItems to text items of theText
	set AppleScript's text item delimiters to oldDelimiters
	return theItems
end splitText

on run argv
	if (count of argv) < 1 then error "Usage: osascript scripts/safari_comment_deep_crawl.applescript <post-url-file>"
	set urlFile to item 1 of argv
	set rawText to read POSIX file urlFile
	set postUrls to splitText(rawText, linefeed)
	
	set collectorJs to "
(() => {
  const canonical = (href) => {
    try { const u = new URL(href, location.href); u.search = ''; u.hash = ''; return u.href; }
    catch (_) { return href || ''; }
  };
  const language = (text) => {
    if (/[\\u4e00-\\u9fff]/.test(text) && /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text)) return 'mixed';
    if (/[\\u4e00-\\u9fff]/.test(text)) return 'zh';
    if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text)) return 'vi';
    if (/[a-z]/i.test(text)) return 'en';
    return 'unknown';
  };
  const noisy = (line) => {
    const t = line.trim();
    if (!t || t === '赞' || t === '回复' || t === '分享' || t === '查看翻译' || t === '留下心情') return true;
    if (/^\\d+$/.test(t)) return true;
    if (/^\\d+\\s*(分钟|小时|天)$/.test(t)) return true;
    if (/^(发表公开评论|写评论|查看更多|查看.*回复|隐藏或举报|已编辑)$/.test(t)) return true;
    return false;
  };
  const timeLabel = (text) => {
    const m = text.match(/(^|\\n)(\\d+\\s*分钟|\\d+\\s*小时|\\d+\\s*天|昨天|星期[^\\n]*|[0-9]{1,2}月[0-9]{1,2}日[^\\n]*)/);
    return m ? m[2].trim() : null;
  };
  const articles = [...document.querySelectorAll('[role=article]')];
  const records = [];
  for (const [idx, a] of articles.entries()) {
    const text = a.innerText || '';
    const links = [...a.querySelectorAll('a[href]')].map(x => x.href);
    const commentUrl = links.find(h => /[?&]comment_id=/.test(h || '')) || '';
    if (!commentUrl) continue;
    const lines = text.split('\\n').map(x => x.trim()).filter(Boolean).filter(line => !noisy(line));
    if (lines.length <= 1) continue;
    const contentText = lines.slice(1).join('\\n').slice(0, 3000);
    if (!contentText) continue;
    records.push({
      domIndex: idx,
      inferredType: 'comment',
      postUrl: canonical(location.href),
      commentUrl: canonical(commentUrl),
      timeLabel: timeLabel(text),
      contentText,
      contentLanguage: language(contentText),
      hasImage: !!a.querySelector('img'),
      hasVideo: !!a.querySelector('video'),
      hasLink: links.some(h => !h.includes('facebook.com') && !h.includes('fbcdn.net')),
      captureQuality: 'has_post_url'
    });
  }
  return JSON.stringify({ pageTitle: document.title, pageUrl: location.href, records });
})();
"
	
	set expandJs to "
(() => {
  let clicked = 0;
  const patterns = /查看更多评论|查看更多回复|查看.*回复|查看更多|展开|View more comments|View more replies|See more|Xem thêm/i;
  const nodes = [...document.querySelectorAll('[role=button],button,span,div')];
  for (const el of nodes) {
    const t = (el.innerText || el.getAttribute('aria-label') || '').trim();
    if (patterns.test(t) && clicked < 20) {
      try { el.scrollIntoView({block:'center'}); el.click(); clicked++; } catch (_) {}
    }
  }
  return 'clicked_' + clicked;
})();
"
	
	tell application "Safari"
		activate
		if (count of documents) = 0 then make new document
		set output to "["
		set firstItem to true
		repeat with u in postUrls
			set postUrl to (u as text)
			if length of postUrl > 10 then
				set URL of front document to postUrl
				delay 7
				repeat with i from 1 to 8
					try
						do JavaScript expandJs in front document
					end try
					delay 1
					try
						do JavaScript "window.scrollBy(0, Math.floor(window.innerHeight * 0.9)); 'scroll';" in front document
					end try
					delay 1
				end repeat
				try
					do JavaScript "window.scrollTo(0, 0); 'top';" in front document
				end try
				delay 1
				try
					do JavaScript expandJs in front document
				end try
				delay 1
				set payload to do JavaScript collectorJs in front document
				if firstItem is false then set output to output & ","
				set output to output & payload
				set firstItem to false
			end if
		end repeat
		set output to output & "]"
		return output
	end tell
end run

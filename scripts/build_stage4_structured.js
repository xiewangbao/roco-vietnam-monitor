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
  /^[A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,3}\s*\)?$/,
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
    .filter((line) => !/^越南\s*·/.test(line))
    .map((line) => line.replace(/\bid\s*\d+\b/gi, 'id[已脱敏]'))
    .map((line) => line.replace(/\b\d{6,}\b/g, '[数字ID已脱敏]'))
    .map((line) => line.replace(/…\s*展开/g, ''))
    .map((line) => line.replace(/\b[A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,3}\b(?=\s+(được|mình|bạn|có|không|ko|k\b|đẹp|thấy))/g, '[用户名已脱敏]'))
    .join('\n')
    .trim();
}

function inRange(rawTimeLabel, text) {
  if (/[234]\s*年|2022年|2023年|2024年|2025年/.test(text)) return 'out_of_range';
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
  if (/[\u4e00-\u9fff]/.test(text) && !/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text)) return text.replace(/\n?\d+\s*周$/, '');
  if (/内容暂时无法显示/.test(text)) return '原帖部分内容已不可见，可能是作者调整分享范围、删除内容或平台限制导致；可见部分显示作者计划持续发布宠物知识、通关方法或科普视频。';
  if (/làm đc 1sao|còn 2sao/.test(t)) return '已经完成 1 星了，剩下 2 星要怎么做？';
  if (/solo.*boss|kéo boss/.test(t)) return '你是自己单挑 Boss，还是有人进来帮你带 Boss？';
  if (/cày.*acc.*pass|cho acc/.test(t)) return '你要不要帮忙代练/刷？我这里有带通行证的账号。';
  if (/đag chs|đang chơi|thấy.*ổn/.test(t)) return '正在玩，感觉整体还可以。';
  if (/để đôi khi câu trả lời có hiệu quả|cầu vua|cầu màu/.test(t)) return '作者表示自己做了一个工具/角色，用来让回答偶尔更有效；如果商人刷新出稀有道具，比如王球、彩球等，也可以用来辅助判断。';
  if (/má ơi.*5p.*2con/.test(t)) return '天啊，5 分钟出了 2 只，太幸运了。';
  if (/ngăn.*bạn.*biết|có thể bạn chưa biết/.test(t)) return '科普/提醒向内容：介绍一些玩家可能还不知道的宠物故事、行为或机制。';
  if (/nhập đại.*vài lần/.test(t)) return '随便输入/尝试几次就行，我前阵子也刚遇到过。';
  if (/bán kiểu gì/.test(t)) return '这个要怎么卖/怎么交易？';
  if (/nhiu b|bao nhiêu b/.test(t)) return '多少钱？';
  if (/nhấp vào nút.*hướng dẫn/.test(t)) return '点击按钮后会出现指引。';
  if (/^ib nè$/.test(t)) return '来私信吧。';
  if (/cuối cùng.*đủ/.test(t)) return '终于凑够了。';
  if (/nhi[ệe]m vụ.*làm sao|nhiện vụ.*làm sao/.test(t)) return '这个任务要怎么做？';
  if (/ném.*tinh linh.*ánh sáng.*bay.*trái tim/.test(t)) return '把光系、飞行系和爱心/心形相关精灵投放到 3 个星星位置。';
  if (/mở cổng/.test(t)) return '有人知道这里的门要怎么打开吗？';
  if (/huhu.*kẹt/.test(t)) return '我也卡住了，它好像提示需要某个东西。';
  if (/b[ée]m.*trái tim.*ngôi sao đỏ/.test(t)) return '把爱心系/心形相关的宠物投到红色星星那里。';
  if (/trò chơi của 3 ng/.test(t)) return '哦不是，现在是 3 人小游戏/三人玩法。';
  if (/kB tui|\[数字ID已脱敏\].*tui/.test(t)) return '加我好友。';
  if (/tui có con bướm/.test(t)) return '我有这只蝴蝶宠物。';
  if (/hóng ké/.test(t)) return '我也蹲一下/想顺便跟着看看。';
  if (/lại gần người muốn vào.*icon.*m[ũủ]i tên/.test(t)) return '靠近想进入的玩家，点对方名字，会出现一个带箭头的图标，再点它向对方申请。';
  if (/xổ mũi.*lưỡi/.test(t)) return '一开始以为这只宠物流鼻涕，后来才发现那其实是它的舌头。';
  if (/cái này làm sao/.test(t)) return '这个要怎么做？';
  if (/thu thap 120|thu thập 120/.test(t)) return '收集 120 只精灵后会解锁。';
  if (/tên anh ấy là.*dimo|hướng dẫn.*thú cưng/.test(t)) return '这只宠物叫 Dimo；作者在讲如何正确使用这只宠物，并附了更多说明图片。';
  if (/vua cánh thánh|cách sử dụngla ẩn|la ẩn/.test(t)) return '攻略内容：关于如何击败圣翼王，以及如何使用 La Ẩn。';
  if (/mấy tấm gương.*giải sao|thử hoài/.test(t)) return '这些镜子机关要怎么解？试了很多次还是解不开。';
  if (/thứ tự 12341|chiều kim đồng hồ/.test(t)) return '按 1-2-3-4-1 的顺序来，大致顺着顺时针绕两圈就可以。';
  if (/xem cho vui|mới kiếm thấy/.test(t)) return '大家随便看看，刚找到的有趣内容。';
  if (/shiny.*cầu mùa|cầu mùa.*shiny|màu đen bạc/.test(t)) return '大家问一下：如果抓到 shiny，再使用季节球，会不会变成黑银配色？还是必须先孵蛋，再使用季节球才会出那个颜色？';
  if (/chia s[eẽ] cho mn|trộm vía/.test(t)) return '分享给大家：今天运气不错，有一些值得晒的收获。';
  if (/làm sao ra được.*màu đen|màu đen đó/.test(t)) return '这个黑色/深色配色要怎么弄出来？';
  if (/nghiện lắm/.test(t)) return '太上头了，很容易沉迷。';
  if (/mới chơi.*shiny|khó kiếm shiny|ngang nhau/.test(t)) return '我是新手，想问这些宠物里有没有哪只更强、而且 shiny 更难刷？还是它们强度和稀有度都差不多？';
  if (/team.*sao b/.test(t)) return '这只宠物能不能放进“流星/陨星”体系队伍里？';
  if (/như nhau.*team 6 pet|bóng 7 màu|đổi màu/.test(t)) return '大体差不多。6 宠队伍里每只都有克制关系；这些主要是换色形态，后面用了七彩球之类的道具后，很多宠物都会变成这种外观。';
  if (/shiny.*xó|chỉ số/.test(t)) return '感觉 shiny 宠物很多都只是放着收藏，很少真拿来用，数值表现不太理想。';
  if (/lặp lại.*chiêu/.test(t)) return '它好像会重复刚才用过的几个技能。';
  if (/tưởng.*virus|vius|ngọc kem/.test(t)) return '一开始还以为是病毒/异常，结果其实是 Ngọc Kem 相关内容。';
  if (/help anh em|không hiểu/.test(t)) return '求助各位，这个任务到底怎么做？我没看懂。';
  if (/hai cái này.*sắp hết mùa/.test(t)) return '这两个任务要怎么做？快到赛季结束了，求救。';
  if (/thiệt ko|thiệt không|thật không/.test(t)) return '真的假的？';
  if (/vpn.*trung|中国节点/.test(t)) return '需要把 VPN 切到中国节点。';
  if (/bật vpn/.test(t)) return '你有开 VPN 吗？';
  if (/full skill/.test(t)) return '有人可以给我这只宠物的完整技能信息吗？';
  if (/ủng h[ộo].*kênh|vt.tiktok|tiktok/.test(t)) return '玩家在请求大家支持/关注自己的频道，并附带 TikTok 链接或兑换码信息。';
  if (/skill này là sao/.test(t)) return '想问这个技能是什么意思、具体怎么触发或使用？';
  if (/đồng hồ cát/.test(t)) return '想问这个沙漏道具在哪里获取？';
  if (/2 nhỏ này.*cho ké|mấy pet này.*cho.*ké|cho e ké|cho ké/.test(t)) return '有人有这几只宠物吗？想借用/蹭一下完成捕捉或任务。';
  if (/tui ké nữa/.test(t)) return '我也想一起蹭/借用。';
  if (/hạt dê/.test(t)) return '我这里目前只有“羊/山羊”相关的种子或道具。';
  if (/ok nhé ae/.test(t)) return '看起来还不错，给大家参考。';
  if (/đi săn.*chụp.*đẹp/.test(t)) return '去刷/狩猎的时候无意中截到这张图，感觉很好看。';
  if (/xắp xếp pet|sắp xếp pet|dps|sup|genshin|wuwa/.test(t)) return '想问这款游戏的宠物队伍是否像 Genshin/WuWa 那样分 DPS、辅助等定位来搭配。';
  if (/pokemon.*genshin/.test(t)) return '这款游戏更像宝可梦类型，和 Genshin 的玩法不一样。';
  if (/thuần buff/.test(t)) return '有的，看到一些队伍是偏纯增益/辅助路线的。';
  if (/phải lmj|phải làm gì|tiếp.*ko bt|tiếp.*không biết/.test(t)) return '接下来要做什么？我想了很久，和它对话之后还是不知道下一步。';
  if (/chỉ tôi.*cấp 31|chỉ.*qua được/.test(t)) return '请教一下这个怎么过，我卡了很久，还是升不到 31 级。';
  if (/ai chỉ mình|giúp.*với/.test(t)) return '有人可以教我/帮我看一下这个怎么做吗？';
  if (/đăng nhập game|chỉ newbie/.test(t)) return '请教一下怎么登录游戏；希望有人私信教一下我这种新手。';
  if (/k chọn pet đánh|không chọn pet đánh/.test(t)) return '为什么我不能选择宠物出战？';
  if (/mấy cái này tăng gì/.test(t)) return '这些东西分别提升什么属性？';
  if (/thả roco ra ngoài|thả một lúc 6 con/.test(t)) return '每次把 Roco 放出去会提升什么？另外想知道怎样在每次登录时一次放出 6 只。';
  if (/2 con trong 1 tiếng|hết vận may/.test(t)) return '一小时出了两只，感觉这周的运气都用完了。';
  if (/cái đầu tiên.*chờ đợi/.test(t)) return '等了这么多天，终于出了第一个。';
  if (/ấp.*lv1.*lv22.*shiny/.test(t)) return '从家园 1 级孵到 22 级，还是一个 shiny 都没出。';
  if (/bắt map.*3 con thỏ/.test(t)) return '在地图里抓的时候直接出了 3 只兔子。';
  if (/biến thành hình dạng người khác/.test(t)) return '如果想变成别人的外观/形态，应该怎么操作？';
  if (/không chọn.*nhân vật khác|k chọn.*nhân vật khác/.test(t)) return '目前好像还不能选择其他角色。';
  if (/huyền thải.*shiny/.test(t)) return '这个应该叫“幻彩/闪光效果”，不算真正的 shiny。';
  if (/con nào cũng mạnh|quan trọng.*team/.test(t)) return '每只都可以很强，关键看你玩什么队伍体系。';
  if (/mũi tên.*ném ra ngoài/.test(t)) return '这个箭头不是属性提升，而是表示当前被派出去/丢出去的宠物。';
  if (/cái này ném con/.test(t)) return '这个地方应该派哪只宠物出去？';
  if (/nên chọn.*dàn pet/.test(t)) return '大家觉得这组宠物里应该选哪一只？';
  if (/tiêu diệt npc|suy luận.*trường hợp/.test(t)) return '攻略内容：如何击败 NPC。作者提示大家要学会从一个案例推导到其他类似 NPC，后续也可以套用这个方法。';
  if (/thông tin.*thú cưng|phối kỹ năng/.test(t)) return '内容整理了宠物信息和技能搭配方式。';
  if (/còn cái file/.test(t)) return '还有人保留这个文件吗？';
  if (/抖音那个帖子/.test(text)) return text.replace(/\n?\d+\s*周$/, '');
  if (/不过孵蛋/.test(text)) return text.replace(/\n?\d+\s*周$/, '');
  if (/con nấm.*tích điểm sao rơi|rời sân/.test(t)) return '想问队伍里用于“星落积分/陨星”体系的蘑菇宠物，有没有可以离场并换其他宠物上场的技能？';
  if (/để phòng khi bạn không biết/.test(t)) return '给还不知道的玩家做一个提醒/科普。';
  if (/bản global|khi nào.*global/.test(t)) return '想问什么时候会有全球版。';
  if (/khả năng.*global|phục vụ nội địa/.test(t)) return '不确定会不会有全球版；目前没有消息，可能因为它一直更偏中国本土游戏。';
  if (/xin bé.*trả phí/.test(t)) return '有人能借/给我这只宠物吗？可以付费。';
  if (/add qua bắt thoải mái/.test(t)) return '加我之后可以过来随便抓。';
  if (/giải thích chỉ số pvp/.test(t)) return '这是在解释 PVP 数值/属性。';
  if (/what day coming out/.test(t)) return '什么时候上线？';
  if (/bao nhiêu bóng.*1k bóng/.test(t)) return '这只大概要多少球才能出？我跟着蹭抓已经用了 1000 多个球还没出。';
  if (/ra shiny.*cầu mùa.*đen bạc/.test(t)) return '出 shiny 后再用季节球/棱镜球，是否能 100% 变成黑银配色？';
  if (/trên bili.*đội hình/.test(t)) return '有人提到 Bilibili 上有几套可参考的队伍配置。';
  if (/không dùng bili/.test(t)) return '对方表示自己不用 Bilibili。';
  if (/đẹp thật|đẹp nhất/.test(t)) return '确实好看/这个黑色闪光外观最好看。';
  if (/build.*ok/.test(t)) return '我这样配队/培养下来感觉还挺可以。';
  if (/đánh con boss/.test(t)) return '这是用来打这个 Boss 的。';
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
  return inferTranslation(text, topicList, risks);
}

function inferTranslation(text, topicList, risks) {
  const topic = topicList[0] || '越南玩家自发讨论';
  const riskNote = risks.length ? `；同时触发「${risks.join('、')}」风险标签` : '';
  if (text.length <= 4 || /^[A-ZÀ-ỹa-z\s._)]+$/.test(text) && text.split(/\s+/).length <= 3) {
    return `短句/昵称式内容，直译需要结合图片或评论上下文复核；可判断为「${topic}」相关互动${riskNote}。`;
  }
  if (topic === '宠物、角色、养成') return `该内容在讨论宠物养成细节，直译需结合图片或上下文复核；核心关注点是宠物获取、异色/配色、强度或养成路径${riskNote}。`;
  if (topic === '玩法机制') return `该内容在询问玩法或任务机制，直译需结合图片或上下文复核；核心诉求是看懂任务条件、找到完成方法或确认机制规则${riskNote}。`;
  if (topic === '社群互动、组队、公会') return `该内容在寻求社区互助，直译需结合图片或上下文复核；主要需求是借宠、进好友地图、组队或通过社群降低任务门槛${riskNote}。`;
  if (topic === '充值、付费、礼包') return `该内容涉及付费或礼包相关问题，直译需结合图片或上下文复核；需要观察其对充值入口、Battle Pass、月卡或第三方渠道的认知${riskNote}。`;
  if (topic === '诈骗、外挂、私服、黑产风险') return `疑似风险内容，直译需结合原帖复核；需要重点关注是否涉及私下交易、账号买卖、充值引流或垃圾广告${riskNote}。`;
  if (topic === '攻略分享') return `该内容属于攻略/经验交流，直译需结合图片或上下文复核；体现新手对强度、获取难度和培养优先级的判断需求${riskNote}。`;
  return `该内容为玩家自发讨论，直译需结合图片或上下文复核；可用于判断社区活跃度、兴趣扩散和潜在发行前认知${riskNote}。`;
}

function analyzeItem(text, topicList, risks, itemSentiment) {
  const topic = topicList[0] || '越南玩家自发讨论';
  const riskPart = risks.length ? `风险上需关注「${risks.join('、')}」，避免其在发行前形成错误渠道或非官方认知。` : '暂未触发高风险标签，主要作为自然兴趣和需求观察。';
  const sentimentPart = `情绪为「${itemSentiment}」，说明这条内容更偏${itemSentiment === '正面' ? '兴趣表达或经验分享' : itemSentiment === '负面' ? '挫败、求助或使用障碍' : itemSentiment === '混合' ? '一边有兴趣一边存在困惑' : '信息询问和中性交流'}。`;
  if (topic === '宠物、角色、养成') return `${sentimentPart} 这类内容说明越南玩家对宠物外观、稀有度、进化、强度和队伍搭配已经有较深讨论，未来发行前可作为核心兴趣点和内容教育重点。${riskPart}`;
  if (topic === '玩法机制') return `${sentimentPart} 这类内容反映任务说明、机制理解或活动目标存在学习成本，适合作为未来越南本地化说明、FAQ 和新手引导的观察信号。${riskPart}`;
  if (topic === '社群互动、组队、公会') return `${sentimentPart} 这类内容体现玩家愿意通过 Group 借宠、组队或互助完成目标，说明社区自传播和互助结构已经自然出现。${riskPart}`;
  if (topic === '充值、付费、礼包') return `${sentimentPart} 这类内容代表潜在付费兴趣，但也容易连接到第三方充值、账号交易或礼包误导，需要在未来发行前持续观察。${riskPart}`;
  if (topic === 'Bug、闪退、卡顿、登录问题') return `${sentimentPart} 这类内容是设备兼容、权限、登录或性能问题的早期信号，不等于正式越南区问题，但对未来技术预期管理有参考价值。${riskPart}`;
  if (topic === '诈骗、外挂、私服、黑产风险') return `${sentimentPart} 这类内容应优先作为社区风险样本，不应作为正常玩家需求解读。${riskPart}`;
  if (topic === '攻略分享') return `${sentimentPart} 这类内容说明新手正在主动寻找强度评价、获取路径和培养优先级，有助于判断越南玩家的内容学习曲线。${riskPart}`;
  return `${sentimentPart} 这类内容体现越南玩家的自然讨论温度，可用于判断社区活跃度、兴趣扩散和潜在发行前认知。${riskPart}`;
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
  const itemTranslation = translate(cleaned, itemTopics, risks);
  if (/玩家自发讨论：|玩家在讨论|玩家在询问|疑似风险内容/.test(itemTranslation)) lowReasons.push('自动翻译为规则推断，重点引用前建议人工复核');
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
    translationZh: itemTranslation,
    analysisZh: analyzeItem(cleaned, itemTopics, risks, itemSentiment),
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

const thresholds = {
  minValidItems: Number(process.env.MIN_VALID_ITEMS || 50),
  minCommentItems: Number(process.env.MIN_COMMENT_ITEMS || 20),
  minRecordsPerActiveGroup: Number(process.env.MIN_RECORDS_PER_GROUP || 5),
  expectedGroups: Number(process.env.EXPECTED_GROUPS || raw.sourceGroups.length),
  maxLowConfidenceRate: Number(process.env.MAX_LOW_CONFIDENCE_RATE || 0.4),
};
const commentItems = items.filter((item) => item.recordType === 'comment');
const structuredGroupCounts = (raw.sourceGroups || []).map((group) => ({
  groupName: group.groupName,
  rawRecordCount: group.capturedRecordCount,
  structuredItemCount: items.filter((item) => item.sourceGroup === group.groupName).length,
}));
const lowConfidenceRate = items.length ? lowConfidenceItems.length / items.length : 1;
const blockingReasons = [];

if (items.length < thresholds.minValidItems) {
  blockingReasons.push(`有效内容 ${items.length} 条，低于阈值 ${thresholds.minValidItems} 条`);
}
if (commentItems.length < thresholds.minCommentItems) {
  blockingReasons.push(`评论样本 ${commentItems.length} 条，低于阈值 ${thresholds.minCommentItems} 条`);
}
if (structuredGroupCounts.filter((group) => group.structuredItemCount > 0).length < thresholds.expectedGroups) {
  blockingReasons.push(`结构化后活跃 Group 不足 ${thresholds.expectedGroups} 个`);
}
const lowVolumeGroups = structuredGroupCounts.filter((group) => group.structuredItemCount < thresholds.minRecordsPerActiveGroup);
if (lowVolumeGroups.length) {
  blockingReasons.push(`部分 Group 结构化内容低于阈值：${lowVolumeGroups.map((group) => `${group.groupName} ${group.structuredItemCount}`).join('；')}`);
}

const readyForWeeklyReport = blockingReasons.length === 0;

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
  qualityGate: {
    status: readyForWeeklyReport ? 'pass' : 'blocked',
    thresholds,
    summary: {
      validItems: items.length,
      commentItems: commentItems.length,
      lowConfidenceItems: lowConfidenceItems.length,
      lowConfidenceRate: Number(lowConfidenceRate.toFixed(3)),
      structuredActiveGroups: structuredGroupCounts.filter((group) => group.structuredItemCount > 0).length,
      expectedGroups: thresholds.expectedGroups,
      groupCounts: structuredGroupCounts,
    },
    blockingReasons,
    warnings: lowConfidenceRate > thresholds.maxLowConfidenceRate
      ? [`低置信内容占比 ${(lowConfidenceRate * 100).toFixed(1)}%，高于观察阈值 ${(thresholds.maxLowConfidenceRate * 100).toFixed(1)}%，重点引用前需人工复核。`]
      : [],
  },
  readyForWeeklyReport,
  readyForWeeklyReportReason: readyForWeeklyReport
    ? '真实 raw 数据已完成清洗、主题、情绪和风险结构化，且达到正式周报最低质量阈值。'
    : `未达到正式周报最低质量阈值：${blockingReasons.join('；')}`,
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

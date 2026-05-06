# Data Quality Review - 2026-W19

Status: needs_user_review

## Summary

- Valid items: 23
- Posts: 16
- Comments: 7
- Comment rate: 30.4%
- Active Groups: 6/6
- Failure/gap records: 3

## Issues

### [high] 有效内容量低于阈值

- Code: LOW_VALID_CONTENT
- Detail: 本轮有效内容 23 条，低于阈值 50 条。
- Recommended action: 先不要把本轮报告当作完整周结论；和用户确认是否按单 Group 重跑、加深滚动或接受可见样本。

### [high] 评论样本量不足

- Code: LOW_COMMENT_SAMPLE
- Detail: 本轮评论样本 7 条，低于阈值 20 条。
- Recommended action: 优先执行帖子详情页评论加深抓取；如仍不足，向用户说明评论覆盖缺口后再决定是否出报告。

### [medium] 部分 Group 内容量异常低

- Code: LOW_GROUP_VOLUME
- Detail: Cong Hoi Roco Kingdom Viet Nam: 1；Roco Kingdom: World Viet Nam Official: 1；ROCO KINGDOM VN: 2；ROCO KINGDOM VIET NAM: 2；Roco Kingdom Mobile Viet Nam: 2
- Recommended action: 先向用户反馈低量 Group 清单；必要时按这些 Group 单独重跑。

### [medium] 存在抓取缺口日志

- Code: CRAWL_GAPS
- Detail: 本轮失败/缺口记录 3 条。
- Recommended action: 查看 failure JSONL，确认是否评论折叠、权限变化、选择器变化或网络中断。


## Group Volumes

| Group | Records | Failures | Status |
|---|---:|---:|---|
| Roco Kingdom Viet Nam | 22 | 3 | ok |
| Cong Hoi Roco Kingdom Viet Nam | 1 | 0 | low_volume |
| Roco Kingdom: World Viet Nam Official | 1 | 0 | low_volume |
| ROCO KINGDOM VN | 2 | 0 | low_volume |
| ROCO KINGDOM VIET NAM | 2 | 0 | low_volume |
| Roco Kingdom Mobile Viet Nam | 2 | 0 | low_volume |

## Rule

If status is needs_user_review, pause before treating the run as final and discuss remediation options with the user.

# Stage 3 - Weekly Monitoring Pipeline

Project: Roco Kingdom Vietnam Facebook Group weekly monitoring

Status: stage 3 draft for user confirmation.

## Confirmed Monitoring Sources

All 6 confirmed Groups are included in the formal monitoring pool. Safari access check on 2026-04-29 confirmed that the account is logged in, can view posts, and has joined each public Group.

| Group | URL | Permission Status | Monitoring Status |
|---|---|---|---|
| Roco Kingdom Viet Nam | https://www.facebook.com/groups/1410112269781852/ | joined, public group | active |
| Cong Hoi Roco Kingdom Viet Nam | https://www.facebook.com/groups/roco.legend/ | joined, public group | active |
| Roco Kingdom: World Viet Nam Official | https://www.facebook.com/groups/1729046980837718/ | joined, public group | active |
| ROCO KINGDOM VN | https://www.facebook.com/groups/3072730653028573/ | joined, public group | active |
| ROCO KINGDOM VIET NAM | https://www.facebook.com/groups/947481474801675/ | joined, public group | active |
| Roco Kingdom Mobile Viet Nam | https://www.facebook.com/groups/3223551104630521/ | joined, public group | active |

Note: The word "Official" in a Group name is treated as a source claim, not as verified official status.

## Weekly Execution Window

Default schedule: every Friday.

Default review range:

- Start: previous Friday 00:00:00
- End: current Thursday 23:59:59
- Timezone: Asia/Shanghai unless configured otherwise

Each raw JSON file must include the actual computed time range. The crawler must not infer data for missing periods.

## Browser Automation Flow

1. Open Safari or a persistent browser profile that contains the authorized Facebook session.
2. For each Group, verify access state:
   - logged in
   - joined or public-view access
   - feed visible
   - no checkpoint, CAPTCHA, rate-limit, or permission wall
3. Scroll the discussion feed with low frequency and jitter.
4. Sort the Group feed by newest posts before scrolling whenever the UI supports it. In the Chinese UI this corresponds to selecting `新帖子` instead of `最相关`; in other locales use the equivalent newest-first option. This reduces crawl volume and avoids relevance-ranked ordering hiding recent posts.
5. Stop when posts older than the weekly range are repeatedly observed.
6. Open each candidate post detail page when possible.
7. Expand long post text.
8. Extract post-level fields.
9. Expand comments and replies.
10. Extract comment-level fields.
11. Normalize, deduplicate, anonymize, and write weekly raw JSON.
12. Write failure and gap logs for every inaccessible Group, post, or comment section.

## Required Raw Fields

Post item fields:

- `recordType`: `post`
- `groupName`
- `groupUrl`
- `postUrl`
- `anonymousContentId`
- `anonymousAuthorId`
- `publishedAt`
- `text`
- `contentLanguage`
- `reactionCount`
- `commentCount`
- `shareCount`
- `hasImage`
- `hasVideo`
- `hasLink`
- `mediaTypes`
- `crawlTime`
- `dataSource`: `browser_automation`
- `permissionStatus`
- `crawlStatus`
- `failureReason`
- `dataCompleteness`

Comment item fields:

- `recordType`: `comment`
- `groupName`
- `groupUrl`
- `postUrl`
- `parentPostId`
- `parentCommentId`
- `commentDepth`
- `anonymousContentId`
- `anonymousAuthorId`
- `publishedAt`
- `text`
- `contentLanguage`
- `reactionCount`
- `crawlTime`
- `dataSource`
- `permissionStatus`
- `crawlStatus`
- `failureReason`
- `dataCompleteness`

## Deduplication Logic

Post dedupe key order:

1. Canonical post URL.
2. Facebook post ID parsed from URL when available.
3. Fallback hash: `groupUrl + normalizedText + publishedAtBucket`.

Comment dedupe key order:

1. Canonical comment URL or comment ID when available.
2. `postUrl + parentCommentId + normalizedText + publishedAtBucket`.

Normalization:

- Trim whitespace.
- Collapse repeated whitespace.
- Preserve Vietnamese diacritics.
- Preserve Chinese text.
- Do not remove emojis before raw storage.

## Anonymous ID Logic

Use a project-specific secret salt stored outside the report and website layers.

Content ID:

```text
anonymousContentId = sha256(projectSalt + recordType + groupUrl + postUrl + parentCommentId + normalizedText)
```

Author ID:

```text
anonymousAuthorId = sha256(projectSalt + rawAuthorStableKey)
```

Raw author names, profile links, avatars, and Facebook IDs must not enter the weekly raw JSON intended for analysis and reporting. If temporary author fields are needed for hash generation, they must be kept in an access-restricted debug store with a cleanup policy.

## Post URL Extraction

Preferred sources:

1. Timestamp permalink in the post card.
2. Post detail URL after opening a post.
3. Share/copy-link menu when available.
4. DOM link matching `/groups/{groupId}/posts/{postId}` or `permalink`.

The stored URL must point to the post, not to a user profile.

## Failure Log Structure

Each run writes `logs/crawl_failures_{reportWeek}.jsonl`.

Fields:

- `runId`
- `reportWeek`
- `groupName`
- `groupUrl`
- `targetType`
- `targetUrl`
- `status`
- `failureReason`
- `missingFields`
- `expectedCount`
- `capturedCount`
- `impact`
- `needsHumanPermission`
- `crawlTime`
- `notes`

Failure reason enum:

- `login_required`
- `join_required`
- `access_denied`
- `checkpoint_required`
- `captcha_or_security_check`
- `rate_limited`
- `selector_changed`
- `network_timeout`
- `post_url_unavailable`
- `comment_collapsed`
- `comment_sort_unavailable`
- `historical_scroll_limit`
- `unknown`

## Data Completeness Notes

Completeness is recorded at three levels:

- Group level: whether feed access and weekly history are available.
- Post level: whether URL, time, text, reactions, media, and link fields are complete.
- Comment level: whether comments are fully expanded, partially expanded, or unavailable.

Comment completeness is expected to be the highest-risk field because Facebook may rank, collapse, or lazily load comments.

## Stage 3 Boundary

This stage defines the weekly raw data pipeline and JSON contract only. It does not perform cleaning, translation, topic classification, sentiment analysis, weekly report generation, or Dashboard development.

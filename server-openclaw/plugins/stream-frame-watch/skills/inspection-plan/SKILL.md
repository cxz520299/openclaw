---
name: inspection-plan
description: Use this skill when the user wants to run the OpenClaw image-vs-stream inspection flow with one baseline image and one stream URL, especially when they say `执行巡检计划`.
---

# Inspection Plan

Use this skill when the user provides:
- one baseline image
- one stream URL
- a short command such as `执行巡检计划`

This skill also covers a database-backed shortcut:
- one store name such as `成都小智零食有鸣`
- optionally one plan name such as `营业画面点检` or `门店基准图巡检`
- allow store aliases such as `成都逮虾户零食有鸣`
- if the user repeats the store name twice, prefer the store-bound text inspection plan instead of falling back to the baseline plan
- a short command such as `执行巡检计划`
- no manual stream URL is required when the store is already mapped in the inspection database

This skill should also accept a bare store-and-plan command:
- `成都小智零食有鸣 营业画面点检`
- `成都小智零食有鸣 门店基准图巡检`
- no extra `执行` verb is required

This skill also covers a second mode:
- no baseline image
- one stream URL
- one textual inspection requirement such as `点检项: 灭火器在位，通道无杂物`
- the short command `执行巡检计划`

## Workflow

1. Treat the first uploaded image as `baselineImage`.
2. Treat the first stream URL in the message as `source`.
3. Execute `stream_frame_watch_analyze` immediately instead of asking follow-up questions.
4. Return the verdict, `差异度`, `相似度`, sampling time, reasons, and artifact paths.

For database-backed inspection:
1. Treat the mentioned store name as `storeName`.
2. Treat the mentioned plan name as `planName` when present.
3. If the user writes the same store text twice, keep the first one as `storeName` and still pass the second one as `planName` so the backend can infer the intended text inspection plan.
4. Execute `stream_frame_watch_analyze` immediately with `storeName` and `planName`, even if the user only wrote `门店名 + 计划名`.
5. Let the tool resolve stream URL, thresholds, plan items, and result writeback through the inspection database.
6. If store or plan cannot be resolved, return the explicit backend miss message. Never silently fall back to an Apple or public sample scene.
7. Return the verdict, sampled timestamp, reasons, and artifact paths directly.

For textual inspection:
1. Treat the text after `点检项:` or `描述:` as `descriptionText`.
2. Use `framePickMode=random` by default unless the user explicitly asks for `第一帧`.
3. Return the verdict, `匹配度`, threshold, sampling time, observed summary, reasons, and plugin recommendation.

## Defaults

- `执行巡检计划` defaults to `framePickMode=first`.
- Default `compareThreshold=0.12`.
- If the user says `相似度低于85%报警`, convert it to the matching threshold override.
- If the user says `差异阈值 15%`, convert it to `compareThreshold=0.15`.
- For textual inspection, default `matchThresholdPercent=80`.
- If the user says `匹配度低于85%报警`, convert it to `matchThresholdPercent=85`.

## WeCom Behavior

- In Enterprise WeChat, prefer the direct command path so the bot can reply fast.
- The expected reply pattern is:
  - immediate acknowledgement
  - final text summary
  - frame image and diff image as follow-up media when available

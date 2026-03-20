---
name: inspection-plan
description: Use this skill when the user wants to run the OpenClaw image-vs-stream inspection flow with one baseline image and one stream URL, especially when they say `执行巡检计划`.
---

# Inspection Plan

Use this skill when the user provides:
- one baseline image
- one stream URL
- a short command such as `执行巡检计划`

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

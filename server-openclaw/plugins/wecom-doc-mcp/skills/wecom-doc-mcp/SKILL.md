# WeCom Doc MCP

Use this skill when the user wants OpenClaw to create, inspect, or update Enterprise WeChat documents through the `wecom_doc_mcp_*` tools.

Recommended flow:
1. For common requests like "整理成企业微信文档/表格", call `wecom_doc_quick_report` first. It is the fastest path and already prefers direct mode.
2. Call `wecom_doc_mcp_status` only when you are unsure whether direct mode or MCP mode is available, or when debugging connectivity.
3. Call `wecom_doc_mcp_list_tools` only for low-level or unfamiliar document operations.
4. In `auto` mode, prefer direct server-side APIs when available.
5. For low-level sheet operations, call `wecom_doc_mcp_call` with tools such as `create_doc`, `smartsheet_get_sheet`, `smartsheet_get_fields`, `smartsheet_add_fields`, `smartsheet_update_fields`, and `smartsheet_add_records`.

Notes:
- Prefer `wecom_doc_quick_report` over `status -> list_tools -> call` for routine report creation.
- Do not ask the user to install `mcporter`.
- The endpoint URL contains a secret API key and must stay in environment variables, not in messages or committed config.

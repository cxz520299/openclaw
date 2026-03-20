# WeCom Doc MCP

Use this skill when the user wants OpenClaw to create, inspect, or update Enterprise WeChat documents through the `wecom_doc_mcp_*` tools.

Recommended flow:
1. Call `wecom_doc_mcp_status` if you are unsure whether the endpoint is configured.
2. Call `wecom_doc_mcp_list_tools` before the first document task so you know the exact tool names and schemas exposed by the current enterprise.
3. Call `wecom_doc_mcp_call` with the chosen tool name and JSON input.

Notes:
- Prefer listing tools first instead of guessing tool names.
- The endpoint URL contains a secret API key and must stay in environment variables, not in messages or committed config.

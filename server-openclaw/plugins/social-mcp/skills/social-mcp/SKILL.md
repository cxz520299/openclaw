# Social MCP

Use this skill when the user wants to retrieve or inspect content from Bilibili, Weibo, or Xiaohongshu through the `social_mcp_*` tools.

## Workflow

1. Call `social_mcp_status` if you are unsure whether a platform is available.
2. Call `social_mcp_list_tools` for the target platform to inspect the exact MCP tool names and parameters.
3. Call `social_mcp_call` with the chosen tool and arguments.
4. Summarize the retrieved content clearly, and include raw identifiers or links when useful.

## Platform hints

- `bilibili`: Good for user search, keyword search, precise result lookup, and danmaku retrieval.
- `weibo`: Good for hot topics, user search, feed search, comments, and profile lookups.
- `xiaohongshu`: Often requires login. If login is needed, check login status first and use the QR-code related tools exposed by the MCP server.

## Behavior

- Prefer executing the crawl directly when the user request is specific enough.
- Do not stop at “I can do that”; actually call the tools and continue.
- If one platform fails, say so briefly and try an alternative platform only if it still satisfies the user request.

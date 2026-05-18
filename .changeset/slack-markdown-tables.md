---
"@chat-adapter/slack": patch
---

Fix Slack table rendering regression introduced in #440.

The top-level `markdown_text` parameter on `chat.postMessage` does not render
GFM tables — they appear as raw `|`-delimited text. Emitting a `{ type: "markdown" }`
Block Kit block instead restores native table rendering while keeping native
rendering of bold/italic/lists/headings/code fences.

For streamed messages, Slack's streaming API only accepts `markdown_text` for
incremental chunks, so tables briefly appear raw during streaming. After
`streamer.stop()` completes, the adapter now rewrites the finalized message
via `chat.update` with a `markdown` block when a table is detected (unless
the caller supplied explicit `stopBlocks`).

# Claude Code MCP bridge: an MCP result straight into a session

Claude Code can run a `PostToolUse` hook after a tool call succeeds, and that hook may replace the tool's output *before the model sees it*:

> `hookSpecificOutput.updatedToolOutput` — Replaces the tool's output with the provided value before it is sent to Claude. The value must match the tool's output shape.
>
> — <https://docs.claude.com/en/docs/claude-code/hooks>

That is the whole mechanism. `dg` ships a hook that uses it: the MCP server still returns the page, but the hook writes the body into a `dg` session and hands the model one line of counts. Nothing here is an MCP feature, and this does not let `dg` inherit the host's credentials — the MCP call still runs in Claude Code, and the host still pays for it.

For Codex, see [Codex MCP bridge](codex-mcp-bridge.md) instead; that host has no hook equivalent and uses a different mechanism.

## Setup

**1. Declare the session.** The hook imports into whatever session you name — it does not infer one. A Claude Code `session_id` identifies a conversation, not a `dg` session, and guessing would scatter results into directories your Agent never opens.

```json
// <project>/.digdig/mcp-bridge.json
{
  "session": "/absolute/path/to/.digdig/sessions/my-session",
  "tools": {
    "mcp__exa__web_fetch_exa": { "kind": "extracted", "textPath": "0.text" }
  }
}
```

`session` must be an absolute path or a path relative to the process working directory. Set `DIGDIG_MCP_BRIDGE_CONFIG` to point somewhere else.

**2. Register the hook.** Matcher syntax matters: a bare server key matches nothing, because the matcher is compared against the full tool name `mcp__<server>__<tool>`. Server-wide matching needs `.*`.

```json
// <project>/.claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "mcp__exa__.*",
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/to/node_modules/digdig/dist/hooks/claude-mcp-bridge.js"
          }
        ]
      }
    ]
  }
}
```

Use the full path to the installed `dist/hooks/claude-mcp-bridge.js`, not a `dg` shim — the shim runs the CLI, not the hook.

## Mapping fields

Each entry under `tools` describes how to read one MCP tool's response.

| Field | Required | Meaning |
|---|---|---|
| `kind` | yes | `search` keeps the text as an excerpt; `extracted` treats it as a body. Extraction requires a nonempty body; a `search` import still needs `dg extract --session` before approval. |
| `textPath` | yes | Dotted path to the text — either a string, or an MCP content array `[{type:"text", text}]`. `0.text` addresses Exa's shape. |
| `urlPath` | no | Dotted path to the source URL. Omitted means parse a `URL: <url>` line out of the text. |
| `titlePath` | no | Dotted path to the title. Omitted means use the first `# heading`. |
| `tool` | no | Recorded as the result's origin. Defaults to the MCP server name from the tool name. |

A record missing its URL or title is dropped rather than guessed — a result with a fabricated URL would enter the graph as a real source.

## What the Agent sees

On success the tool output becomes one line:

```
dg: imported into session (added 1, updated 0, total 1). Page text is in the session, not in this message.
```

On any of these, the original tool output is left untouched and a note is attached instead:

| Situation | Behaviour |
|---|---|
| Tool not in `tools` | Nothing runs. Silent, so unrelated MCP calls are unaffected. |
| No config file | `additionalContext` says so; result unchanged. |
| Response has no readable URL or title | `additionalContext` says so; result unchanged. |
| Import failed | The staged JSON file is **kept** in `<session>/agent-inputs/` for inspection and retry; result unchanged. |

The hook never deletes a staged file it could not import — that file is the only copy of what the MCP server returned.

## Limits

- `PostToolUse` fires on success only. A failed MCP call cannot be rewritten; `PostToolUseFailure` has no equivalent field.
- Provider charges are unchanged. The hook moves the text, it does not avoid the call.
- No token-savings amount is guaranteed. What it removes is the page body from the model's context.
- Plugin-bundled MCP servers use a scoped tool name, `mcp__plugin_<plugin>_<server>__<tool>`. A matcher written against the bare server key never fires for those; write the scoped name instead.
- The replacement must match the tool's own output shape. If an MCP server changes its response shape, the summary can be rejected — check the hook's stderr and the session before assuming success.

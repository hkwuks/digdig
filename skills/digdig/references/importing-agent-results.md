# Importing Agent results into a session

Any Agent tool — an MCP server, a host's own search, a CLI — can hand its results to `dg`. The CLI does not care where the content came from, only that it is valid UTF-8 JSON. One import path serves every host.

## Why import at all

Content that stays in a tool's response is re-read on every later turn that needs it. Importing it once puts it in the session, where `coverage`, `--quality` and `graph-*` read it without the model paying for it again.

Importing does not avoid the first read: the model still saw the response to decide to import it. What it avoids is every read after that.

## Two kinds

| Kind | What it means | What the record needs |
|---|---|---|
| `search` | A snippet from a discovery call | `url`, `title`; `excerpt` optional |
| `extracted` | A page body you have assessed | `url`, `title`, non-empty `content`, `extractor` |

`search` results await extraction; `extracted` results await approval. Both need `tool` and `query`, either per item or as `--tool` / `--query`.

A title or URL you cannot read from the response is a record you do not import. Guessing one puts a fabricated source into the graph.

## Two input forms

Either write the JSON under `<session>/agent-inputs/` and pass `--data-file`, or pipe it in with `--data-stdin`:

```bash
# file form
dg results-add my-session --kind extracted --data-file .digdig/sessions/my-session/agent-inputs/page.json

# stdin form
dg results-add my-session --kind extracted --data-stdin <<'JSON'
[{ "url": "https://example.com", "title": "Example Domain",
   "content": "...", "extractor": "exa", "tool": "exa", "query": "example domain" }]
JSON
```

`--data-stdin` skips the `agent-inputs` path check, so a host that can pipe into `dg` needs no filesystem write at all. Every command that takes JSON supports the same form: `results-add`, `graph-add`, `source-relations`, `claim-add`, `evidence-verify`, and the `--quality` selection flags.

The two forms are mutually exclusive. Passing both is `MULTIPLE_JSON_INPUTS`; passing neither is `MISSING_JSON_INPUT`.

## Hosts that can pipe

Some hosts expose code execution alongside their MCP tools. There, one call can run the MCP tool, hand the response to `dg`, and return only the import counts:

```javascript
const r = await tools.mcp__exa__web_fetch_exa({ urls: [url] });
const body = r.content?.filter(b => b.type === 'text')[0]?.text;
// …build the record from `body`, then:
const { stdout } = await exec('dg', ['results-add', session, '--kind', 'extracted', '--data-stdin'],
  { input: JSON.stringify([record]) });
```

Whether this saves context depends on the host, and it is worth being exact:

- **Host can call the tool from code and return only what the code prints.** The page body never reaches the model. This is the only arrangement that removes the body from context.
- **Host can only call the tool directly.** The body reaches the model once, because the model had to see it. Importing still stops it from being read again.

dg cannot reach another client's MCP connection or its credentials. Whatever the host calls, the host pays for.

## What the model sees

```json
{ "status": "ok", "data": { "added": 1, "updated": 0, "total": 1, "pendingExtraction": 0, "pendingApproval": 1 } }
```

Then `--quality` reports the result as awaiting approval, and `--approve-file` / `--approve-stdin` moves it into the graph.

## Limits

- Provider charges are unchanged. Importing moves text, it does not avoid the call.
- `extracted` means "carries a body", not "verified". Provenance and completeness are the Agent's assessment; `--quality` reports the facts, it does not decide.
- A failed import keeps whatever you staged, because that input is the only copy. Check the session before repeating a paid call.

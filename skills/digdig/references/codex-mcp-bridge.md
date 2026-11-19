# Codex MCP bridge: Exa page to a dg session

Use this only when the host exposes the `functions.exec` tool namespace, the Exa `web_fetch_exa` tool, and `mcp__node_repl__js` in the same invocation. This is a host-specific bridge, not an MCP feature or a way for dg to inherit another client's credentials. If any capability is absent, call the Agent tool normally and import its result using the standard `results-add` flow.

The host orchestrator calls Exa, transfers its returned text directly to a temporary file inside the session's `agent-inputs`, and invokes dg from Node. The model receives only import status and counts. This example records the returned text as a search excerpt: `maxCharacters` can truncate it, so do not claim it is a complete extracted body. For other MCP tools, verify their actual response contract and normalize their results before importing; do not parse an arbitrary response as Exa output. Provider calls may incur charges. No token-savings amount is guaranteed.

Fill in the four variables with the current request and verified absolute paths. `cliEntry` is the absolute path to digdig's installed `dist/index.js`, not a Windows `.cmd` or PowerShell shim. Use the same dg installation that owns the session. Submit the following as one `functions.exec` call; do not print the MCP result or the generated code:

```javascript
const url = 'https://example.com';
const query = 'the original search query';
const session = '/absolute/path/to/session';
const cliEntry = '/absolute/path/to/digdig/dist/index.js';
const result = await tools.mcp__exa__web_fetch_exa({ urls: [url], maxCharacters: 3000 });
if (result.isError) { text('MCP fetch failed; nothing imported.'); exit(); }
const blocks = result.content?.filter(b => b.type === 'text') ?? [];
if (blocks.length !== 1 || !blocks[0].text.split(/\r?\n/).some(line => line.trim() === `URL: ${url}`)) {
  text('Unexpected MCP response; nothing imported.'); exit();
}
const body = blocks[0].text;
const title = body.split(/\r?\n/)[0].replace(/^#+\s*/, '').trim();
if (!title) { text('Missing title; nothing imported.'); exit(); }
const records = [{ url, title, excerpt: body, tool: 'exa', query }];
const code = `
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const cp = await import('node:child_process');
  const util = await import('node:util');
  const session = ${JSON.stringify(session)};
  const folder = path.join(session, 'agent-inputs');
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, 'mcp-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
  await fs.writeFile(file, ${JSON.stringify(JSON.stringify(records))}, { encoding: 'utf8', flag: 'wx' });
  try {
    const { stdout } = await util.promisify(cp.execFile)('node', [${JSON.stringify(cliEntry)}, 'results-add', session, '--kind', 'search', '--data-file', file], { timeout: 30000 });
    const envelope = JSON.parse(stdout);
    if (envelope.status !== 'ok') throw new Error('import failed');
    await fs.unlink(file);
    nodeRepl.write({ status: 'ok', provider: 'exa', added: envelope.data?.added, updated: envelope.data?.updated, total: envelope.data?.total });
  } catch {
    nodeRepl.write({ status: 'error', message: 'Import failed; input retained in session agent-inputs for recovery.' });
  }
`;
const imported = await tools.mcp__node_repl__js({ code, title: 'Importing MCP results', timeout_ms: 60000 });
if (imported.isError) { text('Bridge failed; inspect the session before retrying.'); exit(); }
for (const block of imported.content ?? []) if (block.type === 'text') text(block.text);
```

The `node` executable must be available in the Node REPL's PATH. A failed import retains the input file for inspection; do not repeat a paid MCP request before checking the session and that file. The host and MCP service still process the text; only the data returned into the model context is minimized.

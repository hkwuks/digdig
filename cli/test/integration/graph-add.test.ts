import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runGraphAdd } from '../../src/commands/graph-add.js';
import { appendSessionResults, approveResults, getApprovedResults, initSessionDir, injectApprovedResults, loadSessionGraph, loadSessionResults, setSkipped } from '../../src/deep/session.js';

describe('graph-add command', () => {
  let sessionDir: string;
  let resultId: string;

  beforeEach(() => {
    sessionDir = mkdtempSync(join(tmpdir(), 'sxng-graph-add-'));
    initSessionDir(sessionDir);
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', contentType: 'extracted', content: 'Verified body.',
      extractor: 'defuddle', origins: [{ tool: 'sxng', query: 'graph query' }],
    }]);
    const [result] = loadSessionResults(sessionDir);
    resultId = result.id;
    injectApprovedResults(sessionDir, approveResults(sessionDir, [{ id: result.id, revision: result.revision }]).approvedResults);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sessionDir, { recursive: true, force: true });
  });

  it('requires approved extracted result IDs and persists source provenance on semantic data', async () => {
    const dataFile = join(sessionDir, 'agent-inputs', 'graph.json');
    writeFileSync(dataFile, JSON.stringify({
      entities: [{ id: 'e:tokio', label: 'Tokio', entityType: 'runtime', sourceResultIds: [resultId] }],
      edges: [{ source: resultId, target: 'e:tokio', relation: 'mentions', sourceResultIds: [resultId] }],
    }), 'utf8');

    expect(await runGraphAdd({ session: sessionDir, dataFile })).toBe(0);
    const graph = loadSessionGraph(sessionDir);
    expect(graph.getNodeAttributes('e:tokio').sourceResultIds).toEqual([resultId]);
    expect(graph.someEdge((_edge, attrs) => attrs.relation === 'mentions' && attrs.sourceResultIds?.includes(resultId))).toBe(true);
  });

  it('rejects semantic data backed by an unapproved or unknown result ID', async () => {
    const dataFile = join(sessionDir, 'agent-inputs', 'invalid.json');
    writeFileSync(dataFile, JSON.stringify({ entities: [{ label: 'Tokio', sourceResultIds: ['r:unknown'] }] }), 'utf8');
    expect(await runGraphAdd({ session: sessionDir, dataFile })).toBe(1);
    expect(loadSessionGraph(sessionDir).hasNode('e:tokio')).toBe(false);
  });

  it('rejects the entire batch when an entity id belongs to a structural node', async () => {
    const dataFile = join(sessionDir, 'agent-inputs', 'collision.json');
    const before = loadSessionGraph(sessionDir).export();
    writeFileSync(dataFile, JSON.stringify({ entities: [
      { id: 'e:new', label: 'New', sourceResultIds: [resultId] },
      { id: resultId, label: 'Fake Entity', sourceResultIds: [resultId] },
    ] }), 'utf8');

    expect(await runGraphAdd({ session: sessionDir, dataFile })).toBe(1);
    expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0])).toMatchObject({ error: { code: 'GRAPH_NODE_ID_CONFLICT' } });
    expect(loadSessionGraph(sessionDir).export()).toEqual(before);
  });

  it('still updates an existing entity', async () => {
    const dataFile = join(sessionDir, 'agent-inputs', 'update.json');
    writeFileSync(dataFile, JSON.stringify({ entities: [{ id: 'e:a', label: 'Before', sourceResultIds: [resultId] }] }), 'utf8');
    expect(await runGraphAdd({ session: sessionDir, dataFile })).toBe(0);
    writeFileSync(dataFile, JSON.stringify({ entities: [{ id: 'e:a', label: 'After', sourceResultIds: [resultId] }] }), 'utf8');
    expect(await runGraphAdd({ session: sessionDir, dataFile })).toBe(0);
    expect(loadSessionGraph(sessionDir).getNodeAttribute('e:a', 'label')).toBe('After');
  });

  it('removes semantic data and revokes eligibility when an approved source is skipped', async () => {
    const dataFile = join(sessionDir, 'agent-inputs', 'semantic.json');
    writeFileSync(dataFile, JSON.stringify({
      entities: [{ id: 'e:tokio', label: 'Tokio', sourceResultIds: [resultId] }],
      edges: [{ source: resultId, target: 'e:tokio', relation: 'mentions', sourceResultIds: [resultId] }],
    }), 'utf8');
    expect(await runGraphAdd({ session: sessionDir, dataFile })).toBe(0);

    const current = loadSessionResults(sessionDir).find(result => result.id === resultId)!;
    expect(setSkipped(sessionDir, [{ id: resultId, revision: current.revision }], true).changed).toBe(1);

    expect(getApprovedResults(sessionDir)).toEqual([]);
    expect(loadSessionGraph(sessionDir).hasNode('e:tokio')).toBe(false);
  });

  it('keeps distinct relations between the same nodes in the multi-directed graph', async () => {
    const dataFile = join(sessionDir, 'agent-inputs', 'relations.json');
    writeFileSync(dataFile, JSON.stringify({
      entities: [{ id: 'e:a', label: 'A', sourceResultIds: [resultId] }, { id: 'e:b', label: 'B', sourceResultIds: [resultId] }],
      edges: [
        { source: 'e:a', target: 'e:b', relation: 'depends_on', sourceResultIds: [resultId] },
        { source: 'e:a', target: 'e:b', relation: 'alternative_to', sourceResultIds: [resultId] },
      ],
    }), 'utf8');
    expect(await runGraphAdd({ session: sessionDir, dataFile })).toBe(0);
    const graph = loadSessionGraph(sessionDir);
    expect(graph.edges('e:a', 'e:b')).toHaveLength(2);
  });

  it('rebuilds the structural layer from approved bodies when graph.json is missing', () => {
    const graphFile = join(sessionDir, 'graph.json');
    rmSync(graphFile, { force: true });
    expect(existsSync(graphFile)).toBe(false);

    const rebuilt = injectApprovedResults(sessionDir, getApprovedResults(sessionDir));
    expect(rebuilt.nodesAdded).toBeGreaterThan(0);
    expect(loadSessionGraph(sessionDir).someNode((_id, attrs) => attrs.type === 'result')).toBe(true);
  });
});

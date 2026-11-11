import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runGraphAdd } from '../../src/commands/graph-add.js';
import { runGraphTraverse } from '../../src/commands/graph-traverse.js';
import { appendSessionResults, approveResults, getApprovedResults, initSessionDir, injectApprovedResults, loadSessionGraph, loadSessionResults, mutateSessionGraph, setSkipped } from '../../src/deep/session.js';
import { withSessionRead, withSessionWrite } from '../../src/deep/session-store.js';

function sessionSnapshot(dir: string): unknown {
  return withSessionRead(dir, db => ({
    meta: db.prepare("SELECT data FROM session_meta WHERE key = 'meta'").get(),
    graph: db.prepare('SELECT data FROM graph_snapshot WHERE id = 1').get(),
  }));
}

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

  it.each([
    { entities: 'not-an-array' },
    { entities: null },
    { entities: [null] },
    { edges: [null] },
    { entities: [{ label: 7, sourceResultIds: [] }] },
    { entities: [{ id: 7, label: 'Entity', sourceResultIds: [] }] },
    { entities: [{ label: 'Entity', score: 'high', sourceResultIds: [] }] },
    { entities: [{ label: 'Entity', sourceResultIds: [42] }] },
    { edges: [{ source: 'e:a', target: 'e:b', relation: 42, sourceResultIds: [] }] },
  ])('rejects malformed graph inputs without changing session files: %j', async input => {
    const dataFile = join(sessionDir, 'agent-inputs', 'malformed.json');
    writeFileSync(dataFile, JSON.stringify(input), 'utf8');
    const before = sessionSnapshot(sessionDir);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10000);
    expect(await runGraphAdd({ session: sessionDir, dataFile })).toBe(1);
    expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0])).toMatchObject({ status: 'error', error: { code: 'INVALID_GRAPH_DATA' } });
    expect(sessionSnapshot(sessionDir)).toEqual(before);
  });

  it('does not write a valid entity when another item in the batch is malformed', async () => {
    const dataFile = join(sessionDir, 'agent-inputs', 'mixed-invalid.json');
    writeFileSync(dataFile, JSON.stringify({ entities: [{ id: 'e:ok', label: 'Valid', sourceResultIds: [resultId] }, null] }), 'utf8');
    const before = sessionSnapshot(sessionDir);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10000);
    expect(await runGraphAdd({ session: sessionDir, dataFile })).toBe(1);
    expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0])).toMatchObject({ error: { code: 'INVALID_GRAPH_DATA' } });
    expect(sessionSnapshot(sessionDir)).toEqual(before);
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

  it('persists traversable paths without duplicating them on repeated graph-add', async () => {
    const dataFile = join(sessionDir, 'agent-inputs', 'paths.json');
    writeFileSync(dataFile, JSON.stringify({
      entities: ['a', 'b', 'c'].map(id => ({ id: `e:${id}`, label: id, sourceResultIds: [resultId] })),
      edges: [['a', 'b'], ['b', 'c']].map(([a, b]) => ({ source: `e:${a}`, target: `e:${b}`, relation: 'depends_on', sourceResultIds: [resultId] })),
    }), 'utf8');
    expect(await runGraphAdd({ session: sessionDir, dataFile })).toBe(0);
    const graph = loadSessionGraph(sessionDir);
    const paths = graph.filterNodes((_id, attrs) => attrs.type === 'path');
    expect(paths.length).toBeGreaterThan(0);
    expect(await runGraphTraverse({ session: sessionDir, pathId: paths[0] })).toBe(0);
    expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0]).data.sources).toMatchObject({ resultCount: 1, resultIds: [resultId] });
    expect(await runGraphAdd({ session: sessionDir, dataFile })).toBe(0);
    expect(loadSessionGraph(sessionDir).filterNodes((_id, attrs) => attrs.type === 'path')).toEqual(paths);
  });

  it('returns a structured error when a path references a missing entity', async () => {
    mutateSessionGraph(sessionDir, graph => {
      graph.addNode('e:present', { type: 'entity', label: 'Present' });
      graph.addNode('p:stale', { type: 'path', label: 'Stale', entities: ['e:present', 'e:missing'] });
    });
    expect(await runGraphTraverse({ session: sessionDir, pathId: 'p:stale' })).toBe(1);
    expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0])).toMatchObject({ error: { code: 'PATH_INVALID' } });
  });

  it('bounds dense path generation and reports truncation', async () => {
    const dataFile = join(sessionDir, 'agent-inputs', 'dense.json');
    const entities = Array.from({ length: 10 }, (_, i) => ({ id: `e:${i}`, label: `${i}`, sourceResultIds: [resultId] }));
    const edges = entities.flatMap((source, i) => entities.slice(i + 1).map(target => ({ source: source.id, target: target.id, relation: 'related', sourceResultIds: [resultId] })));
    writeFileSync(dataFile, JSON.stringify({ entities, edges }), 'utf8');
    expect(await runGraphAdd({ session: sessionDir, dataFile })).toBe(0);
    expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0])).toMatchObject({ data: { pathsTruncated: true } });
    expect(loadSessionGraph(sessionDir).filterNodes((_id, attrs) => attrs.type === 'path').length).toBeLessThanOrEqual(1000);
  });

  it('rebuilds the structural layer from approved bodies when the graph snapshot is missing', () => {
    withSessionWrite(sessionDir, db => db.prepare('DELETE FROM graph_snapshot WHERE id = 1').run());
    expect(withSessionRead(sessionDir, db => db.prepare('SELECT 1 FROM graph_snapshot').get())).toBeUndefined();

    const rebuilt = injectApprovedResults(sessionDir, getApprovedResults(sessionDir));
    expect(rebuilt.nodesAdded).toBeGreaterThan(0);
    expect(loadSessionGraph(sessionDir).someNode((_id, attrs) => attrs.type === 'result')).toBe(true);
  });
});

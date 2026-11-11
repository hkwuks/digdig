import { withSessionRead } from '../deep/session-store.js';
import type { SourceRelation } from './types.js';

export function loadSourceRelations(sessionDir: string, claimId: string): SourceRelation[] {
  return withSessionRead(sessionDir, db => db.prepare('SELECT * FROM source_relations WHERE claim_id = ? ORDER BY created_at, id').all(claimId).map(row => ({
    id: String(row.id), claimId: String(row.claim_id), leftResultId: String(row.left_result_id), rightResultId: String(row.right_result_id),
    leftSnapshotId: String(row.left_snapshot_id), rightSnapshotId: String(row.right_snapshot_id),
    relation: row.relation as SourceRelation['relation'], reason: String(row.reason), createdAt: Number(row.created_at),
    ...(row.invalidated_at === null ? {} : { invalidatedAt: Number(row.invalidated_at), invalidationReason: String(row.invalidation_reason) }),
  }))) ?? [];
}

export function relationsConflict(relations: SourceRelation[]): boolean {
  const parent = new Map<string, string>();
  const key = (result: string, snapshot: string) => JSON.stringify([result, snapshot]);
  const root = (value: string): string => {
    if (!parent.has(value)) parent.set(value, value);
    while (parent.get(value) !== value) value = parent.get(value)!;
    return value;
  };
  const active = relations.filter(item => item.invalidatedAt === undefined);
  for (const item of active.filter(item => item.relation === 'same')) {
    parent.set(root(key(item.leftResultId, item.leftSnapshotId)), root(key(item.rightResultId, item.rightSnapshotId)));
  }
  return active.some(item => item.relation === 'independent' && root(key(item.leftResultId, item.leftSnapshotId)) === root(key(item.rightResultId, item.rightSnapshotId)));
}

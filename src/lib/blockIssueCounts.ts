import * as turf from '@turf/turf';
import type { OrchardBlock } from './mapStore';
import type { FieldIssue } from './fieldStore';

export function isOpenIssue(issue: FieldIssue): boolean {
  return issue.status === 'open' || issue.status === 'in-progress';
}

/** Open / in-progress issues whose point falls inside a block polygon. */
export function issuesForBlock(block: OrchardBlock, issues: FieldIssue[]): FieldIssue[] {
  if (!block.geojson) return [];
  return issues.filter((issue) => {
    if (!isOpenIssue(issue)) return false;
    try {
      return turf.booleanPointInPolygon(turf.point([issue.lng, issue.lat]), block.geojson);
    } catch {
      return false;
    }
  });
}

/** Count open / in-progress field issues whose point falls inside each block polygon. */
export function countOpenIssuesByBlock(
  blocks: OrchardBlock[],
  issues: FieldIssue[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const block of blocks) {
    counts[block.id] = issuesForBlock(block, issues).length;
  }
  return counts;
}

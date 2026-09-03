export interface HarvestRecord {
  id: string;
  date: string;
  blockId: string;
  totalWeight: number;
  moistureContent: number;
  qualityGrade: string;
  notes: string;
  blightImpactScore?: number;
  createdAt: string;
  createdBy: string;
}

export function groupHarvestsByBlock(
  records: HarvestRecord[],
  blockIds: string[]
): Record<string, HarvestRecord[]> {
  const map: Record<string, HarvestRecord[]> = {};
  blockIds.forEach((id) => {
    map[id] = [];
  });
  records.forEach((r) => {
    if (!map[r.blockId]) map[r.blockId] = [];
    map[r.blockId].push(r);
  });
  return map;
}

export function harvestSeasonTotalKg(records: HarvestRecord[]): number {
  return records.reduce((sum, r) => sum + (r.totalWeight || 0), 0);
}

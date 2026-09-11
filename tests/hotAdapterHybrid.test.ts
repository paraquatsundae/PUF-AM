/**
 * Envelope → HotState → entities round trip for a **hybrid** farm.
 *
 * The export envelope is built from a Firestore farm's local cache, so it names
 * the cloud farm; the Hot must be addressed under the mist id and remember
 * where it came from in `meta.cloud_farm_id`. The size measured here is the
 * plain envelope Phase 1 of the plan asks to be measured before the design
 * commits to whole-farm blobs.
 *
 * @see Plans/FREENET_NETWORK_PACK.md §3, §5 Phase 1
 */
import { describe, expect, it } from 'vitest';

import {
  FARM_EXPORT_FORMAT,
  FARM_EXPORT_VERSION,
  type FarmExportV1,
} from '../src/lib/farmExport';
import {
  buildHotStateFromFarmExport,
  countHotFarmEntities,
  hotStateCloudFarmId,
  hotStateToFarmEntities,
} from '../src/mist/hotAdapter';

const CLOUD = 'cloud-farm-7f3a';
const MIST = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

function envelope(diaryCount: number): FarmExportV1 {
  const diary = Array.from({ length: diaryCount }, (_, i) => ({
    id: `d${i}`,
    date: `2026-0${1 + (i % 9)}-1${i % 10}`,
    type: (['spray', 'irrigation', 'work', 'nutrition'] as const)[i % 4],
    notes: `Row ${i}: sprayed the north side, wind light, checked the header tank on the way back.`,
    blockId: `b${i % 6}`,
    blockName: `Block ${i % 6}`,
    updatedAt: `2026-01-0${1 + (i % 9)}T0${i % 9}:00:00.000Z`,
  }));
  return {
    format: FARM_EXPORT_FORMAT,
    v: FARM_EXPORT_VERSION,
    exportedAt: '2026-09-11T00:00:00.000Z',
    farmId: CLOUD,
    farmName: 'Shed farm',
    source: 'mist',
    exportScope: { diary: 'all', issues: true, issuesArchive: true },
    diary,
    issues: [
      {
        id: 'i1',
        blockId: 'b1',
        title: 'Leaking riser',
        description: 'Riser 4 dripping at the elbow',
        severity: 'medium',
        status: 'open',
        reportedAt: '2026-08-01T00:00:00.000Z',
        reportedBy: 'George',
        hasPhoto: false,
      } as unknown as FarmExportV1['issues'][number],
    ],
    issuesArchive: [],
  };
}

describe('hybrid envelope → HotState', () => {
  it('addresses the Hot under the mist id and stamps the cloud farm id in meta', () => {
    const hot = buildHotStateFromFarmExport(envelope(3), { farmId: MIST, cloudFarmId: CLOUD });
    expect(hot.farm_id).toBe(MIST);
    expect(hot.meta).toEqual({ cloud_farm_id: CLOUD });
    expect(hotStateCloudFarmId(hot)).toBe(CLOUD);
  });

  it('a Freenet-native envelope carries no meta at all (bytes stay as before)', () => {
    const hot = buildHotStateFromFarmExport({ ...envelope(2), farmId: MIST });
    expect(hot.farm_id).toBe(MIST);
    expect('meta' in hot).toBe(false);
    expect(hotStateCloudFarmId(hot)).toBeNull();
  });

  it('round-trips every record back into entities', () => {
    const env = envelope(12);
    const hot = buildHotStateFromFarmExport(env, { farmId: MIST, cloudFarmId: CLOUD });
    const counts = countHotFarmEntities(hot);
    expect(counts).toMatchObject({ diary: 12, issues: 1, issuesArchive: 0 });

    const back = hotStateToFarmEntities(JSON.parse(JSON.stringify(hot)));
    expect(back.diary.map((d) => d.id).sort()).toEqual(env.diary.map((d) => d.id).sort());
    expect(back.issues.map((i) => i.id)).toEqual(['i1']);
    // The export-only `blockName` column does not leak into the local row.
    expect('blockName' in back.diary[0]!).toBe(false);
  });

  it('measures the envelope: a season of diary stays well inside the Freenet blob budget', () => {
    const hot = buildHotStateFromFarmExport(envelope(400), { farmId: MIST, cloudFarmId: CLOUD });
    const bytes = new TextEncoder().encode(JSON.stringify(hot)).byteLength;
    // ~400 diary rows + 1 issue. Logged so the number is in the test output for the plan.
    console.info(`[hybrid envelope] 400 diary + 1 issue → ${bytes} B plain (${(bytes / 1024).toFixed(1)} KiB)`);
    expect(bytes).toBeGreaterThan(50_000);
    expect(bytes).toBeLessThan(2 * 1024 * 1024);
  });
});

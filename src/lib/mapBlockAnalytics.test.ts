import { describe, expect, it } from 'vitest';
import {
  blockPolygonPathStyle,
  computeBlockAnalytics,
  type BlockAnalyticsRow,
} from './mapBlockAnalytics';
import { DEFAULT_ORCHARD_GEOMETRY } from './orchardGeometry';
import type { OrchardBlock } from './mapStore';

const heat: BlockAnalyticsRow = {
  blight: 0.8,
  moisture: 0.2,
  heat: 0.3,
  overall: 'high',
  color: 'rgb(200, 40, 40)',
  hasProtection: false,
  yieldTotal: 0,
  yieldPerHa: 0,
  yieldColor: 'rgb(10, 180, 80)',
  lastHarvestDate: null,
};

const block = (id: string, geometry: Partial<OrchardBlock>): OrchardBlock => ({
  id,
  name: id,
  cultivar: '',
  density: '',
  irrigation: 'drip',
  geojson: null,
  ...geometry,
});

/** Same day for every case, so only the geometry differs. */
function analyticsFor(blocks: OrchardBlock[]) {
  return computeBlockAnalytics({
    blocks,
    harvests: [],
    environmentalData: null,
    blockSprayEventsCache: {},
    targetDate: new Date('2026-03-01T00:00:00Z'),
    targetDateStr: '2026-03-01',
  });
}

describe('computeBlockAnalytics geometry fallback', () => {
  it('reads a blank block as the default orchard geometry', () => {
    const rows = analyticsFor([
      block('blank', {}),
      block('spelled-out', DEFAULT_ORCHARD_GEOMETRY),
    ]);

    expect(rows.blank.heat).toBe(rows['spelled-out'].heat);
    expect(rows.blank.blight).toBe(rows['spelled-out'].blight);
  });

  it('still prefers measurements the block actually has', () => {
    // Denser canopy relative to row spacing, so more coverage and less heat.
    const rows = analyticsFor([
      block('blank', {}),
      block('measured', { treeHeight: 6, canopyWidth: 6.5, rowSpacing: 7 }),
    ]);

    expect(rows.measured.heat).toBeLessThan(rows.blank.heat);
  });
});

describe('blockPolygonPathStyle', () => {
  it('keeps operate / non-analytics paddocks indigo', () => {
    const style = blockPolygonPathStyle({
      isHighlighted: false,
      showRiskHeat: false,
      analyticsView: 'risk',
    });
    expect(style.color).toBe('#4f46e5');
    expect(style.fillOpacity).toBe(0.4);
    expect(style.dashArray).toBe('');
  });

  it('thickens the selected paddock without heat', () => {
    const style = blockPolygonPathStyle({
      isHighlighted: true,
      showRiskHeat: false,
      analyticsView: 'risk',
    });
    expect(style.color).toBe('#6366f1');
    expect(style.weight).toBe(5);
  });

  it('uses blight heat color and protection dash in analytics', () => {
    const risk = blockPolygonPathStyle({
      isHighlighted: false,
      showRiskHeat: true,
      analyticsView: 'risk',
      data: heat,
    });
    expect(risk.fillColor).toBe(heat.color);
    expect(risk.dashArray).toBe('');

    const protectedStyle = blockPolygonPathStyle({
      isHighlighted: false,
      showRiskHeat: true,
      analyticsView: 'risk',
      data: { ...heat, hasProtection: true },
    });
    expect(protectedStyle.color).toBe('#3b82f6');
    expect(protectedStyle.dashArray).toBe('10 5');
    expect(protectedStyle.weight).toBe(4);
  });
});

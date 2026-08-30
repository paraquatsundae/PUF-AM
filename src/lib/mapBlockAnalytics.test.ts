import { describe, expect, it } from 'vitest';
import { blockPolygonPathStyle, type BlockAnalyticsRow } from './mapBlockAnalytics';

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

/**
 * Edit → Analytics blight / heat / yield colors for the paddock map.
 * Kept out of OrchardMap.tsx (Plans/CODEBASE_HEALTH.md).
 */
import { DEFAULT_ORCHARD_GEOMETRY } from './orchardGeometry';
import type { OrchardBlock } from './mapStore';

export type BlockHarvestRow = {
  blockId: string;
  totalWeight: number;
  date: string;
};

export type BlockAnalyticsRow = {
  blight: number;
  moisture: number;
  heat: number;
  overall: string;
  color: string;
  hasProtection: boolean;
  yieldTotal: number;
  yieldPerHa: number;
  yieldColor: string;
  lastHarvestDate: string | null;
};

export type BlockEnvironmentalData = {
  weatherData?: Record<string, { T: number; RH: number; R: number }>;
} | null;

function getSmoothColor(value: number, type: 'risk' | 'yield' = 'risk'): string {
  const v = Math.max(0, Math.min(1, value));
  if (type === 'risk') {
    if (v < 0.5) {
      const pct = v * 2;
      const r = Math.round(16 + pct * (245 - 16));
      const g = Math.round(185 + pct * (158 - 185));
      const b = Math.round(129 + pct * (11 - 129));
      return `rgb(${r}, ${g}, ${b})`;
    }
    const pct = (v - 0.5) * 2;
    const r = Math.round(245 + pct * (239 - 245));
    const g = Math.round(158 + pct * (68 - 158));
    const b = Math.round(11 + pct * (68 - 11));
    return `rgb(${r}, ${g}, ${b})`;
  }
  const r = Math.round(30 + v * (16 - 30));
  const g = Math.round(64 + v * (185 - 64));
  const b = Math.round(175 + v * (129 - 175));
  return `rgb(${r}, ${g}, ${b})`;
}

export function computeBlockAnalytics(opts: {
  blocks: OrchardBlock[];
  harvests: BlockHarvestRow[];
  environmentalData: BlockEnvironmentalData;
  blockSprayEventsCache: Record<string, Record<string, unknown> | undefined>;
  targetDate: Date;
  targetDateStr: string;
}): Record<string, BlockAnalyticsRow> {
  const { blocks, harvests, environmentalData, blockSprayEventsCache, targetDate, targetDateStr } =
    opts;
  const analytics: Record<string, BlockAnalyticsRow> = {};
  const monthFloat = targetDate.getMonth() + targetDate.getDate() / 31;
  const seasonalHeat = (Math.cos((monthFloat - 0.5) * Math.PI / 6) + 1) / 2;
  const seasonalMoisture = (Math.cos((monthFloat - 6.5) * Math.PI / 6) + 1) / 2;
  const seasonalBlight = (Math.cos((monthFloat - 9.5) * Math.PI / 6) + 1) / 2;

  for (const block of blocks) {
    const height = block.treeHeight || DEFAULT_ORCHARD_GEOMETRY.treeHeight;
    const width = block.canopyWidth || DEFAULT_ORCHARD_GEOMETRY.canopyWidth;
    const spacing = block.rowSpacing || DEFAULT_ORCHARD_GEOMETRY.rowSpacing;
    const coverage = Math.min(1, width / spacing);
    const trv = (height * width * 10000) / spacing;
    const trvNorm = Math.min(1, trv / 50000);
    const heatBase = Math.max(0.2, 1 - coverage);
    const moistureBase = block.irrigation === 'none' ? 0.8 : block.irrigation === 'flood' ? 0.5 : 0.2;

    let heatRisk = 0;
    let moistureRisk = 0;
    let blightRisk = 0;

    if (environmentalData?.weatherData) {
      blightRisk = seasonalBlight * 0.7 + trvNorm * 0.3;
      const dailyWeather = environmentalData.weatherData[targetDateStr];
      if (dailyWeather) {
        const tempFactor = Math.max(0, Math.min(1, (dailyWeather.T - 25) / 10));
        heatRisk = heatBase * 0.4 + tempFactor * 0.6;
        const dryFactor = Math.max(0, Math.min(1, (100 - dailyWeather.RH) / 50));
        const rainRelief = Math.min(1, dailyWeather.R / 10);
        moistureRisk = Math.max(0, moistureBase * 0.4 + dryFactor * 0.6 - rainRelief);
      } else {
        heatRisk = heatBase;
        moistureRisk = moistureBase;
      }
    } else {
      heatRisk = heatBase * 0.4 + seasonalHeat * 0.6;
      moistureRisk = moistureBase * 0.4 + seasonalMoisture * 0.6;
      blightRisk = seasonalBlight * 0.7 + trvNorm * 0.3;
    }

    const maxRisk = Math.max(blightRisk, moistureRisk, heatRisk);
    const overall = maxRisk > 0.7 ? 'high' : maxRisk > 0.4 ? 'medium' : 'low';
    const blockSprayEvents = blockSprayEventsCache[block.id];
    const hasProtection = Boolean(
      blockSprayEvents &&
        Object.keys(blockSprayEvents).some((dateStr) => {
          const sprayDate = new Date(dateStr);
          const diffDays = (targetDate.getTime() - sprayDate.getTime()) / (1000 * 3600 * 24);
          return diffDays >= 0 && diffDays <= 14;
        })
    );
    const blockHarvests = harvests.filter((h) => h.blockId === block.id);
    const yieldTotal = blockHarvests.reduce((acc, h) => acc + h.totalWeight, 0);
    const yieldPerHa = block.areaHa ? yieldTotal / block.areaHa : 0;
    const lastHarvest = blockHarvests.length > 0 ? blockHarvests[0] : null;
    const yieldNorm = Math.min(1, yieldPerHa / 10000);

    analytics[block.id] = {
      blight: blightRisk,
      moisture: moistureRisk,
      heat: heatRisk,
      overall,
      color: getSmoothColor(maxRisk, 'risk'),
      hasProtection,
      yieldTotal,
      yieldPerHa,
      yieldColor: getSmoothColor(yieldNorm, 'yield'),
      lastHarvestDate: lastHarvest ? lastHarvest.date : null,
    };
  }
  return analytics;
}

export type BlockPathStyle = {
  color: string;
  fillColor: string;
  fillOpacity: number;
  weight: number;
  dashArray: string;
  className?: string;
};

/** Operate map stays indigo. Edit → Analytics uses blight / yield heat. */
export function blockPolygonPathStyle(opts: {
  isHighlighted: boolean;
  showRiskHeat: boolean;
  analyticsView: 'risk' | 'yield';
  data?: BlockAnalyticsRow;
}): BlockPathStyle {
  if (opts.showRiskHeat && opts.data) {
    const activeColor = opts.analyticsView === 'risk' ? opts.data.color : opts.data.yieldColor;
    return {
      color: opts.isHighlighted ? '#6366f1' : opts.data.hasProtection ? '#3b82f6' : activeColor,
      fillColor: activeColor,
      fillOpacity: opts.isHighlighted ? 0.8 : 0.6,
      weight: opts.isHighlighted ? 6 : opts.data.hasProtection ? 4 : 2,
      dashArray: opts.data.hasProtection ? '10 5' : '',
      className: 'smooth-polygon-transition',
    };
  }
  return {
    color: opts.isHighlighted ? '#6366f1' : '#4f46e5',
    fillColor: opts.isHighlighted ? '#6366f1' : '#4f46e5',
    fillOpacity: opts.isHighlighted ? 0.6 : 0.4,
    weight: opts.isHighlighted ? 5 : 3,
    dashArray: '',
  };
}

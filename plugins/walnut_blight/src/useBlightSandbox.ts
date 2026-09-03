import { useMemo, useState } from 'react';
import { SEASONS } from '../../../src/constants';
import {
  resolveCanopyGeometry,
  runBlightModel,
  type ApplicationMethod,
  type CalibrationParams,
  type GrowthStage,
  type SprayType,
  type WeatherData,
} from './blightModel';

export type SandboxScenario = {
  id: string;
  name: string;
  sprays: Record<string, { type: SprayType; method: ApplicationMethod }>;
  irrigation: Record<string, number>;
  treeHeight: number | null;
  canopyWidth: number | null;
  rowSpacing: number | null;
  color: string;
};

const EMPTY_SCENARIOS: SandboxScenario[] = [
  {
    id: '1',
    name: 'Scenario 1',
    sprays: {},
    irrigation: {},
    treeHeight: null,
    canopyWidth: null,
    rowSpacing: null,
    color: '#6366f1',
  },
  {
    id: '2',
    name: 'Scenario 2',
    sprays: {},
    irrigation: {},
    treeHeight: null,
    canopyWidth: null,
    rowSpacing: null,
    color: '#10b981',
  },
];

export function useBlightSandbox() {
  const [sandboxView, setSandboxView] = useState<'forecast' | 'historical'>('forecast');
  const [sandboxUseSecondaryLatency, setSandboxUseSecondaryLatency] = useState(false);
  const [scenarios, setScenarios] = useState<SandboxScenario[]>(EMPTY_SCENARIOS);
  const [activeScenarioId, setActiveScenarioId] = useState('1');
  const [compareAllScenarios, setCompareAllScenarios] = useState(false);

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === activeScenarioId) || scenarios[0],
    [scenarios, activeScenarioId]
  );

  const setSandboxSprays = (newSprays: Record<string, { type: SprayType; method: ApplicationMethod }>) => {
    setScenarios((prev) => prev.map((s) => (s.id === activeScenarioId ? { ...s, sprays: newSprays } : s)));
  };
  const setSandboxIrrigation = (newIrrigation: Record<string, number>) => {
    setScenarios((prev) =>
      prev.map((s) => (s.id === activeScenarioId ? { ...s, irrigation: newIrrigation } : s))
    );
  };
  const setSandboxHeight = (newHeight: number | null) => {
    setScenarios((prev) => prev.map((s) => (s.id === activeScenarioId ? { ...s, treeHeight: newHeight } : s)));
  };
  const setSandboxWidth = (newWidth: number | null) => {
    setScenarios((prev) =>
      prev.map((s) => (s.id === activeScenarioId ? { ...s, canopyWidth: newWidth } : s))
    );
  };
  const setSandboxSpacing = (newSpacing: number | null) => {
    setScenarios((prev) =>
      prev.map((s) => (s.id === activeScenarioId ? { ...s, rowSpacing: newSpacing } : s))
    );
  };

  const handleCloneScenario = (sourceId: string) => {
    const source = scenarios.find((s) => s.id === sourceId);
    if (!source) return;
    const targetId = activeScenarioId;
    setScenarios((prev) =>
      prev.map((s) =>
        s.id === targetId
          ? {
              ...s,
              sprays: { ...source.sprays },
              irrigation: { ...source.irrigation },
              treeHeight: source.treeHeight,
              canopyWidth: source.canopyWidth,
              rowSpacing: source.rowSpacing,
            }
          : s
      )
    );
  };

  const handleAutoDistribute = ({
    type = 'chem',
    selectedSeason,
    todayDate,
    todayStr,
    selectedBlockId,
    blocks,
    weatherData,
    irrigationEvents,
    irrigationSystemType,
    debouncedParams,
  }: {
    type?: SprayType;
    selectedSeason: string;
    todayDate: Date;
    todayStr: string;
    selectedBlockId: string | null;
    blocks: { id: string; treeHeight?: number; canopyWidth?: number; rowSpacing?: number }[];
    weatherData: Record<string, WeatherData>;
    irrigationEvents: Record<string, number>;
    irrigationSystemType: 'micro' | 'surface_drip' | 'sub_surface' | 'flood' | undefined;
    debouncedParams: { growthStage: GrowthStage; calib: CalibrationParams };
  }) => {
    if (!activeScenario) return;
    const isHistorical = sandboxView === 'historical';
    let startYear: number;
    let endDate: Date;
    if (isHistorical) {
      startYear = parseInt(selectedSeason.split('-')[0], 10);
      endDate = new Date(`${startYear + 1}-06-30T23:59:59Z`);
      if (endDate.getTime() > todayDate.getTime()) endDate = new Date(todayDate);
    } else {
      startYear = parseInt(SEASONS[0].split('-')[0], 10);
      endDate = new Date(todayDate);
      endDate.setDate(endDate.getDate() + 30);
    }
    const startDate = new Date(`${startYear}-06-01T12:00:00Z`);
    const selectedBlock = selectedBlockId ? blocks.find((b) => b.id === selectedBlockId) : null;
    const canopy = resolveCanopyGeometry({
      selectedBlock,
      blocks,
      overrides: {
        treeHeight: activeScenario.treeHeight,
        canopyWidth: activeScenario.canopyWidth,
        rowSpacing: activeScenario.rowSpacing,
      },
      fallback: {
        treeHeight: debouncedParams.calib.treeHeight,
        canopyWidth: debouncedParams.calib.canopyWidth,
        rowSpacing: debouncedParams.calib.rowSpacing,
      },
    });
    const canopyCoverage = Math.min(1, canopy.canopyWidth / canopy.rowSpacing);
    const dynamicCalib = {
      ...debouncedParams.calib,
      treeHeight: canopy.treeHeight,
      canopyWidth: canopy.canopyWidth,
      rowSpacing: canopy.rowSpacing,
      cropCoefficient: 0.2 + 0.8 * canopyCoverage,
    };

    const currentSprays = { ...activeScenario.sprays };
    let iterations = 0;
    const maxIterations = isHistorical ? 100 : 30;
    const threshold = 0.8;

    while (iterations < maxIterations) {
      const results = runBlightModel(
        startDate,
        endDate,
        debouncedParams.growthStage,
        currentSprays,
        weatherData,
        irrigationEvents,
        irrigationSystemType || 'micro',
        dynamicCalib,
        { includeProtection: true, useCanopyMicroclimate: canopy.useCanopyMicroclimate }
      );
      const firstBreach = results.find(
        (d) =>
          (isHistorical ? d.timestamp >= startDate.getTime() : d.fullDate >= todayStr) &&
          d.threat > threshold
      );
      if (!firstBreach) break;

      const breachDate = new Date(firstBreach.timestamp);
      let foundSlot = false;
      for (let dOffset = 1; dOffset <= 4; dOffset++) {
        const sprayDate = new Date(breachDate);
        sprayDate.setDate(breachDate.getDate() - dOffset);
        const year = sprayDate.getFullYear();
        const month = String(sprayDate.getMonth() + 1).padStart(2, '0');
        const day = String(sprayDate.getDate()).padStart(2, '0');
        let sprayDateStr = `${year}-${month}-${day}`;
        if (!isHistorical && sprayDateStr < todayStr) sprayDateStr = todayStr;
        const startYearN = startDate.getFullYear();
        const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');
        const startDay = String(startDate.getDate()).padStart(2, '0');
        const startDateStr = `${startYearN}-${startMonth}-${startDay}`;
        if (isHistorical && sprayDateStr < startDateStr) sprayDateStr = startDateStr;
        if (!currentSprays[sprayDateStr]) {
          currentSprays[sprayDateStr] = { type, method: 'ground' };
          foundSlot = true;
          break;
        }
        if (sprayDateStr <= (isHistorical ? startDateStr : todayStr)) break;
      }
      if (!foundSlot) break;
      iterations++;
    }
    setSandboxSprays(currentSprays);
  };

  return {
    sandboxView,
    setSandboxView,
    sandboxUseSecondaryLatency,
    setSandboxUseSecondaryLatency,
    scenarios,
    setScenarios,
    activeScenarioId,
    setActiveScenarioId,
    compareAllScenarios,
    setCompareAllScenarios,
    activeScenario,
    setSandboxSprays,
    setSandboxIrrigation,
    setSandboxHeight,
    setSandboxWidth,
    setSandboxSpacing,
    handleCloneScenario,
    handleAutoDistribute,
  };
}

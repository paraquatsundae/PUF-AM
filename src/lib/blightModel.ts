export type SprayType = 'chem' | 'bio' | 'both';
export type ApplicationMethod = 'ground' | 'drone' | 'helicopter' | 'aeroplane';
export type GrowthStage = 'dormant' | 'bud_break' | 'bloom' | 'post_bloom' | 'shell_hardening';

function toLocalISOString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type DailyData = {
  dateStr: string;
  timestamp: number;
  year: number;
  month: number;
  threat: number;
  latentThreat: number;
  eruptingThreat: number;
  daysToEruption: number | null;
  chem: number;
  bio: number;
  isSprayDay: boolean;
  T: number;
  RH: number;
  R: number;
  WD: number;
  fullDate: string; // YYYY-MM-DD for easy reference
};

export type WeatherData = {
  T: number;
  RH: number;
  R: number;
  WD: number;
  maxHourlyRain: number;
  windSpeed?: number;
  ET0?: number;
};

export type CalibrationParams = {
  cdfBaseWeighting: number;
  cdfExponentialEffect: number;
  tempOptimumWeight: number;
  wdCompoundingRate: number;
  chemBaseDecayRate: number;
  bioFavorableGrowthRate: number;
  bioEnvDegradationCoef: number;

  blightSensitivity: number;
  cropCoefficient: number;
  gddBaseTemp: number;
  humidityGradientFactor: number;
  splashMultiplier: number;
  chemRainWashoffRate: number;
  bioColonizationEff: number;
  /**
   * Initial threat at the start of a model run (unitless floor).
   * Not loaded from last season’s disease or bud CFU — just a calibration knob.
   */
  springStartingInoculum: number;
  latencyGDDThreshold: number;
  /** Reserved for future calendar-latency experiments; core uses GDD. */
  latencyDays: number;
  secondarySpreadMultiplier: number;
  chemEfficacy: number;
  bioEfficacy: number;
  treeHeight: number;
  canopyWidth: number;
  rowSpacing: number;
};

export const defaultCalibration: CalibrationParams = {
  cdfBaseWeighting: 0.7,
  cdfExponentialEffect: 1.0,
  tempOptimumWeight: 1.2,
  wdCompoundingRate: 0.1,
  chemBaseDecayRate: 0.88,
  bioFavorableGrowthRate: 1.1,
  bioEnvDegradationCoef: 0.75,

  blightSensitivity: 0.85,
  cropCoefficient: 1.0,
  gddBaseTemp: 10.0,
  humidityGradientFactor: 1.0,
  splashMultiplier: 1.0,
  chemRainWashoffRate: 0.05,
  bioColonizationEff: 1.0,
  springStartingInoculum: 0.02,
  latencyGDDThreshold: 120.0,
  latencyDays: 18,
  /** Only used when `useSecondaryLatency` is on; 1.0 = no extra amplification. */
  secondarySpreadMultiplier: 1.0,
  chemEfficacy: 95,
  bioEfficacy: 30,
  treeHeight: 4.5,
  canopyWidth: 4.0,
  rowSpacing: 7.0,
};

/**
 * Product options layered on the PUFOM weather-driven core.
 * Protection is sandbox-only; phenology calendar mode fixes Historical.
 */
export type BlightModelOptions = {
  includeProtection?: boolean;
  /**
   * Canopy TRV/CDF RH–WD modifiers.
   * Default **false** — only turn on when orchard geometry is explicitly set
   * (see `hasExplicitCanopyGeometry`), not when using calibration defaults alone.
   */
  useCanopyMicroclimate?: boolean;
  /**
   * Experimental GDD latency queue + secondary “eruption” feedback into threat.
   * Default **false** — historical/forecast use weather-driven threat only.
   * Enable in sandbox when you want to explore lag / secondary bumps.
   */
  useSecondaryLatency?: boolean;
  /**
   * `calendar` (default): stage from each day's month — required for multi-month historical.
   * `fixed`: use the growthStage argument every day (sandbox what-ifs).
   */
  phenologyMode?: 'calendar' | 'fixed';
  /**
   * Optional scouting override (Forecast “from today” path).
   * When set with `phenologyMode: 'calendar'`, days on/after `scoutingEffectiveFrom`
   * (YYYY-MM-DD, default: first day of the run that is ≥ today if omitted by caller)
   * use this stage instead of the month schedule. Past days stay on the calendar.
   * Reserved for diary/scouted phenology later — not persisted yet.
   */
  scoutingStage?: GrowthStage;
  /** Inclusive YYYY-MM-DD; required for a stable override window when `scoutingStage` is set. */
  scoutingEffectiveFrom?: string;
};

/** True when height, width, and row spacing are all positive (not missing / zero). */
export function hasExplicitCanopyGeometry(g: {
  treeHeight?: number | null;
  canopyWidth?: number | null;
  rowSpacing?: number | null;
}): boolean {
  return (
    typeof g.treeHeight === 'number' &&
    g.treeHeight > 0 &&
    typeof g.canopyWidth === 'number' &&
    g.canopyWidth > 0 &&
    typeof g.rowSpacing === 'number' &&
    g.rowSpacing > 0
  );
}

export type CanopyGeomFields = {
  treeHeight?: number | null;
  canopyWidth?: number | null;
  rowSpacing?: number | null;
  areaHa?: number;
};

/**
 * Resolve canopy geometry for blight runs.
 * TRV/CDF microclimate is **off** unless geometry comes from map blocks (or a full sandbox override),
 * not from calibration defaults alone.
 */
export function resolveCanopyGeometry(input: {
  selectedBlock?: CanopyGeomFields | null;
  blocks?: CanopyGeomFields[];
  /** Sandbox sliders — null means “use base”. */
  overrides?: CanopyGeomFields | null;
  fallback: { treeHeight: number; canopyWidth: number; rowSpacing: number };
}): {
  treeHeight: number;
  canopyWidth: number;
  rowSpacing: number;
  useCanopyMicroclimate: boolean;
} {
  const blocks = input.blocks || [];
  const overrides = input.overrides;
  const selected = input.selectedBlock;

  let base = { ...input.fallback };
  let baseFromBlocks = false;

  if (selected && hasExplicitCanopyGeometry(selected)) {
    base = {
      treeHeight: selected.treeHeight as number,
      canopyWidth: selected.canopyWidth as number,
      rowSpacing: selected.rowSpacing as number,
    };
    baseFromBlocks = true;
  } else {
    const complete = blocks.filter(hasExplicitCanopyGeometry);
    if (complete.length > 0) {
      const totalArea =
        complete.reduce((sum, b) => sum + (b.areaHa && b.areaHa > 0 ? b.areaHa : 0), 0) ||
        complete.length;
      let h = 0;
      let w = 0;
      let s = 0;
      for (const b of complete) {
        const area = b.areaHa && b.areaHa > 0 ? b.areaHa : totalArea / complete.length;
        h += (b.treeHeight as number) * area;
        w += (b.canopyWidth as number) * area;
        s += (b.rowSpacing as number) * area;
      }
      base = {
        treeHeight: h / totalArea,
        canopyWidth: w / totalArea,
        rowSpacing: s / totalArea,
      };
      baseFromBlocks = true;
    }
  }

  const merged = {
    treeHeight: overrides?.treeHeight != null ? overrides.treeHeight : base.treeHeight,
    canopyWidth: overrides?.canopyWidth != null ? overrides.canopyWidth : base.canopyWidth,
    rowSpacing: overrides?.rowSpacing != null ? overrides.rowSpacing : base.rowSpacing,
  };

  const fullSandboxOverride =
    overrides != null &&
    overrides.treeHeight != null &&
    overrides.canopyWidth != null &&
    overrides.rowSpacing != null;

  const useCanopyMicroclimate =
    hasExplicitCanopyGeometry(merged) && (baseFromBlocks || fullSandboxOverride);

  return { ...merged, useCanopyMicroclimate };
}

function stageSusceptibility(growthStage: GrowthStage): number {
  switch (growthStage) {
    case 'dormant':
      return 0.1;
    case 'bud_break':
      return 1.5;
    case 'bloom':
      return 2.0;
    case 'post_bloom':
      return 1.0;
    case 'shell_hardening':
      return 0.3;
  }
}

/**
 * Coarse Southern-Hemisphere WA walnut schedule used by Forecast / Historical.
 * Month index 0 = January … 11 = December. Not scouting-confirmed.
 *
 * | Months (SH)   | Stage            | Susceptibility |
 * |---------------|------------------|----------------|
 * | May–Aug       | dormant          | 0.1            |
 * | Sep           | bud_break        | 1.5            |
 * | Oct           | bloom            | 2.0            |
 * | Nov–Jan       | post_bloom       | 1.0            |
 * | Feb–Apr       | shell_hardening  | 0.3            |
 */
export const SH_WALNUT_PHENOLOGY_BY_MONTH: ReadonlyArray<{
  months: readonly number[];
  monthLabels: string;
  stage: GrowthStage;
  susceptibility: number;
}> = [
  { months: [4, 5, 6, 7], monthLabels: 'May–Aug', stage: 'dormant', susceptibility: 0.1 },
  { months: [8], monthLabels: 'Sep', stage: 'bud_break', susceptibility: 1.5 },
  { months: [9], monthLabels: 'Oct', stage: 'bloom', susceptibility: 2.0 },
  { months: [10, 11, 0], monthLabels: 'Nov–Jan', stage: 'post_bloom', susceptibility: 1.0 },
  { months: [1, 2, 3], monthLabels: 'Feb–Apr', stage: 'shell_hardening', susceptibility: 0.3 },
] as const;

const STAGE_LABELS: Record<GrowthStage, string> = {
  dormant: 'Dormant',
  bud_break: 'Bud break',
  bloom: 'Bloom',
  post_bloom: 'Post-bloom',
  shell_hardening: 'Shell hardening',
};

export function growthStageLabel(stage: GrowthStage): string {
  return STAGE_LABELS[stage];
}

/** Southern-hemisphere walnut phenology from calendar month (0–11). */
export function growthStageFromDate(date: Date): GrowthStage {
  const month = date.getMonth();
  for (const row of SH_WALNUT_PHENOLOGY_BY_MONTH) {
    if (row.months.includes(month)) return row.stage;
  }
  return 'shell_hardening';
}

/** Month labels for the calendar row that owns this stage (e.g. bloom → "Oct"). */
export function calendarMonthLabelsForStage(stage: GrowthStage): string {
  return SH_WALNUT_PHENOLOGY_BY_MONTH.find((r) => r.stage === stage)?.monthLabels ?? '';
}

/**
 * Resolve stage for one model day.
 * - `fixed`: always `growthStage` (sandbox).
 * - `calendar`: month schedule, optionally overridden from `scoutingEffectiveFrom` onward.
 */
export function resolveGrowthStageForDay(
  date: Date,
  growthStage: GrowthStage,
  options: Pick<BlightModelOptions, 'phenologyMode' | 'scoutingStage' | 'scoutingEffectiveFrom'> = {}
): GrowthStage {
  const phenologyMode = options.phenologyMode ?? 'calendar';
  if (phenologyMode === 'fixed') return growthStage;

  const calendarStage = growthStageFromDate(date);
  const { scoutingStage, scoutingEffectiveFrom } = options;
  if (!scoutingStage || !scoutingEffectiveFrom) return calendarStage;

  const dateKey = toLocalISOString(date);
  return dateKey >= scoutingEffectiveFrom ? scoutingStage : calendarStage;
}

export function runBlightModel(
  startDate: Date,
  endDate: Date,
  growthStage: GrowthStage,
  sprayEvents: Record<string, { type: SprayType; method: ApplicationMethod }>,
  weatherData: Record<string, WeatherData>,
  irrigationEvents: Record<string, number> = {},
  irrigationType: 'micro' | 'surface_drip' | 'sub_surface' | 'flood' = 'micro',
  calib: CalibrationParams = defaultCalibration,
  options: BlightModelOptions = {}
): DailyData[] {
  const includeProtection = options.includeProtection === true;
  const useCanopyMicroclimate = options.useCanopyMicroclimate === true;
  const useSecondaryLatency = options.useSecondaryLatency === true;
  const phenologyMode = options.phenologyMode ?? 'calendar';

  const data: DailyData[] = [];
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  let currentThreat = calib.springStartingInoculum;
  let currentChem = 0;
  let currentBio = 0;
  let accumulatedGDD = 0;
  let latentQueue: { gdd: number; amount: number; date: string }[] = [];

  let lastKnownT = 15;
  let lastKnownRH = 60;
  let lastKnownR = 0;
  let lastKnownWD = 4;
  let lastKnownMaxHourlyRain = 0;

  for (let i = 0; i <= totalDays; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const dateKey = toLocalISOString(currentDate);

    const dailyWeather = weatherData[dateKey];
    const T = dailyWeather ? dailyWeather.T : lastKnownT;
    const RH = dailyWeather ? dailyWeather.RH : lastKnownRH;
    const R = dailyWeather ? dailyWeather.R : lastKnownR;
    const WD = dailyWeather ? dailyWeather.WD : lastKnownWD;
    const maxHourlyRain = dailyWeather ? dailyWeather.maxHourlyRain : lastKnownMaxHourlyRain;

    if (dailyWeather) {
      lastKnownT = T;
      lastKnownRH = RH;
      lastKnownR = R;
      lastKnownWD = WD;
      lastKnownMaxHourlyRain = maxHourlyRain;
    }

    const dailyGDD = Math.max(0, T - calib.gddBaseTemp);
    accumulatedGDD += dailyGDD;

    // Canopy Density Factor (CDF) / TRV — optional but on by default (pre–Ji path)
    const trv = (calib.treeHeight * calib.canopyWidth * 10000) / calib.rowSpacing;
    const trvNorm = Math.min(1, trv / 25000);
    const CDF = Math.pow(Math.min(1, trvNorm), calib.cdfExponentialEffect);
    const cdfDiff = CDF - 0.5;

    let modifiedRH = RH;
    let modifiedWD = WD;

    if (useCanopyMicroclimate) {
      const w = Math.min(1, Math.max(0, calib.cdfBaseWeighting));
      const canopyRH = RH + cdfDiff * 15 * calib.humidityGradientFactor;
      const canopyWD = WD + cdfDiff * 4;
      modifiedRH = RH * (1 - w) + canopyRH * w;
      modifiedWD = WD * (1 - w) + canopyWD * w;

      const irrigationAmount = irrigationEvents[dateKey] || 0;
      let irigRHModifier = 0;
      let irigWDModifier = 0;
      if (irrigationAmount > 0) {
        switch (irrigationType) {
          case 'micro':
            irigRHModifier = 15;
            irigWDModifier = 1.5;
            break;
          case 'flood':
            irigRHModifier = 10;
            break;
          case 'surface_drip':
            irigRHModifier = 3;
            break;
          case 'sub_surface':
            break;
        }
      }
      modifiedRH = Math.min(100, Math.max(0, modifiedRH + irigRHModifier * CDF * calib.humidityGradientFactor));
      modifiedWD = Math.max(0, modifiedWD + irigWDModifier * CDF);
    }

    // Rain splash dispersal
    let rainSplashMultiplier = 1.0;
    if (maxHourlyRain > 0) {
      if (maxHourlyRain < 2) {
        rainSplashMultiplier = 1.1;
      } else if (maxHourlyRain <= 5) {
        rainSplashMultiplier = 1.2;
      } else {
        rainSplashMultiplier = 2.0;
      }
      if (useCanopyMicroclimate) {
        const splashModifier = 1 + cdfDiff * 0.5;
        rainSplashMultiplier = Math.max(
          1.0,
          rainSplashMultiplier * splashModifier * calib.splashMultiplier
        );
      } else {
        rainSplashMultiplier = Math.max(1.0, rainSplashMultiplier * calib.splashMultiplier);
      }
    }

    // Weather-driven infection (PUFOM core — not inoculum-gated)
    const tempFactor = T > 12 && T < 24 ? calib.tempOptimumWeight : 0.5;
    const wetnessFactor = modifiedWD > 8 ? (modifiedWD - 8) * calib.wdCompoundingRate : 0;
    const humidityFactor = modifiedRH > 85 ? 1.2 * calib.humidityGradientFactor : 1.0;

    const dayStage = resolveGrowthStageForDay(currentDate, growthStage, {
      phenologyMode,
      scoutingStage: options.scoutingStage,
      scoutingEffectiveFrom: options.scoutingEffectiveFrom,
    });
    const stageFactor = stageSusceptibility(dayStage);
    const sensitivityModifier = 0.85 / Math.max(0.1, calib.blightSensitivity);

    const dailyInfectionRate =
      tempFactor *
      wetnessFactor *
      humidityFactor *
      stageFactor *
      rainSplashMultiplier *
      sensitivityModifier;

    // Protection armour (sandbox only)
    let isSprayDay = false;
    let bioSuppression = 0;
    let totalSuppression = 0;

    if (includeProtection) {
      // Decay first so same-day sprays are not immediately eroded
      const rainWashoff = R > 15 ? calib.chemRainWashoffRate : 0;
      currentChem = Math.max(0, currentChem * calib.chemBaseDecayRate - rainWashoff);

      const isFavorableBio = T > 15 && T < 25 && modifiedRH > 80;
      if (isFavorableBio) {
        currentBio = Math.min(1.0, currentBio * calib.bioFavorableGrowthRate);
      } else {
        currentBio = Math.max(0, currentBio * calib.bioEnvDegradationCoef - (R > 10 ? 0.08 : 0));
      }

      const sprayEvent = sprayEvents[dateKey];
      if (sprayEvent) {
        const { type: sprayType, method } = sprayEvent;

        let methodPenaltyMultiplier = 1.0;
        switch (method) {
          case 'ground':
            methodPenaltyMultiplier = 1.2;
            break;
          case 'aeroplane':
            methodPenaltyMultiplier = 0.8;
            break;
          case 'drone':
            methodPenaltyMultiplier = 0.5;
            break;
          case 'helicopter':
            methodPenaltyMultiplier = 0.2;
            break;
        }

        const trvPenalty = Math.max(0, (trv - 10000) / 100000);
        const sprayPenetrationPenalty = Math.max(
          0,
          (cdfDiff * 0.15 + trvPenalty) * methodPenaltyMultiplier
        );

        if (sprayType === 'chem' || sprayType === 'both') {
          const baseChem = calib.chemEfficacy / 100;
          currentChem = Math.max(0.1, baseChem * (1 - sprayPenetrationPenalty));
          isSprayDay = true;
        }
        if (sprayType === 'bio' || sprayType === 'both') {
          const interferenceFactor = Math.max(0.1, 1 - currentChem * 1.2);
          const baseBio = calib.bioColonizationEff * interferenceFactor;
          currentBio = Math.min(
            1.0,
            currentBio + Math.max(0.05, baseBio * (1 - sprayPenetrationPenalty))
          );
          isSprayDay = true;
        }
      }

      bioSuppression = currentBio * (calib.bioEfficacy / 100);
      totalSuppression = Math.min(1.0, currentChem + bioSuppression);
    } else {
      currentChem = 0;
      currentBio = 0;
    }

    const effectiveDailyInfection = dailyInfectionRate * 0.2 * (1 - totalSuppression);

    let currentLatentThreat = 0;
    let secondaryInfection = 0;
    let daysToEruption: number | null = null;

    if (useSecondaryLatency) {
      if (effectiveDailyInfection > 0.01) {
        latentQueue.push({ gdd: accumulatedGDD, amount: effectiveDailyInfection, date: dateKey });
      }

      let nextEruptionGDD: number | null = null;
      let eruptingAmount = 0;
      latentQueue = latentQueue.filter((item) => {
        const gddRemaining = calib.latencyGDDThreshold - (accumulatedGDD - item.gdd);
        if (gddRemaining <= 0) {
          eruptingAmount += item.amount;
          return false;
        }
        if (nextEruptionGDD === null || gddRemaining < nextEruptionGDD) {
          nextEruptionGDD = gddRemaining;
        }
        return true;
      });

      currentLatentThreat = latentQueue.reduce((sum, item) => sum + item.amount, 0);
      daysToEruption =
        nextEruptionGDD !== null ? Math.ceil(nextEruptionGDD / Math.max(1, dailyGDD)) : null;
      secondaryInfection =
        eruptingAmount * (calib.secondarySpreadMultiplier || 1.0) * (1 - totalSuppression);
    }

    currentThreat = currentThreat * 0.85 + effectiveDailyInfection + secondaryInfection;
    currentThreat = Math.min(1.5, currentThreat);

    data.push({
      dateStr: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: dateKey,
      timestamp: currentDate.getTime(),
      year,
      month,
      threat: Number(currentThreat.toFixed(2)),
      latentThreat: Number(currentLatentThreat.toFixed(2)),
      eruptingThreat: Number(secondaryInfection.toFixed(2)),
      daysToEruption,
      chem: Number((includeProtection ? currentChem : 0).toFixed(2)),
      bio: Number((includeProtection ? bioSuppression : 0).toFixed(2)),
      isSprayDay: includeProtection && isSprayDay,
      T: Number(T.toFixed(1)),
      RH: Number(RH.toFixed(1)),
      R: Number(R.toFixed(1)),
      WD: Number(WD.toFixed(1)),
    });
  }

  return data;
}

/**
 * Wheat yield calculator — calculation only.
 * This is the logic currently running in the Wheat Yield app (v1.12).
 * No Android, no DOM.
 *
 * Counting rule:
 *   The user counts one side of the head only.
 *   grains/head = height × width × 2
 *   10 high × 4 wide = 80 grains.
 *
 * Hectolitre to grain:
 *   half-litre cup grams = HLW × 5          (74 kg/hL = 370 g)
 *   TGW g/1000 = 0.50 × HLW + 3             (74 kg/hL = 40.0 g = 40 mg/grain)
 *   A weighed TGW above 0 overrides that estimate.
 *
 * Yield:
 *   t/ha = heads/m² × grains/head × mg/grain / 100000
 *   paddock t/ha = counted t/ha × (1 − deduction)
 *   total tonnes = paddock t/ha × area
 *
 * Several square-metre counts are averaged (heads, height, width).
 * HLW, deduction, area and TGW are paddock figures, applied once.
 * If no count has been added, the numbers on screen are one count.
 */

export interface HeadCount {
  /** Heads in a measured square metre. */
  heads: number;
  /** Sockets along one side of an average head. */
  height: number;
  /** Grains filling across one side. 2 thin, 3 average, 4 plump. */
  width: number;
}

export interface PaddockInputs {
  counts: HeadCount[];
  /** kg/hL. WA milling floor default is 74. */
  hectolitreWeight: number;
  /** Gut-feel percent off, for low areas that were not counted. 0–100. */
  deductionPercent: number;
  /** Seeded area, hectares. */
  hectares: number;
  /** Weighed thousand-grain weight, g/1000. 0 means use the HLW estimate. */
  thousandGrainWeightOverride?: number;
}

export interface YieldResult {
  countCount: number;
  meanHeadsPerM2: number;
  meanHeight: number;
  meanWidth: number;
  grainsPerHead: number;
  grainsPerM2: number;
  hectolitreWeight: number;
  halfLitreCupGrams: number;
  estimatedThousandGrainWeight: number;
  thousandGrainWeightUsed: number;
  gramsPerGrain: number;
  milligramsPerGrain: number;
  countedTonnesPerHa: number;
  deductionTonnesPerHa: number;
  tonnesPerHa: number;
  totalTonnes: number;
  note: string;
}

export const DEFAULTS = {
  heads: 320,
  height: 10,
  width: 3,
  hectolitreWeight: 74,
  deductionPercent: 10,
  hectares: 100,
  thousandGrainWeightOverride: 0,
} as const;

/** TGW g/1000 from hectolitre weight. 74 kg/hL → 40 g. */
export function tgwFromHlw(hlwKgPerHl: number): number {
  return 0.5 * hlwKgPerHl + 3;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

export function estimateYield(input: PaddockInputs): YieldResult {
  const counts = input.counts.length
    ? input.counts
    : [{ heads: 0, height: 0, width: 0 }];

  const meanHeads = mean(counts.map((c) => c.heads));
  const meanHeight = mean(counts.map((c) => c.height));
  const meanWidth = mean(counts.map((c) => c.width));

  const grainsPerHead = meanHeight * meanWidth * 2;
  const grainsPerM2 = meanHeads * grainsPerHead;

  const hlw = input.hectolitreWeight;
  const deduction = Math.min(Math.max(input.deductionPercent, 0), 100) / 100;
  const estimatedTgw = tgwFromHlw(hlw);
  const override = input.thousandGrainWeightOverride ?? 0;
  const tgwUsed = override > 0 ? override : estimatedTgw;
  const gramsPerGrain = tgwUsed / 1000;

  const countedTonnesPerHa = (meanHeads * grainsPerHead * tgwUsed) / 100_000;
  const tonnesPerHa = countedTonnesPerHa * (1 - deduction);
  const totalTonnes = tonnesPerHa * input.hectares;

  let note = 'Plausible paddock estimate. Walk more strips if it is patchy.';
  if (tonnesPerHa <= 0) note = 'Enter the paddock counts.';
  else if (tonnesPerHa < 0.8) note = 'Very light crop. Check head count and fill width.';
  else if (tonnesPerHa > 8) note = 'Bumper result. Confirm heads/m2 and that width is grains on one side only.';
  else if (hlw < 70 && tonnesPerHa > 4) note = 'Low hectolitre with a high yield. Pinched grain may not deliver this.';

  return {
    countCount: input.counts.length,
    meanHeadsPerM2: meanHeads,
    meanHeight,
    meanWidth,
    grainsPerHead,
    grainsPerM2,
    hectolitreWeight: hlw,
    halfLitreCupGrams: hlw * 5,
    estimatedThousandGrainWeight: estimatedTgw,
    thousandGrainWeightUsed: tgwUsed,
    gramsPerGrain,
    milligramsPerGrain: tgwUsed,
    countedTonnesPerHa,
    deductionTonnesPerHa: countedTonnesPerHa * deduction,
    tonnesPerHa,
    totalTonnes,
    note,
  };
}

/** Same numbers the app opens with: 320 heads, 10 × 3, 74 kg/hL, 10% off, 100 ha. */
export function example(): YieldResult {
  return estimateYield({
    counts: [{ heads: DEFAULTS.heads, height: DEFAULTS.height, width: DEFAULTS.width }],
    hectolitreWeight: DEFAULTS.hectolitreWeight,
    deductionPercent: DEFAULTS.deductionPercent,
    hectares: DEFAULTS.hectares,
  });
}

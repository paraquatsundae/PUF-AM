export interface MoistureReading {
  time: string; // ISO string
  moisture: number; // percentage
  note?: string;      // optional note for this reading
}

export interface TempReading {
  time: string; // ISO string
  temperature: number; // Celsius
  note?: string;       // optional note for this reading
}

export interface DryingSession {
  id: string;
  binNumber: string;
  /** Farm setup dryer id when chosen from configured dryers. */
  dryerId?: string;
  blockId?: string;
  harvestRecordId?: string;
  status: 'active' | 'completed';
  targetMoisture: number;
  readings: MoistureReading[];
  temperatureReadings?: TempReading[];
  startTime: string;
  generalComments?: string; // optional general comments for the session
}

export interface DryingPrediction {
  k: number; // drying rate constant
  m0: number; // estimated initial moisture based on curve fit
  targetDate: Date; // when it will hit target
  targetHours: number; // hours from start to hit target
  plotData: Array<{
    hours: number;
    fitted: number | null;
    measured: number | null;
    isTarget?: boolean;
    date: Date;
  }>;
  t0: number; // unix timestamp of start
}

export function calculateDryingPrediction(
  readings: MoistureReading[], 
  targetMoisture: number = 4.0
): DryingPrediction | null {
  if (readings.length < 2) return null;

  // Sort readings chronologically
  const sorted = [...readings].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const t0 = new Date(sorted[0].time).getTime();

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  const n = sorted.length;
  
  const pts = sorted.map(r => {
    // x is hours from t0
    const x = (new Date(r.time).getTime() - t0) / (1000 * 60 * 60);
    const y = Math.log(r.moisture);
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    return { x, y, moisture: r.moisture };
  });

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator; // -k
  const intercept = (sumY - slope * sumX) / n; // ln(M0)

  const k = -slope;
  const m0 = Math.exp(intercept);

  // If curve is not decaying, predict logic fails (e.g., getting wetter or static)
  if (k <= 0) return null;

  // target = m0 * e^(-k * t) => ln(target) = ln(m0) - k * t => t = (ln(m0) - ln(target)) / k
  const targetHours = (Math.log(m0) - Math.log(targetMoisture)) / k;
  const targetDate = new Date(t0 + targetHours * 60 * 60 * 1000);

  // Build plot data
  const plotData = [];
  const maxActualHour = pts[pts.length - 1].x;
  
  // Extend graph a bit past the target if target happens before max actual,
  // or a bit past max actual if target is far in the future.
  const maxPlotHours = Math.max(targetHours, maxActualHour) * 1.1; 
  
  // Generate curve points (smooth line)
  const numSteps = 50;
  for(let i = 0; i <= numSteps; i++) {
    const h = (maxPlotHours * i) / numSteps;
    const fittedMoisture = m0 * Math.exp(-k * h);
    plotData.push({
      hours: Number(h.toFixed(2)),
      fitted: Number(fittedMoisture.toFixed(2)),
      measured: null,
      date: new Date(t0 + h * 60 * 60 * 1000)
    });
  }

  // Inject actual measured points exactly where they lie
  pts.forEach(p => {
    plotData.push({
      hours: Number(p.x.toFixed(2)),
      fitted: null,
      measured: p.moisture,
      date: new Date(t0 + p.x * 60 * 60 * 1000)
    });
  });

  // Inject target point
  plotData.push({
    hours: Number(targetHours.toFixed(2)),
    fitted: null,
    measured: null,
    isTarget: true,
    targetY: targetMoisture,
    date: targetDate
  });

  // Sort everything by hours for recharts
  plotData.sort((a, b) => a.hours - b.hours);

  return { k, m0, targetDate, targetHours, plotData, t0 };
}

"use strict";
/**
 * Ji et al. 2025 — mechanistic walnut blight infection risk (Cloud Functions mirror).
 *
 * This is a byte-for-byte behavioural mirror of `shared/weather/jiBlightModel.ts`
 * plus the seasonal bridge from `src/lib/runJiBlightSeries.ts`. Firebase deploys
 * only the `functions/` folder (see firebase.json) and this tsconfig is scoped to
 * `src`, so we cannot import the shared module directly. The parity test
 * `tests/functionsJiParity.test.ts` runs both implementations over the golden
 * fixture and fails if they diverge — keep them in sync.
 *
 * Published coefficients are frozen; only orchard `k` is farm-tunable.
 * @see Plans/BLIGHT_VALIDATION.md (BV-09 client ↔ Cloud Function parity)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JI_INOCULUM_K = exports.JI_ACTION_THRESHOLD = exports.JI_WATCH_THRESHOLD = exports.JI_PUBLISHED = void 0;
exports.bandFromRisk = bandFromRisk;
exports.kFromInoculumLevel = kFromInoculumLevel;
exports.estimateWetnessHoursProxy = estimateWetnessHoursProxy;
exports.jiTempFactor = jiTempFactor;
exports.jiWetnessFactor = jiWetnessFactor;
exports.jiDensityFactor = jiDensityFactor;
exports.runJiBlightModel = runJiBlightModel;
exports.runJiBlightSeries = runJiBlightSeries;
/** Frozen parameters from Ji et al. 2025 (Adaskaveg 1998 fits). */
exports.JI_PUBLISHED = {
    aMobil: 0.916,
    TminInf: 10,
    TmaxInf: 24,
    bBeta: 3.075,
    cBeta: 0.676,
    dBeta: 8.205,
    eGomp: 1.02,
    fGomp: 2.093,
    gGomp: 0.896,
};
/** Below this: Quiet. At/above: Watch. (mirror of jiBlightBands.ts) */
exports.JI_WATCH_THRESHOLD = 0.002;
/** At/above: Action. */
exports.JI_ACTION_THRESHOLD = 0.01;
function bandFromRisk(risk) {
    if (risk >= exports.JI_ACTION_THRESHOLD)
        return "action";
    if (risk >= exports.JI_WATCH_THRESHOLD)
        return "watch";
    return "quiet";
}
exports.JI_INOCULUM_K = {
    low: 0.5,
    medium: 1.0,
    high: 2.0,
};
/** Map an inoculum level to Ji `k`. Unknown/undefined → medium (k=1, unchanged). */
function kFromInoculumLevel(level) {
    return level && level in exports.JI_INOCULUM_K ? exports.JI_INOCULUM_K[level] : exports.JI_INOCULUM_K.medium;
}
/** Interim LWD when no sensor: rain intensity + high RH (local Mathematica notebook). */
function estimateWetnessHoursProxy(R, RH) {
    const fromRain = R > 0.2 ? 5 + 0.8 * R : 0;
    const fromHumidity = RH > 82 ? 5 : 0;
    return Math.min(18, fromRain + fromHumidity);
}
/** Beta temperature response — Analytis form as in Ji supplementary / notebook. */
function jiTempFactor(T, p = exports.JI_PUBLISHED) {
    if (T < p.TminInf || T > p.TmaxInf)
        return 0;
    const teq = (T - p.TminInf) / (p.TmaxInf - p.TminInf);
    if (teq <= 0 || teq >= 1)
        return 0;
    return p.bBeta * teq ** p.cBeta * (1 - teq) ** p.dBeta;
}
/** Gompertz wetness response (Ji eq. 4). */
function jiWetnessFactor(WD, p = exports.JI_PUBLISHED) {
    return p.eGomp * Math.exp(-Math.exp(-p.fGomp * (WD - p.gGomp)));
}
function jiDensityFactor(orchard = {}) {
    const dens = orchard.treeDensityPerHa;
    if (dens == null || dens <= 0)
        return 1;
    const ref = orchard.densityRefPerHa ?? 150;
    const alpha = orchard.alphaDensity ?? 0.28;
    const exp = orchard.densityExponent ?? 1.3;
    const factor = 1 + alpha * (dens / ref - 1);
    return Math.max(0, factor) ** exp;
}
/** Run Ji infection risk over a daily weather series (one budbreak season). */
function runJiBlightModel(weather, options = {}) {
    const p = exports.JI_PUBLISHED;
    const k = options.orchard?.k ?? 1;
    const doseMode = options.doseMode ?? "deltaY";
    const densityMult = jiDensityFactor(options.orchard ?? {});
    let cumulativeRain = 0;
    let prevY = 0;
    const out = [];
    for (const day of weather) {
        const R = Math.max(0, day.R);
        const RH = day.RH ?? 60;
        const WD = typeof day.WD === "number" && Number.isFinite(day.WD)
            ? Math.max(0, Math.min(24, day.WD))
            : estimateWetnessHoursProxy(R, RH);
        cumulativeRain += R;
        const Y = k * (1 - p.aMobil ** cumulativeRain);
        const deltaY = Math.max(0, Y - prevY);
        prevY = Y;
        const fTemp = jiTempFactor(day.T, p);
        const fWetness = jiWetnessFactor(WD, p);
        const infectionRate = fTemp * fWetness;
        const dose = doseMode === "cumulativeY" ? Y : deltaY;
        const dailyInfectionRisk = infectionRate * dose * densityMult;
        out.push({
            date: day.date,
            cumulativeRain,
            primaryInoculumY: Y,
            primaryDoseDelta: deltaY,
            wetnessHours: WD,
            fTemp,
            fWetness,
            infectionRate,
            dailyInfectionRisk,
        });
    }
    return out;
}
function toLocalISOString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
/** Southern Hemisphere calendar bud break: 1 Sep of each year. */
function isShBudbreakDay(date) {
    return date.getMonth() === 8 && date.getDate() === 1;
}
/** First SH budbreak on or after rangeStart (local calendar). */
function defaultShBudbreakDate(rangeStart) {
    const y = rangeStart.getFullYear();
    const sep1 = new Date(y, 8, 1);
    if (toLocalISOString(rangeStart) <= toLocalISOString(sep1))
        return sep1;
    return new Date(y + 1, 8, 1);
}
/**
 * Seasonal Ji infection risk, mirroring `src/lib/runJiBlightSeries.ts`.
 * Rain / primary inoculum accumulate from each SH budbreak (1 Sep), resetting yearly.
 */
function runJiBlightSeries(startDate, endDate, weatherData, options = {}) {
    const firstBudbreak = defaultShBudbreakDate(startDate);
    const firstBudbreakKey = toLocalISOString(firstBudbreak);
    const doseMode = options.doseMode ?? "cumulativeY";
    const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
    const out = [];
    let lastT = 15;
    let lastRH = 60;
    let lastR = 0;
    let lastWD;
    let segmentWeather = [];
    let segmentMeta = [];
    const flushSegment = () => {
        if (segmentWeather.length === 0)
            return;
        const ji = runJiBlightModel(segmentWeather, {
            orchard: options.orchard,
            doseMode,
        });
        for (let i = 0; i < segmentMeta.length; i++) {
            const m = segmentMeta[i];
            const row = ji[i];
            const risk = m.beforeFirstBudbreak ? 0 : row.dailyInfectionRisk;
            const raw = weatherData[m.key];
            const T = raw?.T ?? segmentWeather[i].T;
            const RH = raw?.RH ?? segmentWeather[i].RH;
            const R = raw?.R ?? 0;
            const threat = Number(risk.toFixed(6));
            out.push({
                fullDate: m.key,
                threat,
                band: bandFromRisk(threat),
                T: Number(T.toFixed(1)),
                RH: Number(RH.toFixed(1)),
                R: Number(R.toFixed(1)),
                WD: Number(row.wetnessHours.toFixed(1)),
            });
        }
        segmentWeather = [];
        segmentMeta = [];
    };
    for (let i = 0; i <= totalDays; i++) {
        const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
        const key = toLocalISOString(d);
        const w = weatherData[key];
        if (w) {
            lastT = w.T;
            lastRH = w.RH;
            lastR = w.R;
            lastWD = w.WD;
        }
        const seasonReset = isShBudbreakDay(d) && segmentWeather.length > 0;
        if (seasonReset) {
            flushSegment();
            lastR = 0;
            lastWD = undefined;
        }
        const beforeFirstBudbreak = key < firstBudbreakKey;
        const R = beforeFirstBudbreak ? 0 : w ? w.R : lastR;
        const T = w ? w.T : lastT;
        const RH = w ? w.RH : lastRH;
        const WD = w ? w.WD : lastWD;
        segmentMeta.push({ date: d, key, beforeFirstBudbreak });
        segmentWeather.push({ date: key, R, T, RH, WD });
    }
    flushSegment();
    return out;
}
//# sourceMappingURL=jiBlightModel.js.map
"use strict";
/**
 * Farm calendar is Australia/Perth. Cloud Functions run in us-central1 (UTC),
 * so `Date#getFullYear` / `getMonth` / `getDate` are yesterday for the first
 * eight hours of a Perth day — including the 05:00 blight aggregate.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPerthYmd = getPerthYmd;
exports.toPerthISOString = toPerthISOString;
exports.perthCivilDate = perthCivilDate;
exports.blightSeasonStart = blightSeasonStart;
function getPerthYmd(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Australia/Perth",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const num = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
    return { year: num("year"), month: num("month"), day: num("day") };
}
function toPerthISOString(date = new Date()) {
    const { year, month, day } = getPerthYmd(date);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
/**
 * Midnight *in the runtime TZ* on the Perth civil date. Safe to feed the
 * existing `getFullYear`/`getMonth`/`getDate` series walker: the Y-M-D
 * components match Perth, so weather-cache keys match the client in WA.
 */
function perthCivilDate(date = new Date()) {
    const { year, month, day } = getPerthYmd(date);
    return new Date(year, month - 1, day);
}
/**
 * SH walnut season start (1 June Perth) for the season that contains `now`.
 * June–December → this year's 1 June; January–May → last year's 1 June.
 */
function blightSeasonStart(now = new Date()) {
    const { year, month } = getPerthYmd(now);
    const startYear = month >= 6 ? year : year - 1;
    return new Date(startYear, 5, 1);
}
//# sourceMappingURL=perthDate.js.map
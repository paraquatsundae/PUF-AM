"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onDiaryEventWrite = exports.refreshBlightAggregates = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-functions/v2/firestore");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const DEFAULT_CALIBRATION = {
    blightSensitivity: 0.85,
    cropCoefficient: 1.0,
    gddBaseTemp: 10.0,
    humidityGradientFactor: 1.0,
    splashMultiplier: 1.0,
    chemRainWashoffRate: 0.05,
    bioColonizationEff: 1.0,
    springStartingInoculum: 0.1,
    latencyGDDThreshold: 120.0,
    secondarySpreadMultiplier: 1.5,
    chemEfficacy: 95,
    bioEfficacy: 30,
    treeHeight: 4.5,
    canopyWidth: 4.0,
    rowSpacing: 7.0,
    cdfBaseWeighting: 0.7,
    cdfExponentialEffect: 1.0,
    tempOptimumWeight: 1.2,
    wdCompoundingRate: 0.1,
    chemBaseDecayRate: 0.88,
    bioFavorableGrowthRate: 1.1,
    bioEnvDegradationCoef: 0.75,
};
function toLocalISOString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
/** Simplified server-side blight model (mirrors client model for aggregate pre-compute). */
function runBlightModel(startDate, endDate, sprayEvents, weatherData) {
    const data = [];
    const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const calib = DEFAULT_CALIBRATION;
    let currentThreat = calib.springStartingInoculum;
    let currentChem = 0;
    let currentBio = 0;
    let accumulatedGDD = 0;
    let latentQueue = [];
    for (let i = 0; i <= totalDays; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateKey = toLocalISOString(currentDate);
        const w = weatherData[dateKey] || { T: 15, RH: 60, R: 0, WD: 4, maxHourlyRain: 0 };
        const dailyGDD = Math.max(0, w.T - calib.gddBaseTemp);
        accumulatedGDD += dailyGDD;
        const tempFactor = w.T > 12 && w.T < 24 ? calib.tempOptimumWeight : 0.5;
        const wetnessFactor = w.WD > 8 ? (w.WD - 8) * calib.wdCompoundingRate : 0;
        const humidityFactor = w.RH > 85 ? 1.2 : 1.0;
        const dailyInfectionRate = tempFactor * wetnessFactor * humidityFactor * 2.0;
        const sprayEvent = sprayEvents[dateKey];
        if (sprayEvent) {
            if (sprayEvent.type === "chem" || sprayEvent.type === "both")
                currentChem = calib.chemEfficacy / 100;
            if (sprayEvent.type === "bio" || sprayEvent.type === "both")
                currentBio = Math.min(1, currentBio + 0.2);
        }
        currentChem = Math.max(0, currentChem * calib.chemBaseDecayRate);
        const totalSuppression = Math.min(1, currentChem + currentBio * (calib.bioEfficacy / 100));
        const effectiveDailyInfection = dailyInfectionRate * 0.2 * (1 - totalSuppression);
        if (effectiveDailyInfection > 0.01) {
            latentQueue.push({ gdd: accumulatedGDD, amount: effectiveDailyInfection });
        }
        let eruptingAmount = 0;
        latentQueue = latentQueue.filter((item) => {
            if (accumulatedGDD - item.gdd >= calib.latencyGDDThreshold) {
                eruptingAmount += item.amount;
                return false;
            }
            return true;
        });
        currentThreat = currentThreat * 0.85 + effectiveDailyInfection + eruptingAmount * 1.5 * (1 - totalSuppression);
        currentThreat = Math.min(1.5, currentThreat);
        data.push({ fullDate: dateKey, threat: Number(currentThreat.toFixed(2)) });
    }
    return data;
}
async function computeFarmBlightAggregate(farmId) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 14);
    const eventsSnap = await db
        .collection(`farms/${farmId}/events`)
        .where("date", ">=", toLocalISOString(startDate))
        .get();
    const sprayEvents = {};
    for (const docSnap of eventsSnap.docs) {
        const e = docSnap.data();
        if (e.type === "spray" && e.sprayType) {
            sprayEvents[e.date] = { type: e.sprayType, method: e.applicationMethod || "ground" };
        }
    }
    const cacheSnap = await db.doc("weather_cache/MA002").get();
    const weatherData = (cacheSnap.data()?.weatherData || {});
    const results = runBlightModel(startDate, endDate, sprayEvents, weatherData);
    const currentRiskScore = results.length > 0 ? results[results.length - 1].threat : 0;
    await db.doc(`farms/${farmId}/aggregates/blight_daily`).set({
        currentRiskScore,
        lastUpdated: new Date().toISOString(),
        startDate: toLocalISOString(startDate),
        endDate: toLocalISOString(endDate),
        resultsCount: results.length,
        stationCode: cacheSnap.data()?.stationCode || "MA002",
    });
}
/** Nightly blight aggregate refresh for all farms (Step 12). */
exports.refreshBlightAggregates = (0, scheduler_1.onSchedule)({
    schedule: "every day 05:00",
    timeZone: "Australia/Perth",
}, async () => {
    const farmsSnap = await db.collection("farms").get();
    for (const farmDoc of farmsSnap.docs) {
        try {
            await computeFarmBlightAggregate(farmDoc.id);
        }
        catch (error) {
            console.error(`[refreshBlightAggregates] farm ${farmDoc.id}:`, error);
        }
    }
});
/** Recompute blight aggregate when diary events change. */
exports.onDiaryEventWrite = (0, firestore_1.onDocumentWritten)("farms/{farmId}/events/{eventId}", async (event) => {
    const farmId = event.params.farmId;
    try {
        await computeFarmBlightAggregate(farmId);
    }
    catch (error) {
        console.error(`[onDiaryEventWrite] farm ${farmId}:`, error);
    }
});
//# sourceMappingURL=blightAggregate.js.map
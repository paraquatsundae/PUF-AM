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
exports.refreshWeatherCache = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const params_1 = require("firebase-functions/params");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const dpirdApiKey = (0, params_1.defineSecret)("DPIRD_API_KEY");
const STATION_ANCHORS = [
    { stationCode: "MA002", name: "Manjimup" },
    { stationCode: "PE001", name: "Pemberton" },
    { stationCode: "BA001", name: "Balingup" },
    { stationCode: "DN001", name: "Donnybrook" },
];
function toLocalISOString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function getDateWindow(days = 14) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    return { startDate: toLocalISOString(startDate), endDate: toLocalISOString(endDate) };
}
async function fetchStationWeather(apiKey, stationCode, startDate, endDate) {
    const url = `https://api.agric.wa.gov.au/v2/weather/stations/summaries/daily` +
        `?startDate=${startDate}&endDate=${endDate}&stationCode=${stationCode}&limit=100`;
    const response = await fetch(url, {
        headers: { "api-key": apiKey, Accept: "application/json" },
    });
    if (!response.ok) {
        throw new Error(`DPIRD ${stationCode}: HTTP ${response.status}`);
    }
    const json = await response.json();
    const summaries = json.collection?.[0]?.summaries || [];
    const weatherData = {};
    for (const obs of summaries) {
        if (!obs.period)
            continue;
        const dateKey = `${obs.period.year}-${String(obs.period.month).padStart(2, "0")}-${String(obs.period.day).padStart(2, "0")}`;
        weatherData[dateKey] = {
            T: obs.airTemperature?.avg ?? 15,
            RH: obs.relativeHumidity?.avg ?? 60,
            R: obs.rainfall ?? 0,
            WD: obs.rainfall > 0 ? 10 : 0,
            maxHourlyRain: obs.rainfall > 0 ? obs.rainfall * 0.2 : 0,
            windSpeed: obs.wind?.[0]?.avg?.speed ?? 10,
            ET0: obs.evapotranspiration?.shortCrop ?? 3,
        };
    }
    return weatherData;
}
/** Hourly DPIRD refresh — clients read weather_cache only (Step 9). */
exports.refreshWeatherCache = (0, scheduler_1.onSchedule)({
    schedule: "every 60 minutes",
    timeZone: "Australia/Perth",
    secrets: [dpirdApiKey],
}, async () => {
    const apiKey = dpirdApiKey.value();
    if (!apiKey) {
        console.error("[refreshWeatherCache] DPIRD_API_KEY secret not configured");
        return;
    }
    const { startDate, endDate } = getDateWindow(14);
    const now = new Date().toISOString();
    for (const station of STATION_ANCHORS) {
        try {
            const weatherData = await fetchStationWeather(apiKey, station.stationCode, startDate, endDate);
            await db.doc(`weather_cache/${station.stationCode}`).set({
                stationCode: station.stationCode,
                stationName: station.name,
                lastUpdated: now,
                startDate,
                endDate,
                weatherData,
            });
            console.log(`[refreshWeatherCache] Updated ${station.stationCode} (${Object.keys(weatherData).length} days)`);
        }
        catch (error) {
            console.error(`[refreshWeatherCache] Failed for ${station.stationCode}:`, error);
        }
    }
});
//# sourceMappingURL=weatherScheduler.js.map
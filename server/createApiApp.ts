import express, { Express } from "express";
import { runBlightModel, defaultCalibration } from "../src/lib/blightModel.ts";
import { registerAccessPinRoutes } from "./accessPinRoutes.ts";
import { registerWeatherCacheRoutes } from "./weatherCacheRoutes.ts";
import { registerChillRoutes } from "./chillRoutes.ts";
import { registerLanSyncRoutes } from "./lanSyncRoutes.ts";
import { registerMistFreenetRoutes } from "./mistFreenetRoutes.ts";
import { getDpirdApiKey } from "./envSecrets.ts";
import {
  fetchDpirdDailySummaries,
} from "../shared/weather/dpirdClient.ts";

/** Express app with API routes only (no Vite/static middleware). Used by server.ts and tests. */
export function createApiApp(): Express {
  const app = express();

  // Capacitor (https://localhost) and LAN devices call this API cross-origin.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Accept, api-key'
    );
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return next();
  });

  app.use(express.json());

  // body-parser JSON errors → JSON (not HTML), so the browser can parse them
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && "status" in err && (err as { status?: number }).status === 400) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
    return next(err);
  });

  registerAccessPinRoutes(app);
  registerWeatherCacheRoutes(app);
  registerChillRoutes(app);
  registerLanSyncRoutes(app);
  registerMistFreenetRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/weather/blight-risk", async (req, res) => {
    const { farmId, lat, lng, startDate, endDate, stationCode } = req.body;

    if (!farmId || !lat || !lng || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    try {
      const apiKey = getDpirdApiKey();
      let weatherData: Record<string, unknown> = {};

      if (apiKey) {
        let stationsToTry: Array<{ stationCode?: string; code?: string }> = [];
        if (stationCode) {
          stationsToTry = [{ stationCode }];
        } else {
          const nearbyUrl = `https://api.agric.wa.gov.au/v2/weather/stations/nearby?latitude=${lat}&longitude=${lng}&limit=5`;
          const nearbyRes = await fetch(nearbyUrl, {
            headers: { "api-key": apiKey, Accept: "application/json" },
          });
          if (nearbyRes.ok) {
            const nearbyJson = await nearbyRes.json();
            stationsToTry = nearbyJson.collection || nearbyJson.data || nearbyJson || [];
          }
        }

        for (const station of stationsToTry) {
          const targetStation = station.stationCode || station.code;
          if (!targetStation) continue;

          try {
            const page = await fetchDpirdDailySummaries(
              apiKey,
              targetStation,
              startDate,
              endDate
            );
            const stationDays = Object.keys(page).length;
            if (stationDays === 0) continue;

            const hasRH = Object.values(page).some(
              (d) => d.RH !== null && d.RH !== undefined
            );
            if (!hasRH && stationsToTry.length > 1) continue;

            weatherData = page;
            console.log(
              `[Server] DPIRD daily summaries: ${stationDays} days for ${targetStation} (${startDate} → ${endDate})`
            );
            break;
          } catch (err) {
            console.warn(`[Server] DPIRD fetch failed for ${targetStation}:`, err);
          }
        }
      }

      if (Object.keys(weatherData).length === 0) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const totalDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        for (let i = 0; i <= totalDays; i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          weatherData[dateKey] = {
            T: 15,
            RH: 60,
            R: 0,
            WD: 0,
            maxHourlyRain: 0,
            windSpeed: 10,
            ET0: 3,
          };
        }
      }

      const {
        calibration,
        sprayEvents = {},
        irrigationEvents = {},
        blocks = [],
        defaultIrrigationType = "micro",
      } = req.body;

      const finalCalibration = calibration || defaultCalibration;

      const generalResults = runBlightModel(
        new Date(startDate),
        new Date(endDate),
        "bloom",
        sprayEvents,
        weatherData as Parameters<typeof runBlightModel>[4],
        irrigationEvents,
        defaultIrrigationType,
        finalCalibration
      );

      const blockRisks: Record<string, ReturnType<typeof runBlightModel>> = {};
      for (const block of blocks) {
        const height = block.treeHeight || finalCalibration.treeHeight;
        const width = block.canopyWidth || finalCalibration.canopyWidth;
        const spacing = block.rowSpacing || finalCalibration.rowSpacing;
        const coverage = Math.min(1, width / spacing);

        const blockCalib = {
          ...finalCalibration,
          treeHeight: height,
          canopyWidth: width,
          rowSpacing: spacing,
          cropCoefficient: 0.2 + 0.8 * coverage,
        };

        blockRisks[block.id] = runBlightModel(
          new Date(startDate),
          new Date(endDate),
          "bloom",
          sprayEvents,
          weatherData as Parameters<typeof runBlightModel>[4],
          irrigationEvents,
          block.irrigation || defaultIrrigationType,
          blockCalib
        );
      }

      res.json({
        lastUpdated: new Date().toISOString(),
        weatherData,
        blightResults: generalResults,
        blockRisks,
        currentRiskScore:
          generalResults.length > 0 ? generalResults[generalResults.length - 1].threat : 0,
      });
    } catch (error) {
      console.error("[Server] Blight Risk Endpoint Error:", error);
      res.status(500).json({ error: "Failed to process blight risk" });
    }
  });

  app.get("/api/weather/dpird/*", async (req, res) => {
    try {
      const apiKey = getDpirdApiKey();
      if (!apiKey) {
        return res.status(401).json({ error: "API key missing" });
      }

      const dpirdPath = req.params[0];
      const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
      const targetUrl = `https://api.agric.wa.gov.au/v2/weather/${dpirdPath}${queryString ? "?" + queryString : ""}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000);

      try {
        const response = await fetch(targetUrl, {
          headers: { "api-key": apiKey, Accept: "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        res.status(response.status).json(data);
      } catch (fetchError: unknown) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          return res.status(504).json({ error: "DPIRD API request timed out" });
        }
        throw fetchError;
      }
    } catch (error) {
      console.error("[Server] DPIRD Proxy Error:", error);
      res.status(500).json({ error: "Failed to fetch from DPIRD API" });
    }
  });

  // Unmatched /api/* → JSON (avoids Vite empty 404s that break res.json() in the browser)
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  return app;
}

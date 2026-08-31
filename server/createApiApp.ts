import { hostname as osHostname } from "node:os";

import express, { Express } from "express";
import { runBlightModel, defaultCalibration } from "../src/lib/blightModel.ts";
import { HUB_INFO_PATH, type HubInfo } from "../shared/sync/hubInfo.ts";
import { registerAccessPinRoutes } from "./accessPinRoutes.ts";
import { registerAdminOpsRoutes } from "./adminOpsRoutes.ts";
import { registerWeatherCacheRoutes } from "./weatherCacheRoutes.ts";
import { registerChillRoutes } from "./chillRoutes.ts";
import { registerLanSyncRoutes } from "./lanSyncRoutes.ts";
import { registerMistFreenetRoutes } from "./mistFreenetRoutes.ts";
import { registerPluginPackageRoutes } from "./pluginPackageRoutes.ts";
import { rateLimit } from "./accessPinAuth.ts";
import { requireAuthedUser } from "./requireAuthedUser.ts";
import { getDpirdApiKey } from "./envSecrets.ts";
import {
  fetchDpirdDailySummaries,
} from "../shared/weather/dpirdClient.ts";

/**
 * The DPIRD paths this app actually asks for — the station directory
 * (`weatherService.fetchAllDPIRDStations`) and hourly ambient temperature
 * (`useDryerSessionActions`).
 *
 * The proxy spends this server's `DPIRD_API_KEY`, so it forwards a fixed set
 * rather than whatever `req.params[0]` holds. Concatenating the caller's path
 * onto the upstream base made it a general-purpose credentialed proxy to
 * api.agric.wa.gov.au, reachable on any path the caller cared to name.
 */
const DPIRD_PROXY_PATHS = new Set(["stations", "stations/summaries/hourly"]);

const DPIRD_MAX_CALLS = 60;
const DPIRD_WINDOW_MS = 15 * 60 * 1000;

// Capacitor, LAN devices, and am.pufworks.farm → local Freenet sidecar call cross-origin.
const allowedCorsOrigins = new Set([
  'https://am.pufworks.farm',
  'https://pufom-quby5ye5pa-ts.a.run.app',
]);

/**
 * Shared so the desktop shell's LAN listener can put its own `/api/hub/*` routes
 * in front of `createApiApp()` and still answer a preflight the same way. Two
 * copies of this would drift, and the failure mode is a tablet that works on one
 * listener and not the other.
 */
export function apiCorsMiddleware(): express.RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    let allowOrigin = '*';
    if (origin) {
      if (
        allowedCorsOrigins.has(origin) ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.startsWith('http://localhost:') ||
        origin === 'https://localhost' ||
        origin === 'capacitor://localhost'
      ) {
        allowOrigin = origin;
      }
    }
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    // `x-puf-hub-token` is the paired-tablet credential for a desktop LAN hub.
    // Omitting it here is invisible on same-origin and fails every cross-origin
    // call from the APK, which is the only place it is ever sent from.
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Accept, api-key, x-puf-hub-token'
    );
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return next();
  };
}

/** Express app with API routes only (no Vite/static middleware). Used by server.ts and tests. */
export function createApiApp(): Express {
  const app = express();

  app.use(apiCorsMiddleware());

  app.use(express.json());

  // body-parser JSON errors → JSON (not HTML), so the browser can parse them
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && "status" in err && (err as { status?: number }).status === 400) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
    return next(err);
  });

  registerAccessPinRoutes(app);
  registerAdminOpsRoutes(app);
  registerWeatherCacheRoutes(app);
  registerChillRoutes(app);
  registerLanSyncRoutes(app);
  registerMistFreenetRoutes(app);
  registerPluginPackageRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  /**
   * The workshop answer to the tablet's hub handshake. A repo checkout holds the
   * Firebase and DPIRD secrets, so it serves every family itself and asks for no
   * credential — the opposite of the packaged desktop LAN hub, which registers a
   * richer version of this route in front of `createApiApp()`.
   */
  app.get(HUB_INFO_PATH, (_req, res) => {
    const info: HubInfo = {
      product: 'PUF-AM',
      kind: 'workshop-dev',
      name: `PUF-AM dev (${osHostname().split('.')[0] || 'workshop'})`,
      pairingRequired: false,
      paired: true,
      cloudOnlyPrefixes: [],
      cloudApiBase: '',
      lanScopePrefixes: [],
      freenet: process.env.MIST_FREENET_DISABLED !== '1',
    };
    res.json(info);
  });

  app.post("/api/weather/blight-risk", async (req, res) => {
    const caller = await requireAuthedUser(req, res);
    if (!caller) return;

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
    // Allowlist before auth: it is the cheaper check, it tells an anonymous
    // caller nothing they could not read in the client bundle, and putting it
    // first keeps it testable without minting a token.
    const dpirdPath = String(req.params[0] || "");
    if (!DPIRD_PROXY_PATHS.has(dpirdPath)) {
      return res.status(404).json({ error: "Unknown DPIRD path" });
    }

    const caller = await requireAuthedUser(req, res);
    if (!caller) return;

    try {
      // Keyed by uid, not IP: the caller is authenticated by this point, and the
      // IP is the shared NAT of a farm office as often as it is one operator.
      if (!rateLimit(`dpird:${caller.uid}`, DPIRD_MAX_CALLS, DPIRD_WINDOW_MS)) {
        return res
          .status(429)
          .json({ error: "Too many weather requests. Try again shortly." });
      }

      const apiKey = getDpirdApiKey();
      if (!apiKey) {
        return res.status(503).json({ error: "DPIRD API key missing on this server" });
      }

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

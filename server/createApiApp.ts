import { hostname as osHostname } from "node:os";

import express, { Express } from "express";
import { HUB_INFO_PATH, type HubInfo } from "../shared/sync/hubInfo.ts";
import { servesLanFamilies, type ApiSurface } from "./apiSurface.ts";
import { registerTileProxyRoutes } from "./tileProxyRoutes.ts";
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
const DEFAULT_CORS_ORIGINS = [
  'https://am.pufworks.farm',
  'https://pufom-quby5ye5pa-ts.a.run.app',
];

/**
 * Exact origins allowed to read a cross-origin response.
 *
 * `ALLOWED_ORIGINS` is comma-separated and replaces the built-in pair outright
 * rather than adding to it, so a deployment can be narrowed as well as widened.
 */
function allowedCorsOrigins(): Set<string> {
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_CORS_ORIGINS);
}

/**
 * The loopback and Capacitor origins a tablet talks to a LAN hub from.
 *
 * These belong to the hub surface only. On Cloud Run they let any page served
 * from any localhost port read the response, which is a real origin on a
 * developer's machine and one an attacker can arrange to be — it costs nothing
 * to allow there and buys nothing either, because the cloud API is never the
 * thing a `capacitor://localhost` page is calling on the LAN.
 */
function isLanClientOrigin(origin: string): boolean {
  return (
    origin.startsWith('http://127.0.0.1:') ||
    origin.startsWith('http://localhost:') ||
    origin === 'https://localhost' ||
    origin === 'capacitor://localhost'
  );
}

/**
 * Shared so the desktop shell's LAN listener can put its own `/api/hub/*` routes
 * in front of `createApiApp()` and still answer a preflight the same way. Two
 * copies of this would drift, and the failure mode is a tablet that works on one
 * listener and not the other.
 *
 * An unrecognised origin gets **no** `Access-Control-Allow-Origin` at all. It
 * used to get `*`, which let any site on the internet read every unauthenticated
 * response. Same-origin traffic is unaffected either way — the browser does not
 * consult CORS for it — so the wildcard was only ever serving the cross-origin
 * callers we do not have.
 */
export function apiCorsMiddleware(surface: ApiSurface = 'cloud'): express.RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    const allowed =
      typeof origin === 'string' &&
      (allowedCorsOrigins().has(origin) ||
        (servesLanFamilies(surface) && isLanClientOrigin(origin)));

    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin as string);
      // The answer depends on the request's Origin, so a shared cache must not
      // serve one origin's response to another.
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      // `x-puf-hub-token` is the paired-tablet credential for a desktop LAN hub.
      // Omitting it here is invisible on same-origin and fails every cross-origin
      // call from the APK, which is the only place it is ever sent from.
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Accept, api-key, x-puf-hub-token'
      );
    }

    // Still 204 an unrecognised preflight rather than letting it fall through to
    // a route: without the headers above the browser blocks the real request
    // anyway, and this keeps OPTIONS off the handlers.
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return next();
  };
}

/**
 * Express app with API routes only (no Vite/static middleware). Used by
 * server.ts, the desktop shell's two listeners, and tests.
 *
 * See `apiSurface.ts` for why the LAN families are not registered on `'cloud'`,
 * and why `'cloud'` is the default.
 */
export function createApiApp(opts: { surface?: ApiSurface } = {}): Express {
  const surface = opts.surface ?? 'cloud';
  const app = express();

  app.use(apiCorsMiddleware(surface));

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
  registerLanSyncRoutes(app, surface);
  registerPluginPackageRoutes(app);
  // Both surfaces: a desktop hub serving tablets on the shed Wi-Fi needs to
  // render imagery for them just as Cloud Run does for the web app.
  registerTileProxyRoutes(app);

  // Freenet is a peer on somebody's own machine. Every route in this family is
  // unauthenticated by design, which is defensible on a laptop and not on the
  // public internet — where today it is closed only by `MIST_FREENET_DISABLED=1`
  // happening to be set on the deploy.
  if (servesLanFamilies(surface)) registerMistFreenetRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  /**
   * The workshop answer to the tablet's hub handshake. A repo checkout holds the
   * Firebase and DPIRD secrets, so it serves every family itself and asks for no
   * credential — the opposite of the packaged desktop LAN hub, which registers a
   * richer version of this route in front of `createApiApp()`.
   *
   * Not on the cloud surface: Cloud Run is not a hub, and answering
   * `kind: 'workshop-dev'` there advertised the production API as a dev box and
   * leaked its hostname. `fetchHubInfo()` already documents a 404 here as "a
   * Cloud Run deployment", so this is the case it was written for.
   */
  if (servesLanFamilies(surface)) {
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
        tiles: true,
      };
      res.json(info);
    });
  }

  /**
   * Dev-only DPIRD weather fetch. The path is a misnomer kept for compatibility:
   * it used to run the blight model server-side and return `blightResults`,
   * `blockRisks` and `currentRiskScore` alongside the weather. Nothing consumed
   * them — `fetchEnvironmentalData` reads `weatherData` and drops the rest, and
   * its return type never carried the risk fields — so the model ran on every
   * call and its output was discarded. Removing it also removed the last import
   * of pack code from core server (Plans/PLUGIN_PACK_LAYOUT.md Phase 0).
   */
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

      res.json({
        lastUpdated: new Date().toISOString(),
        weatherData,
      });
    } catch (error) {
      console.error("[Server] Dev weather endpoint error:", error);
      res.status(500).json({ error: "Failed to fetch weather" });
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

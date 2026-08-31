/**
 * The `/api/weather/*` family spends server-held secrets — the DPIRD key and
 * Admin SDK writes — so none of it may answer an anonymous caller.
 *
 * The proxy in particular was an open credentialed relay: it concatenated
 * `req.params[0]` onto `api.agric.wa.gov.au/v2/weather/` with this server's key
 * attached, for any caller and any path.
 *
 * Refusal is 401 with Firebase Admin credentials present and 503 without, so a
 * checkout with no `secrets/` still runs these. Both mean "did not reach DPIRD",
 * which is the property under test.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createApiApp } from "../../server/createApiApp.ts";

const REFUSED = [401, 503];

describe("weather route auth", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApiApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("Failed to bind test server");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("refuses an anonymous caller on the DPIRD proxy", async () => {
    const res = await fetch(`${baseUrl}/api/weather/dpird/stations?limit=500`);
    expect(REFUSED).toContain(res.status);
  });

  it("refuses an anonymous caller on the hourly DPIRD path", async () => {
    const res = await fetch(
      `${baseUrl}/api/weather/dpird/stations/summaries/hourly?stationCode=MA002`
    );
    expect(REFUSED).toContain(res.status);
  });

  it("refuses an anonymous caller on the cache and forecast writers", async () => {
    for (const path of ["/api/weather/ensure-cache", "/api/weather/ensure-forecast"]) {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationCode: "MA002" }),
      });
      expect(REFUSED, `${path} answered ${res.status}`).toContain(res.status);
    }
  });

  it("refuses an anonymous caller on chill portions", async () => {
    const res = await fetch(`${baseUrl}/api/weather/chill-portions?stationCode=MA002`);
    expect(REFUSED).toContain(res.status);
  });

  /**
   * The allowlist runs before the bearer check, so this is a 404 rather than a
   * 401 — the point being that no token would make these reachable either.
   */
  it("does not forward DPIRD paths the app never asks for", async () => {
    const offPath = [
      "/api/weather/dpird/stations/nearby",
      "/api/weather/dpird/soil/probes",
      "/api/weather/dpird/",
    ];
    for (const path of offPath) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status, `${path} answered ${res.status}`).toBe(404);
      expect(await res.json()).toEqual({ error: "Unknown DPIRD path" });
    }
  });

  it("does not let a traversal escape the allowlisted paths", async () => {
    const res = await fetch(`${baseUrl}/api/weather/dpird/stations/../../../v2/soil`);
    expect([404, 401, 503]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });
});

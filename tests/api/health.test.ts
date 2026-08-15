import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createApiApp } from "../../server/createApiApp.ts";

describe("API health", () => {
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

  it("GET /api/admin/ops refuses an anonymous caller", async () => {
    const res = await fetch(`${baseUrl}/api/admin/ops`);
    expect([401, 503]).toContain(res.status);
  });

  it("GET /api/health returns ok", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("POST /api/weather/blight-risk validates required fields", async () => {
    const res = await fetch(`${baseUrl}/api/weather/blight-risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ farmId: "test" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing required parameters" });
  });

  it("POST /api/weather/blight-risk returns blight payload with fallback weather", async () => {
    const res = await fetch(`${baseUrl}/api/weather/blight-risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        farmId: "test-farm",
        lat: -34.25,
        lng: 116.15,
        startDate: "2026-03-01",
        endDate: "2026-03-05",
        sprayEvents: {},
        irrigationEvents: {},
        blocks: [],
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.currentRiskScore).toBeTypeOf("number");
    expect(data.blightResults.length).toBeGreaterThan(0);
    expect(Object.keys(data.weatherData).length).toBeGreaterThan(0);
  });
});

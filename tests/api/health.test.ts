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

  /**
   * `blight-risk` used to answer anonymously, so these asserted the payload
   * shape over HTTP. It runs `runBlightModel` over every block on a caller's
   * say-so, so it verifies a bearer now and the model itself is covered
   * directly by `tests/jiBlightModel.test.ts`.
   *
   * 401 or 503 depending on whether this tree has Firebase Admin credentials —
   * same pairing as the `/api/admin/ops` case above.
   */
  it("POST /api/weather/blight-risk refuses an anonymous caller before validating", async () => {
    const res = await fetch(`${baseUrl}/api/weather/blight-risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ farmId: "test" }),
    });
    expect([401, 503]).toContain(res.status);
  });
});

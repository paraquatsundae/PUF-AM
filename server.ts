import express from "express";
import path from "path";
import * as dotenv from "dotenv";
import { createApiApp } from "./server/createApiApp.ts";
import { surfaceFromEnv } from "./server/apiSurface.ts";

dotenv.config();

function warnMissingEnvKeys() {
  const checks: { name: string; present: boolean; note: string }[] = [
    {
      name: 'DPIRD_API_KEY',
      present: Boolean(
        (process.env.DPIRD_API_KEY && process.env.DPIRD_API_KEY !== 'YOUR_DPIRD_API_KEY') ||
        (process.env.VITE_DPIRD_API_KEY && process.env.VITE_DPIRD_API_KEY !== 'YOUR_DPIRD_API_KEY')
      ),
      note: 'Weather proxy and blight risk will use fallback data (server-only; do not use VITE_ prefix)',
    },
  ];

  const missing = checks.filter((c) => !c.present);
  if (missing.length === 0) return;

  console.warn('[Server] Missing or placeholder environment keys:');
  for (const item of missing) {
    console.warn(`  - ${item.name}: ${item.note}`);
  }
  console.warn('[Server] Copy .env.example to .env and fill in your keys.');
}

async function startServer() {
  warnMissingEnvKeys();
  // Production here means Cloud Run, which is not a LAN hub. The desktop shell
  // does not come through this file; it asks for the hub surface outright.
  const app = createApiApp({ surface: surfaceFromEnv() });
  const PORT = Number(process.env.PORT) || 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA fallback — never shadow /api/*
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (process.env.NODE_ENV !== "production") {
      console.log(`LAN devices: http://<this-pc-ip>:${PORT} (same Wi‑Fi; keep this process running)`);
    } else {
      console.log(`PUFAM production listening on 0.0.0.0:${PORT}`);
    }
    // mDNS advertise / browse for Offline & sync peer discovery
    void import("./server/mdnsHub.ts")
      .then(({ startPufomMdns }) => startPufomMdns(PORT))
      .catch((err) => console.warn("[mdns] not started:", err));
    void import("./server/freenetPeerHost.ts")
      .then(({ maybeAutoStartFreenetPeer }) => maybeAutoStartFreenetPeer())
      .catch((err) => console.warn("[mist-freenet] auto-start skipped:", err));
  });

  const shutdown = () => {
    void import("./server/mdnsHub.ts")
      .then(({ stopPufomMdns }) => stopPufomMdns())
      .catch(() => undefined);
    void import("./server/freenetPeerHost.ts")
      .then(({ shutdownFreenetPeerHost }) => shutdownFreenetPeerHost())
      .catch(() => undefined);
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();

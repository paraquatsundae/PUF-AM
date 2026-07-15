import express from "express";
import path from "path";
import * as dotenv from "dotenv";
import { createApiApp } from "./server/createApiApp.ts";

dotenv.config();

function warnMissingEnvKeys() {
  const checks: { name: string; present: boolean; note: string }[] = [
    {
      name: 'VITE_DPIRD_API_KEY / DPIRD_API_KEY',
      present: Boolean(
        (process.env.VITE_DPIRD_API_KEY && process.env.VITE_DPIRD_API_KEY !== 'YOUR_DPIRD_API_KEY') ||
        (process.env.DPIRD_API_KEY && process.env.DPIRD_API_KEY !== 'YOUR_DPIRD_API_KEY')
      ),
      note: 'Weather proxy and blight risk will use fallback data',
    },
    {
      name: 'VITE_GOOGLE_MAPS_API_KEY',
      present: Boolean(
        process.env.VITE_GOOGLE_MAPS_API_KEY &&
        process.env.VITE_GOOGLE_MAPS_API_KEY !== 'YOUR_GOOGLE_MAPS_API_KEY'
      ),
      note: 'Google Maps satellite layer will not load (OpenStreetMap still works)',
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
  const app = createApiApp();
  const PORT = 3000;

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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

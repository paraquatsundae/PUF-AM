# AGENTS.md

## Cursor Cloud specific instructions

PUF-AM ("Ag Manager", npm name `walnut-farm-manager`) is a single-product React 19 + TypeScript + Vite web app for mixed-farm management (map, diary, blight risk, team tools). It talks directly to Firebase (Firestore/Auth) from the browser; an Express server (`server.ts`, run via `tsx`) serves the Vite dev middleware in dev and hosts `/api/*` routes in one process. `functions/` is a **separate** Firebase Cloud Functions npm package (optional for local dev). Standard commands live in `package.json` scripts and `README.md`; don't duplicate them here.

Key non-obvious caveats for running/developing in this environment:

- **Run the app in workshop mode.** Real Firebase credentials are not configured in this environment, so start the dev server with `VITE_WORKSHOP_MODE=true npm run dev`. This auto-logs-in a mock admin ("Workshop User") with all modules enabled and skips live Firestore listeners (unauthenticated Firestore watches otherwise cause `INTERNAL ASSERTION FAILED` crashes). The server listens on `http://localhost:3000`. Without workshop mode you land on the invite-PIN login screen and cannot get past auth. In workshop mode, data changes stay in the browser (local only) and are not persisted to Firestore.
- **`firebase-applet-config.json` must exist to compile.** `src/firebase.ts` statically imports it, so `npm run dev`/`npm run build` fail to compile if it is missing. It is git-ignored; the startup update script copies `firebase-applet-config.example.json` (placeholder values) into place, which is enough to boot the UI in workshop mode. `.env` (from `.env.example`) is likewise git-ignored and auto-created.
- **`npm run lint` (`tsc --noEmit`) currently reports pre-existing type errors** (in `server/mdnsHub.ts` and `src/lib/mapDrawHelpers.ts`) that are unrelated to environment setup. Treat these as the known baseline, not something to "fix" during setup.
- **`npm test` (Vitest) has one date-sensitive baseline failure**: `tests/dpirdClient.test.ts > prunes days older than keep window` uses a hard-coded `2026-07-01` fixture against a 30-day keep window, so it fails once the real clock is >30 days past that date. All other tests pass. This is a pre-existing time-bomb, not a setup issue.
- **`npm run build` (Vite production build) succeeds** and is the reliable "does it compile end-to-end" check.
- **Windows-only scripts:** `build:android`, `sync:android:lan`, and `deploy:cloudrun` are PowerShell scripts and won't run on Linux. Android/Capacitor builds require the Android SDK/JDK and are not part of the standard Linux dev loop.
- External integrations degrade gracefully without keys: missing `DPIRD_API_KEY` → synthetic weather/blight data; missing `VITE_GOOGLE_MAPS_API_KEY` → OpenStreetMap tiles instead of Google satellite. The server prints a harmless warning listing these placeholder keys on startup.

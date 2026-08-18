# Smoke Test Log

**Purpose:** Record manual smoke test results for [ROADMAP Step 3](./ROADMAP.md#step-3--smoke-test-dev-server-against-firebase).

Update this file each time Step 3 (or a re-verification) is run.

---

## Test run — 13 July 2026 (Phase A)

| Field | Value |
|-------|-------|
| **Date** | 2026-07-13 |
| **Tester** | Cursor agent (automated) + manual browser checks pending |
| **Branch / commit** | `master` — no commits yet |
| **Environment** | local dev (`npm run dev`) |
| **Firebase project** | `gen-lang-client-0444791425` (local `firebase-applet-config.json`) |
| **Keys configured** | DPIRD: no · Google Maps: no |

### Automated results

| Route / check | Pass | Fail | Notes |
|---------------|------|------|-------|
| App loads `/` | ✓ | | HTTP 200, HTML served |
| `GET /api/health` | ✓ | | `{"status":"ok"}` |
| `POST /api/weather/blight-risk` | ✓ | | Fallback weather used (no DPIRD key); score returned |
| DPIRD proxy (no key) | ✓ | | HTTP 401 as expected — proxy route works |
| Server key warnings | ✓ | | Placeholder keys logged on startup |
| `npm run lint` | ✓ | | tsc --noEmit passes |
| `npm run build` | ✓ | | Production build succeeds |
| Google auth sign-in | | | **Manual** — requires browser |
| Dashboard weather (live) | | | **Blocked** — needs `VITE_DPIRD_API_KEY` |
| Orchard Map CRUD | | | **Manual** — requires signed-in user |
| Blight Risk chart (live) | | | **Blocked** — needs DPIRD key for live weather |
| Farm Diary CRUD | | | **Manual** — requires signed-in user |
| Harvest + drying | | | **Manual** — requires signed-in user |
| Financials load | | | **Manual** — requires signed-in user |
| Map issue list | | | **Manual** — requires signed-in user (Field Ops page removed 2026-08-13; `/field-ops` → `/map`) |
| Offline indicator | | | **Manual** — requires browser |

**Overall:** **PARTIAL PASS** — server and build pipeline verified; live API keys and browser auth flows pending user configuration.

**Blockers:**

1. Fill real values in `.env` for `VITE_DPIRD_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY`
2. Run browser sign-in smoke test after keys are set

**Next re-test:** After `.env` keys are populated, re-run browser checklist and update this log.

---

## Test run template

| Field | Value |
|-------|-------|
| **Date** | YYYY-MM-DD |
| **Tester** | |
| **Branch / commit** | |
| **Environment** | local dev (`npm run dev`) |
| **Firebase project** | |
| **Keys configured** | DPIRD / Google Maps — yes/no each |

### Results

| Route / check | Pass | Fail | Notes |
|---------------|------|------|-------|
| App loads `/` | | | |
| Google auth sign-in | | | |
| Dashboard weather | | | |
| Orchard Map CRUD | | | |
| Blight Risk chart | | | |
| Farm Diary CRUD | | | |
| Harvest + drying | | | |
| Financials load | | | |
| Map issue list | | | |
| Offline indicator | | | |
| `GET /api/health` | | | |

**Overall:** PASS / FAIL

**Blockers:**

---

## Runs

_See test run above (13 July 2026)._

# npm Audit Log

**Purpose:** Record vulnerability scan output for [ROADMAP Step 8](../ROADMAP.md#step-8--npm-audit-and-critical-vulnerability-remediation).

---

## Baseline — 13 July 2026

Captured after `npm install` in a fresh workspace.

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 13 |
| Moderate | 16 |
| Low | 3 |
| **Total** | **34** |

**Command:** `npm audit`

**Remediation status:** Complete (Phase B)

---

## Remediation run — 13 July 2026 (Phase B)

### Actions taken

1. `npm audit fix` — updated 63 transitive packages (react-router, vitest, protobufjs, vite, lodash, etc.)
2. Removed unused `firebase-admin` dependency — eliminated 101 packages and all `uuid` / Google Cloud transitive advisories

### Result

| Severity | Before | After | Change |
|----------|--------|-------|--------|
| Critical | 2 | **0** | −2 |
| High | 13 | **1** | −12 |
| Moderate | 16 | **0** | −16 |
| Low | 3 | **1** | −2 |
| **Total** | **34** | **2** | **−32 (94%)** |

**Verification:** `npm test` (11 passed), `npm run build` (pass), `npm run lint` (pass)

### Remaining advisories (accepted)

| Package | Severity | Risk | Mitigation |
|---------|----------|------|------------|
| `esbuild` 0.27–0.28 | Low | Arbitrary file read via dev server on Windows | Dev-only tool; not shipped to production. Upgrade when Vite bumps esbuild. |
| `xlsx` * | High | Prototype pollution, ReDoS | No upstream fix in npm package. Used only for client-side nutrition CSV/Excel parsing of operator-uploaded files. Future: migrate to SheetJS CE or server-side parsing (Phase C+). |

### Deferred (breaking change)

- `npm audit fix --force` for remaining esbuild — not applied; would require major toolchain upgrades with regression risk

---

## Re-audit — 9 Sep 2026

`xlsx` is gone from the app. First pass: `overrides.browserslist: ">=4.28.7"` cleared the browserslist High (21 left). Second pass closed the rest that do not need a firebase-tools / firebase-admin major.

### Actions taken (second pass)

1. Pin `@xmldom/xmldom` to **0.9.12** (plist under `@capacitor/cli` and `electron-builder`, not html2pdf).
2. Pin `qs` to **>=6.16.0** and `morgan` to **>=1.12.0**. Express is **4.22.2**.
3. Bump `vitest` to **4.1.11** (`@vitest/mocker` path-traversal). `npm install vitest@4.1.11` hits an arborist `edgesOut` bug on npm 10.9.8; `--legacy-peer-deps` once, then a normal `npm install` succeeds against the lockfile.
4. Bump `tsx` to **4.23.13** so its esbuild is **0.28.1** (outside 0.27.3–0.28.0). Vite still has esbuild 0.25.12, which is outside that range — do not globally force esbuild 0.28 onto Vite.
5. Bump `firebase-tools` to **15.29.0** and `firebase-admin` to **^13.10.0**.
6. Drop unused `html2pdf.js` (PDFs already go through `jspdf` + `html2canvas`).

Do **not** `npm audit fix --force` — that still downgrades `firebase-tools` to 10.1.1.

### Result

| Severity | After browserslist | After second pass |
|----------|--------------------|-------------------|
| Critical | 0 | **0** |
| High | 1 | **0** |
| Moderate | 19 | **13** |
| Low | 1 | **0** |
| **Total** | **21** | **13** |

### Remaining advisories (accepted)

All 13 are nested under `firebase-tools` / `firebase-admin`. The advertised non-force fix for `stream-json` is a 1.x → 3.x jump; the rest only clear by downgrading tools to 10.1.1.

| Package | Severity | Why left |
|---------|----------|----------|
| `@opentelemetry/core` 1.30.1 | Moderate | pubsub wants 1.x; advisory fix is 2.8.0 (major). |
| `csv-parse` 5.6.0 | Moderate | tools still on 5.x; fix is 7.0.2 (major). |
| `stream-json` 1.9.1 | Moderate | CLI JSON filter DoS. No 1.x patch; 3.x would be a tools break. |
| `uuid` 8/9 under gaxios / google-gax / teeny-request / storage | Moderate | v3/v5/v6 buffer bound. Direct `uuid` is already 13. Nested override to 11+ can break the Google clients. |
| `google-gax` / `@google-cloud/firestore` / `@google-cloud/storage` / `teeny-request` / `retry-request` / `gaxios` | Moderate | Same admin/tools tree. npm’s “fix” is firebase-admin 10.3.0. |

| Date | Total | Critical | High | Notes |
|------|-------|----------|------|-------|
| 2026-09-09 | 13 | 0 | 0 | xmldom / qs / vitest / morgan / tsx esbuild closed. 13 firebase nested accepted. |
| 2026-09-09 | 21 | 0 | 1 | browserslist pinned. xmldom / qs / esbuild remain. |
| 2026-07-13 | 2 | 0 | 1 | Phase B complete (`xlsx` High accepted; package since removed) |

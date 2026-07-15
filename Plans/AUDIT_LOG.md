# npm Audit Log

**Purpose:** Record vulnerability scan output for [ROADMAP Step 8](./ROADMAP.md#step-8--npm-audit-and-critical-vulnerability-remediation).

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

## Re-audit template

| Date | Total | Critical | High | Notes |
|------|-------|----------|------|-------|
| 2026-07-13 | 2 | 0 | 1 | Phase B complete |

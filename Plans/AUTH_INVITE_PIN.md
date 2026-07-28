# Invite PIN authentication (multi-user farms)

PUFAM signs users in with **Firebase Auth custom tokens**. Farm owners **create a farm in the app**, then mint **invite PINs** with a role and module list for workers.

## Owner flow

1. Open `/login` → **Create a farm** → enter farm name + your name.
2. Server creates `farms/{farmId}`, owner `users/{uid}` (`role: admin`, all modules), and an **owner recovery PIN** (shown once).
3. Sign in completes after you save the recovery PIN.
4. **Farm Management → Invite PINs**: mint worker codes (presets or custom role + modules).
5. Share the plaintext PIN once. Revoke PINs or **Remove access** on a member anytime.

## Worker flow

1. `/login` → **Join a farm** → device lists **nearby farms** (GPS → `GET /api/auth/nearby-farms`).
2. Tap a farm name (avoids spelling / language issues), enter name + PIN.
3. Optional `expectedFarmId` on redeem rejects PINs for a different farm.
4. `POST /api/auth/redeem-pin` validates the PIN, writes `users/{uid}` with `farmId`, `role`, `modules`, `authEpoch`, returns a custom token.
5. Client `signInWithCustomToken` — session persists until logout or access revoke.
6. Same **name + PIN** maps to the same UID (stable return login) while the PIN stays active.

Owners stamp location on **Create a farm** (opt-in “show nearby”) or later via **Farm Management → Nearby discovery**. Public index: `farms_public/{farmId}` (name + coarse lat/lng/geohash only).

PINs are stored as SHA-256 hashes in `access_pins/{hash}` (clients cannot read this collection).

## Roles vs modules

| Role | Writes farm data | Team / mint PINs |
|------|------------------|------------------|
| `admin` | yes | yes (all **farm-enabled** modules) |
| `farmer` | yes | no |
| `viewer` | no (read-only) | no |

**Farm catalog** (`farms/{farmId}.enabledModules`) — owner toggles in **Farm Management → Farm modules**. Always-on: dashboard, farm_management, farm_setup, settings. Optional: map, diary, blight, water, nutrition, harvest, financials. Missing field → all modules (backward compatible).

**Worker grants** are a subset of the farm catalog. Nav uses `effectiveModules(role, user.modules, farm.enabledModules)`. Crop-pack tools (e.g. walnut blight) are omitted from PIN presets and the module picker when that pack is off.

Platform `/admin` is not a farm module.

## Revoke

- **Revoke PIN** — `active: false`; blocks new joins and return login with that code.
- **Remove access** (member) — clears farm membership, bumps `authEpoch`, sets custom claims, calls `revokeRefreshTokens`. Client listens on `users/{uid}` and signs out with “Access removed”.

## Break-glass bootstrap (emergency only)

Prefer in-app **Create a farm**. If Admin credentials are available and you must mint a PIN for an existing farm:

```powershell
npx tsx scripts/createAccessPin.ts --farm farm_xxxxx --role admin --label "Owner" --days 365
```

## Requirements

- `npm run dev` (Express hosts `/api/auth/*` + Vite)
- Service account JSON that can mint custom tokens
- Deploy updated `firestore.rules` so viewers cannot write and `access_pins` stays Admin-only:
  `firebase deploy --only firestore:rules`

## Workshop mode

`VITE_WORKSHOP_MODE=true` still bypasses login for local UI-only work (no cloud farm data).

## Device session vs unlock PIN (UX)

See **DEVELOPER_NOTES.md §4.1**. Summary:

- **Now:** After invite PIN / create-farm sign-in, Firebase Auth IndexedDB persistence keeps the session.
- **Later:** Personal unlock PIN (or biometric) after auth / on return — invite PIN stays for first join / recovery.

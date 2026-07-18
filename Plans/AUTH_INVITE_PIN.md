# Invite PIN authentication (no Google)

SentiNut signs users in with **farm invite PINs** minted by an admin. Firebase Auth custom tokens still back Firestore rules — Google OAuth is not used.

## Flow

1. Admin creates a PIN (Settings → Invite PINs, or bootstrap script).
2. Worker opens `/login`, enters **name + PIN**.
3. Express `POST /api/auth/redeem-pin` validates the PIN (Admin SDK), creates/updates the Auth user, writes `users/{uid}` with `farmId` + role, returns a custom token.
4. Client calls `signInWithCustomToken` — session persists until logout.
5. Same **name + PIN** maps to the same UID (stable return login).

PINs are stored as SHA-256 hashes in `access_pins/{hash}` (clients cannot read this collection).

## First owner PIN (bootstrap)

With your Firebase Admin service account under `secrets/` (or `GOOGLE_APPLICATION_CREDENTIALS`):

```powershell
npx tsx scripts/createAccessPin.ts --farm farm_owner1 --role admin --label "Owner" --days 365
```

Copy the printed `CODE`, open `http://localhost:3000/login`, enter your name + code.

Then create more PINs from **Farm Management → Team & Access** (or Settings → Invite PINs) while signed in as admin.

Staff join the **same farm** by signing in with name + PIN. Firestore rules treat `pinAuth` custom tokens as authorized farm members (email whitelist does not apply).

## Requirements

- `npm run dev` (Express hosts `/api/auth/*` + Vite)
- Service account JSON that can mint custom tokens for project `gen-lang-client-0444791425`
- Named Firestore DB from `firebase-applet-config.json` (`firestoreDatabaseId`) is used automatically
- Deploy updated `firestore.rules` so `access_pins` stays Admin-only: `firebase deploy --only firestore:rules`

## Optional: disable Google in Firebase Console

Authentication → Sign-in method → disable Google. Custom tokens do not require a provider to be enabled.

## Workshop mode

`VITE_WORKSHOP_MODE=true` still bypasses login for local UI-only work (no cloud farm data).

## Device session vs unlock PIN (UX)

See **DEVELOPER_NOTES.md §4.1**. Summary:

- **Now (implemented):** After first invite PIN sign-in, Firebase Auth IndexedDB persistence keeps the session. Reopen skips `/login` until logout / app-data wipe. Last display name is prefilled via `src/lib/deviceSession.ts`.
- **Later:** Personal unlock PIN (or biometric) after auth / on return — invite PIN stays for first join only.

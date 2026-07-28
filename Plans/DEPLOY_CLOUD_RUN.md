# Deploy PUF-AM live (Cloud Run + custom domain)

> Service name may still be `pufom` until rename Phase B (see `RENAME_TO_PUFAM.md`).

| Surface | URL |
|--------|-----|
| **Canonical live app** | `https://am.pufworks.farm` |
| Cloud Run default (fallback) | `https://pufom-quby5ye5pa-ts.a.run.app` |
| Marketing page | `https://pufworks.farm/pufam/` (PUFworks-site) |
| Android APK | [GitHub Releases](https://github.com/paraquatsundae/PUF-AM/releases/latest) |

`puf.works` apex stays 301 → `pufworks.farm` (path preserved). Do **not** point apex at Cloud Run.

## One-time setup

1. Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)  
   `winget install Google.CloudSDK` → **open a new terminal**
2. Log in and pick the Firebase/GCP project:
   ```powershell
   gcloud auth login
   gcloud config set project gen-lang-client-0444791425
   ```
3. Ensure billing is enabled on that project (Cloud Run requires it).
4. Keep `firebase-applet-config.json` locally (not committed).
5. For **GitHub Actions APK builds**, set repo secret `FIREBASE_APPLET_CONFIG` to that file’s JSON (see [Android APK releases](#android-apk-releases-github-actions) below). The web client config is typically non-secret (apiKey domain-restricted) but stays out of git.

## Deploy

```powershell
cd C:\Projects\Walnut_farm_manager
npm run deploy:cloudrun
```

This builds via Cloud Build, deploys service `pufom` in `australia-southeast1`, wires `DPIRD_API_KEY` from Secret Manager, and prints the public `*.run.app` URL.

## Custom domain: `am.pufworks.farm`

### A) Map domain on Cloud Run

```powershell
gcloud config set project gen-lang-client-0444791425

# Domain mapping (Cloud Run Admin API / domain mappings)
gcloud beta run domain-mappings create `
  --service=pufom `
  --domain=am.pufworks.farm `
  --region=australia-southeast1

# Or (newer): Cloud Run custom domains in console
# https://console.cloud.google.com/run/detail/australia-southeast1/pufom/integrations
```

`gcloud beta run domain-mappings describe --domain=am.pufworks.farm --region=australia-southeast1` prints the records Google expects (usually a CNAME to `ghs.googlehosted.com`, or A/AAAA for some setups).

### B) DNS in Cloudflare (`pufworks.farm` zone)

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `am` | `ghs.googlehosted.com` | **DNS only** (grey cloud) while Google verifies SSL |

Notes:

- Proxied (orange cloud) often breaks Google-managed certificates for Cloud Run domain mappings. Prefer **DNS only** unless you terminate TLS at Cloudflare and reverse-proxy deliberately.
- Do **not** change the existing `puf.works` → `pufworks.farm` redirect rule.
- Apex `pufworks.farm` stays on Cloudflare Pages.

### C) App URL + third-party allowlists (after DNS works)

1. Local / deploy env (and any Cloud Run env vars you set for the container):
   ```
   APP_URL=https://am.pufworks.farm
   VITE_APP_URL=https://am.pufworks.farm
   ```
   Rebuild/redeploy the web app so client bundles pick up `VITE_APP_URL`.

2. **Firebase Auth** → Authentication → Settings → **Authorized domains** → add `am.pufworks.farm` (keep `*.run.app` until cutover is proven).

3. **Google Maps** HTTP referrer restrictions → add:
   - `https://am.pufworks.farm/*`
   - keep `https://pufom-quby5ye5pa-ts.a.run.app/*` briefly as fallback

4. Marketing site CTAs already point at `https://am.pufworks.farm` (PUFworks-site).

### Checklist

- [ ] Cloud Run domain mapping created for `am.pufworks.farm`
- [ ] Cloudflare CNAME `am` → `ghs.googlehosted.com` (DNS only)
- [ ] HTTPS loads on `https://am.pufworks.farm`
- [ ] `APP_URL` / `VITE_APP_URL` set; service redeployed
- [ ] Firebase authorized domain added
- [ ] Maps referrer updated
- [ ] Invite PIN / login smoke on custom domain

## After deploy (run.app only)

If you are not using the custom domain yet:

1. Put the Cloud Run URL into `.env`:
   ```
   APP_URL=https://pufom-xxxxx-ts.a.run.app
   VITE_APP_URL=https://pufom-xxxxx-ts.a.run.app
   ```
2. Google Maps key → HTTP referrer `https://pufom-xxxxx-ts.a.run.app/*`
3. Invite PIN: Cloud Run default compute SA needs Firebase/Auth access (usually fine in the same Firebase project; if redeem fails, grant Firebase Admin / Datastore User).
4. Devices: open the live URL in a browser, or rebuild the APK with:
   ```
   VITE_API_BASE_URL=https://am.pufworks.farm
   CAP_PACKAGED=1
   npm run build:android
   ```

## Android APK releases (GitHub Actions)

Workflow: [`.github/workflows/release-apk.yml`](../.github/workflows/release-apk.yml)

| Trigger | Result |
|---------|--------|
| **Actions → Release Android APK → Run workflow** | Builds debug APK (default) or release if signing secrets present; uploads a GitHub Release |
| Push tag `v*` (e.g. `v0.1.0`) | Same |

Default artefact name on the release: **`PUFAM.apk`**.

Site download button: `https://github.com/paraquatsundae/PUF-AM/releases/latest`

### Firebase config secret (required)

`src/firebase.ts` imports `../firebase-applet-config.json`, which is gitignored. The workflow writes it from **`FIREBASE_APPLET_CONFIG`** before `vite build`:

```powershell
gh secret set FIREBASE_APPLET_CONFIG --repo paraquatsundae/PUF-AM < firebase-applet-config.json
```

### Trigger from GitHub UI

1. Open https://github.com/paraquatsundae/PUF-AM/actions/workflows/release-apk.yml  
2. **Run workflow** → branch `master` → optionally set `build_type` (`debug` / `release`)  
3. When green, open https://github.com/paraquatsundae/PUF-AM/releases/latest

### Trigger from CLI (Windows / Linux)

```powershell
gh workflow run release-apk.yml --repo paraquatsundae/PUF-AM
# or tag:
git tag v0.1.0
git push origin v0.1.0
```

### Signed release APK (optional later)

Without secrets the workflow ships a **debug** APK (fine for workshop sideload). For Play / trusted release signing, add repo secrets:

| Secret | Contents |
|--------|----------|
| `ANDROID_KEYSTORE_BASE64` | Base64 of the `.jks` / `.keystore` file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |

Never commit the keystore. See also `Plans/OFFLINE_MAP_APK.md` § CI releases.

## Firestore rules / scheduled functions

Still via Firebase CLI (separate from the web app container):

```powershell
npx firebase login
npx firebase deploy --only firestore:rules,functions
```

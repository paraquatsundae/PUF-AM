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
   Windows: `winget install Google.CloudSDK` → **open a new terminal**. Linux: the tarball
   installer puts it in `~/google-cloud-sdk`; add `~/google-cloud-sdk/bin` to `PATH` (the
   deploy script also finds it there, and in `/usr/lib/google-cloud-sdk` and `/snap/bin`).
2. Log in and pick the Firebase/GCP project:
   ```bash
   gcloud auth login
   gcloud config set project gen-lang-client-0444791425
   ```
3. Ensure billing is enabled on that project (Cloud Run requires it).
4. Keep `firebase-applet-config.json` locally (not committed).
5. For **GitHub Actions APK builds**, set repo secret `FIREBASE_APPLET_CONFIG` to that file’s JSON (see [Android APK releases](#android-apk-releases-github-actions) below). The web client config is typically non-secret (apiKey domain-restricted) but stays out of git.

## Deploy

```bash
cd ~/dev/Walnut_farm_manager   # or C:\Projects\Walnut_farm_manager on Windows
npm run deploy:cloudrun
```

This builds via Cloud Build, deploys service `pufom` in `australia-southeast1`, wires `DPIRD_API_KEY` from Secret Manager, and prints the public `*.run.app` URL.

`scripts/deploy-cloudrun.mjs` runs on Linux, macOS and Windows — Cloud Build does the
container build server-side, so no local Docker is needed either. The only hard local
requirement is `firebase-applet-config.json`; `.env` and `secrets/enrollment-codes.json`
are read **only** to bootstrap the `DPIRD_API_KEY` / `PUF_ENROLLMENT_CODES` secrets the
first time, and both are in `.gcloudignore` so they never reach the image.

## Custom domain: `am.pufworks.farm`

**GCP / Firebase project:** `gen-lang-client-0444791425`  
**Cloud Run:** service `pufom`, region `australia-southeast1`  
**Fallback (keep until cutover proven):** `https://pufom-quby5ye5pa-ts.a.run.app`

Cloudflare DNS alone is **not** enough. Google also requires the **base domain** to be **verified for the same Google account** used by `gcloud` (Search Console / Webmaster). Until then, domain mapping fails with:

```text
ERROR: (gcloud.beta.run.domain-mappings.create) The provided domain does not appear to be verified for the current account. To verify it, run:

  $ gcloud domains verify am.pufworks.farm

Once verified, try this command again.
You currently have no verified domains.
```

(`gcloud domains list-user-verified` returns empty until this succeeds.)

### Auth first (Linux workshop)

```bash
# SDK may live at ~/google-cloud-sdk after install
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
gcloud auth login          # browser machine; or --no-browser + remote-bootstrap
gcloud config set project gen-lang-client-0444791425
gcloud auth list
```

Cloudflare / Firebase CLIs also need login (`npx wrangler login`, `npx firebase login`) if you use them instead of Dashboards.

### 0) Verify domain ownership (required before mapping)

Verify **`pufworks.farm`** (base domain) with the **same account** as `gcloud auth list` (currently `georgecarmody@gmail.com`). Verifying the apex covers `am.pufworks.farm`.

```bash
gcloud domains list-user-verified --project=gen-lang-client-0444791425
# Expect empty until verified

# Opens Search Console ownership UI for the base domain:
gcloud domains verify pufworks.farm
```

**Cloudflare TXT (DNS only — do not proxy):**

1. In Search Console (opened by `gcloud domains verify`), choose **Domain** property for `pufworks.farm` (not “URL prefix”).
2. Copy the Google verification TXT value (looks like `google-site-verification=…`).
3. [Cloudflare](https://dash.cloudflare.com/) → zone **pufworks.farm** → **DNS** → **Add record**:
   - **Type:** TXT  
   - **Name:** `@` (or `pufworks.farm`)  
   - **Content:** the exact `google-site-verification=…` string  
   - **Proxy:** DNS only (TXT is never proxied)  
   - TTL: Auto
4. Back in Search Console → **Verify**. Wait 1–5 minutes if DNS is fresh; re-check with:

```bash
gcloud domains list-user-verified --project=gen-lang-client-0444791425
# Should list pufworks.farm (or similar)
```

Do **not** change the `puf.works` → `pufworks.farm` redirect. Verification TXT goes only on the **pufworks.farm** zone.

### Region caveat (`australia-southeast1`)

Native Cloud Run **domain mappings are not available** in `australia-southeast1` ([Google docs — Domain mappings locations](https://cloud.google.com/run/docs/mapping-custom-domains)). Supported regions include e.g. `asia-southeast1`, `us-central1`, several EU/US — **not** Sydney.

So after verification you may still hit a region/API error on:

```bash
gcloud beta run domain-mappings create \
  --service=pufom \
  --domain=am.pufworks.farm \
  --region=australia-southeast1
```

Use one of these paths instead of (or after) native mapping:

| Path | When to use |
|------|-------------|
| **A′ Firebase Hosting rewrite → Cloud Run** | Cheapest / simplest for a single app hostname; keep service in Sydney |
| **B′ Global external HTTPS LB + serverless NEG + Google-managed cert** | Production custom domain without moving the service; more GCP resources/cost |
| Move service to a domain-mapping region | Only if you deliberately abandon Sydney for this service |

Prefer **A′** for workshop cutover unless you already want an LB.

> **Client IP for rate limiting — verify `TRUSTED_PROXY_CIDRS` after any change here.**
>
> Rate limits on `redeem-pin`, `create-farm` and `nearby-farms` key off the caller's
> address, which `server/clientIp.ts` reads from the **right** of `X-Forwarded-For`
> — the left of that list is written by the caller and is worthless.
>
> Which entry is the caller cannot be settled by counting hops on this deployment.
> A′ puts two hops in front (Hosting edge, then Cloud Run) while the `run.app`
> origin stays reachable at one hop, and Hosting **cannot** use restricted ingress —
> it proxies over the public internet, so the service must stay
> `--allow-unauthenticated` with ingress `all`
> ([Firebase](https://stackoverflow.com/questions/70510668/)). A fixed count of 2
> would therefore be forgeable by anyone calling `run.app` directly.
>
> So the proxy is recognised by **address** instead: walk from the right, skip
> entries in `server/trustedProxyRanges.ts`, take the first that is not one. Both
> shapes resolve correctly at once and no configuration is required.
>
> **The one thing to check.** That range list is Fastly's published list, but
> Hosting also fronts on Google-owned addresses (`199.36.158.100`), so the hop that
> actually reaches Cloud Run may not be in it. Confirm once, signed in as a platform
> admin:
>
> ```bash
> curl -H "Authorization: Bearer $ID_TOKEN" https://am.pufworks.farm/api/admin/client-ip
> ```
>
> If the **last** `forwarded` entry comes back `"trusted": false`, that address is
> the edge: add its range to `TRUSTED_PROXY_CIDRS` (comma-separated, additive) and
> redeploy. Until then it is being used as the rate-limit key, so everyone behind
> that edge shares a bucket — coarse, but never forgeable.
>
> `TRUSTED_PROXY_HOPS` overrides all of the above with a plain count. Only use it on
> B′, where ingress *can* be restricted to internal + load balancer: close ingress
> first, then set it to 2. See `tests/api/clientIp.test.ts`.

#### A′) Firebase Hosting → `pufom` (recommended while service stays in Sydney)

In a **separate** hosting config folder (not required to live inside the Vite app root), use a rewrite to Cloud Run, then attach `am.pufworks.farm` as a Firebase Hosting custom domain (Firebase will give its own DNS instructions — still **DNS only** in Cloudflare while certs provision).

```json
{
  "hosting": {
    "rewrites": [{
      "source": "**",
      "run": {
        "serviceId": "pufom",
        "region": "australia-southeast1"
      }
    }]
  }
}
```

```bash
npx firebase login
npx firebase deploy --only hosting --project gen-lang-client-0444791425
# Then Firebase Console → Hosting → Add custom domain → am.pufworks.farm
```

#### B′) Load balancer + certificate map (if you skip domain-mappings / Firebase)

Outline only — full LB setup is heavier than Firebase Hosting for this app:

1. Serverless NEG → service `pufom` in `australia-southeast1`
2. Backend service + URL map + HTTPS proxy + forwarding rule
3. Certificate Manager / Google-managed cert for `am.pufworks.farm`
4. Cloudflare: **A/AAAA** or **CNAME** to the LB (DNS only while Google cert provisions)

See [Set up a global external Application Load Balancer with Cloud Run](https://cloud.google.com/load-balancing/docs/https/setting-up-https-serverless).

### A) Map domain on Cloud Run (only if region supports it)

If Google later enables mappings in Sydney, or the service moves to a supported region:

```bash
gcloud config set project gen-lang-client-0444791425

# Confirm ownership first:
gcloud domains list-user-verified

gcloud beta run domain-mappings create \
  --service=pufom \
  --domain=am.pufworks.farm \
  --region=australia-southeast1

gcloud beta run domain-mappings describe \
  --domain=am.pufworks.farm \
  --region=australia-southeast1
```

Google usually wants **CNAME `am` → `ghs.googlehosted.com`**. Confirm with `describe` before changing DNS.

Console: Cloud Run → pufom → Integrations / custom domains:  
https://console.cloud.google.com/run/detail/australia-southeast1/pufom/integrations?project=gen-lang-client-0444791425

### B) DNS in Cloudflare (`pufworks.farm` zone) — after mapping or Firebase/LB

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `am` | `ghs.googlehosted.com` (or Firebase/LB target from setup UI) | **DNS only** (grey cloud) while Google verifies SSL |

**Dashboard steps (no API token required):**

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → zone **pufworks.farm** → **DNS** → **Records**
2. Find `am` (today it may be an orange-cloud / proxied record — that yields **HTTP 525** against Cloud Run)
3. Edit (or create): **CNAME** · name `am` · target from Google/Firebase (**often** `ghs.googlehosted.com`) · **Proxy status: DNS only** (grey cloud)
4. Save. Wait for Google-managed cert (often 15–60 min after mapping + DNS)

Notes:

- Proxied (orange cloud) breaks Google-managed certificates for Cloud Run / Firebase custom domains → **525**. Keep **DNS only** until HTTPS is green; only re-enable proxy if you deliberately terminate TLS at Cloudflare.
- Do **not** change the existing `puf.works` → `pufworks.farm` redirect rule (path-preserving 301).
- Apex `pufworks.farm` stays on Cloudflare Pages.

CLI alternative (needs `CLOUDFLARE_API_TOKEN` with Zone.DNS Edit):

```bash
npx wrangler login   # or export CLOUDFLARE_API_TOKEN=...
# Then use Dashboard or Cloudflare API to upsert the CNAME with proxied=false
```

### C) App URL + third-party allowlists (after DNS works)

1. Local `.env` (gitignored) and Cloud Run:
   ```
   APP_URL=https://am.pufworks.farm
   VITE_APP_URL=https://am.pufworks.farm
   ```
   `npm run deploy:cloudrun` now sets runtime `APP_URL` and passes `VITE_APP_URL` as a **build** env var — required because `.env*` is in `.gcloudignore`. (There is no Maps key any more; imagery goes through `/api/tiles` — see [`API_KEY_SECURITY.md`](API_KEY_SECURITY.md).)

2. **Firebase Auth** authorized domains — add `am.pufworks.farm` (keep the `*.run.app` host until cutover is proven):  
   https://console.firebase.google.com/project/gen-lang-client-0444791425/authentication/settings

3. **Google Maps** key (`VITE_GOOGLE_MAPS_API_KEY`) → Application restrictions → HTTP referrers → add:
   - `https://am.pufworks.farm/*`
   - keep `https://pufom-quby5ye5pa-ts.a.run.app/*` briefly as fallback  
   https://console.cloud.google.com/apis/credentials?project=gen-lang-client-0444791425  
   Details: `Plans/API_KEY_SECURITY.md`

4. Marketing site CTAs already point at `https://am.pufworks.farm` (PUFworks-site).

### Checklist

- [ ] `gcloud auth login` (and wrangler/firebase login if using CLIs)
- [ ] `pufworks.farm` verified in Search Console for the gcloud account (`gcloud domains list-user-verified`)
- [ ] Custom hostname path chosen: Firebase Hosting rewrite **or** HTTPS LB (native domain-mappings **not** in `australia-southeast1`)
- [ ] `GET /api/admin/client-ip` through the custom domain: last forwarded entry reads `"trusted": true`, else add its range to `TRUSTED_PROXY_CIDRS`
- [ ] Cloudflare DNS for `am` → target from that path (**DNS only**, not proxied) — leave `puf.works` redirect alone
- [ ] HTTPS loads on `https://am.pufworks.farm` (not 525)
- [ ] `APP_URL` / `VITE_APP_URL` set; service redeployed via `npm run deploy:cloudrun`
- [ ] Firebase authorized domain added
- [ ] Maps referrer updated
- [ ] Invite PIN / login smoke on custom domain
- [x] `puf.works` → `pufworks.farm` path redirect left alone (verified)

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

```bash
gh secret set FIREBASE_APPLET_CONFIG --repo paraquatsundae/PUF-AM < firebase-applet-config.json
```

### Trigger from GitHub UI

1. Open https://github.com/paraquatsundae/PUF-AM/actions/workflows/release-apk.yml  
2. **Run workflow** → branch `master` → optionally set `build_type` (`debug` / `release`)  
3. When green, open https://github.com/paraquatsundae/PUF-AM/releases/latest

### Trigger from CLI (Windows / Linux)

```bash
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

```bash
npx firebase login
npx firebase deploy --only firestore:rules,functions
```

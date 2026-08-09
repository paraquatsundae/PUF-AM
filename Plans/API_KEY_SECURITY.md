# API key security (workshop)

**Last updated:** 16 July 2026

## DPIRD (weather) — server only

| Env var | Role |
|---------|------|
| `DPIRD_API_KEY` | **Use this.** Loaded by Express / Cloud Functions only. |
| `VITE_DPIRD_API_KEY` | **Deprecated.** Vite can bake any `VITE_*` into the APK. Remove from `.env`. |

Cloud Functions already use Secret Manager: `firebase functions:secrets:set DPIRD_API_KEY`.

Clients never call DPIRD directly — they hit `/api/weather/*` and Firestore `weather_cache`.

---

## Google Maps — client key (must be restricted)

`VITE_GOOGLE_MAPS_API_KEY` is intentionally client-visible (Maps JavaScript API in the WebView / browser). Security is **Google Cloud key restrictions**, not secrecy.

**App package:** `com.sentinut.farm`

### Console steps

1. Open [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials).
2. Select the Maps API key used in `.env` as `VITE_GOOGLE_MAPS_API_KEY`.
3. **API restrictions** → Restrict key → enable only:
   - Maps JavaScript API  
   - (optional) Places API if you add place search later  
   Do **not** leave “Don’t restrict key”.
4. **Application restrictions** → **HTTP referrers (web sites)** → add:

| Referrer | Why |
|----------|-----|
| `http://localhost:3000/*` | Local desktop / Vite |
| `http://127.0.0.1:3000/*` | Tablet via `adb reverse` |
| `http://192.168.0.0/16` is **not** valid — add your PC LAN host explicitly, e.g. `http://192.168.1.168:3000/*` | Live-reload over Wi‑Fi |
| `https://localhost/*` | Packaged Capacitor WebView (`androidScheme: https`) |
| `capacitor://localhost/*` | Some Capacitor builds |
| `https://am.pufworks.farm/*` | Production (canonical) |
| `https://pufom-quby5ye5pa-ts.a.run.app/*` (keep until cutover proven) | Cloud Run fallback |

5. Save. Wait a few minutes for propagation.
6. Smoke-test: desktop satellite layer + tablet map with USB reverse.

### Android package restriction?

Use **HTTP referrers** for the current Leaflet + GoogleMutant (JS API) stack.  
**Android apps** restriction (package + SHA-1) applies to the native Maps SDK — not this WebView path. Keep package `com.sentinut.farm` noted for a future native Maps migration.

### Debug SHA-1 (if you later add native Maps)

```powershell
cd android
.\gradlew.bat signingReport
```

Use the `Variant: debug` SHA-1 with package `com.sentinut.farm` in Cloud Console.

---

## Checklist

- [ ] `.env` has `DPIRD_API_KEY=` and **no** `VITE_DPIRD_API_KEY=`
- [ ] Maps key API-restricted to Maps JavaScript API
- [ ] Maps key application-restricted to the referrers above
- [ ] Satellite tiles still load on desktop + tablet after restrictions

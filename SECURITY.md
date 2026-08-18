# Security

PUF-AM is open source. **Operator secrets stay off GitHub.**

## Never commit

| Local file | Why |
|------------|-----|
| `.env` | DPIRD key, Maps key, workshop overrides |
| `firebase-applet-config.json` | Firebase web config for *your* project |
| `secrets/` | Enrollment codes, Admin SDK JSON, owner console |
| `android/local.properties` | SDK path on this machine |

Copy the examples instead:

```bash
cp .env.example .env
cp firebase-applet-config.example.json firebase-applet-config.json
```

Cloud Run reads `DPIRD_API_KEY` and `PUF_ENROLLMENT_CODES` from **Secret Manager**, not from git.

## Client-visible keys

`VITE_GOOGLE_MAPS_API_KEY` is baked into the web/APK build. Restrict it in Google Cloud (HTTP referrers + Android package). See `Plans/API_KEY_SECURITY.md`.

## Reports

Open a GitHub issue without pasting keys, or email the maintainer listed on the repo.

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

There is no client map key. Satellite imagery goes through `/api/tiles/:z/:x/:y` on our own server, so the provider and any credential it needs stay server-side. The only credential in the bundle is the Firebase web API key, which is public by design — restrict it anyway. See `Plans/API_KEY_SECURITY.md`.

## Reports

Open a GitHub issue without pasting keys, or email the maintainer listed on the repo.

# Deploy PUFOM live (Cloud Run)

Goal: public `https://…run.app` URL — phones/browsers work without your PC or localhost.

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

## Deploy

```powershell
cd C:\Projects\Walnut_farm_manager
npm run deploy:cloudrun
```

This builds via Cloud Build, deploys service `pufom` in `australia-southeast1`, wires `DPIRD_API_KEY` from Secret Manager, and prints the public URL.

## After deploy

1. Put the Cloud Run URL into `.env`:
   ```
   APP_URL=https://pufom-xxxxx-ts.a.run.app
   VITE_APP_URL=https://pufom-xxxxx-ts.a.run.app
   ```
2. Google Maps key → HTTP referrer `https://pufom-xxxxx-ts.a.run.app/*`
3. Invite PIN: Cloud Run default compute SA needs Firebase/Auth access (usually fine in the same Firebase project; if redeem fails, grant Firebase Admin / Datastore User).
4. Devices: open the `https://…run.app` URL in a browser, or rebuild the APK with:
   ```
   VITE_API_BASE_URL=<cloud-run-url>
   CAP_PACKAGED=1
   npm run build:android
   ```

## Firestore rules / scheduled functions

Still via Firebase CLI (separate from the web app container):

```powershell
npx firebase login
npx firebase deploy --only firestore:rules,functions
```

# BYO weather (your DPIRD key, your Google project)

PUF-Ag Manager never holds your DPIRD API key. You deploy this folder into **your**
Firebase project. The key lives in **your** Secret Manager. The function writes
`weather_cache` in your `(default)` Firestore.

Hosted farms on `am.pufworks.farm` do **not** use this package.

## Before you start

- A Firebase project you created (the BYO wizard). Spark is not enough here —
  Cloud Functions and Secret Manager need **Blaze** (a billing account). Set a
  budget alert first.
- A DPIRD API key you registered yourself:
  [DPIRD APIs](https://www.dpird.wa.gov.au/online-tools/apis/) ·
  [API terms](https://www.dpird.wa.gov.au/online-tools/apis/api-terms-and-conditions/)
- You are the API User. Call limits, suspension, and indemnity are yours.
  Do not paste the key into PUF-AM, chat, or email. Misuse can get **your**
  DPIRD account shut off. Weather is information, not advice.

## Deploy

You need a PUF-AM checkout: this package compiles `shared/weather` from the
repo. Copying only this folder is not enough.

From this folder — not the repo root (the root `firebase.json` is PUFworks'):

```text
cd functions-byo-weather
npm install
firebase login
firebase use --add
firebase functions:secrets:set DPIRD_API_KEY
firebase deploy --only functions
```

`firebase use --add` must pick **your** project. Deploy to the PUFworks hosted
project is refused on purpose.

After deploy, copy the `byoWeatherApi` URL (region `australia-southeast1`).
That URL is not a secret. You will paste it into PUF-AM later (Settings).
Do not send the DPIRD key anywhere.

## What this deploys

| Function | Role |
|----------|------|
| `byoRefreshWeatherCache` | Hourly (Australia/Perth). Fills `weather_cache` from DPIRD + MET Norway. |
| `byoWeatherApi` | HTTP: `ensure-cache`, `ensure-forecast`, station list, hourly summaries. |

Auth is a Firebase ID token for **this** project plus farm membership.
The DPIRD allow-list is the same as hosted PUF-AM: `stations` and
`stations/summaries/hourly` only. There is no fallback to PUFworks' key.

Hourly refresh uses your farm's `dpirdStationCode` / existing cache docs, or
the four SW anchors if the cache is still empty.

## Remove

Disconnect the URL in PUF-AM first (clients stop calling). Then, in **your**
project, or the function keeps running and spending DPIRD quota:

```text
cd functions-byo-weather
firebase functions:delete byoRefreshWeatherCache byoWeatherApi
firebase functions:secrets:destroy DPIRD_API_KEY
```

Optional: delete `weather_cache` documents in Firestore. Disconnecting BYO
Firebase on a device does **not** delete this function.

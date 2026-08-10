# Firebase billing — who pays for a cloud farm

**Status:** Plan / not implemented. §5 guardrails are the only part scheduled.
**Date:** 2026-08-09
**Product:** PUF-AM (Ag Manager)
**Goal:** Nobody else's farm can put a charge on George's Google Cloud bill, and no
operator is ever surprised by a bill of their own.

**The requirement, in the owner's words:** *"If people decide to use Firebase hosting
services I don't want to incur any costs. It must be automatic and transparent and
clearly explained to the end user before they start incurring costs of their own."*

Related: [`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) §1 (the XOR) and §6
(this doc supersedes that deferral note) ·
[`DEPLOY_CLOUD_RUN.md`](DEPLOY_CLOUD_RUN.md) ·
[`AUTH_INVITE_PIN.md`](AUTH_INVITE_PIN.md) ·
[`API_KEY_SECURITY.md`](API_KEY_SECURITY.md) ·
[`NAMING.md`](NAMING.md) §8 (Firestore paths).

---

## §0 The locked decision this sits on

[`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) §1 froze it: **a farm is
cloud XOR freenet, never both.** The owner picks on the login storage chooser, before
a PIN is asked for, and nothing in the app lets one farm hold both.

Billing therefore has exactly one surface. A Freenet farm costs nobody anything —
no Firestore, no Storage, no functions, no Cloud Run — and everything below concerns
**cloud farms only**. Wi‑Fi/LAN and Files & backup are always available on both and
are also free: the LAN shelf is a socket on somebody's laptop.

That is not a footnote, it is the escape hatch. Every option in §2 is measured
against the fact that a farm which does not want to pay already has somewhere to go.

---

## §1 Cost model reality

### What Google actually charges

Firestore and Cloud Run both live in **`australia-southeast1` (Sydney)** — see
[`DEPLOY_CLOUD_RUN.md`](DEPLOY_CLOUD_RUN.md). Sydney is a *regional* location, so
op prices are about half the US multi-region prices, but Australian network egress is
at the top of Google's range. Rates below are Sydney, standard edition, **verified
2026-08-10** against the per-location table on
[Firestore pricing](https://cloud.google.com/firestore/pricing) and
[VPC network pricing](https://cloud.google.com/vpc/network-pricing). Re-check before
quoting them to anyone — this is the part of the document that rots.

| Resource | No-cost allowance | Then |
|----------|-------------------|------|
| Firestore document reads | 50,000 / day | **$0.03** per 100k |
| Firestore document writes | 20,000 / day | **$0.09** per 100k |
| Firestore document deletes | 20,000 / day | **$0.01** per 100k |
| Firestore stored data | 1 GiB | **$0.000205479** / GiB-hour ≈ **$0.15** / GiB / month |
| Firestore network egress | 10 GiB / month | **$0.19** / GiB to 1 TiB, then $0.18, then $0.15 |
| Cloud Storage (photos) | 5 GB — **US regions only** for `*.firebasestorage.app` | ~$0.023 / GB / month + egress |
| Firebase Hosting transfer | 360 MB / day | $0.15 / GB |
| Cloud Functions | 2M invocations / month | $0.40 / M |
| Cloud Run | 2M requests, 180k vCPU-s, 360k GiB-s / month | scale-to-zero, so ~$0 idle |
| Firebase Auth | 50,000 MAU | — |

**Three traps in that table.**

1. **The Firestore no-cost allowance covers one database per project** — the first one
   created. `firebase-applet-config.json` carries a `firestoreDatabaseId` field, which
   means this app can be pointed at a *named* database. If the production database is
   not the project's free-tier one, **every read is billed from op number one.**
   Confirm which database holds `farms/*` before trusting any "we're inside the free
   tier" reasoning.
2. **The Cloud Storage no-cost allowance for `*.firebasestorage.app` buckets only
   applies in `us-central1` / `us-west1` / `us-east1`.** A Sydney bucket has no free
   tier at all.
3. **Egress, not ops, is the expensive part here.** Reads are three hundredths of a
   cent per thousand. Shipping a 250 KB photo preview inside the document you just
   read is what costs money, and §1.2 is about exactly that.

Shared/fixed costs today are essentially nil: Cloud Run scales to zero, the weather
scheduler is 720 invocations a month against a 2M allowance, and the four
`weather_cache` docs are a rounding error. **The bill scales with farms, not with
having the service switched on.**

### 1.1 What a cloud farm touches

| Path | Cost shape | Notes |
|------|-----------|-------|
| `farms/{id}/presence/{uid}` | **Writes + fan-out reads + egress** | `PRESENCE_UPSERT_MS = 500` — two writes per second per device, each carrying a ~2 minute bread trail (`TRAIL_WINDOW_MS`, capped 250 points). Every write fans out to every `subscribeFarmPresence` listener as a billable read. |
| `farms/{id}/issues` | **Reads + egress** | `fieldStore` polls the whole collection every **30 s** per device (`getDocs`, not a delta). Each poll bills one read per issue *and re-downloads the document*, including `photoData`. |
| `farms/{id}/archived_issues` | Reads + egress | Same shape, 60 s poll. |
| `photoData` on an issue doc | **Egress multiplier** | `MAX_PHOTO_DATA_BYTES = 800_000` — a base64 JPEG preview living *inside* the Firestore document, re-sent on every poll. |
| Firebase Storage `farms/{id}/issues/**` | Storage + egress | Full-size photo, ≤ 8 MB by `storage.rules`. Nutrition reports ≤ 20 MB. |
| `farms/{id}/tasks`, `harvests`, `machinery`, `employees`, `budgets`, `rd_*`, `marketing_*`, `processing_logs`, `packing_logs`, `energy_logs` | Reads | Live `onSnapshot` per manager component. Cheap while small, and they only bill when the page is open. |
| `farms/{id}/settings/model_params` | Reads | Two listeners (Settings, BlightRisk). Negligible. |
| `users/{uid}`, `farms/{id}` | Reads | One listener each in `AuthContext`. Negligible. |
| `metrics_global/all`, `metrics_daily/{date}`, `metrics_users/{uid}` | **Writes** | `trackMetric` does **three writes per tracked event**. The cost tracker costs money, and `metrics_global/all` is one hot document written by every authenticated user. |
| Cloud Functions | Invocations | `refreshWeatherCache` hourly, `blightAggregate`, `financialAggregate`. Well inside the allowance. |
| Cloud Run (`pufom`) | Requests + CPU | `/api/auth/*`, weather proxy, LAN routes. Scale-to-zero. |
| Firebase Hosting | Transfer | `dist/` is **4.9 MB** on disk (~1.5–2 MB over the wire, compressed and cached). Every page load and every `/api/*` call goes through the Hosting → Cloud Run rewrite. 360 MB/day free ≈ 200 cold loads/day. |

### 1.2 Estimates — small crew, per farm, per month

Arithmetic is shown so it can be argued with. Assumptions: 22 working days, Sydney
rates from the table above, presence trail ~10 KB per document, photo previews
~250 KB (the cap is 800 KB, so this is optimistic).

**Quiet farm** — 2 devices, app open 2 h/day, presence off, 20 open issues, 5 with photos.

| Item | Volume | Cost |
|------|--------|------|
| Issue + path polling reads | ~210k reads | $0.06 |
| Everything else (writes, listeners) | ~5k writes | $0.01 |
| Egress (1.25 MB/poll re-download) | ~13 GB, 3 GiB billable | $0.61 |
| | | **≈ $0.70** |

**Working farm** — 3 devices, map open 4 h/day, **presence on**, 40 issues, 15 with photos.

| Item | Volume | Cost |
|------|--------|------|
| Presence writes | 1.9M | $1.71 |
| Presence fan-out reads | 5.7M | $1.71 |
| Presence egress | ~57 GB, 47 GiB billable | $8.93 |
| Issue polling reads | 1.3M | $0.38 |
| Issue polling egress | ~119 GB | $22.60 |
| | | **≈ $35** |

**Harvest week shape** — 5 devices, 8 h/day, 26 days, 60 issues, 20 with photos.

| Item | Volume | Cost |
|------|--------|------|
| Presence writes | 7.5M | $6.74 |
| Presence fan-out reads | 37.4M | $11.23 |
| Presence egress | ~374 GB | $71 |
| Issue polling reads + egress | 7.5M reads, ~624 GB | $120 |
| | | **≈ $210** |

**The number to remember: $1 for a farm that is barely using it, $35 for a farm that
is, and $200 in a bad month.** Ten farms at harvest is a four-figure bill on a
personal credit card.

### 1.3 The same table after two fixes

Both headline numbers are dominated by two loops, and neither is load-bearing:

| Fix | Effect |
|-----|--------|
| Presence: 500 ms → ~5 s, gated on movement, trail out of the synced document | Presence writes, reads and egress all fall ~10–20× |
| Photo previews out of the Firestore document; polling replaced by a delta or a listener | Issue egress falls from hundreds of GB to megabytes |

With both, all three scenarios land at roughly **$1–3 per farm per month**. That is
the difference between "a managed tier is a business" and "a managed tier is a
liability", so it belongs in this doc even though the changes are code and this pass
is documentation.

**It does not change the recommendation.** $1–3/farm/month is still not $0, and the
requirement says zero. It changes how bad the failure mode is while the guardrails in
§5 are the only thing standing between George and someone else's harvest.

---

## §2 Options, ranked

### The ranking

| | Option | Meets "zero cost to George"? | Cost to build | Verdict |
|--|--------|------------------------------|---------------|---------|
| **1** | **D — Freenet-first, cloud is George's farms only** | **Yes, completely** | Days (§5 guardrails) | **Do this now** |
| **2** | **A — Bring-your-own-Firebase** | Almost (see §3's hole) | Weeks | **Fund this next** |
| 3 | C — Managed paid tier, pass-through billing | No, but it's *funded* | Months + ongoing | Only with demand |
| 4 | B — George's project with quotas and caps | **No** | Days | Adopt the guardrails, reject the answer |

**Recommendation: ship D now, build A next.** They are one path, not two: D is what
the product does until A exists, and A is what makes D unnecessary. C stays a business
decision, not an engineering one. B is not a strategy — but its guardrails are
adopted immediately in §5 as defence in depth, because A and D both still run on
George's project for George's own farms.

### D — Freenet-first (recommended posture, today)

Cloud is not offered to anyone but George. The login storage chooser presents Freenet
(and LAN, which is always on) to everybody else. `create-farm` and the Firestore rules
both refuse a farm that is not on an allowlist.

- **Zero cost is real, not mitigated.** There are no other farms on the project, so
  there is no usage to cap.
- **The product still works for them.** This is the whole point of §1's escape hatch:
  Freenet, LAN sync and `.pufom` files already answer "I don't want my farm in
  someone else's cloud", and §9 auto-sync made the Wi-Fi rung work on a Freenet farm.
- **The cost:** Freenet farms have no crew roster beyond join tickets, no cloud
  presence between devices that cannot see each other, and no Firestore rules as an
  enforcement boundary. Those limits are already written down and already accepted.
- **Honest limit:** it is a *policy*, so it needs the §5 enforcement to be real.
  A rate-limited but unauthenticated `create-farm` endpoint is not a policy, it is a
  suggestion.

### A — Bring-your-own-Firebase (recommended destination)

The farm owner creates their own Firebase project and pastes its config into a
farm-creation wizard step. The app runs against their Firestore, their Storage, their
Auth, their bill. George's project holds only George's farms.

- **Zero cost is very nearly real** — see §3.5 for the one hole (they still load the
  app from George's Hosting) and its fix.
- **It is the honest answer to "their farm, their data, their bill"**, and it gives a
  cloud farm data residency that Freenet cannot promise.
- **It is not free to build.** §3 is the whole design; the short version is that
  `src/firebase.ts` imports its config at *build* time and the invite-PIN system needs
  Admin credentials in the target project. Neither is a wizard step.
- **It asks a farmer to create a Google Cloud project and attach a credit card.**
  That is a real adoption cliff and the copy must not pretend otherwise.

### C — Managed paid tier with pass-through billing

George's project, Stripe, per-farm subscription, usage metered against it.

- Only worth doing on the §1.3 numbers, not the §1.2 ones. At $35/farm/month of
  underlying cost the margin is thin and the downside is unbounded; at $1–3 it is a
  normal SaaS.
- Needs everything a business needs: metering that agrees with Google's, invoicing,
  dunning, a suspension path when a card fails, tax, and a support obligation. That is
  a different product from a workshop app.
- **Do not start this before A.** A proves the multi-project seam that C needs anyway,
  and it earns the right to charge.

### B — George's project with hard quotas, farm caps and a kill switch

Everyone lives on `gen-lang-client-0444791425`; George bounds the damage with budget
alerts, per-farm caps, App Check and a switch that turns it all off.

**This fails the stated requirement, and it should be said plainly.**

- A **GCP budget is an alert, not a cap.** Nothing in Google Cloud stops spend at a
  number. The only hard stop is detaching the billing account, which takes the app
  offline for everyone including George — and it fires *after* the money is spent.
- The Pub/Sub → "disable billing" automation exists and is worth having, but it is
  reactive, it has minutes of latency, and it is indistinguishable from an outage.
- Per-farm caps in Firestore rules cost a read to evaluate and can be exhausted by
  the very traffic they are meant to bound.
- Any bug on any farm — an unmounted presence listener, a retry loop in the shed with
  bad Wi-Fi — is George's money.

**It is a good set of guardrails and a bad answer.** §5 adopts the guardrails.

---

## §3 Recommended flow for A (bring-your-own-Firebase)

This is a sketch to cost the work, not a spec to build from.

### 3.1 The wizard step

Sits on the login storage chooser, at the XOR fork
([`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) §1) — which is already the
one place a farm's backend is chosen, and therefore the only correct place to disclose
what it costs.

```
How should this farm be stored?

  ( ) Freenet + Wi-Fi          Free. Your devices, your network.
  ( ) Your own Firebase        You create a Google project. You pay Google
                               directly — typically a few dollars a month.
  ( ) PUFworks cloud           Invite only.
```

Choosing the middle option leads to the disclosure screen (§4), then to a config
paste, then to validation, then to rules deployment.

### 3.2 The engineering, in order of how much it hurts

| # | Problem | Why it is hard | Way through |
|---|---------|----------------|-------------|
| 1 | **Invite PINs need Admin credentials in the owner's project.** `/api/auth/create-farm`, `/redeem-pin` and `/create-pin` mint Firebase **custom tokens** using George's service account from `secrets/`. A custom token can only be minted by a credential belonging to the target project. | Custom tokens are not a shared capability. Having the owner upload a service-account key to George's Cloud Run would give George a credential that can do anything in their project — a liability, not a solution. | Three real choices, none free: **(a)** the owner deploys the auth routes as Cloud Functions in their own project from a printed one-liner; **(b)** the owner deploys the whole container to their own Cloud Run (this is really "self-hosting", not BYO-config); **(c)** drop custom tokens for BYO farms — Firebase Auth anonymous sign-in plus a membership document and Firestore rules, with the PIN redeemed client-side against a rules-checkable record. **(c)** is the only one that needs nothing deployed by the owner and the only one that is a wizard step. It is also the biggest change to [`AUTH_INVITE_PIN.md`](AUTH_INVITE_PIN.md). |
| 2 | **Firebase config is build-time.** `src/firebase.ts` does `import firebaseConfig from '../firebase-applet-config.json'` and Vite inlines it. `db`, `auth` and `storage` are module-level singletons initialised at import. | A pasted config cannot reach a constant Vite already baked into the bundle. | Move to a runtime loader: config from `localStorage`/IDB, lazy `initializeApp`, and every `db` consumer tolerant of "no project chosen yet". Touches every file that imports `../firebase`. Keep George's config as the built-in default so nothing changes for existing farms. |
| 3 | **Security rules must be deployed to their project.** `firestore.rules` is 63 KB and deployed by hand today. | A browser cannot run `firebase deploy`. | Template the rules, show them with a copy button and a link to the Rules console tab, then **verify by probe**: after they save, the app attempts a read that must fail and a read that must succeed, and refuses to finish the wizard until both behave. Same for `storage.rules`. Never assume the paste happened. |
| 4 | **Named vs default database.** The config carries `firestoreDatabaseId`. | A BYO owner who creates a second database silently loses the entire no-cost allowance (§1). | The wizard forces `(default)` and says why. |
| 5 | **Indexes.** `firestore.indexes.json` plus whatever the viewport query on `issues` needs. | Missing indexes surface as runtime `failed-precondition`, which `AuthContext` already classifies as benign and swallows. | Ship the index file in the wizard, and make the probe in #3 cover an indexed query so a missing index fails loudly during setup instead of quietly in the paddock. |
| 6 | **Functions.** `blightAggregate`, `financialAggregate`, `refreshWeatherCache`. | Same deploy problem as #3. | Blight and financial aggregates are per-farm and must land in the owner's project (or be recomputed client-side). Weather is different — see §3.3. |

### 3.3 What breaks, and what to do about it

| Breaks | Why | Mitigation |
|--------|-----|------------|
| **Weather** | `weather_cache/{station}` is filled by George's hourly function using George's `DPIRD_API_KEY`. A fresh project has an empty cache. | **Keep weather as a shared read-only service on George's project**, behind an authenticated, App Check'd, rate-limited endpoint. It is four station documents refreshed hourly regardless of how many farms read them — the cost is bounded and does **not** scale with farm count. This is a deliberate, named exception to "zero" and it should be stated as such rather than quietly absorbed. Alternative: the owner brings their own DPIRD key. The MET Norway forecast needs no key and could run anywhere. |
| **`chill_cache`** | Same shape — shared aggregates, `allow read, write: if false`, Admin SDK only. | Same endpoint as weather. |
| **`DPIRD_API_KEY`** | Server-only by rule ([`NAMING.md`](NAMING.md) §3 — never `VITE_*`). | **Never hand it to a BYO owner.** It stays behind George's endpoint or they get their own. Non-negotiable. |
| **Google Maps** | `VITE_GOOGLE_MAPS_API_KEY` is George's key, restricted by HTTP referrer and `com.sentinut.farm` ([`API_KEY_SECURITY.md`](API_KEY_SECURITY.md)). A BYO farm on George's origin uses George's Maps quota — **George pays for their map tiles.** | Either the wizard takes their Maps key too, or the map falls back to the Esri basemap packs (`sentinut_basemap`) which are already the offline path. Flag this early: it is easy to ship BYO-Firestore and forget Maps is still on George's card. |
| **Nearby farm discovery** | `farms_public` is one project's collection; `/api/auth/nearby-farms` queries it with the Admin SDK. | Discovery becomes per-project. A BYO farm will not see George's farms and vice versa. Accept it and say so in the wizard — do not silently show an empty list. |
| **Crew presence, invite PINs, members** | All Firestore/Auth in whichever project the farm lives in. | Work unchanged once #1 and #2 are solved. |
| **The `.pufom` / LAN / Freenet pipes** | Do not touch Firebase at all. | Unaffected. This is why the XOR holds. |

### 3.4 What must *not* change

- **The XOR.** A BYO farm is still *the cloud pipe*, not a third one
  ([`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) §6 said this and it is
  still right). `activeFarmPipe()` returns `cloud`. No component learns about
  "whose Firebase".
- **`farmPipes.ts` stays the single answer** to which pipe a farm has. Nothing may
  start sniffing a project id to decide whether to render a card.
- **George's own farms keep working with no wizard.** The built-in config remains the
  default; BYO is an opt-in branch, not a migration.

### 3.5 The hole in "zero", and how to close it

A BYO farm still **loads the app from `am.pufworks.farm`** — George's Firebase
Hosting, rewriting to George's Cloud Run. Their *data* is in their project; their
*page loads* are on George's bill. At 1.5–2 MB a cold load against a 360 MB/day
allowance that is fine for a handful of farms and not fine for a hundred.

Three ways to close it, in order of preference:

1. **They use the desktop app or the APK.** Both serve their own bundled assets —
   `CAP_PACKAGED=1` drops `server.url`, and the Electron shell loads from disk. A
   BYO owner on PUF-AM Desktop or the sideloaded APK is **genuinely zero**, because
   nothing they do touches George's infrastructure at all. This is the strongest
   version of the story and it already works.
2. **Move the static bundle to a free host.** PUFworks-site is already on Cloudflare
   Pages. Serving `dist/` from Cloudflare and keeping Cloud Run for `/api/*` only
   would take almost all of the bandwidth off George's bill.
3. Accept it, and cap it with the §5 budget alert.

**Say this out loud in the wizard.** "Zero" that quietly excludes page loads is the
kind of half-truth this whole document exists to avoid.

---

## §4 Consent and transparency

The requirement is *before they start incurring costs of their own*. That means the
disclosure lands **at the storage chooser, before the farm exists** — not in Settings
where it would be found after the first bill.

### 4.1 The disclosure screen

Shown when "your own Firebase" is chosen, before any config is accepted:

> **This farm will run on your Google account, and Google will bill you for it.**
>
> PUF-AM stores your diary, map, issues and photos in a Firebase project that **you**
> create and **you** own. PUFworks never sees the data and never pays for it.
>
> **What it usually costs.** A small crew with a few thousand records is typically a
> couple of dollars a month, and often nothing at all — Google gives every project a
> free daily allowance. Heavy use during harvest, with live crew positions on the map
> and lots of photos, costs more. Google bills you directly.
>
> **What makes it cost more:** live crew positions on the map, photos on field issues,
> and more devices open at once. You can turn crew positions off in Settings.
>
> **You can avoid this entirely.** Choose **Freenet + Wi-Fi** instead — your devices,
> your network, no accounts and no bills. You can move a farm across later by
> exporting a `.pufom` file.
>
> Google's rates: [firebase.google.com/pricing](https://firebase.google.com/pricing)
> · [Cost calculator](https://cloud.google.com/products/calculator)
>
> ☐ I understand I am connecting my own Firebase project and that I am responsible
>   for its billing.
>
> [ Back ]  [ I understand — continue ]

**Rules for this copy.** No dollar figure is promised — a range and the drivers.
The checkbox is unticked and the continue button is disabled until it is ticked. The
acknowledgment (text version and timestamp) is stored on the farm document, so a later
"nobody told me" has an answer.

The **PUFworks cloud** option gets its own, shorter screen: invite only, George pays,
here is what he can see, here is when it might be withdrawn.

### 4.2 In-app usage indicator

**Most of this already exists.** `src/services/metricsService.ts` has `COST_ESTIMATES`
and `calculateEstimatedCost`; `trackMetric` maintains `metrics_global`, `metrics_daily`
and `metrics_users`; `Admin.tsx` renders all of it. What is missing is showing it to
the person who is paying.

| Where | What it says |
|-------|--------------|
| Settings → Sync → Cloud sync card, footer | "This farm has used about **N** reads and **M** writes this month — roughly **$X** on Google's rates. [What drives this?]" |
| The same card, when presence is on | "Live crew positions are the biggest single cost on this farm." |
| Monthly, once | A dismissible note with the month's figure. Never a modal, never during work. |

Three things to fix before showing it to anyone:

1. **The constants are wrong for Sydney.** `COST_ESTIMATES` uses `$0.06/100k` reads
   and `$0.18/100k` writes — the US multi-region rates. Sydney is `$0.03` and `$0.09`.
   Either correct them or label the figure "estimated upper bound". Do not show a
   number that is quietly 2× reality in either direction.
2. **It ignores egress**, which §1.2 shows is most of the bill. A read count that
   omits the 250 KB the read dragged with it is not an estimate of anything. Either
   estimate bytes or label the figure "operations only, excludes data transfer".
3. **The tracker costs three writes per tracked event** and hammers one global
   document. Sample it, batch it, or scope it per farm — a cost meter that is itself
   a measurable line item is embarrassing.

Cheap and honest beats precise: this is a nudge toward the Settings switches, not an
invoice. The invoice is Google's.

---

## §5 Guardrails on George's project — this week

These apply **whatever** happens with A, C or D, because George's own farms live here
and the project is currently reachable by anyone who loads the site.

### 5.1 The open door

**`POST /api/auth/create-farm` was unauthenticated** until 2026-08-10. The only gate was
`rateLimit(clientKey(req, 'create-farm'), 5, 60 * 60 * 1000)` — five farms per IP per
hour, in-process, so it reset on every Cloud Run cold start and was per-instance, not
global. Anyone who found `am.pufworks.farm` could create farms on George's project and
start writing to his Firestore.

**Closed — item 1 below is built** (`server/enrollmentCodes.ts`). The route now fails
closed: no configured codes means farm creation is off, said plainly. Codes come from
`PUF_ENROLLMENT_CODES` (Secret Manager on Cloud Run) or `secrets/enrollment-codes.json`
in the workshop; single-use is a Firestore `create()` reservation keyed by the code's
SHA-256 — atomic across instances, surviving cold starts, storing the hash rather than
the code — reserved before the farm is built, released if the build fails, and stamped
with the resulting `farmId` for the audit trail. **Deploying this to Cloud Run and
setting the secret is what makes it real on `am.pufworks.farm`.**

| # | Action | Effort | Notes |
|---|--------|--------|-------|
| 1 | ~~**Gate `create-farm` behind an enrolment code** George issues (env var / Secret Manager list, single-use, logged).~~ **Done 2026-08-10** — see above; needs the Cloud Run redeploy + secret. | Small | The single highest-value change in this document. |
| 2 | **Allowlist the farms in `firestore.rules`.** A literal `farmId in ['...','...']` constant in the rules file costs **no extra read** to evaluate, unlike an `exists()` lookup against an allowlist collection. George has a handful of farms; redeploying rules to add one is the right trade. | Small | Belt and braces with #1: even a leaked token cannot create a new farm's worth of data. |
| 3 | **Set a GCP budget alert** at $1 / $5 / $20 to George's email, plus the Pub/Sub → disable-billing function for the runaway case. | Small | **A budget does not cap spend.** It is an alarm. The Pub/Sub automation is a fire axe: it takes the whole app down, George's farms included. |
| 4 | **Turn on App Check** (reCAPTCHA Enterprise on web, Play Integrity on Android) and enforce it on Firestore, Storage and Cloud Run. Nothing in the repo references App Check today. | Medium | Caveats worth knowing before starting: the Electron desktop shell and sideloaded (non-Play) APKs are awkward to attest, `npm run dev` needs the debug provider, and reCAPTCHA Enterprise has its own cost above its free assessments. Roll out in monitor-only mode first. |
| 5 | **Close `test/connection`.** `firestore.rules` has `allow read: if true`, and `src/firebase.ts` calls `getDocFromServer` on it at every boot. That is an unauthenticated billable read available to anyone who loads the page, in a loop if they want. | Tiny | Either delete the probe or make it require auth. |
| 6 | **Fix `metrics_global/all`.** `allow write: if isAuthenticated()` on a single document that every user writes is both a contention hotspot (Firestore's sustained limit is ~1 write/s per document) and an abuse vector. | Small | See §4.2 item 3 — the same change fixes both. |
| 7 | **Cap Cloud Run** with `--max-instances` (3–5 is plenty) and a sane `--concurrency`. | Tiny | Bounds runaway compute. Does nothing for Firestore. |
| 8 | **Disable unused products** — Realtime Database, Phone Auth (billed per SMS), and any API not in use. | Tiny | Reduces the surface that can be billed at all. |
| 9 | **Confirm which Firestore database has the free tier** and that `firestoreDatabaseId` points at it. | Tiny | §1 trap 1. Potentially the difference between $0 and the full bill. |
| 10 | **Turn down the two loops** — presence cadence, and photo previews inside issue documents. | Medium, **code** | Out of scope for this docs pass; §1.3 is the argument. This is the change that makes every other number in this document small. |

### 5.2 What none of this achieves

Items 1–9 make it *hard* for someone else's farm to land on George's project and
*bounded* if one does. They do not make it impossible, and they do not cap spend —
only §2's option D, enforced by items 1 and 2, actually delivers zero. Everything
else is damage control, which is exactly why B is ranked last.

---

## §6 Phasing

### Now — this week (docs + policy, mostly not code)

- [x] This document.
- [x] §5 item 1 — enrolment code on `create-farm` (built 2026-08-10; Cloud Run redeploy pending).
- [ ] §5 item 2 — farm allowlist in `firestore.rules`.
- [ ] §5 item 3 — budget alerts at $1 / $5 / $20.
- [ ] §5 item 5 — close `test/connection`.
- [ ] §5 item 9 — confirm the free-tier database.
- [ ] Storage chooser copy: cloud is invite-only, Freenet is the open path.

Outcome: **zero cost from other people's farms, by construction** — there are no
other people's farms.

### Phase 2 — BYO-Firebase

In dependency order, each landable alone:

1. Runtime Firebase config (§3.2 #2) — the prerequisite for everything else, and
   useful on its own for workshop project switching.
2. The invite-PIN decision (§3.2 #1). **Decide before building anything else**; it is
   the fork that determines whether BYO is a wizard step or a self-hosting exercise.
3. Wizard: disclosure (§4.1) → config paste → rules/indexes template → verification
   probe.
4. Shared weather/chill endpoint (§3.3) — the one named exception to zero.
5. Maps key decision (§3.3) — do not let this be discovered after launch.
6. §5 item 10, the two loops, so a BYO owner's bill is a few dollars and not $35.

### Phase 3 — managed paid tier, only if asked for

Gated on: Phase 2 shipped, §1.3 fixes landed, and actual demand. Needs Stripe,
metering that agrees with Google's, suspension, tax and a support obligation.
**Not an engineering decision.**

---

## §7 The honest summary

- A farm is **cloud XOR freenet**. Freenet, LAN and files cost nobody anything. This
  document is only about cloud farms.
- A cloud farm as the code stands today costs **$1–35 per month**, and **~$200** in a
  harvest month with five devices and live crew positions. Two code changes take that
  to **$1–3**.
- **Option B — quotas and a kill switch — does not meet the requirement.** Google has
  no hard spend cap. Say this to anyone who proposes it.
- **Ship D now:** cloud is George's farms only, enforced at `create-farm` and in the
  Firestore rules. That is zero cost, by construction, this week.
- **Build A next:** bring-your-own-Firebase. It is weeks of work, and the two things
  that make it weeks rather than days are build-time Firebase config and invite PINs
  needing Admin credentials in the target project.
- **A is only truly zero on the desktop app and the APK**, which serve their own
  assets. A browser user still loads the bundle from George's Hosting. Say so.
- Weather and chill aggregates stay a **shared service on George's project** — bounded,
  hourly, and it does not scale with farm count. That is a deliberate exception, not
  an oversight.
- Nobody chooses cloud without reading, and ticking, what it will cost them.

---

*Cross-link housekeeping ([`NAMING.md`](NAMING.md) §9): this plan still needs a row in
the README "Development roadmap" table and a pointer in `DEVELOPER_NOTES.md`. Not done
in this pass — it was scoped to `Plans/` only.*

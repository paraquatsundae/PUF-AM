# Farm Map overlays — highlights, bread trails, paddock names

**Status:** implemented 2026-07-28 (cloud + LAN for highlights/trails; PathTrace remains separate)  
**Related:** `CREW_PRESENCE.md`, Farm Map operate mode

---

## A — Timed area highlights (“check this”)

| Piece | Path / behaviour |
|-------|------------------|
| Cloud | `farms/{farmId}/mapHighlights/{id}` |
| LAN | `server/lanHighlightStore.ts` + `POST/GET/DELETE /api/highlights/:farmId` |
| Client | `src/lib/mapHighlights.ts`, `src/lib/lanHighlights.ts`, `src/hooks/useMapHighlights.ts` |
| Layer | `src/components/map/MapHighlightsLayer.tsx` — pulsing fill in author colour + displayName watermark |
| Tool | Operate mode Hexagon control → Leaflet polygon paint → `HighlightComposeSheet` |

**Fields:** `geojson`, `createdBy`, `displayName`, `colour` (= `presenceColourForUid`), optional `note`, `audience` (`all` \| uid[]), `expiresAt`, `createdAt`.

**Duration**

- Farm setting `highlightDefaultSeconds` (default **30**), editable in **Farm setup** by admin/farmer.
- **Viewers** always send that fixed duration (no picker).
- **Admin / farmer** may pick a preset (incl. farm default) when sending.

**Delete:** admin, farmer, or creator only. Viewers cannot delete others’.

**Create:** any farm member who can use the map (incl. viewer).

Expire client-side when `expiresAt` past; LAN shelf prunes on list; cloud docs may linger until overwritten/deleted (optional server prune later).

---

## B — Bread trails (last 2 minutes)

Presence publish keeps a ring buffer of `{ lat, lng, t }` for the last **120 s** (cloud + LAN), capped at **250** points (~2 min at 0.5 s samples for side-by-side ~15–23 km/h). Cloud upsert / LAN poll every **0.5 s** (`PRESENCE_UPSERT_MS` / `PRESENCE_LAN_POLL_MS` = 500). Local `appendTrailPoint` on every GPS fix with a **100 ms** near-duplicate time gate (plus small distance skip so stationary idle does not fill the buffer); browser/Capacitor watch `maximumAge: 500`.

**Do not drop publish/poll to 0.05–0.1 s.** Consumer GPS is usually ~1 Hz (sometimes a few Hz); sub-100 ms sampling mostly duplicates the same fix. Firestore upsert at 10–20 Hz × N users burns writes, battery, and bandwidth — e.g. 2 min @ 20 Hz ≈ 2400 points/doc before the cap. Keep publish/poll at **500 ms**; denser trail shape comes from local appends, not faster cloud writes. Cap **250** is enough for 0.5 s × 2 min (~240); raise to ~300 only if a denser local buffer is needed later.

| Piece | Path |
|-------|------|
| Helpers / prefs | `src/lib/breadTrails.ts` (localStorage `pufom_bread_trail_prefs`) |
| Publish | `useCrewPresence` appends trail on GPS; `CrewPresenceDoc.trail` (`PRESENCE_UPSERT_MS` / `PRESENCE_LAN_POLL_MS` = 500) |
| Layer | `src/components/map/BreadTrailLayer.tsx` — segment opacity fades to transparent at 2 min |
| Toggles | `BreadTrailToggles` on operate map |

**Toggles (persisted locally)**

| Toggle | Default | Gate |
|--------|---------|------|
| Mine | ON | everyone |
| Machines | ON | everyone (vehicle stub: `kind === 'vehicle'` or `speedMps >= 4`) |
| Everyone | OFF | **admin only** to enable |

Vehicle trails use double stroke width. FieldMode `PathTrace` is unrelated — do not conflate.

---

## C — Paddock name watermarks

`PaddockNameLayer` on OrchardMap (operate + edit): each block’s **name once** at `turf.centerOfMass` (fallback centroid), bold with dark halo for satellite readability.

---

## Rules

`firestore.rules`: `isValidMapHighlight`, `match /mapHighlights/{id}`, presence `trail`/`kind`/`speedMps`, settings `highlightDefaultSeconds` + `farmProfile`. Deploy with `npm run deploy:rules`.

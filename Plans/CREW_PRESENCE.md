# Crew presence on the farm map

**Status:** P1 + P2 done (2026-07-27); P3 mesh still planned  
**Goal:** Show other signed-in farm users live on the map when devices can reach each other (internet, LAN, or device-to-device relay).

---

## Phases

### P1 — Cloud presence (internet) — done

When both devices have Firebase + network:

| Piece | Path / behaviour |
|-------|------------------|
| Write | `src/hooks/useCrewPresence.ts` → `farms/{farmId}/presence/{uid}` every ~8 s while Farm Map open + sharing + GPS |
| Helpers | `src/lib/crewPresence.ts` |
| Layer | `src/components/map/CrewPresenceLayer.tsx` on OrchardMap |
| Privacy | Settings → Privacy “Share location with farm crew” (`pufom_share_crew_location`); default on for workshop / invite PIN |
| Rules | `firestore.rules` `match /presence/{userId}` — deploy rules before prod multi-device |

Reuse `UserLocationLayer` GPS; do not invent a second geolocation stack.

### P2 — LAN presence (same Wi‑Fi / workshop hub) — done

When Cloud is down but Express hub is reachable (or as a same-Wi‑Fi complement):

| Piece | Path / behaviour |
|-------|------------------|
| Store | `server/lanPresenceStore.ts` — in-memory shelf, 45 s stale prune |
| API | `POST /api/presence/:farmId`, `GET /api/presence/:farmId`, `DELETE /api/presence/:farmId/me` (Bearer + farm member, same as LAN sync) |
| Client | `src/lib/lanPresence.ts` — publish + poll (~5 s) via `syncApiUrl` / selected mDNS peer |
| Merge | `useCrewPresence` unions cloud snapshot + LAN poll; freshest `updatedAt` per `uid` |

Discovery: Offline & sync peers / last hub (`mdnsPeers.ts`). Tablet must point at the PC hub base URL.

### P3 — Mesh / device relay (no hub)

Hardest; defer until P1–P2 prove useful in the paddock.

| Option | Notes |
|--------|-------|
| WebRTC data channels via hub signalling | Works when one device can still reach a signaler |
| Nearby / Wi‑Fi Direct (Capacitor plugin) | Android-specific; research later |
| Store-and-forward via USB / `.pufom` | Not “live”; out of scope for presence |

Do **not** build Bluetooth mesh in P1–P2.

---

## UX sketch

- Map header chip: `Crew · 2 nearby` when ≥1 other presence
- Markers: muted colour per user; pulse only for self
- Bread trails (last 2 min) ship with MAP_OVERLAYS — not PathTrace / coverage recording

---

## Acceptance (P1)

1. Two browsers / tablet+PC on same farm both see each other’s marker within ~15 s.
2. Closing the map (or toggling share off) clears presence within ~45 s.
3. Offline device does not spam failed writes; resumes when online.
4. View-only roles can share location if opted in (read map already allowed).

## Acceptance (P2)

1. With Firebase blocked/offline but hub up: two devices on same farm still see each other via LAN within ~15 s.
2. With both cloud + LAN up: markers still correct (no doubles); freshest wins.
3. Hub restart clears in-memory shelf (expected); devices re-publish on next upsert tick.

---

## Implementation order

1. ~~Fix tablet basemap (offline pack + skip/online).~~  
2. ~~P1 cloud presence (rules + publish + markers + Settings).~~  
3. ~~LAN hub endpoints (P2).~~  
4. Mesh / relay (P3).

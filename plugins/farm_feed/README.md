# Farm feed (farm pack)

Whole-farm **chat log** plus issues, highlights, and diary, and a **For you** filter when Directed at names this device’s person. Empty Directed at is Everyone.

**Not a crop pack. Not Freenet. Not a `.pufom` farm pack.** Settings tile says **Farm feed**.

| File | Owns |
|------|------|
| `plugin.json` | Catalog row (`kind: farm`, `category: generic`, `/farm-feed`) |
| `src/farmChatLog.ts` | Cap 80, trim, local cache `pufam.farmChat.log.v1.{farmId}` |
| `src/farmChatHosted.ts` | One rolling Firestore doc `farms/{farmId}/farm_chat/log` |
| `src/farmChatHot.ts` | Chat rides `hot/current` (HotKey only; no new slot) |
| `src/` | Feed page, dashboard card, derive / For you match, last-seen |

**Stays in core:** Directed at picker on issue / highlight compose (`directedAt*` / diary `assignedTo*`).

**Pipes:** Hosted / BYO — capped `farm_chat/log` (single-doc snapshot while Farm feed is open). Freenet-native — local log + Hot + 20s watch (AppImage / APK). Hybrid — Firestore only (no dual-write onto the mirror). Web hosted has no node.

`plugins/.gitignore` allow-lists this folder (`!farm_feed/` + `!farm_feed/**`). Third-party unpacked packs stay ignored.

```bash
npm run plugins:verify -- plugins/farm_feed
```

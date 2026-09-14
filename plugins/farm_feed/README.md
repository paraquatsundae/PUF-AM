# Farm feed (farm pack)

Whole-farm stream of issues, highlights, and diary plus a **For you** filter when Directed at names this device’s person. Empty Directed at is Everyone.

**Not a crop pack. Not Freenet. Not a `.pufom` farm pack.** Settings tile says **Farm feed**.

| File | Owns |
|------|------|
| `plugin.json` | Catalog row (`kind: farm`, `category: generic`, `/farm-feed`) |
| `src/` | Feed page, dashboard card, derive / For you match, local last-seen |

**Stays in core:** Directed at picker on issue / highlight compose (`directedAt*` / diary `assignedTo*`).

**Pipes:** Hosted reuses existing issue / diary / highlight stores (zero new Firestore collection). Freenet reuses Hot + the 20s watch after local merge. Web hosted has no node.

`plugins/.gitignore` allow-lists this folder (`!farm_feed/` + `!farm_feed/**`). Third-party unpacked packs stay ignored.

```bash
npm run plugins:verify -- plugins/farm_feed
```

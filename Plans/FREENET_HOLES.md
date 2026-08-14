# Freenet known holes — how we address them

**Experimental — not production.** Companion to [`FREENET_OPERATOR_FLOW.md`](FREENET_OPERATOR_FLOW.md) §8.

These seven holes are in the code or the plans, not guesses. This file is the plan for each: what we will change, what we will not fake, and in what order.

Do **not** pretend a copy tweak is a crypto change. Roles stay UI bookkeeping; FarmCode stays the decrypt boundary.

---

## Inventory

| # | Hole | Class | When | Status |
|---|------|-------|------|--------|
| 6 | Send card “device PIN for that FarmCode” | Copy | **Now** | **Done** 2026-08-14 — optional PIN, owner Send PIN kept separate |
| 7 | Privacy / Crew leftovers still say Invite PIN | Copy | **Now** | **Done** 2026-08-14 — `activeFarmPipe()` branches |
| 2 | FarmCode + ticket is a two-piece handoff | Copy + UX | **Now** | **Done** 2026-08-14 — Send checklist + join-gate second-piece copy |
| 1 | Send is after farm-setup, not at create | UX | **Soon** | **Done** 2026-08-14 — FarmCode/PIN screens + dismissible Farm setup nudge. No auto-publish |
| 3 | People list is per hub | Product | **Soon** | **Copy done** 2026-08-14 — empty-state names the hub first. Shared bones ledger still later |
| 4 | Revoke is not kick | Crypto / product | **Later** | Open — do not fake |
| 5 | Two tablets, no laptop | Product / APK | **Later** | Open — tracked as E-08 [`APK_FREENET_HOST.md`](APK_FREENET_HOST.md). Needs native PUT + isolated host |

---

## Now — copy (days)

Operator-facing words that already contradict the flow. Cheap, and they stop people walking the wrong path.

### Hole 6 — Send card PIN wording

**Today:** `MistFarmSyncCard` tells the owner the joiner needs “the device PIN for that FarmCode.” The PIN is optional at create/recover. Many joiners skipped it.

**Do:** Split the three-thing list:

1. Paper FarmCode — always.
2. This join ticket — always, latest one.
3. Device PIN — **only if they set one** when they recovered. If they skipped it, they leave that field blank.

Owner-side PIN (this tab sealed the farm) stays a separate field. Do not mix “PIN that unlocks *this* Send” with “PIN the joiner may have set.”

### Hole 7 — Invite PIN leftovers on a Freenet farm

Invite PINs are a Firebase mechanism. On a Freenet farm they must not appear as the way in.

| File | Leftover |
|------|----------|
| `src/pages/Settings.tsx` Privacy card | “Invite PIN / workshop defaults on” |
| `src/components/UnlockPinSettingsCard.tsx` | “use the farm invite PIN” for a new device |
| `src/components/AppUnlockGate.tsx` | Sign-out / setup copy says invite PIN |

**Do:** Branch on `activeFarmPipe()`. Freenet copy: FarmCode + join ticket (and personal unlock PIN as a local lock). Cloud copy: invite PIN, unchanged.

Login / BYO / Farm Management strings that only render on the cloud pipe stay as they are.

### Hole 2 — Two-piece handoff

**Today:** The ticket alone cannot decrypt the farm. The joiner must already have the paper FarmCode. That is correct crypto and a clumsy handoff.

**Do now:**

- How this works (login + in-app) already says two secrets. Keep that the source of truth.
- Send card: “Give them the paper FarmCode **and** this ticket. The ticket by itself will not open the farm.”
- Join gate: “You already typed the FarmCode. This ticket is the second piece.”
- Optional: a one-line “give them” checklist under the minted `PUF-XXXX-XXXX` box.

**Do not:** invent a ticket-only join, embed the FarmCode in the ticket, or print the FarmCode again after the write-it-down screen. That would break the “shown once” rule.

---

## Soon — UX (days–week)

The farm is usable but the next step is easy to miss.

### Hole 1 — Send after farm-setup

**Today:** Create → paper FarmCode → `/farm-setup`. The farm is local-only until Settings → Sync → Send. Farm setup → People is empty and looks like “nobody else exists,” which is true, but the operator may think the farm is already shareable.

**Do:**

1. After the FarmCode screen (or at the end of farm-setup), one sentence: “This farm is only on this computer until Settings → Sync → **Send this farm**.”
2. Optional, not blocking: first-ticket prompt after farm-setup (“Send now so someone else can join, or skip”). Skip leaves them local-only on purpose.
3. People empty-state already points at Send. Keep it; do not add a fake Send on Farm setup.

**Do not:** auto-publish on create. Send is deliberate — it puts ciphertext on Freenet and mints a ticket.

### Hole 3 — People list is per hub

**Today:** Tickets live on the laptop that minted them (`server/joinManifestStore.ts`). Laptop B and the tablet see an empty list even when Dave already joined from laptop A.

**Do first (copy):** Empty-state names the hub and says “tickets live on the laptop that Sent.” The card already names the shelf — make that the first sentence, not a footer.

**Do later (real design, not a footer tweak):** a farm-bones join ledger that travels with Hot/bones so every device that has the farm can list the same tickets. That is a sealed, versioned record plus conflict rules (two hubs minting at once). Spec it before coding. Until then, do not imply a central roster.

---

## Later — product (weeks+)

These need new machinery. Honest copy is already on the People card. Do not ship a button that claims to do them.

### Hole 4 — Revoke is not kick

**Today:** Revoke stops the next resolve of that ticket. A device that already pulled holds a FarmSeed copy. Taking the farm back means a **new FarmCode** (and republish).

**Do not:** add a “kick” that only hides a row, or a remote wipe we cannot enforce.

**If we ever kick for real:** a sealed farm epoch (or a new FarmCode) that old seeds cannot open, plus a re-hand to devices that should stay. That is a crypto/product project, not a Settings toggle. Until then the UI keeps saying “revoke stops new joins; a device that already pulled keeps its copy.”

### Hole 5 — Two tablets, no laptop

**Today:** Only a desktop hosts Freenet and can Send. Two tablets with no laptop cannot hand a farm to each other. Documented in [`APK_FREENET_PLUGIN.md`](APK_FREENET_PLUGIN.md).

**Do:** keep pointing at a laptop hub. How this works already says this.

**Do not:** fake a tablet Send, or ship a half-node in the APK.

**When:** APK Freenet host is a later phase of that plan. Not this workstream.

---

## Suggested build order

1. **Copy pass** — holes 6, 7, and the two-piece sentences on Send + join gate (hole 2). Same PR as any leftover Invite PIN strings on Freenet surfaces.
2. **Create → Send nudge** — hole 1. One screen, no auto-publish.
3. **People empty-state** — hole 3 copy. Then, if we still need a shared list, a bones-ledger spec.
4. **Leave 4 and 5 documented** until someone explicitly opens epoch-kick or APK host.

Roadmap tracker: [`ROADMAP.md`](ROADMAP.md) E-07.

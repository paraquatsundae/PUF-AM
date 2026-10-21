# Hosted multi-user login — requirements

**Status:** Active plan. Requirements and constraints only. Edge cases, the security pass, acceptance criteria, and unhappy-path tests come after this is confirmed.
**Date:** 2026-10-08
**Product:** PUF-AM
**Scope:** Hosted Firebase farms on `pufworks-am` — the login at `am.pufworks.farm`. Invite PIN, owner recovery PIN, enrollment code, and the Firebase session those open.

Not in this document: Freenet / FarmCode / `PUF-` crew invites, bring-your-own Firebase, workshop mode, LAN hub pairing, and the personal unlock PIN except where it sits on top of a hosted session. Those stay in their own plans. Production PIN mechanics stay in [`AUTH_INVITE_PIN.md`](AUTH_INVITE_PIN.md). This file says what the multi-user system must do, including the rules that file never stated.

**Decision — 2026-10-08.** A code is the right to open a session. A session, once open, stays until that device signs out, an admin removes that member, or the account is removed from the directory. Revoking, expiring, replacing, or linking a code does not log other devices out. Changing a member's role or modules does not log them out either.

---

## 1. Actors and credentials

| Actor | How they get in | What they are |
|---|---|---|
| Farm owner | Enrollment code at create, then the owner recovery PIN | Farm admin. One account, the name typed at create. |
| Staff | Invite PIN + their name | `farmer` (can write) or `viewer` (read only). Cannot mint PINs or remove people. |
| Farm admin (not the creator) | An admin invite PIN + their name | Same powers as the owner inside that farm. The PIN binds to the first person who redeems it. |
| Project admin | Google account on this Firebase project | Mints enrollment codes. Not a farm member until they create or join a farm. |
| Returning device | The Firebase session already on that device | No code. Optional local unlock PIN gates the screen; it is not a farm credential. |

There is no password and no email recovery for a PIN account (`@sentinut.local`). July 2026, [`DEVELOPER_NOTES.md`](../DEVELOPER_NOTES.md) §4.1.

The account key for a PIN is **normalised name + PIN**. Normalised means trimmed and lowercased: `George` and `george` are one person. `George` and `George Smith` are two. Same pair always reopens the same account while that PIN still accepts sign-in.

A staff PIN may be redeemed under more than one name, and each name is its own account, until the device cap is spent. An admin PIN may not: the first successful name owns it.

---

## 2. What each code is, and when it stops working

There is no operation that edits a code in place. Replacing one means minting another (new or linked) and, if the old one must die, revoking it.

| Code | Who mints it | Lifetime | After it stops | Open sessions |
|---|---|---|---|---|
| Enrollment code | Project admin, or the configured server list | Single use. No calendar expiry. | A second create is refused. A failed create gives the code back. | None yet — the farm does not exist until create succeeds. |
| Owner recovery PIN | Create-farm, shown once | No expiry. No device cap. | Only if an admin revokes that PIN. | Stay open. |
| Staff invite PIN | Farm admin. Presets are 365 days and 3 device slots. | The expiry the admin set. Empty expiry means never. The API default, when the client omits the field, is 90 days. | Expiry, revoke, or the device cap, each block **new** sign-in only. | Stay open. |
| Admin invite PIN | Farm admin. Presets do not cap devices. | Same expiry rule as staff. | Binds to the first name that succeeds. Any other name is refused. Revoke or expiry blocks return login for that person too. | Stay open. |
| Linked PIN | Farm admin, from a live PIN | Copies the source PIN's expiry. It does not start a new clock. | The source PIN stays valid until it is revoked, expires, or hits its own cap. The linked PIN is held for the source's name when that name is known, and then reopens **that** account. | Stay open. |
| Personal unlock PIN | The person, on one device | Until they change or clear it on that device. | Wrong digits stay on the lock screen. | The Firebase session underneath is unchanged. |

A device slot is one account on one browser, as decided 2026-09-28: phone, tablet, and a computer, three in total for a staff preset. Signing in again on a browser that already has a slot does not spend another. Adding uses, or issuing a linked PIN, does not close anything already open.

Firebase ID tokens last about an hour and refresh while the session is still allowed. That refresh is not a code, and it is not something the person types.

---

## 3. What logs a device out

| Event | This device | Other devices signed in as that person | Can they sign in again with the same code? |
|---|---|---|---|
| Sign out | Leaves the farm. Local unlock PIN is not a way back. | Stay. | Yes, with the same name and a PIN that still accepts sign-in. |
| Wipe, new browser, or a new origin | Must use name + PIN again. | Stay. | Yes, subject to the device cap. |
| Revoke PIN | Stays, if already in. | Stay. | No. |
| PIN expires | Stays, if already in. | Stay. | No. |
| Device cap reached | A browser that already has a slot can still sign in. A new browser cannot. | Stay. | Only on a browser that already took a slot, until an admin adds uses or issues a linked PIN. |
| Linked PIN issued | Stays. | Stay. | Old code still works. New code works for the held name. |
| Role or modules changed | Stays. The open app shows the new grant. | Stay, and take the same new grant. | Next sign-in gets the new grant. |
| Remove access | Leaves, and is told that access was removed. | Every device leaves, with the same reason. | No. They need a new invite. |
| Directory removal | Leaves, and is told the account was removed. | Every device leaves. | No. |

Remove access and directory removal are the only member actions that end other devices. Revoke, expiry, link, add-uses, and a role or module edit do not.

The person must still see the reason after they land on the login screen. A kick that dumps them on an empty join box has not met this requirement.

---

## 4. Use cases

Each use case is the success the system owes that person. Refusals in §5 are part of the same cases, not a later test list.

**UC-1 Create.** A person with an enrollment code enters a farm name and their name and gets a farm, an admin account under that name, and an owner recovery PIN shown once. They cannot reach the farm until that PIN is still on screen for them to keep.

**UC-2 Return as owner.** The same name and the recovery PIN open the original account on a wiped or new device. A different name does not open a second admin and does not take the PIN.

**UC-3 Mint staff.** A farm admin mints an invite for a role and a module list that is a subset of what the farm has turned on, with an expiry and a device cap, and can read the plaintext once.

**UC-4 Join.** A worker types that PIN, then their name, and enters the farm with that role and those modules. The same name and PIN on a later visit reopen that account.

**UC-5 Already in.** A device with a live session opens the farm without asking for the PIN, until sign-out, remove access, directory removal, or a wipe.

**UC-6 New device.** The same worker on a browser that has not taken a slot signs in with the same name and PIN. That spends one slot. The same browser later does not spend another.

**UC-7 Cap.** At three slots the next new browser is refused and told to ask an admin to add uses or issue a linked PIN. Devices already in stay in.

**UC-8 Link.** The admin issues a linked PIN. If the spent PIN has a name, the new PIN is held for that name and reopens that account. Anyone else is refused and told the PIN was issued for that name.

**UC-9 Revoke.** The admin revokes a PIN. Later sign-in with it fails. Phones and tablets already in that farm stay in.

**UC-10 Remove.** The admin removes a member. Every device that member is using leaves the farm and shows why. The admin cannot remove themselves.

**UC-11 Change grant.** The admin changes someone's role or modules. Open devices keep the session and start enforcing the new grant. The screen does not say they were removed.

**UC-12 Sign out.** Sign out ends this device only.

**UC-13 Enrollment.** A project admin can mint a single-use enrollment code. A create without a valid unused code is refused, and a wrong code is not distinguished from a missing one. Nobody creates a hosted farm on this project without one.

**UC-14 Google.** Google sign-in is a different account from any PIN. It does not redeem a PIN and it does not replace the recovery PIN. A Google account with no farm can create one only with an enrollment code, or by minting a code when that account is allowed to. Closing the Google window is not an error.

---

## 5. Constraints

These hold for every use case above.

1. Hosted web does not run Freenet. A FarmCode or a `PUF-` invite on this site is refused with a reason, and a failed PIN lookup does not suggest Freenet.
2. There is no public farm list. Join is the code the person was handed.
3. PIN plaintext is shown once. The server stores a hash. Clients cannot read the PIN collection.
4. A PIN opens only the farm it was minted for.
5. A remembered farm on this device must not reject a PIN for a different farm unless the person has confirmed they are returning to that farm.
6. The owner recovery PIN is bound to the name used at create, from the moment the farm exists. The first return does not get to claim it under another name.
7. An admin invite that is not the recovery PIN binds to the first successful name. A second name is refused and told to use the first name or ask for a new invite.
8. Viewer cannot write farm data. Farmer and viewer cannot mint PINs, change members, or remove access. Admin can, for their own farm only.
9. Worker modules are a subset of the modules the farm has enabled.
10. The sentence the server chooses for a refusal is the sentence the person sees. A Firebase or Admin SDK message is not a login error.
11. Sign-in and create are rate-limited per caller address. The limit is a shed-wide bucket when many devices share one address, and it is allowed to reset when a server process restarts. It is not a per-person lockout.
12. Create on this project stays behind an enrollment code. No code configured and none issued means create is closed.

---

## 6. Missed requirements

These are rules §2–§5 now state that the product never stated, or that the running code does not meet. They are the backlog for the passes after this document. They are not acceptance criteria yet.

| Gap | Requirement | What the product does today |
|---|---|---|
| Revoke is not a kick | UC-9. Revoke stops the next sign-in only. | Server matches this (`active: false` only). Nothing on the Invite PINs screen says the phones stay signed in. |
| Expiry is not a kick | §2. An expired PIN blocks return login. Open sessions stay. | `expiresAt` is checked only inside redeem. Presets are 365 days; omitting the field on the API is 90 days; a blank custom expiry is never. None of that is told to the admin as "this will not sign them out." |
| No in-place edit | §2. Codes are replaced, not edited. | There is revoke, link, and add-uses. There is no "change this code" and no statement of what that would do to sessions. |
| Grant change is not removal | UC-11. | Changing role or modules bumps `authEpoch`. The client treats a higher epoch as "Access removed" and signs them out. |
| Recovery PIN is bound at create | UC-2, constraint 6. | The recovery PIN is stored with no `claimedBy`. The first redeem binds it. A different name on the way back in becomes a second admin and locks the create-time name out. The comment in `inviteLimits.ts` still says the recovery PIN is exempt from binding. |
| One name, one account, said before submit | §1. | The name step says the same name reopens the account. A different spelling still succeeds for a staff PIN and spends a slot as a new person. |
| Remembered farm | Constraint 5. | Every redeem sends the last farm id, including a fresh join. A valid PIN for another farm is refused with "pick the right farm" and the join screen has no picker. |
| Kick reason survives | §3 last paragraph. | Remove access sets "Access removed…" and then sign-out clears the error before login draws. Blacklist and whitelist messages go the same way. |
| Recovery PIN can be lost | UC-1. | The PIN lives in memory. Refresh spends the enrollment code and drops the PIN. Continue does not require it to have been copied. A failed continue is not shown on that screen. |
| Device means a device | 2026-09-28 cap. | A slot is `uid` plus the User-Agent string. A browser update can spend another of the three. |
| Enrollment has no expiry | UC-13. | True in code, never written down. Single-use is. |
| Google is a trap for everyone else | UC-14. | The link sits under the PIN form. A non-admin Google account with no farm is held on a create form whose "Generate a code" button refuses them. |
| Server text on failure | Constraint 10. | Uncaught redeem and create errors return `error.message` to the rose box. Profile load can do the same. |

---

## 7. After this document

Confirm §2 and §3, especially "a replaced or expired code does not log other devices out" and "only Remove access and directory removal do."

Then, in order:

1. Edge cases on these use cases (mistyped name, shared PIN, cap plus link, welcome-back, recovery refresh).
2. Security concerns that sit under the constraints (guessing, shared address, token lifetime after remove, name disclosure on a bound admin PIN).
3. Acceptance criteria, one per use case and constraint, written so a test can fail.
4. Unhappy-path tests of this multi-user system against those criteria.

Do not treat today's behaviour in §6 as the requirement. The requirement is the column on the left.

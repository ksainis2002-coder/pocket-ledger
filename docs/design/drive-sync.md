# Design: Google Drive sync

Date: 2026-10-25. Status: **approved by the owner on 2026-10-25**, with the three spike and sync additions marked "(added at approval)". Replaces `docs/proposals/drive-sync.md` (2026-10-04); that proposal's sign-in and encryption parts carry over, and its four open questions are answered here.

## Why

The owner wants two things, in this order:

1. **Never lose data when a device is lost, broken, stolen or wiped.** The protection should be automatic, so it doesn't depend on remembering to make a backup.
2. **Keep the PC current.** The owner logs on both the phone and the PC, but mostly on the phone. Today the PC falls behind whenever they forget to move data across.

Convenience of switching isn't the main goal; protection is. **Recent matters more than instant:** losing the last few minutes of entries is acceptable, losing a month is not.

## Goals

- Every change reaches a copy in the owner's own Google Drive soon after it's made, with no action needed.
- Opening the app on either device brings it up to date with no action needed.
- A new or wiped device gets everything back with: install, sign in to Google, enter the password.
- Google can store the file but can't read it.
- The app keeps working fully offline. Sync catches up later.

## Non-goals

- Real-time sync, where a change appears on the other device within seconds while both are open.
- Sharing with another person, or more than one ledger.
- Any server of ours.
- Replacing file backup and restore. Backup, Restore and "Send to my other device" stay exactly as they are.

## Anti-goals (a failure even if it technically works)

- **Sync loses data.** This is worse than having no sync. When in doubt, keep both versions or show the restore preview. Never discard data silently.
- **Deleted entries come back.**
- **Google, or anyone with access to the owner's Google account, can read the ledger.**
- **Sync asks questions during everyday use.** It never asks the owner to choose between versions.
- **Sync slows down logging an expense.** The under-5-seconds rule still holds, and a write never waits for the network.

## Rule change

Non-negotiable 1 in CLAUDE.md becomes:

> **No user data leaves the device unencrypted.** When the owner turns on Drive sync, the app stores one encrypted file in a hidden app folder in the owner's own Google Drive. Only the owner's password or recovery code can open it; Google sees only unreadable data. There is no server of ours, no analytics, no telemetry and no third-party scripts. Sync is off until the owner turns it on.

`scripts/lint.mjs` gets an allow-list of exactly two external hosts, `accounts.google.com` and `www.googleapis.com`. They may be used only in `src/sync/` (or wherever the builder places the Drive client). Any other external URL still fails lint. The README privacy text and the release checklist item "No network requests carry my data" change to match: the only requests carrying data are encrypted uploads to the owner's Drive.

## Sign-in (carried over from the proposal)

- The OAuth flow is written by hand with no Google script. It uses the `drive.appdata` scope (a hidden app folder), so the app can't see any other Drive files.
- One-time setup by the owner: a Google Cloud project, an OAuth consent screen, and a web client ID. Allowed origins: the Pages origin and `http://localhost:5173`. Claude provides the steps.
- Access tokens last about an hour, and a browser-only app gets no refresh token.

**Phase 4B spike, before anything else is built.** On a real iPhone home-screen app, an Android installed app and a PC installed app, using the Pages URL, answer:

1. Does sign-in return to the installed app (not Safari or a browser tab)?
2. When the token has expired, can the app get a new one **without taking the owner out of the app**? If not, how often does the owner need to tap "Sign in to Drive again" in normal use (once per app open, once a day…)?

3. *(Added at approval.)* Test **two sign-in methods** side by side, because quiet renewal through a hidden Google page is likely blocked by Safari's tracking protection on the iPhone:
   - **A. Hand-written token flow** (no refresh token), as above.
   - **B. Authorization code flow with PKCE**, which returns a refresh token. Google's token endpoint for web clients also wants the client secret, so it would ship in the app's code. Google discourages that; the harm is limited because the client only works from the registered origins. While the consent screen is in **Testing**, refresh tokens expire after **7 days**, meaning a sign-in once a week unless the Google project is published. Record which scopes need verification to publish.
4. *(Added at approval.)* Does Drive v3 support a **conditional upload** (`If-Match` on the file's ETag, or an equivalent revision check)? If not, the fallback is to read the file's revision just before uploading and again right after; if someone else's upload landed in between, read, merge and upload again. Weaker, acceptable for one person.

The spike reports, for each method and device, how often the owner would have to sign in again.

**Go:** with method A or B, sign-in returns to the installed app on all three devices, and re-sign-in is needed no more than once a day on the phone. If only B passes, the owner confirms the shipped client secret and the 7-day Testing limit (or publishing the Google project) before 4C. If the spike can't meet this, stop and bring the findings back to the owner before 4C. The owner then decides between a tap-to-sync design and dropping Drive sync.

## Encryption (carried over from the proposal)

- WebCrypto only, no dependency.
- A random 256-bit data key encrypts the Drive file with AES-GCM, with a fresh random IV on every upload.
- The data key is stored twice in the file: once wrapped by a key derived from the password (PBKDF2-SHA256, 600,000 iterations, random salt), and once wrapped by a key derived from the recovery code.
- Recovery code: 24 random characters from an unambiguous alphabet, shown in groups of 4 ("K7QX-…").
- Each device keeps the data key in its own IndexedDB after unlocking. The data on the device is already unencrypted, so this adds no new risk.
- **Change password** (from any unlocked device) re-wraps the data key with the new password. Nothing else changes.
- **New recovery code** (from any unlocked device) replaces the old wrap.
- **Forgot everything** (no password, no code, no unlocked device): "Start over in Drive" deletes the Drive file and uploads from this device with a new password and code. Data on the devices is never lost because of a forgotten password.
- Wrong password: "That password doesn't open your Drive data." Nothing changes.

### Recovery code screen (owner's decisions)

- Shown once at setup, and again after "New recovery code".
- Line above the code: "Save this in your password manager. It's the only way back in if you forget your password."
- Buttons: **Copy** and **Email it to myself** (opens the device's mail app with the code in the body; the app never sends mail).
- Under the Email button, always visible: "Your email is probably behind the same Google account as your Drive file. Anyone who gets into that account would have both. A password manager is safer."
- "Done" is enabled only after Copy or Email has been tapped.

## How sync behaves

### When it runs

- When the app opens and when it comes back to the foreground (`visibilitychange` to visible).
- About 3 seconds after the last write (debounced), so a burst of edits makes one upload.
- "Sync now" in Settings.
- *(Added at approval.)* When the app goes to the background (`visibilitychange` to hidden) with unsynced changes, it tries an upload at once. iOS may stop the app before it finishes, so the next-open sync is still the guarantee; this only shrinks the gap.
- Never in the middle of a write, and never blocking one. Writes go to IndexedDB as they do today. Sync reads, merges and writes in its own separate steps, following the IndexedDB rules in CLAUDE.md (no network awaits inside a transaction).

Known limit, accepted: if the phone is closed within the debounce window and the background upload doesn't finish before the OS stops the app, that change uploads the next time the phone app opens. Until then the PC won't have it.

### The four cases

Each device remembers the Drive file revision it last synced with (`lastSyncedRevision`), and whether it has changes since: a separate **`driveDirty`** flag. Every counted write sets it, and so does any change to a traveling setting, including the recent-category lists. Only a successful Drive upload, or taking Drive's copy, clears it. *(Builder's call: the existing `changesSinceSync` is not reused. A file backup or "Send to my other device" resets that counter, and reusing it would let "Take Drive's copy" silently replace changes that were never uploaded.)*

| Drive changed since last sync? | This device changed? | What happens |
|---|---|---|
| No | No | Nothing |
| No | Yes | Upload this device's data |
| Yes | No | **Take Drive's copy** (replace locally, no merge) |
| Yes | Yes | **Merge**, then upload the result |

The third case is the PC catching up, which is most days. The fourth is rare for this owner.

Every upload uses Drive's revision check (upload only if the file is still at the revision just read), or the before-and-after check from spike question 4. If it changed in between, read again and redo the decision, up to 3 times. After that, the status shows "Couldn't sync: try again" and nothing local changes.

### Merge rules

- Records (transactions, goals, budgets) merge one by one by id. For each id, the version with the newer `updatedAt` wins, whether it's an edit, an add or a delete.
- A delete is a **tombstone** `{ id, kind, deletedAt }`. Tombstones are kept in the Drive file and in each device's database for **180 days**, then dropped. (Today `deleteLog` is cleared on import. Under sync, tombstones are separate from `deleteLog` and follow these rules.)
- Settings that travel with the data (currency, locale, recent categories) each get their own `updatedAt`; newer wins per setting. Per-device settings never travel, same as today.
- **Clock guard:** every write sets `updatedAt = max(now, previous updatedAt + 1)`. A record stamped in the future by a device with a wrong clock can then still be overwritten by a later edit on a correct device.
- A goal's `savedCents` is derived, so it's recomputed for every goal after a merge, never merged.
- If free savings or the balance comes out negative after a merge, keep the data and let the Savings tab warning explain it, as import already does.
- A merge never asks questions.

**Goals and their linked movements** *(builder's call, following "never lose data silently")*. After the record-by-record merge, the merged data is checked, and nothing is ever dropped:
- A movement linked to a goal that no longer exists is kept, with `goalId` cleared, so it becomes general savings.
- Money added on one device to a goal that the other device deleted (with "delete the movements too") is kept the same way.
- Money added to a goal that is now archived stays linked, and the goal stays archived.
- If any goal's `savedCents` comes out negative (for example, "I spent it" applied on both devices, which creates two withdrawals), the data is kept as it is.
- Every case above is shown in "See what changed" with a **Check this** label, so the owner can fix it by hand. The Savings warning covers any negative totals.

### First connect on a device that already has data

*(Builder's call.)* Entries deleted before sync existed left no tombstones, so a blind merge on first connect could bring them back. The device uses the existing state history instead:
- **This device has no data:** take Drive's copy.
- **This device's current state is in the Drive file's history and it has no changes since** (it's the same data or older, for example the PC after earlier file moves): take Drive's copy.
- **Otherwise:** show the existing restore preview, with "Only on this device" and Copy list, offering **Take Drive's copy** or **Use this device's data instead**. The second replaces the Drive copy and needs a confirmation. It never merges here.

To make this work, the Drive file carries the state history (`state.lineage`) the same way backup files do.

### Device away for more than 180 days (owner's decision)

If this device's last successful sync is more than 180 days old, it doesn't merge, because tombstones older than that are gone and deleted entries could come back. Instead it shows the **existing restore preview**: "This device hasn't synced since {date}." Below that come the "Only on this device" list with Copy list and "Save a copy first", then **Take Drive's copy** or **Use this device's data instead** (which replaces the Drive copy and needs a confirmation). It never merges in this state. Cancelling leaves this device unchanged and sync paused, with the status "Sync paused: open Settings". *(Builder's call: the second button gives a way forward when this device's data is the copy to keep.)*

### When the Drive copy is reset, replaced or missing

*(Builder's call: never undo a deliberate deletion silently.)* The Drive file carries a `resetId`. It changes whenever the Drive copy is replaced on purpose: a manual restore with sync on, "Use this device's data instead", "Start over in Drive", or Delete all data with sync on.
- **The `resetId` differs from the one this device last synced with:** don't merge. If this device has no unsynced changes, take Drive's copy and say "Your Drive copy was replaced from your {device} on {date}." If it does have unsynced changes, show the restore preview with that line on top, offering Take Drive's copy or Use this device's data instead.
- **The file can no longer be opened with the stored key** (another device used "Start over in Drive"): ask for the password, then follow the reset rule above.
- **The file is gone** (Disconnect with "Also delete the Drive copy" on the other device, or removed from the Google account): pause, with the status "Your Drive copy was deleted". Offer **Upload this device's data** or **Disconnect**. Never re-upload on its own.

### After a merge (owner's decision)

- A one-time note: "Synced: 3 changes from your iPhone · See what changed".
- "See what changed" opens a sheet listing what the merge brought in: entries added, entries replaced by a newer version (showing the new values), and entries removed, each as "3 Oct · Eating out · 4,50 € · Coffee" with a short label (Added / Changed / Removed). Goal and budget changes are listed the same way.
- The list stays available from Settings → Google Drive ("Last sync: 3 changes · See what changed") until the next merge that brings in changes.
- Taking Drive's copy in the "this device didn't change" case shows the same note and list. It's still changes arriving on this device.

## Interaction with existing features

- **Manual restore with sync on.** The restore preview adds "This also replaces your Drive copy." The restore uploads without merging and sets a new `resetId`. The other device then follows the reset rule above, so entries the restore removed don't come back, even if that device had unsynced edits. A restore is the final word, and the other device shows what it would lose before giving anything up.
- **Send to my other device / Open from my other device.** These keep working. With sync on, Settings shows a line above them: "With Drive sync on, you don't need these."
- **Undo.** An undo is an ordinary write: it bumps `updatedAt` and syncs like any change.
- **Delete all data with sync on.** The confirmation sheet adds: "This also empties your Drive copy, unless you disconnect Drive first." It uploads an empty ledger with a new `resetId`. The other device follows the reset rule, so it empties too, unless it has unsynced changes, in which case it shows the preview first.
- **Backup reminder.** With sync on and a successful sync within the last 7 days, the reminder banner doesn't show. File backup stays available.

## Offline

Changes stay on the device. The status says "Waiting for connection". Sync runs when the app is next visible and online. The service worker never caches Drive or Google sign-in requests.

## Settings → Google Drive

- Off by default. **Connect** → Google sign-in → set a password (entered twice, at least 10 characters) → recovery code screen.
- On a device where a Drive copy already exists: Connect → sign-in → "Found your Drive data" → enter the password, or "Use recovery code instead". If this device already has data, it's merged (or, if it was away more than 180 days, the restore preview above).
- Status line: "Synced 2 minutes ago" / "Waiting for connection" / "Sign in to Drive again" / "Sync paused: …" / "Couldn't sync: …".
- Sync now · Change password · New recovery code · Disconnect.
- Disconnect keeps the data on this device, with a separate checkbox "Also delete the Drive copy". That checkbox opens a confirmation sheet.

## Data and schema

- A schema migration (v1 → v2) adds the tombstones store, per-setting `updatedAt` for the traveling settings, and the sync state: `lastSyncedRevision`, last successful sync time, the stored data key, connection status, and the last merge's change list. Existing records already have `updatedAt`. The migration needs an upgrade test, as CLAUDE.md requires.
- The Drive file is one JSON envelope: format version, KDF parameters and salts, the two wrapped keys, IV, and the ciphertext. The plaintext inside is the existing backup format, plus tombstones and per-setting `updatedAt`.

## Phase 4 order

1. **4A Repo and CI.** Done.
2. **4B Spike:** sign-in on the three real devices, with the Go criteria above. Throwaway code.
3. **4C Drive sync:** built to this design, behind the Settings switch.
4. **4D Real-device checks and the release checklist:** everything already listed, plus Drive on all three devices, including a lost-phone drill (wipe the phone app, reconnect, everything comes back).

## Tests (4C)

- **Unit:** the four-case decision; `driveDirty` is set by every counted write and every traveling-setting change, and stays set across a file backup; first connect (empty device, same-history device, different data); the `resetId` rule (clean device, device with unsynced changes); missing file; the goal and linked-movement merge cases with their "Check this" labels; merge (edit vs edit, edit vs delete, add on both sides, settings per field); the clock guard; tombstone expiry at 180 days and one day over; the away-too-long path; `savedCents` recompute after a merge; the crypto round trip; wrong password; recovery-code unlock; change password; new recovery code; the change list after a merge.
- **e2e with a fake Drive** (a local stub with revision checks): two profiles syncing both ways, a conflict on the same entry, a delete on one side and an edit on the other, offline then online, a revision race (retry), wrong password, recovery code, password change on one device then unlock on the other, restore with sync on while the other device has unsynced edits (the preview shows and nothing comes back), delete all with sync on, disconnect with and without deleting the Drive copy (the other device pauses and doesn't re-upload), "Start over in Drive" on one device and then unlock on the other, a routine file backup made before the upload (nothing is lost), and first connect on a PC that already has data from earlier file moves.
- **Speed:** writing an expense with sync on stays as fast as today. Sync work never runs inside the write.

## Left to the builder

- Module layout, the fake Drive's shape, and how the Drive client is organised.
- Exact debounce time (around 3 seconds), retry back-off, and status-line wording beyond what's quoted here.
- Recovery-code alphabet and grouping details.
- Exact layout of the Drive settings section and the "See what changed" sheet, following the existing sheet and list styles.
- How the stored data key is kept in IndexedDB (raw or as a non-extractable `CryptoKey`).

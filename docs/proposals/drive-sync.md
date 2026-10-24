# Proposal: Google Drive sync (before publishing)

Status: **superseded** by [docs/design/drive-sync.md](../design/drive-sync.md) (approved 2026-10-25). Kept for history. Date: 2026-10-04.

## What the owner decided

- Phone and PC stay in step through **Google Drive**, before the app is published.
- Sync is **automatic**: when the app opens, when it comes back to the foreground, a few seconds after each change, plus a "Sync now" button.
- The Drive file is **encrypted with a password**. The owner asked for a password reminder by email or from an authenticated device.
  - Email reminders aren't possible without a server, and anything that could send the password could read it. **A recovery code replaces them.** The app shows it once at setup, and the owner can copy it or email it to themselves from their own mail app.
  - The authenticated-device part is kept: **any device that's already unlocked can set a new password.**
- Moving data by file (backup, restore, "Send to my other device") stays as it is.

## Rule change

Non-negotiable 1 becomes: "No user data leaves the device, except that when the owner turns on Drive sync, an encrypted file goes to the owner's own Google Drive. There is no server of ours, no analytics, and no third-party scripts." The README privacy text changes to match. Sync is off until the owner turns it on.

## How it works

**Sign-in.**
- The OAuth flow is written by hand with no Google script, so the "no third-party scripts" rule still holds. It sends the owner to Google's sign-in page with the `drive.appdata` scope, which is a hidden app folder. The app can't see any other Drive files.
- In the browser, access tokens last about an hour and there's no refresh token. The app tries to re-authorize silently. If that fails, the status says "Sign in to Drive again" and offers a button.
- **Main risk: an iPhone home-screen app.** Sending you to a Google page might come back to Safari instead of the installed app. This is checked first, in a spike, on a real iPhone. If it fails, a popup or a "connect in Safari" fallback gets designed before anything else is built.
- Setup the owner does once: a Google Cloud project, an OAuth consent screen (the owner as test user, or published), and a web client ID. Its allowed origins are the Pages origin and `http://localhost:5173`. Claude gives the steps.

**Encryption.** WebCrypto only, with no dependency.
- A random 256-bit data key encrypts the file with AES-GCM.
- That data key is stored twice in the file: once locked by the password (PBKDF2-SHA256, 600,000 iterations, random salt) and once locked by the recovery code. The recovery code is 24 random characters in groups.
- Each device keeps the data key in its own database after unlocking. The data on the device is already unencrypted, so this adds no new risk.
- **Change password**, from any unlocked device, re-locks the key with the new password. Nothing else changes.
- **New recovery code**, from any unlocked device, replaces the old one.
- **Forgot everything** (no password, no code, no unlocked device): "Start over in Drive" deletes the Drive file and uploads from this device. Data on each device is never lost because of a forgotten password.
- Wrong password: "That password doesn't open your Drive data." Nothing changes.

**Merge** (needed because sync is automatic).
- Records are merged one by one using their id and `updatedAt`. For each id the newer version wins, whether it's an edit, an add or a delete.
- A delete is a tombstone `{id, kind, deletedAt}` kept in the Drive file for 180 days. Today `deleteLog` is cleared on import; under sync, tombstones are kept until they expire.
- Settings that travel with the data each get an `updatedAt`, and the newer value wins.
- After a merge: recompute `savedCents`. If free savings comes out negative, keep the data and let the Savings warning explain it, the same as import does.
- A merge never asks questions. Clock skew between the owner's two devices is accepted, since it's one person.
- Writes: read the Drive file, merge, then upload with a check that the file hasn't changed since it was read (Drive's revision check). If it has changed, read and merge again, up to 3 times.
- A merge that brings in changes says so once: "Synced: 3 changes from your iPhone."

**Manual restore with sync on.** Without this rule, entries the restore removed would come back from Drive on the next merge. So the restore preview adds "This also replaces your Drive copy," and the restore uploads without merging.

**Offline.** Changes stay on the device and the status says "Waiting for connection." Sync runs when the connection is back. The service worker never caches Drive calls.

**Settings → Google Drive.**
- Connect: sign in, set a password, then the recovery code screen. The code must be copied or emailed before "Done" works.
- Status: "Synced 2 minutes ago" / "Waiting for connection" / "Sign in to Drive again" / "Couldn't sync: …"
- Sync now
- Change password
- New recovery code
- Disconnect, which keeps the data here, with a separate option to also delete the Drive copy.

**On a new device:** Connect → sign in → the Drive copy is found → enter the password (or recovery code). If this device already has data, it's merged, not replaced. That replaces the unsent-changes warning for Drive users.

## Phase 4 order

1. **4A Repo and CI:** push, CI (lint, test, build, e2e), deploy to Pages. The site is live but the README says not ready: no real money yet.
2. **4B Spike:** Google sign-in on a real iPhone home-screen app, Android and PC on the Pages URL. Go or no-go for the sign-in method.
3. **4C Drive sync:** build it per this proposal, behind the Settings switch. Tests use a fake Drive in e2e (two profiles syncing, conflicts, offline, wrong password, recovery code, password change from an unlocked device, restore with sync on), plus unit tests for merge, tombstone expiry and the crypto round trip.
4. **4D Real-device checks and release checklist:** everything already listed, plus Drive on all three devices.

## Questions for the project

1. Is the rule change acceptable as written?
2. Is the recovery code an acceptable replacement for the email reminder?
3. Tombstones kept for 180 days: if a device is offline longer than that, a deleted entry could come back. Acceptable?
4. Is "newer `updatedAt` wins" acceptable, or do you want a field-level merge?

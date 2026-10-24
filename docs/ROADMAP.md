# Roadmap

Phases 0–3 were built and tested locally. Since Phase 4A the repo is on GitHub (`ksainis2002-coder/pocket-ledger`), every change is a pull request, and `main` deploys to GitHub Pages.

Each phase is one local branch. Paste the **prompt** into Claude Code (on a computer) or into the Claude chat session that builds the app (from a phone) to start a phase. Review it with `npm run dev`, and on your phone with `npm run dev -- --host` (same Wi-Fi). Then approve the merge.

Notes:
- A phone can't install the app or use offline mode from your computer over Wi-Fi, because that needs HTTPS. Installing and offline mode are tested on desktop Chrome (`localhost` counts as secure) until Phase 4, and on real phones after that.
- **Don't log real money until Phase 4.** Data entered during local testing stays on that address (`localhost` or `http://192.168.x.x`) and won't appear on the published app.

---

## Phase 0 — Scaffold
**Prompt:** "Read CLAUDE.md and docs/SPEC.md. Do Phase 0 from docs/ROADMAP.md."

- TypeScript (strict), esbuild build and dev server, `node:test` via tsx, Playwright (see CLAUDE.md Stack)
- `tokens.css` with light and dark palettes, taken from the prototype's colors
- System font stacks (no font downloads)
- App shell: header, month picker, bottom tab bar with 5 empty tabs, last tab remembered; at 900px and wider a left side menu replaces the bottom bar (SPEC Phone and PC)
- Web app manifest (name, icons, `display: standalone`, theme colors) and a build-generated service worker that precaches the app for offline use and waits for the owner before updating (SPEC App updates). No auto-reload.
- Base path set at build time, default `/`. Asset paths, manifest `start_url` and `scope`, and the service worker scope all follow it.
- An `npm run build:pages` script that builds with base `/pocket-ledger/` and works the same on Windows, macOS and Linux (no shell-only `BASE=… npm run build` syntax).
- `git init` with a `main` branch (no remote)

**Done when:** `npm run e2e` passes (it checks both base paths in Chromium); `npm run build && npm run preview` installs as an app in desktop Chrome, opens offline, and shows 5 tabs; the same works with `npm run build:pages && npm run preview`; and `npm run screenshots` saves every tab at 375×812, 375×667, 1280×800 and 1920×1080 in light and dark, and they've been reviewed. (No computer on the same Wi-Fi is available, so the real-phone layout check happens in Phase 4.)

## Phase 1 — Data layer and money logic
**Prompt:** "Do Phase 1 from docs/ROADMAP.md."

- IndexedDB schema v1 per SPEC (own layer: `Store` interface, `IdbStore`, `MemoryStore`, contract tests in Node and Chromium), including `Goal.openingCents`, the recent-category settings and an index on `updatedAt`; repositories; `navigator.storage.persist()` on first run
- Goals and savings rules from SPEC as repository-level checks: free-savings limit on withdrawals, and refusing any edit, delete or undo that would leave goals claiming money that isn't there (imports excepted)
- Repository functions for undo: restore the previous state of an added, edited or deleted entry, following the same rules (SPEC Undo)
- Typed repository errors (`RuleError`, `QuotaError`, `StorageError`) and IndexedDB `versionchange`/`blocked` hooks exposed to the app (SPEC Storage errors, App updates)
- Repositories refuse entry dates later than today (SPEC Dates and today)
- Settings fields for Phone and PC (`deviceId`, `deviceName` from the user agent, `stateLineage` with `{ id, at }`, `changesSinceSync`, `deleteLog`, `lastSyncAt`, `lastImport`) and `Budget.updatedAt`; every counted repository write updates them in the same transaction; pure `nextExportState()`, `restoreSafety()`, `lossCutoff()`, `lostSince()`, `settingsForExport()` and `settingsAfterImport()` in `src/domain/sync.ts` with their SPEC tests
- `domain/money.ts`: `parseAmount` per SPEC Amount input; format with Intl
- `domain/months.ts`: month keys, previous/next, last 6 months, local-date helpers
- `domain/totals.ts`: month totals (including net to savings), per-category totals, all-time totals, savings balance
- `domain/goals.ts`: `goalPlan` per SPEC Goal plan, and status
- Unit tests for everything above, plus repository tests against `MemoryStore` and the store contract tests in Chromium, including every required test listed in SPEC Amount input, Goal plan, Undo (repository side), Storage errors (failed write) and Goals and savings rules

**Done when:** `npm run test` covers domain logic, the SPEC's required tests for this phase, and the edge cases listed in CLAUDE.md; `npm run e2e` runs the store contract against IndexedDB in Chromium and confirms settings are created at startup.

## Phase 2 — Core screens
**Prompt:** "Do Phase 2 from docs/ROADMAP.md. Use prototype/pocket-ledger-prototype.html as the behavior reference, minus the Don't port list in CLAUDE.md."

- **Install gate** per SPEC: on iPhone in Safari, the app asks you to add it to the Home Screen first, with a "Use in Safari anyway" option that keeps a permanent warning banner showing. Unit tests for `shouldGate`.
- Income, Expenses (with budgets), Savings, and Goals tabs, fully working
- **Fast entry** per SPEC: amount-first form, recent category chips, "Today ▾" chip, collapsed note, focus on open, Enter submits; the "Add expense" PWA shortcut
- `AmountInput` component used for every amount field
- Edit an entry or savings movement in a bottom sheet; single-entry add, edit, delete and goal Add/Take out use the **Undo** toast (SPEC Undo). Goal archive and delete use their confirmation sheets.
- **Storage errors** UI: failed-write toast that keeps the form; "Can't open your data" screen with Reload; "Pocket Ledger was updated. Reload" and "Close other windows" screens
- "Today" refreshed on visibility, focus and every minute (SPEC Dates and today); date pickers capped at today
- Net tab with stats, all-time figures and the 6-month SVG chart using net to savings, with a zero line and a hidden table as the text alternative
- Empty states on every tab
- Speed check (e2e, real IndexedDB in Chromium): seed 10,000 transactions and 20 goals, then time an add, an edit and an undo; each under 150 ms. If it misses, read only savings movements and goals for the rules check and write single entries directly.
- Playwright smoke test at 375×812: add salary, an expense (amount, chip, Enter), a saving and a goal contribution, then check the Net figures; delete the expense and undo it

**Done when:** all tabs work end to end in the browser, an expense can be logged in 3 taps, the install gate logic passes its unit tests (it's simulated in tests, since a real iPhone check needs HTTPS), and `npm run screenshots` output for every tab, form and sheet has been reviewed.

## Phase 3 — Safety net
**Prompt:** "Do Phase 3 from docs/ROADMAP.md."

- Settings screen: currency, theme
- JSON export and import (schema-validated, preview, confirm) per SPEC Backup
- "Phone and PC" in Settings per SPEC: Send to my other device, Open from my other device, Last moved, the state lineage in exported files, the unsent-changes warning with the list of what would be lost, "Copy list" and "Save a copy first", PC install hint
- CSV export per SPEC CSV export (Greek Excel friendly)
- Backup reminder per SPEC (time or volume); storage status display
- "Export what can be read" on the "Can't open your data" screen
- "Update ready · Reload now" in Settings
- iOS installed first-run line in the Net empty state ("Used Pocket Ledger in Safari before? …")
- Install instructions; delete-all-data flow
- Test: export → wipe → import gives identical data; the SPEC's required Backup and CSV tests

**Done when:** a backup restores perfectly in another browser profile, moving data both ways between two browser profiles (standing in for phone and PC) loses nothing and warns about unsent changes, and an e2e test downloads the CSV on a Greek-locale page and reads it back (BOM, `;`, `12,50`, `YYYY-MM-DD`, Greek text, formula escaping). Opening the CSV in Excel is a Phase 4 PC check.

## Phase 4 — Publish

Split into four steps. Drive sync follows `docs/design/drive-sync.md` (approved 2026-10-25).

### 4A — Repo and CI (done 2026-10-25)
- Remote `ksainis2002-coder/pocket-ledger`, `main` pushed with its full history
- GitHub Actions: lint, test, build, build:pages, Playwright Chromium install and e2e on every push and PR; Pages deploys `main` with `npm run build:pages` only after those pass
- `package-lock.json` made by the hand-run "Make lockfile" workflow (every `resolved` is registry.npmjs.org); CI uses `npm ci`
- From here on, each change is a branch and a PR

### 4B — Sign-in spike
**Prompt:** "Do Phase 4B from docs/ROADMAP.md, following the spike section of docs/design/drive-sync.md."

- Throwaway code on a `spike/drive-sign-in` branch, deployed to Pages so it runs on the real origin; nothing reaches `main` except the findings
- On the iPhone home-screen app, the Android installed app and the PC installed app: does sign-in return to the installed app; how often does sign-in have to be repeated with method A (hand-written token flow) and method B (code flow with PKCE and a refresh token)
- Does Drive v3 accept a conditional upload; if not, confirm the before-and-after revision check works
- Needs the owner's one-time Google Cloud setup (project, consent screen with the owner as test user, web client ID with the Pages origin and `http://localhost:5173`)

**Done when:** the findings are written up per device and method, and the owner has made the Go / no-go call (design: Go criteria).

### 4C — Drive sync
**Prompt:** "Do Phase 4C from docs/ROADMAP.md, building docs/design/drive-sync.md."

- Built to the design, behind the Settings switch, with the schema v1 → v2 migration and its upgrade test
- Lint allows `accounts.google.com` and `www.googleapis.com` only in the Drive sync module
- Every test listed in the design's Tests section, including e2e against a fake Drive

**Done when:** lint, test, build and e2e pass, the design's tests are in, and the Drive settings, setup, recovery code, "See what changed" and restore-preview screenshots have been reviewed.

### 4D — Real-device checks and release
- Real-device checks on the Pages URL:
  - iPhone: install gate shows in Safari; Add to Home Screen; the app opens offline; backup through the share sheet saves to Files; Back up now → Save to Files → Cancel in the Files picker leaves "Last backup" unchanged (if iOS reports the share as done anyway, ask "Did you save it?" before committing); the layout looks right on the real screen (notch, keyboard over the Add button)
  - iPhone keyboard: tap Expenses in the tab bar → the decimal keypad opens by itself (iOS only opens it when focus happens inside the tap; if it doesn't, focus synchronously in the tab's click handler)
  - iPhone storage: add, edit, delete and undo entries, close the app fully, reopen, and confirm everything is still there (the WebKit check for the IndexedDB layer)
  - iPhone file picker: "Restore from backup" shows the .json backup in Files (not greyed out)
  - Android: installs from Chrome, opens offline, and the "Add expense" shortcut works
  - PC: installs from Chrome or Edge, opens offline in its own window, side menu and keyboard use work; move data phone → PC → phone with nothing lost; the CSV opens in Excel with correct columns, dates and amounts
  - Drive on all three: connect, phone → PC catch-up, offline then online, and the lost-phone drill (delete the phone app, reinstall, connect, everything comes back)
- Change the README Status to published
- Run the release checklist from the project instructions and fix every fail

**Done when:** the release checklist has no fails, and you've used the installed app on your phone for a few days with Drive sync on and a file backup made.

## Phase 5 — After launch (optional, pick in any order)
- Recurring entries (rent, salary) that create themselves each month, with a review step
- Custom categories (add, rename, hide), with a migration
- Search and filter across all months
- Year view: totals per month, best and worst months
- Quick-add from any tab: long-press the Expenses tab to log an expense in 2 taps
- Optional app lock with a PIN or device passkey (WebAuthn)
- Budget history: a limit change applies from that month on, not to past months
- Currency list limited to currencies with 2 decimal places (the cents model assumes 2)

Each item is its own branch and PR. Any schema change needs a schema migration and a test that upgrades old data.

---

## Ground rules for every phase
- `npm run lint && npm run test && npm run build` pass before a phase is called done, and `npm run e2e` from Phase 1 on
- The phase summary lists what changed, how it was tested, and any new dependency with its reason
- Nothing in the app sends data off the device, except the encrypted Drive file when the owner turns sync on

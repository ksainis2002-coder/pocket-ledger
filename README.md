# Pocket Ledger

A private personal-finance app for tracking income, expenses, savings and goals. It installs to your phone's home screen, works offline, and keeps all data on your device.

## Status
Early development. **Not published yet:** it is built and tested locally until Phase 4 (Publish). See [docs/ROADMAP.md](docs/ROADMAP.md).

## Use it
Open the GitHub Pages URL for this repo on your phone, then install it before entering anything.
- **iPhone:** Safari → Share → Add to Home Screen, then open Pocket Ledger from the home screen. Data entered in Safari stays in Safari and doesn't move to the installed app.
- **Android:** Chrome → menu → Install app

Your data lives only in the installed app on that device. Nothing is sent anywhere.

## Back up
Back up regularly, and always before changing phones. The app reminds you.
- **Back up:** Settings → Back up now. On iPhone, the share sheet opens: choose **Save to Files** (iCloud Drive works well). On other devices the file downloads.
- **Restore:** Settings → Restore from backup, pick the `pocket-ledger-backup-YYYY-MM-DD.json` file, check the preview, then tap **Replace my data**. Restoring replaces everything on this device.
- **CSV:** Settings → Export transactions as CSV gives a spreadsheet of your transactions. It isn't a backup and can't be restored.

## Develop
Needs Node 22 or newer.
```bash
npm install
npx playwright install chromium   # once, for npm run e2e
npm run dev                       # http://localhost:5173, rebuilds on save
npm run dev -- --host             # also reachable from a phone on the same Wi-Fi
npm run build && npm run preview  # production build with offline support, http://localhost:4173
```
Before calling a phase done, run `npm run lint && npm run test && npm run build && npm run e2e`.

Test data entered on `localhost` or over Wi-Fi stays at that address. Don't log real money until the app is published.

## Docs
- [CLAUDE.md](CLAUDE.md): rules for Claude Code in this repo
- [docs/SPEC.md](docs/SPEC.md): what the app does
- [docs/ROADMAP.md](docs/ROADMAP.md): build phases
- [docs/DECISIONS.md](docs/DECISIONS.md): technical decisions log

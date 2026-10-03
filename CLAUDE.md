# CLAUDE.md — Pocket Ledger

Instructions for Claude Code working in this repository. Read this file and `docs/SPEC.md` before any task.

## What this is

Pocket Ledger is a **personal finance app for one person**. It tracks income, expenses, savings and savings goals. It is an installable **Progressive Web App (PWA)** used mainly on a phone, and also on desktop.

**All data stays on the device.** There is no server, no account, no analytics and no network calls with user data. It is developed locally first. Only in Phase 4 (Publish) does it go to GitHub and get hosted as static files on GitHub Pages.

`prototype/pocket-ledger-prototype.html` is the working single-file prototype. Treat it as the reference for features and behavior, not for code structure.

**Don't port from the prototype:**
- the `claude.use("db")` / `claude.use("user")` sync and anything that talks to a remote store
- the "saved to your private space … on any device where you're signed in" text
- float amounts, `parseFloat`, `type="number"` amount fields, and `Math.round(x*100)/100`
- the old data shape (`type`, `amount`, `cat`, `save` flag, `kind: "tx"`) and the `localStorage` data store (`pocket-ledger-v1`)
- the tap-twice "Delete?" button
- Google Fonts `<link>` tags
- a `today` read once at load
- goal "Add" that creates an unlinked save, and the goal plan's month math

There is no import of prototype data.

## Non-negotiables

1. **No user data leaves the device.** No backend, no telemetry, no third-party scripts at runtime, no CDN fonts. Self-host fonts. The only network traffic is loading the app's own static files.
2. **Money is stored as integer cents** (`amountCents: number`). Never store or add floats. Parse input only with `parseAmount` from `src/domain/money.ts`. Format only at the UI edge with `Intl.NumberFormat`.
3. **Dates are local calendar dates** stored as `"YYYY-MM-DD"` strings. Never convert them through UTC (no `new Date("2026-10-03")` for display logic; parse the parts). Read "today" from app state, never from a value captured at load.
4. **Works offline.** After the first visit, every feature works with no connection.
5. **Data must survive.** Call `navigator.storage.persist()` on first run. Keep JSON export/import working at all times. Any schema change needs a Dexie migration and a test that upgrades old data. A failed write never clears what the owner typed.
6. **Mobile first.** Design at 375px wide first. Use the bottom tab bar, keep tap targets at least 44px, and respect `env(safe-area-inset-*)`.
7. Light and dark themes both supported.
8. **The app never reloads itself.** Updates wait for the owner (SPEC App updates).

## Stack (use the latest stable versions at setup time)

- **Vite + React + TypeScript** with `strict: true`
- **Dexie** (IndexedDB) for storage, with `dexie-react-hooks` for live queries
- **vite-plugin-pwa** for the manifest and service worker (`registerType: "prompt"`)
- **Plain CSS with CSS custom properties** (design tokens in `src/styles/tokens.css`). No UI kit.
- **Vitest** + **@testing-library/react** for unit and component tests; **fake-indexeddb** for storage tests
- **Playwright** for a few end-to-end smoke tests at a mobile viewport
- **ESLint + Prettier**
- Charts are hand-rolled SVG components. Add a chart library only if this becomes painful, and ask first.

The base path comes from the `BASE` env variable (default `/`). Never hard-code `/` or `/pocket-ledger/` in asset paths, the manifest or the service worker.

Don't add other dependencies without a short justification in the phase summary.

## Project layout

```
src/
  app/            App shell, routing between tabs, providers, install gate, today clock, update prompt
  features/
    net/          Net money tab
    income/       Income tab
    expenses/     Expenses tab + budgets
    savings/      Savings tab
    goals/        Goals tab
    settings/     Currency, backup/export/import, CSV, updates, about
  db/             Dexie schema, migrations, repositories, typed errors, undo
  domain/         Pure logic: money parsing and math, month totals, goal plans, CSV (no React, no Dexie)
  components/     Shared UI (Money, AmountInput, MonthPicker, BarRow, Ring, Sheet, Toast, CategoryChips)
  styles/         tokens.css, base.css
  test/           Test helpers and fixtures
prototype/        Original single-file prototype (reference only, do not import)
docs/             SPEC.md, ROADMAP.md, DECISIONS.md
```

Keep business logic in `src/domain/` as pure, tested functions. Components call domain functions; they don't do math themselves.

## Commands

- `npm run dev` — local dev server
- `npm run build` — type-check and production build (base `/`)
- `npm run build:pages` — the same build with base `/pocket-ledger/`, for GitHub Pages; must work on Windows, macOS and Linux
- `npm run preview` — serve the production build
- `npm run test` — Vitest
- `npm run e2e` — Playwright
- `npm run lint` — ESLint + Prettier check

Before saying a task is done: `npm run lint && npm run test && npm run build` must pass.

## Working style

- Work one phase from `docs/ROADMAP.md` at a time, on a local git branch named `phase-N-short-name`. When the phase is done, write a short phase summary (what changed, how it was tested, new dependencies), and merge into `main` locally only after I approve.
- There is no GitHub remote until Phase 4 (Publish). Don't add one, push, or set up CI or hosting before then.
- Use small commits with conventional messages (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- Write tests alongside the code. Every domain function gets unit tests, including edge cases: zero, month boundaries, leap years and cents rounding. Every "Required tests" list in SPEC.md is part of done.
- If a requirement in SPEC.md is unclear or seems wrong, stop and ask rather than guess.
- Record any notable technical choice in `docs/DECISIONS.md` (date, decision, why).
- UI copy is plain and short. Buttons say what they do ("Add expense"), and confirmations say what happened ("Expense added").
- Single-entry changes (add, edit, delete an entry; goal Add and Take out) happen at once with an Undo toast. Bigger destructive actions (archive or delete a goal, import, delete all data) need an in-app confirmation sheet. Never use `window.confirm`.

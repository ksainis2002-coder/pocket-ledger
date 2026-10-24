# CLAUDE.md — Pocket Ledger

Instructions for Claude Code working in this repository. Read this file and `docs/SPEC.md` before any task.

## What this is

Pocket Ledger is a **personal finance app for one person**. It tracks income, expenses, savings and savings goals. It is an installable **Progressive Web App (PWA)** used mainly on a phone, and also on desktop.

**Data lives on the device.** There is no server, no account of ours and no analytics. Optional Google Drive sync (Phase 4C, `docs/design/drive-sync.md`) stores one encrypted file in the owner's own Drive; nothing else carries user data. The app is hosted as static files on GitHub Pages from `ksainis2002-coder/pocket-ledger`.

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

1. **No user data leaves the device unencrypted.** When the owner turns on Drive sync, the app stores one encrypted file in a hidden app folder in the owner's own Google Drive. Only the owner's password or recovery code can open it; Google sees only unreadable data. There is no server of ours, no analytics, no telemetry, no third-party scripts at runtime and no CDN fonts (use system font stacks, or self-hosted files in `public/fonts/`). Sync is off until the owner turns it on. Apart from that, the only network traffic is loading the app's own static files.
2. **Money is stored as integer cents** (`amountCents: number`). Never store or add floats. Parse input only with `parseAmount` from `src/domain/money.ts`. Format only at the UI edge with `Intl.NumberFormat`.
3. **Dates are local calendar dates** stored as `"YYYY-MM-DD"` strings. Never convert them through UTC (no `new Date("2026-10-03")` for display logic; parse the parts). Read "today" from app state, never from a value captured at load.
4. **Works offline.** After the first visit, every feature works with no connection.
5. **Data must survive.** Call `navigator.storage.persist()` on first run. Keep JSON export/import working at all times. Any schema change needs a schema migration and a test that upgrades old data. A failed write never clears what the owner typed.
6. **Mobile first.** Design at 375px wide first. Use the bottom tab bar, keep tap targets at least 44px, and respect `env(safe-area-inset-*)`.
7. Light and dark themes both supported.
8. **The app never reloads itself.** Updates wait for the owner (SPEC App updates).

## Stack

The project has only four dev dependencies, all pinned in `package.json`: `esbuild`, `typescript`, `tsx`, `playwright`. There are no runtime dependencies. This was chosen so the app can be built in environments without npm access (see DECISIONS.md, 2026-10-03).

- **TypeScript** with `strict: true`, plus `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes`
- **No UI framework.** Screens are plain TypeScript that build DOM with the small helpers in `src/components/dom.ts`. Each screen exposes `render(state)` and re-renders when its data changes. Always set text with `textContent`, never with `innerHTML` built from data.
- **esbuild** bundles the app (`scripts/build.mjs`) and serves it in development (`scripts/dev.mjs`)
- **Storage:** IndexedDB through our own small layer in `src/db/` (no Dexie). Repositories depend on a `Store` interface with two adapters: `IdbStore` for the browser and `MemoryStore` for Node tests. Both must pass the same contract tests (`src/db/store.contract.ts`): in Node against `MemoryStore`, and in Chromium via `npm run e2e` against `IdbStore`.
- **IndexedDB rules** (Safari is the strictest about these):
  - Never `await` anything except IndexedDB requests inside a transaction. A transaction commits as soon as it has no pending requests, so awaiting a domain function, a timer or a fetch mid-transaction silently commits half a write. Read everything, compute synchronously with pure domain functions, then write, all inside the one transaction.
  - `MemoryStore` behaves like IndexedDB: a transaction is all-or-nothing. If any write in it fails, nothing from it is saved. The contract tests include "the second of three writes fails, and none are saved".
  - The store contract tests run against `IdbStore` in Chromium (`npm run e2e`). WebKit can't be downloaded in the build environment, so Safari storage behavior is checked on a real iPhone in Phase 4.
- **Offline and updates:** a hand-written service worker generated at build time (`scripts/build.mjs` writes `sw.js` with the precache list). Updates use the "prompt" pattern: a new worker waits and is only activated by the owner (SPEC App updates). It never calls `skipWaiting()` on its own.
- **Plain CSS with CSS custom properties** (design tokens in `src/styles/tokens.css`). No UI kit.
- **Fonts:** system font stacks only, so nothing is fetched from a font CDN. Self-hosted font files may be added to `public/fonts/` later. Every amount uses the `.num` class (monospace stack `--font-mono` with `font-variant-numeric: tabular-nums`) so figures line up.
- **Tests:** Node's built-in test runner (`node:test` + `node:assert/strict`) run through `tsx`, for unit and repository tests. **Playwright** (library, Chromium) for end-to-end checks at a 375×812 viewport.
- **Lint:** `tsc --noEmit` with the strict flags above, plus `scripts/lint.mjs`, which enforces the non-negotiables: no `parseFloat` or `Number(` on amount strings, no `new Date("YYYY-MM-DD")` string parsing, no `window.confirm`, no `innerHTML =` with data, and no external URLs in `src/` (from Phase 4C, `accounts.google.com` and `www.googleapis.com` are allowed only in the Drive sync module).
- Charts are hand-rolled SVG. Add a chart library only if this becomes painful, and ask first.

The base path is set at build time: `npm run build` uses `/`, `npm run build:pages` uses `/pocket-ledger/` (a `--base=` flag, so it works on every OS; `BASE` env is also read). Never hard-code `/` or `/pocket-ledger/` in asset paths, the manifest or the service worker. Read it from `BASE_PATH` in `src/app/env.ts`.

Don't add dependencies without asking first and giving a short justification in the phase summary.

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
    settings/     Currency, backup/export/import, CSV, updates, about (Phase 3)
    shared/       Quick add form, edit sheet, helpers used by several screens
  db/             Store interface, IdbStore, MemoryStore, schema, migrations, repositories, typed errors, undo
  domain/         Pure logic: money parsing and math, month totals, goal plans, CSV (no DOM, no storage)
  components/     Shared UI (dom helpers, Money, AmountInput, MonthPicker, BarRow, Ring, Sheet, Toast, CategoryChips)
  styles/         tokens.css, base.css
  test/           Test helpers and fixtures
public/           Static files copied into the build (icons)
scripts/          build, dev, preview server, lint
e2e/              Playwright end-to-end tests
prototype/        Original single-file prototype (reference only, do not import)
docs/             SPEC.md, ROADMAP.md, DECISIONS.md
```

Keep business logic in `src/domain/` as pure, tested functions. Components call domain functions; they don't do math themselves.

## Commands

- `npm run dev` — local dev server with rebuild on save (`npm run dev -- --host` for a phone on the same Wi-Fi). No service worker in dev.
- `npm run build` — production build into `dist/` (base `/`)
- `npm run build:pages` — the same build with base `/pocket-ledger/`, for GitHub Pages; works on Windows, macOS and Linux
- `npm run preview` — serve `dist/` at its base path (`-- --host` for a phone)
- `npm run test` — unit and repository tests (`node:test`)
- `npm run e2e` — Playwright in Chromium; builds at `/` and `/pocket-ledger/` and checks install, offline and the shell. First run on a new computer: `npx playwright install chromium`.
- `npm run lint` — strict type-check plus `scripts/lint.mjs`
- `npm run screenshots` — saves every tab at 375×812, 375×667, 1280×800 and 1920×1080, light and dark, to `e2e/screenshots/` for layout review

Before saying a task is done: `npm run lint && npm run test && npm run build` must pass. From Phase 1 on, `npm run e2e` must pass too, because the real `IdbStore` is only tested there.

## Working style

- Work one phase from `docs/ROADMAP.md` at a time, on a local git branch named `phase-N-short-name`. When the phase is done, write a short phase summary (what changed, how it was tested, new dependencies), and merge into `main` locally only after I approve.
- The GitHub remote is `ksainis2002-coder/pocket-ledger`. Every change is a branch and a pull request; CI (lint, test, build, e2e) must pass before merging, and `main` deploys to GitHub Pages. Phase merges still wait for my approval. `package-lock.json` is made by the "Make lockfile" workflow, since the build environment can't reach the npm registry.
- Use small commits with conventional messages (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- Write tests alongside the code. Every domain function gets unit tests, including edge cases: zero, month boundaries, leap years and cents rounding. Every "Required tests" list in SPEC.md is part of done.
- If a requirement in SPEC.md is unclear or seems wrong, stop and ask rather than guess.
- Record any notable technical choice in `docs/DECISIONS.md` (date, decision, why).
- UI copy is plain and short. Buttons say what they do ("Add expense"), and confirmations say what happened ("Expense added").
- Single-entry changes (add, edit, delete an entry; goal Add and Take out) happen at once with an Undo toast. Bigger destructive actions (archive or delete a goal, import, delete all data) need an in-app confirmation sheet. Never use `window.confirm`.

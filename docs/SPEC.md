# Pocket Ledger — Product Spec

## Goal

Pocket Ledger is a private, fast way for one person to log money in and out, see what's left each month, and build savings toward goals. It is used mostly on a phone, installed to the home screen. Data never leaves the device.

**Out of scope:** multiple users, accounts or login, cloud sync, bank connections, investments or stocks, multi-currency within one ledger, and receipts or photos. Revisit these only if the owner asks.

## Concepts

| Term | Meaning |
|---|---|
| Income | Money received: Salary, Bonus, Gifts, Freelance, Interest, Other income |
| Expense | Money spent, in a category |
| Savings movement | Money moved into savings (`save`) or taken out (`withdraw`). It is not spending. |
| Opening amount | Money a goal already had when it was created (`Goal.openingCents`). It existed before the app, so it is not a movement and never counts toward any month's net. |
| Savings balance | All-time sum of `save` minus `withdraw`, plus the opening amounts of all goals that still exist (archived ones included) |
| Goal | A named target amount with an optional target date. Its money is part of the savings balance, set aside for that goal. Adding money to a goal also creates a `save` movement. |
| Set aside | Sum of `savedCents` over goals that are not archived |
| Free savings | Savings balance − set aside. Money in savings not tied to an active goal. |
| Net to savings (month) | saves − withdrawals for that month. Can be negative. |
| Budget | A monthly spending limit for one expense category |
| Net (month) | income − expenses − net to savings for that month. Opening amounts are never included. |

## Data model (Dexie / IndexedDB)

```ts
type Kind = "income" | "expense" | "save" | "withdraw";

interface Transaction {
  id: string;            // crypto.randomUUID()
  kind: Kind;
  amountCents: number;   // positive integer, at most 9_999_999_999 (99,999,999.99)
  category: string;      // income source, expense category, or "Savings"
  date: string;          // "YYYY-MM-DD", local; never later than today
  note?: string;         // max 80 chars
  goalId?: string;       // set when created from a goal contribution; only on save/withdraw
  createdAt: number;     // epoch ms
  updatedAt: number;
}

interface Goal {
  id: string;
  name: string;          // max 40 chars
  targetCents: number;
  openingCents: number;  // "Already saved" at creation; integer ≥ 0; editable later
  savedCents: number;    // derived and stored: openingCents + linked saves − linked withdrawals
  dueDate?: string;      // "YYYY-MM-DD"; may be in the future
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

interface Budget {
  category: string;      // primary key; one budget per expense category
  limitCents: number;
}

interface Settings {
  key: "settings";
  currency: string;      // ISO 4217, default "EUR"
  locale?: string;       // default: browser locale
  theme: "system" | "light" | "dark";
  lastBackupAt?: number;        // epoch ms of the last completed export
  backupSnoozedUntil?: number;  // epoch ms; hides the backup reminder until then
  iosBrowserAcknowledged?: boolean; // owner chose "Use in Safari anyway" (see Install gate)
  recentExpenseCategories: string[]; // most recent first, max 4; default ["Groceries","Eating out","Transport","Shopping"]
  recentIncomeSource?: string;       // last income source used
  schemaVersion: number;
}
```

Indexes: `transactions` on `date`, `kind`, `[kind+date]`, `goalId` and `updatedAt`.

`openingCents`, the recent-category fields and the indexes are part of schema v1. No migration is needed because v1 has not shipped.

Default categories are fixed lists in `src/domain/categories.ts`. Custom categories come after launch.

- Expense categories: Housing, Groceries, Eating out, Transport, Utilities, Health, Shopping, Entertainment, Travel, Subscriptions, Other
- Income sources: Salary, Bonus, Gifts, Freelance, Interest, Other income

## Install gate (iPhone and iPad)

On iOS and iPadOS, Safari and the home-screen app keep **separate storage**. Entries made in Safari don't appear in the installed app, and Safari storage can be deleted after a period of not being used. So the app must be installed before it is used there.

- **Detect:** the app is installed when `matchMedia("(display-mode: standalone)").matches` or `navigator.standalone === true`. The device is iOS/iPadOS when the user agent says iPhone/iPad/iPod, or when it says Macintosh and `navigator.maxTouchPoints > 1` (iPadOS reports itself as a Mac).
- **iOS, not installed:** show the Install screen instead of the tabs. It has:
  - One line on why: "Install Pocket Ledger first. On iPhone, data you enter in Safari stays in Safari and can be deleted by the browser."
  - Steps: tap Share → Add to Home Screen → open Pocket Ledger from your home screen.
  - A small secondary link, "Use in Safari anyway". It opens a confirmation sheet that repeats the risk, with buttons "Use in Safari" and "Go back". Choosing "Use in Safari" sets `iosBrowserAcknowledged` and shows the tabs. In this mode, a persistent banner above the tab content says "Not installed: your data may be deleted. Install".
- **iOS, installed, first run with no data:** the Net empty state adds one line: "Used Pocket Ledger in Safari before? Export a backup there, then import it here in Settings." This line ships with import (Phase 3).
- **Android and desktop:** no gate, because the browser and the installed app share storage. Show a dismissible install hint in Settings only.
- Gate logic lives in `src/app/` as a pure function `shouldGate({ isIOS, isStandalone, acknowledged })` with unit tests for each combination.

## Screens

A bottom tab bar with 5 tabs. The header shows the tab name and a month picker (‹ month ›). The picker is hidden on Goals, and it can't move past the current month. The app opens on the last tab used.

When the backup reminder is due (see Backup), it shows as a banner at the top of the Net tab: "Last backup 34 days ago" (or "No backup yet") with buttons "Back up now" and "Later". "Later" snoozes it for 7 days.

### 1. Net
- Hero figure: **net this month**, shown in red when negative.
- Three stats: income, expenses, net to savings. Net to savings is shown with a minus sign when negative.
- 6-month grouped bar chart ending at the selected month, with three series: income, expenses, net to savings. Net to savings bars below zero are drawn below a visible zero line. Legend: "Income", "Expenses", "Net to savings".
- The chart's text alternative is a visually hidden table with the same 6 months and three figures.
- All-time figures: total earned, total spent, savings balance.
- Empty state explains what will appear here.

### 2. Income
- Add form at the top, in this order: amount (first, see Fast entry), source as chips (all 6 shown; last used preselected), "Today ▾" date chip, "Add note" link, "Add income" button.
- Below the form: hero figure (income this month), bars per source, and this month's entries newest first.
- Tap an entry to edit it in a bottom sheet. Delete is in the sheet and uses Undo (see Undo).

### 3. Expenses
- Add form at the top (see Fast entry).
- Below the form: hero figure (expenses this month), then bars by category. When a category has a budget, its bar shows progress against the limit: green under 80%, amber from 80%, red at 100% or more. Each budgeted category also gets a pill ("€42 left of €150" or "Over by €12"). The pill text carries the meaning on its own; color is extra.
- Set or remove a monthly budget per category.
- Entry list, with edit and delete as on Income.

### 4. Savings
- Hero figure: savings balance (all time), plus this month's in and out.
- Below the hero: "€X set aside for goals · €Y free". If free savings is negative (possible only with imported data), show instead: "Goals add up to €Z more than your savings balance" in the warning color, with a link to Goals.
- Form: direction (Into savings / Take out), amount, date, note. Movements made here are not linked to a goal.
- This month's movements. Movements linked to a goal show the goal's name.
- Tap a movement to edit it in a bottom sheet; delete is in the sheet and uses Undo. Edits and deletes follow Goals and savings rules.

### 5. Goals
- Create a goal: name, target, already saved (stored as `openingCents`), optional target date.
- Goal card shows: progress ring, saved of target, and a plan line (see Goal plan).
- "Add" on a card puts money into the goal and creates a linked `save` transaction.
- "Take out" on a card withdraws from the goal and creates a linked `withdraw` transaction.
- Edit, archive and delete a goal (see Goals and savings rules).
- Archived goals sit in a collapsed "Archived" list below the active ones.

### Settings (gear icon in the header)
- Currency (EUR default) and theme.
- **Backup:** "Back up now" (export everything as JSON); "Restore from backup" (import). See Backup.
- Export transactions as CSV (see CSV export).
- Storage status: whether persistent storage is granted, whether the app is installed, and the last backup date ("Never" if none).
- **Updates:** when a new version is waiting, "Update ready" with a "Reload now" button (see App updates).
- Install-to-home-screen instructions for iPhone (Safari → Share → Add to Home Screen) and Android.
- Delete all data (requires typing DELETE to confirm).

## Fast entry

Logging an expense should take under 5 seconds: amount, category, Add.

- **Layout of the Expenses add form (375px):**
  1. Amount field, full width, large mono digits, `inputmode="decimal"`.
  2. One row of 4 category chips from `recentExpenseCategories`, plus a "More" chip that opens the full list in a sheet. The most recent is preselected.
  3. One row: "Today ▾" chip (opens a date picker; shows the chosen date when not today) and an "Add note" link that reveals the note field.
  4. "Add expense" button, full width.
- When the Expenses tab is opened from the tab bar or the shortcut, and the selected month is the current month, the amount field gets focus so the keyboard opens.
- Enter in the amount field submits the form (desktop and Android). The iPhone decimal keypad has no return key, so the "Add expense" button must stay visible above the open keyboard on a 375×667 screen; it is the main way to submit on iPhone.
- After adding: the amount and note clear, the category stays, focus returns to the amount field, and the toast says "Expense added · Undo".
- Choosing a category moves it to the front of `recentExpenseCategories` (max 4).
- **PWA shortcut:** the manifest has a shortcut "Add expense" that opens `?add=expense`, which shows the Expenses tab on the current month with the amount focused. Android shows it on long-press of the icon; iOS doesn't support manifest shortcuts.

## Amount input

All amount fields (entries, goal target, already saved, budgets) use one `AmountInput` component and one parser, `parseAmount(text): cents | error` in `src/domain/money.ts`.

- The field is `type="text" inputmode="decimal"`, never `type="number"`.
- Spaces are ignored.
- If the text contains `,` or `.`: the **last** separator is the decimal mark if it is followed by exactly 1 or 2 digits. Every earlier separator is a thousands separator and must be followed by exactly 3 digits.
- If the last separator is followed by exactly 3 digits, it is a thousands separator (`12,345` = 12345.00).
- Rejected, with the message "Enter an amount like 12,50": letters, a minus sign, more than one kind of decimal mark after the last thousands group, 4 or more digits after the last separator, a trailing separator (`12,`), and zero.
- A leading separator is allowed (`,50` = 0.50).
- Maximum 99,999,999.99. Above it: "That amount is too large."
- Cents are built from the digit strings. No `parseFloat`, no floating-point math.
- `openingCents` (already saved) also accepts 0.
- Required tests: `12,50`, `12.50`, `12,5`, `0,01`, `,50`, `1.234,56`, `1,234.56`, `12,345`, `1 234,56`, `12,`, `12,3456`, `-5`, `abc`, `0`, `0,00`, `99999999,99`, `100000000`.

## Dates and today

- Entry dates can't be later than today. The date picker sets `max` to today, and repository functions refuse a later date with "Dates can't be in the future."
- Goal target dates can be in the future.
- "Today" is a value in app state, recomputed on `visibilitychange` (becoming visible), on window `focus`, and once a minute while visible. Everything that depends on today reads it from there: default dates, the month picker's limit, goal plans, the backup reminder.
- If the selected month was the current month when the day changed to a new month, the picker moves to the new current month.
- After adding an entry dated in another month, the month picker jumps to that month.
- Required tests: crossing midnight into the 1st of a month updates the default date and the picker limit; a date one day after today is refused; today is accepted.

## Goal plan

Pure function `goalPlan(goal, linkedThisMonth, today)` in `src/domain/goals.ts`.

- remaining = targetCents − savedCents.
- **Reached:** remaining ≤ 0. Show a "Reached" pill.
- **No target date:** "€{remaining} still to go".
- **Target date passed** (dueDate < today): "Target date passed" pill and "€{remaining} still to go".
- **Due this month** (due month = current month, dueDate ≥ today): "€{remaining} due by {D Mon}".
- **Otherwise:**
  - Start month = the current month if the goal has no linked `save` dated in the current month; otherwise the next month.
  - Months = number of calendar months from the start month through the due month, both included.
  - Monthly = remaining ÷ months, **rounded up to the cent**, so following the plan always reaches the target.
  - Copy: "Put aside €{monthly} a month from {start} to reach it by {Mon YYYY}". {start} is "this month" when the start month is the current month, otherwise the month name ("November", or "January 2027" when it is in the next year).
- Examples (today 2026-10-03):
  - Due 2027-03-15, remaining €600, no contribution in October → 6 months → "Put aside €100 a month from this month to reach it by Mar 2027".
  - Same goal with a contribution already made in October, €600 still remaining → Nov to Mar = 5 months → "Put aside €120 a month from November to reach it by Mar 2027".
  - Remaining €100, due 2027-01-20, contributed in October → Nov, Dec, Jan = 3 months → €33.34.
  - Today 2026-12-31, due 2027-01-01, no December contribution → Dec and Jan = 2 months.
  - Today 2026-10-03, due 2026-10-31 → "€{remaining} due by 31 Oct".
- Required tests: each example above; rounding up by one cent; a goal reached exactly; a target date equal to today.

## Undo

Single-entry changes happen at once and can be undone, instead of asking first.

- Covered actions: add, edit or delete an entry (income, expense, savings movement); "Add" and "Take out" on a goal card.
- After the action, a toast shows what happened with an "Undo" button for 6 seconds: "Expense added · Undo", "Expense deleted · Undo", "Changes saved · Undo", "€50 added to Holiday · Undo".
- Only the most recent action can be undone. A new action replaces the toast.
- Undo restores the exact previous state of the affected records (same id, `createdAt` and `updatedAt`) through a repository function, in one Dexie transaction, and recomputes the goal's `savedCents` when a linked movement is involved.
- Undo is a write and follows Goals and savings rules. If the data changed so that undo would break a rule (for example, the money was withdrawn after the save was deleted), undo is refused with the rule's message and nothing changes.
- Not covered, because they already have a confirmation sheet: archiving or deleting a goal, import, delete all data.
- Required tests: undo after add, edit and delete restores identical records; undo of a goal contribution restores `savedCents`; undo refused by a savings rule leaves data unchanged.

## Storage errors

- **Repository errors** are typed: `RuleError` (a Goals and savings rule), `QuotaError` (storage full), `StorageError` (anything else). Components show the message; they never see raw Dexie errors.
- **A write fails:** nothing is cleared. The form keeps its values, and a toast says "Couldn't save. Your entry is still in the form." For `QuotaError`: "Storage is full. Export a backup, then delete old entries."
- **The database won't open** (blocked, unavailable, `VersionError`, corrupted): show a full-screen message instead of the tabs: "Can't open your data" with "Reload" and, from Phase 3, "Export what can be read". That export reads each table on its own, skips tables that fail, and builds a normal backup file with whatever it read.
- Required tests: a simulated failed write leaves data unchanged and returns the right error type; a failed add keeps the form values.

## App updates

- vite-plugin-pwa uses `registerType: "prompt"`. A new version never reloads the app on its own.
- When a new version is waiting, Settings shows "Update ready" with "Reload now". Otherwise the update applies the next time the app is fully closed and reopened.
- Dexie `versionchange` (another tab or window is upgrading the database): close the database and show a full-screen message "Pocket Ledger was updated. Reload".
- Dexie `blocked` (this tab is upgrading and another one holds the old version): show "Close other Pocket Ledger windows to finish updating."

## Goals and savings rules

All of these are enforced in repository functions in `src/db/`, inside one Dexie transaction per write, with the math in `src/domain/goals.ts` and `src/domain/totals.ts`.

**Invariant.** For every goal, `savedCents = openingCents + Σ linked save − Σ linked withdraw`, and `savedCents ≥ 0`. Recompute it whenever a linked movement is added, edited or deleted, or `openingCents` is edited.

**Limits on taking money out.**
- "Take out" on a goal can't exceed that goal's `savedCents`. Message: "This goal only has €X."
- "Take out" on the Savings tab can't exceed free savings. Message: "Only €X is free. The rest is set aside for goals. To use it, take it out of a goal."
- Any add, edit, delete or undo that would make free savings or the savings balance negative is refused with a message naming the shortfall. Example: deleting an old general `save` of €200 when free savings is €150 gives "This would leave your savings €50 short of what's set aside for goals."
- Refusals happen before any write and leave data unchanged.

**Editing linked movements.** Amount, date and note can be edited; the goal link and the kind can't. To move money to a different goal, delete the movement and add it again. An edit that would make the goal's `savedCents` negative is refused.

**Editing a goal.** Name, target, date and opening amount can be edited. Lowering `openingCents` follows the same limits as a withdrawal.

**Archiving.** Archiving opens a sheet that asks "What happened to the €{saved}?" with two choices:
- **I spent it:** creates a linked `withdraw` for the goal's full `savedCents`, dated today, with the note "Spent: {goal name}". The goal's `savedCents` becomes 0, the savings balance goes down by that amount, and free savings is unchanged. This withdrawal counts toward this month's net like any other withdrawal, so the money appears as available to spend. The real spending should be logged as expenses. The sheet says so: "Log what you bought as expenses so this month adds up."
- **Keep it in savings:** the goal stops counting toward "set aside", so its money becomes free savings, and no movement is created.
- If `savedCents` is 0, skip the sheet and archive directly.
- In both cases the goal's opening amount still counts toward the savings balance until the goal is deleted.
- Unarchiving is refused if free savings is less than the goal's `savedCents`. A goal archived with "I spent it" has `savedCents` 0, so it can always be unarchived.

**Deleting a goal.** The confirmation sheet offers two choices and states the effect of each with real figures:
- **Keep the movements:** linked movements stay as general savings with `goalId` cleared, and the goal's opening amount leaves the savings balance. Free savings changes by d = savedCents − openingCents. Copy:
  - d > 0: "Your savings balance goes down by €{opening}. €{d} moves to free savings."
  - d = 0: "Your savings balance goes down by €{opening}. Free savings doesn't change."
  - d < 0: "Your savings balance goes down by €{opening}. Free savings goes down by €{−d}."
  - If d < 0 and free savings is less than −d, this choice is disabled and shows: "Not enough free savings to keep these movements. Delete the movements too, or add €{shortfall} to savings first." Here shortfall = (−d) − free savings: the amount that would otherwise leave free savings negative.
- **Delete the movements too:** linked movements are deleted. The savings balance goes down by `savedCents`; free savings is unchanged. Copy: "Your savings balance goes down by €{saved}."
- In both cases the movements' past months change, and the copy says so: "Past months will be recalculated."

**Required tests** (`src/domain` and repository tests with fake-indexeddb): the invariant after add, edit and delete of linked movements; each refusal above at exactly the limit and one cent over; archive/unarchive effects on free savings; archiving with "I spent it" creates one linked withdraw equal to `savedCents`, leaves free savings unchanged, and lowers the balance by `savedCents`; archiving with "Keep it in savings" creates no movement and raises free savings by `savedCents`; archiving a goal with `savedCents` 0 skips the sheet; both delete options, checking balance, free savings and that no orphaned `goalId` remains; Keep-the-movements delete with d > 0, d = 0 and d < 0, checking the balance, free savings and the copy; the disabled state when free savings is exactly −d minus one cent; a goal whose opening amount is edited below what has been withdrawn.

## Backup

Export and import are the only protection against lost data, so they must work on an installed iPhone app.

**File.** `pocket-ledger-backup-YYYY-MM-DD.json` (local date), containing:

```ts
interface BackupFile {
  app: "pocket-ledger";
  formatVersion: 1;
  schemaVersion: number;
  exportedAt: number;    // epoch ms
  data: { transactions: Transaction[]; goals: Goal[]; budgets: Budget[]; settings: Settings };
}
```

**Export.**
1. Read all tables and build the file as a `File` object.
2. If `navigator.canShare?.({ files: [file] })` is true, call `navigator.share({ files: [file] })` so the owner can save it to Files or iCloud Drive, or send it to themselves. Otherwise download it with an `<a download>` link.
3. Safari requires `share()` to run soon after a tap, and reading the database first can use up that window. If `share()` throws `NotAllowedError`, show a sheet "Backup ready" with a "Share backup" button that calls `share()` directly with the already-built file.
4. Set `lastBackupAt` only when sharing resolves or the download starts. If the owner cancels the share sheet (`AbortError`), don't set it and show nothing.
5. Toast: "Backup saved".

**Reminder.** Show the backup banner when it isn't snoozed and any of these is true:
- no backup yet and at least 10 transactions exist;
- 30 or more days since `lastBackupAt` and at least one transaction changed since then;
- 50 or more transactions with `updatedAt > lastBackupAt`.
Logic lives in a pure `backupReminder(now, settings, changedCount, totalCount)` with unit tests for each rule and for snoozing.

**Import.**
1. Pick a file. Validate it fully against the schema before touching any data: `app` and `formatVersion` match, all amounts are positive integers within the maximum (opening amounts ≥ 0), dates are valid `YYYY-MM-DD`, IDs are unique, every `goalId` points to a goal in the file, and only `save`/`withdraw` have a `goalId`. On failure, show one plain sentence with the first problem ("This file isn't a Pocket Ledger backup" or "Entry 214 has an invalid date") and change nothing.
2. Preview: when the backup was made, counts of transactions, goals and budgets, and the date of its newest entry.
3. If the newest `updatedAt` in the current data is later than the backup's `exportedAt`, show a warning in the preview: "This backup is older than the data on this phone. {N} entries added or changed since {date} will be lost." N is the number of current transactions with `updatedAt > exportedAt`.
4. The preview always offers "Back up current data first" (runs Export) above the confirm button "Replace my data".
5. Replace all tables in one Dexie transaction. Recompute every goal's `savedCents` from the imported movements. If any stored value differed, say so after the import: "Fixed saved amounts on 2 goals to match their movements."
6. If free savings comes out negative after import, import anyway (it's the owner's data) and let the Savings tab warning explain it.
7. Toast: "Backup restored".

**Required tests:** export → delete all → import gives identical data (including `lastBackupAt` handling); each validation failure leaves data unchanged; the "older backup" warning count; `savedCents` repair on import.

## CSV export

For opening transactions in a spreadsheet. It is not a backup and can't be imported.

- File: `pocket-ledger-transactions-YYYY-MM-DD.csv`, delivered the same way as a backup (share sheet, else download).
- UTF-8 with a BOM, CRLF line endings.
- Columns: Date, Type, Category, Amount, Note, Goal. Type is Income, Expense, Into savings or Taken out. Goal is the goal's name or empty.
- Delimiter: `;` when the locale's decimal mark is a comma (as in Greek), otherwise `,`.
- Amounts use the locale's decimal mark, with no thousands separator and no currency symbol (`12,50` in Greek).
- Fields containing the delimiter, a quote or a line break are quoted, with quotes doubled.
- Formula injection: any cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`.
- Required tests: Greek locale output (`;`, `12,50`, BOM); English locale output (`,`, `12.50`); a note with a delimiter and quotes; a note starting with `=`; Greek characters survive.

## Behavior rules

- Amounts follow Amount input. Dates follow Dates and today.
- Totals only count transactions within the selected month (inclusive).
- Goal `savedCents` follows the invariant in Goals and savings rules.
- Every write goes through a repository function in `src/db/`. Components never touch Dexie tables directly.

## Non-functional

- Lighthouse PWA installable; Performance and Accessibility ≥ 90 on mobile.
- First load JS under 200 KB gzipped.
- WCAG AA contrast in both themes. Visible focus states. Charts have text alternatives.
- Works in iOS Safari 17+ (installed and in-browser), Chrome Android, and desktop Chrome, Firefox and Safari.
- The app works at any base path (`/` locally, `/pocket-ledger/` on GitHub Pages), set at build time.

## Known platform risk

When the app is used in iOS Safari without being installed, the browser can delete its storage after a period of not being used, and that storage is separate from the installed app's. Installed home-screen apps are treated better, but nothing is guaranteed. This is why the install gate, export/backup and the backup reminder are core features, not extras. The Settings screen should say this in plain words.

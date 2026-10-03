import { test } from "node:test";
import assert from "node:assert/strict";
import { backupFileName, backupReminder, buildBackup, readBackupText, reminderText, restorePreview, timeAgo, validateBackup, type BackupFile } from "./backup";
import { formatMoney } from "./money";
import { goal, tx } from "../test/builders";
import type { LedgerData, Settings } from "./types";

const eur = (c: number) => formatMoney(c, "EUR", "en-GB");

function settings(extra: Partial<Settings> = {}): Settings {
  return {
    key: "settings",
    currency: "EUR",
    theme: "system",
    deviceId: "dev-pc",
    deviceName: "Windows PC",
    stateLineage: [],
    changesSinceSync: 0,
    deleteLog: [],
    recentExpenseCategories: ["Groceries", "Eating out"],
    schemaVersion: 1,
    ...extra,
  };
}

function data(extra: Partial<LedgerData> = {}): LedgerData {
  const g = goal({ id: "g1", openingCents: 1000, savedCents: 1500 });
  return {
    transactions: [tx("income", 240000, "2026-10-01"), tx("save", 500, "2026-10-02", { goalId: "g1" }), tx("expense", 1250, "2026-10-03", { note: "Coffee" })],
    goals: [g],
    budgets: [{ category: "Groceries", limitCents: 30000, updatedAt: 5 }],
    settings: settings({ changesSinceSync: 3 }),
    ...extra,
  };
}

const roundTrip = (file: BackupFile): unknown => JSON.parse(JSON.stringify(file));

test("buildBackup: the file carries the data, the device, the traveling settings and a new state", () => {
  const { file, commit } = buildBackup(data(), 1_000, () => "state-1");
  assert.equal(file.app, "pocket-ledger");
  assert.equal(file.formatVersion, 1);
  assert.deepEqual(file.fromDevice, { id: "dev-pc", name: "Windows PC" });
  assert.deepEqual(file.state, { id: "state-1", lineage: [{ id: "state-1", at: 1_000 }] });
  assert.deepEqual(file.data.settings, { schemaVersion: 1, currency: "EUR", recentExpenseCategories: ["Groceries", "Eating out"] });
  assert.equal(file.data.transactions.length, 3);
  assert.deepEqual(commit, { lineage: [{ id: "state-1", at: 1_000 }], changesAtBuild: 3 });
  assert.equal(backupFileName("2026-10-04"), "pocket-ledger-backup-2026-10-04.json");
});

test("validateBackup accepts a real file and returns an identical clean copy", () => {
  const { file } = buildBackup(data(), 1_000, () => "s1");
  const r = validateBackup(roundTrip(file));
  assert.equal(r.ok, true);
  assert.ok(r.ok);
  assert.deepEqual(r.file, file);
});

test("validateBackup drops unknown fields", () => {
  const { file } = buildBackup(data(), 1_000, () => "s1");
  const raw = roundTrip(file) as { extra?: number; data: { transactions: { hacked?: boolean }[] } };
  raw.extra = 1;
  raw.data.transactions[0]!.hacked = true;
  const r = validateBackup(raw);
  assert.ok(r.ok);
  assert.equal("extra" in r.file, false);
  assert.equal("hacked" in r.file.data.transactions[0]!, false);
});

test("each validation failure gives one plain sentence", () => {
  const good = () => roundTrip(buildBackup(data(), 1_000, () => "s1").file) as Record<string, any>;
  const cases: [string, (f: Record<string, any>) => unknown, string][] = [
    ["not JSON object", () => [], "This file isn't a Pocket Ledger backup."],
    ["other app", (f) => ({ ...f, app: "other" }), "This file isn't a Pocket Ledger backup."],
    ["other format", (f) => ({ ...f, formatVersion: 2 }), "This file isn't a Pocket Ledger backup."],
    ["newer schema", (f) => ({ ...f, schemaVersion: 99 }), "This backup was made by a newer version of Pocket Ledger. Update the app, then try again."],
    ["state mismatch", (f) => ({ ...f, state: { id: "x", lineage: [{ id: "y", at: 1 }] } }), "This file isn't a Pocket Ledger backup."],
    ["invalid date", (f) => (f.data.transactions[2].date = "2026-02-30", f), "Entry 3 has an invalid date."],
    ["float amount", (f) => (f.data.transactions[0].amountCents = 12.5, f), "Entry 1 has an invalid amount."],
    ["zero amount", (f) => (f.data.transactions[0].amountCents = 0, f), "Entry 1 has an invalid amount."],
    ["too large", (f) => (f.data.transactions[0].amountCents = 10_000_000_000, f), "Entry 1 has an invalid amount."],
    ["repeated id", (f) => (f.data.transactions[1].id = f.data.transactions[0].id, f), "Entry 2 has a missing or repeated id."],
    ["unknown goal", (f) => (f.data.transactions[1].goalId = "nope", f), "Entry 2 is linked to a goal that isn't in the file."],
    ["goal on expense", (f) => (f.data.transactions[2].goalId = "g1", f), "Entry 3 is linked to a goal but isn't a savings movement."],
    ["bad category", (f) => (f.data.transactions[2].category = "Salary", f), "Entry 3 has an unknown category."],
    ["negative opening", (f) => (f.data.goals[0].openingCents = -1, f), 'Goal 1 has an invalid "already saved" amount.'],
    ["bad budget", (f) => (f.data.budgets[0].category = "Salary", f), "Budget 1 has an unknown or repeated category."],
    ["bad currency", (f) => (f.data.settings.currency = "euro", f), "The backup's settings are damaged."],
  ];
  for (const [name, mutate, message] of cases) {
    const r = validateBackup(mutate(good()));
    assert.deepEqual(r, { ok: false, message }, name);
  }
  assert.deepEqual(readBackupText("not json"), { ok: false, message: "This file isn't a Pocket Ledger backup." });
  assert.equal(readBackupText("﻿" + JSON.stringify(good())).ok, true, "a BOM is fine");
});

test("an opening amount of 0 is valid", () => {
  const f = roundTrip(buildBackup(data(), 1_000, () => "s1").file) as any;
  f.data.goals[0].openingCents = 0;
  assert.equal(validateBackup(f).ok, true);
});

test("restore preview on an empty device: safe, counts and newest date, no warnings", () => {
  const { file } = buildBackup(data(), 1_000, () => "s1");
  const empty = data({ transactions: [], goals: [], budgets: [], settings: settings() });
  const p = restorePreview(empty, file, 1_000 + 12 * 60_000, eur, "en-GB");
  assert.deepEqual(p.safety, { safe: true });
  assert.equal(p.fromDeviceName, "Windows PC");
  assert.equal(p.madeAgo, "12 minutes ago");
  assert.deepEqual(p.counts, { transactions: 3, goals: 1, budgets: 1 });
  assert.equal(p.newestEntryDate, "2026-10-03");
  assert.equal(p.warning, undefined);
  assert.equal(p.warning, undefined);
  assert.equal(p.fromThisDevice, true);
});

test("restore preview with unsent changes: warning and lost list, no second older-backup warning", () => {
  const phone = buildBackup(data({ settings: settings({ deviceId: "dev-phone", deviceName: "iPhone" }) }), 1_000, () => "phone-1").file;
  const here = data({
    transactions: [tx("expense", 450, "2026-10-04", { updatedAt: 2_000, category: "Eating out", note: "Coffee" }), tx("income", 100, "2026-10-01", { updatedAt: 500 })],
    settings: settings({ changesSinceSync: 1 }),
  });
  const p = restorePreview(here, phone, 3_000, eur, "en-GB");
  assert.deepEqual(p.safety, { safe: false, reason: "unsentChanges", changes: 1 });
  assert.equal(p.warning, "You made 1 change on this Windows PC since you last sent or received data. Restoring will lose them.");
  assert.deepEqual(p.loss?.shown, ["4 Oct · Eating out · €4.50 · Coffee", "1 Oct · Salary · €1"]);
  assert.equal(p.fromThisDevice, false);
  assert.equal("older" in p, false, "the lineage warning replaces the older-backup line");
});

test("restore preview of this device's own older backup: 'this device' wording", () => {
  const own = buildBackup(data(), 1_000, () => "pc-1").file;
  const coffee = tx("expense", 450, "2026-10-04", { updatedAt: 2_000, category: "Eating out", note: "Coffee" });
  // Unsent change since the backup.
  const changed = data({ transactions: [coffee], settings: settings({ stateLineage: [{ id: "pc-1", at: 1_000 }], changesSinceSync: 1 }) });
  const p1 = restorePreview(changed, own, 3_000, eur, "en-GB");
  assert.equal(p1.fromThisDevice, true);
  assert.equal(p1.warning, "This backup doesn't include your latest changes. Restoring will lose them.");
  assert.deepEqual(p1.loss?.shown, ["4 Oct · Eating out · €4.50 · Coffee"]);
  // No unsent changes, but a newer state was sent elsewhere since this backup ("never received" case).
  const moved = data({ transactions: [coffee], settings: settings({ stateLineage: [{ id: "pc-1", at: 1_000 }, { id: "pc-2", at: 2_500 }], changesSinceSync: 0 }) });
  const p2 = restorePreview(moved, own, 3_000, eur, "en-GB");
  assert.deepEqual(p2.safety, { safe: false, reason: "neverReceived" });
  assert.equal(p2.warning, "This backup doesn't include your latest changes. Restoring will lose them.");
});

test("timeAgo", () => {
  const now = Date.UTC(2026, 9, 4, 12);
  assert.equal(timeAgo(now - 10_000, now), "just now");
  assert.equal(timeAgo(now - 60_000, now), "1 minute ago");
  assert.equal(timeAgo(now - 3 * 3_600_000, now), "3 hours ago");
  assert.equal(timeAgo(now - 30 * 3_600_000, now), "yesterday");
  assert.equal(timeAgo(now - 4 * 86_400_000, now), "4 days ago");
  assert.equal(timeAgo(Date.UTC(2026, 8, 1, 12), now), "1 Sept 2026");
});

const DAY = 86_400_000;

test("reminder: no backup yet shows once there are 10 entries", () => {
  assert.equal(backupReminder(DAY, {}, 9, 9).due, false);
  assert.equal(backupReminder(DAY, {}, 10, 10).due, true);
});

test("reminder: 30 days with at least one change", () => {
  const last = 0;
  assert.equal(backupReminder(29 * DAY, { lastBackupAt: last }, 5, 100).due, false);
  assert.equal(backupReminder(30 * DAY, { lastBackupAt: last }, 0, 100).due, false, "nothing changed");
  assert.deepEqual(backupReminder(30 * DAY, { lastBackupAt: last }, 1, 100), { due: true, daysSince: 30 });
});

test("reminder: 50 changed entries, even the same day", () => {
  assert.equal(backupReminder(DAY / 2, { lastBackupAt: 0 }, 49, 200).due, false);
  assert.equal(backupReminder(DAY / 2, { lastBackupAt: 0 }, 50, 200).due, true);
});

test("reminder: snoozing hides it until the snooze ends", () => {
  assert.equal(backupReminder(5 * DAY, { backupSnoozedUntil: 6 * DAY }, 20, 20).due, false);
  assert.equal(backupReminder(6 * DAY, { backupSnoozedUntil: 6 * DAY }, 20, 20).due, true);
});

test("reminder text", () => {
  assert.equal(reminderText({ due: true }), "No backup yet.");
  assert.equal(reminderText({ due: true, daysSince: 34 }), "Last backup 34 days ago.");
  assert.equal(reminderText({ due: true, daysSince: 1 }), "Last backup 1 day ago.");
});

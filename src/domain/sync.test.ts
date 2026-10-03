import { test } from "node:test";
import assert from "node:assert/strict";
import { lossCutoff, lostSince, nextExportState, restoreSafety, restoreWarning, settingsAfterImport, settingsForExport } from "./sync";
import { formatMoney } from "./money";
import { goal, tx } from "../test/builders";
import type { Settings, StateRef } from "./types";

let n = 0;
const newId = () => `s${++n}`;
const eur = (c: number) => formatMoney(c, "EUR", "en-GB");

/** Two devices exchanging files, using only the pure functions. */
function device(name: string) {
  return { name, stateLineage: [] as StateRef[], changesSinceSync: 0, hasData: false };
}
type Dev = ReturnType<typeof device>;
let clock = 0;
const write = (d: Dev) => {
  d.changesSinceSync += 1;
  d.hasData = true;
};
const exportFrom = (d: Dev) => {
  const s = nextExportState(d, newId, ++clock);
  d.stateLineage = s.lineage;
  d.changesSinceSync = 0;
  return { lineage: s.lineage, from: d.name, id: s.id };
};
const importInto = (d: Dev, file: { lineage: StateRef[] }) => {
  const lineage = file.lineage.map((s) => ({ ...s }));
  lineage[lineage.length - 1]!.at = ++clock;
  d.stateLineage = lineage;
  d.changesSinceSync = 0;
  d.hasData = true;
};

test("export reuses the state when nothing changed, and creates one when something did", () => {
  const a = nextExportState({ stateLineage: [], changesSinceSync: 0 }, () => "x", 10);
  assert.deepEqual(a, { id: "x", lineage: [{ id: "x", at: 10 }], created: true });
  const b = nextExportState({ stateLineage: [{ id: "x", at: 10 }], changesSinceSync: 0 }, () => "y", 20);
  assert.deepEqual(b, { id: "x", lineage: [{ id: "x", at: 10 }], created: false });
  const c = nextExportState({ stateLineage: [{ id: "x", at: 10 }], changesSinceSync: 2 }, () => "y", 30);
  assert.deepEqual(c, { id: "y", lineage: [{ id: "x", at: 10 }, { id: "y", at: 30 }], created: true });
});

test("lineage keeps the last 50 states", () => {
  const lineage = Array.from({ length: 50 }, (_, i) => ({ id: `id${i}`, at: i }));
  const r = nextExportState({ stateLineage: lineage, changesSinceSync: 1 }, () => "new", 99);
  assert.equal(r.lineage.length, 50);
  assert.equal(r.lineage[0]?.id, "id1");
  assert.deepEqual(r.lineage[49], { id: "new", at: 99 });
});

test("clean round trip PC -> phone -> edit -> PC: no warning", () => {
  const pc = device("PC");
  const phone = device("iPhone");
  write(pc);
  importInto(phone, exportFrom(pc));
  write(phone);
  assert.deepEqual(restoreSafety(pc, exportFrom(phone).lineage), { safe: true });
});

test("a chain of edits and exports on the other device still counts as received", () => {
  const pc = device("PC");
  const phone = device("iPhone");
  write(pc);
  importInto(phone, exportFrom(pc));
  write(phone);
  exportFrom(phone);
  write(phone);
  assert.deepEqual(restoreSafety(pc, exportFrom(phone).lineage), { safe: true });
});

test("routine backup after changing data, then importing the other device's file: warns", () => {
  const pc = device("PC");
  const phone = device("iPhone");
  write(pc);
  importInto(phone, exportFrom(pc));
  write(pc);
  exportFrom(pc);
  write(phone);
  assert.deepEqual(restoreSafety(pc, exportFrom(phone).lineage), { safe: false, reason: "neverReceived" });
});

test("a file sent from here but never opened on the other device: warns", () => {
  const pc = device("PC");
  const phone = device("iPhone");
  write(phone);
  importInto(pc, exportFrom(phone));
  write(pc);
  exportFrom(pc);
  write(phone);
  assert.deepEqual(restoreSafety(pc, exportFrom(phone).lineage), { safe: false, reason: "neverReceived" });
});

test("unsent changes: warns with the count", () => {
  const pc = device("PC");
  const phone = device("iPhone");
  write(pc);
  importInto(phone, exportFrom(pc));
  write(pc);
  write(pc);
  write(pc);
  assert.deepEqual(restoreSafety(pc, exportFrom(phone).lineage), { safe: false, reason: "unsentChanges", changes: 3 });
});

test("repeated backups with no changes don't cause a false warning", () => {
  const pc = device("PC");
  const phone = device("iPhone");
  write(pc);
  const first = exportFrom(pc);
  exportFrom(pc);
  exportFrom(pc);
  importInto(phone, first);
  write(phone);
  assert.deepEqual(restoreSafety(pc, exportFrom(phone).lineage), { safe: true });
});

test("import, then export straight away, reuses the file's state id", () => {
  const pc = device("PC");
  const phone = device("iPhone");
  write(pc);
  const file = exportFrom(pc);
  importInto(phone, file);
  assert.equal(exportFrom(phone).id, file.id);
});

test("a device with no data is always safe", () => {
  assert.deepEqual(restoreSafety({ hasData: false, stateLineage: [], changesSinceSync: 0 }, [{ id: "x", at: 1 }]), { safe: true });
});

test("warning copy names the devices", () => {
  assert.equal(
    restoreWarning({ safe: false, reason: "unsentChanges", changes: 3 }, "Windows PC", "iPhone"),
    "You made 3 changes on this Windows PC since you last sent or received data. Restoring will lose them.",
  );
  assert.equal(restoreWarning({ safe: false, reason: "neverReceived" }, "Windows PC", "iPhone"), "This Windows PC has data your iPhone never received. Restoring will lose it.");
});

test("cutoff: the newest state both sides share, else the last import, else everything", () => {
  const mine = [
    { id: "a", at: 100 },
    { id: "b", at: 200 },
    { id: "c", at: 300 },
  ];
  assert.equal(lossCutoff(mine, [{ id: "a", at: 5 }, { id: "b", at: 6 }, { id: "z", at: 7 }], undefined), 200);
  assert.equal(lossCutoff(mine, [{ id: "z", at: 7 }], { fromDeviceName: "iPhone", exportedAt: 1, importedAt: 150 }), 150);
  assert.equal(lossCutoff(mine, [{ id: "z", at: 7 }], undefined), -Infinity);
});

test("only changes after the newest shared state are listed (import Mon, send Wed and opened, edit Thu)", () => {
  const MON = 1_000, WED = 3_000, THU = 4_000;
  const pcLineage = [
    { id: "phone-1", at: MON }, // imported on Monday
    { id: "pc-2", at: WED }, // sent on Wednesday, opened on the phone
  ];
  const phoneFile = [{ id: "phone-1", at: 900 }, { id: "pc-2", at: WED + 10 }, { id: "phone-3", at: WED + 500 }];
  const cutoff = lossCutoff(pcLineage, phoneFile, { fromDeviceName: "iPhone", exportedAt: 900, importedAt: MON });
  assert.equal(cutoff, WED);
  const tuesday = tx("expense", 300, "2026-10-06", { updatedAt: 2_000, category: "Transport" });
  const thursday = tx("expense", 450, "2026-10-08", { updatedAt: THU, category: "Eating out", note: "Coffee" });
  const list = lostSince({ transactions: [tuesday, thursday], goals: [], budgets: [], deleteLog: [] }, cutoff, eur, "en-GB");
  assert.deepEqual(list.lines, ["8 Oct · Eating out · €4.50 · Coffee"]);
});

test("lost list: newest first, capped at 10, deletes and goal/budget changes after the cutoff", () => {
  const recent = Array.from({ length: 12 }, (_, i) =>
    tx("expense", 450 + i, `2026-10-${String(i + 1).padStart(2, "0")}`, { updatedAt: 5_000 + i, category: "Eating out", note: "Coffee" }),
  );
  const save = tx("save", 2000, "2026-10-20", { updatedAt: 6_000 });
  const list = lostSince(
    {
      transactions: [tx("expense", 100, "2026-09-01", { updatedAt: 1_000 }), ...recent, save],
      goals: [goal({ updatedAt: 1_500 }), goal({ updatedAt: 2_500 })],
      budgets: [
        { category: "Groceries", limitCents: 30_000, updatedAt: 2_600 }, // a budget edit
        { category: "Transport", limitCents: 5_000, updatedAt: 1_000 },
      ],
      deleteLog: [
        { at: 1_900, what: "entry" },
        { at: 2_100, what: "entry" },
        { at: 2_200, what: "budget" }, // a budget delete
        { at: 2_300, what: "goal" },
      ],
    },
    2_000,
    eur,
    "en-GB",
  );
  assert.equal(list.lines.length, 13);
  assert.equal(list.shown.length, 10);
  assert.equal(list.more, 3);
  assert.equal(list.shown[0], "20 Oct · Into savings · €20");
  assert.equal(list.shown[1], "12 Oct · Eating out · €4.61 · Coffee");
  assert.equal(list.deleted, 1);
  assert.equal(list.goalBudgetChanges, 4, "one goal edit, one budget edit, one budget delete, one goal delete");
  const copy = list.copyText.split("\n");
  assert.equal(copy.length, 15);
  assert.equal(copy[13], "1 deleted entry");
  assert.equal(copy[14], "4 goal or budget changes");
});

function settings(extra: Partial<Settings> = {}): Settings {
  return {
    key: "settings",
    currency: "EUR",
    theme: "dark",
    deviceId: "pc-device",
    deviceName: "Windows PC",
    stateLineage: [{ id: "old", at: 1 }],
    changesSinceSync: 4,
    deleteLog: [{ at: 5, what: "entry" }],
    lastBackupAt: 77,
    backupSnoozedUntil: 88,
    recentExpenseCategories: ["Travel", "Groceries"],
    schemaVersion: 1,
    ...extra,
  };
}

test("export carries only the traveling settings", () => {
  const out = settingsForExport(settings({ locale: "el-GR", recentIncomeSource: "Salary", iosBrowserAcknowledged: true }));
  assert.deepEqual(out, { schemaVersion: 1, currency: "EUR", locale: "el-GR", recentExpenseCategories: ["Travel", "Groceries"], recentIncomeSource: "Salary" });
});

test("import: traveling settings come from the file; theme, device and backup fields stay; sync starts again", () => {
  const device = settings({ locale: "en-GB", iosBrowserAcknowledged: true });
  const after = settingsAfterImport(
    device,
    {
      settings: { currency: "USD", recentExpenseCategories: ["Health"], recentIncomeSource: "Bonus" },
      state: { lineage: [{ id: "p1", at: 10 }, { id: "p2", at: 20 }] },
      fromDevice: { name: "iPhone" },
      exportedAt: 25,
    },
    1_000,
  );
  assert.equal(after.currency, "USD");
  assert.equal(after.locale, undefined, "locale travels: the file had none");
  assert.deepEqual(after.recentExpenseCategories, ["Health"]);
  assert.equal(after.recentIncomeSource, "Bonus");
  assert.equal(after.theme, "dark");
  assert.equal(after.deviceId, "pc-device");
  assert.equal(after.deviceName, "Windows PC");
  assert.equal(after.iosBrowserAcknowledged, true);
  assert.equal(after.lastBackupAt, 77);
  assert.equal(after.backupSnoozedUntil, 88);
  assert.deepEqual(after.stateLineage, [{ id: "p1", at: 10 }, { id: "p2", at: 1_000 }], "the newest state is stamped with this device's import time");
  assert.equal(after.changesSinceSync, 0);
  assert.deepEqual(after.deleteLog, []);
  assert.deepEqual(after.lastImport, { fromDeviceName: "iPhone", exportedAt: 25, importedAt: 1_000 });
  assert.equal(after.lastSyncAt, 1_000);
  // Import, then export with no changes: the file's state id is reused.
  assert.equal(nextExportState(after, () => "fresh", 2_000).id, "p2");
});

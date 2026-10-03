import { test } from "node:test";
import assert from "node:assert/strict";
import { lossList, nextExportState, restoreSafety, restoreWarning } from "./sync";
import { formatMoney } from "./money";
import { tx } from "../test/builders";

let n = 0;
const newId = () => `s${++n}`;

/** A small simulation of two devices exchanging files, using only the pure functions. */
function device(name: string) {
  return { name, stateLineage: [] as string[], changesSinceSync: 0, hasData: false };
}
type Dev = ReturnType<typeof device>;
const write = (d: Dev) => {
  d.changesSinceSync += 1;
  d.hasData = true;
};
const exportFrom = (d: Dev) => {
  const s = nextExportState(d, newId);
  d.stateLineage = s.lineage;
  d.changesSinceSync = 0;
  return { lineage: s.lineage, from: d.name };
};
const importInto = (d: Dev, file: { lineage: string[] }) => {
  d.stateLineage = [...file.lineage];
  d.changesSinceSync = 0;
  d.hasData = true;
};

test("export reuses the state id when nothing changed, and creates one when something did", () => {
  const a = nextExportState({ stateLineage: [], changesSinceSync: 0 }, () => "x");
  assert.deepEqual(a, { id: "x", lineage: ["x"], created: true });
  const b = nextExportState({ stateLineage: ["x"], changesSinceSync: 0 }, () => "y");
  assert.deepEqual(b, { id: "x", lineage: ["x"], created: false });
  const c = nextExportState({ stateLineage: ["x"], changesSinceSync: 2 }, () => "y");
  assert.deepEqual(c, { id: "y", lineage: ["x", "y"], created: true });
});

test("lineage keeps the last 50 ids", () => {
  const lineage = Array.from({ length: 50 }, (_, i) => `id${i}`);
  const r = nextExportState({ stateLineage: lineage, changesSinceSync: 1 }, () => "new");
  assert.equal(r.lineage.length, 50);
  assert.equal(r.lineage[0], "id1");
  assert.equal(r.lineage[49], "new");
});

test("clean round trip PC -> phone -> edit -> PC: no warning", () => {
  const pc = device("PC");
  const phone = device("iPhone");
  write(pc);
  importInto(phone, exportFrom(pc));
  write(phone);
  write(phone);
  const back = exportFrom(phone);
  assert.deepEqual(restoreSafety(pc, back.lineage), { safe: true });
});

test("chain of edits and exports on the other device still counts as received", () => {
  const pc = device("PC");
  const phone = device("iPhone");
  write(pc);
  importInto(phone, exportFrom(pc));
  write(phone);
  exportFrom(phone); // a routine backup on the phone
  write(phone);
  const file = exportFrom(phone);
  assert.deepEqual(restoreSafety(pc, file.lineage), { safe: true });
});

test("routine backup after changing data, then importing the other device's file: warns", () => {
  const pc = device("PC");
  const phone = device("iPhone");
  write(pc);
  importInto(phone, exportFrom(pc));
  write(pc); // a coffee logged on the PC
  exportFrom(pc); // routine backup on the PC resets the counter
  write(phone);
  const file = exportFrom(phone);
  assert.deepEqual(restoreSafety(pc, file.lineage), { safe: false, reason: "neverReceived" });
});

test("a file sent from here but never opened on the other device: warns", () => {
  const pc = device("PC");
  const phone = device("iPhone");
  write(phone);
  importInto(pc, exportFrom(phone));
  write(pc);
  exportFrom(pc); // sent, but the phone never opens it
  write(phone);
  const file = exportFrom(phone);
  assert.deepEqual(restoreSafety(pc, file.lineage), { safe: false, reason: "neverReceived" });
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

test("a device with no data is always safe", () => {
  assert.deepEqual(restoreSafety({ hasData: false, stateLineage: [], changesSinceSync: 0 }, ["x"]), { safe: true });
});

test("warning copy names the devices", () => {
  assert.equal(
    restoreWarning({ safe: false, reason: "unsentChanges", changes: 3 }, "Windows PC", "iPhone"),
    "You made 3 changes on this Windows PC since you last sent or received data. Restoring will lose them.",
  );
  assert.equal(
    restoreWarning({ safe: false, reason: "neverReceived" }, "Windows PC", "iPhone"),
    "This Windows PC has data your iPhone never received. Restoring will lose it.",
  );
});

test("loss list: newest first, capped at 10, counts, and copy text", () => {
  const eur = (c: number) => formatMoney(c, "EUR", "en-GB");
  const old = tx("expense", 100, "2026-09-01", { updatedAt: 1_000 });
  const recent = Array.from({ length: 12 }, (_, i) =>
    tx("expense", 450 + i, `2026-10-${String(i + 1).padStart(2, "0")}`, { updatedAt: 5_000 + i, category: "Eating out", note: "Coffee" }),
  );
  const save = tx("save", 2000, "2026-10-20", { updatedAt: 6_000 });
  const list = lossList([old, ...recent, save], { lastImport: { fromDeviceName: "iPhone", exportedAt: 1, importedAt: 2_000 }, deletesSinceImport: 1, goalBudgetChangesSinceImport: 2 }, eur, "en-GB");
  assert.equal(list.lines.length, 13);
  assert.equal(list.shown.length, 10);
  assert.equal(list.more, 3);
  assert.equal(list.shown[0], "20 Oct · Into savings · €20");
  assert.equal(list.shown[1], "12 Oct · Eating out · €4.61 · Coffee");
  assert.equal(list.deleted, 1);
  assert.equal(list.goalBudgetChanges, 2);
  const copy = list.copyText.split("\n");
  assert.equal(copy.length, 15);
  assert.equal(copy[13], "1 deleted entry");
  assert.equal(copy[14], "2 goal or budget changes");
});

test("loss list with no import lists everything", () => {
  const eur = (c: number) => formatMoney(c, "EUR", "en-GB");
  const list = lossList([tx("income", 100, "2026-10-01")], { deletesSinceImport: 0, goalBudgetChangesSinceImport: 0 }, eur, "en-GB");
  assert.deepEqual(list.lines, ["1 Oct · Salary · €1"]);
  assert.equal(list.copyText, "1 Oct · Salary · €1");
});

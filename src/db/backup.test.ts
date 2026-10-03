// Backup and restore through the Ledger: round trips between two devices, delete all, repairs, counters.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger } from "./ledger";
import { MemoryStore } from "./memory-store";
import { readBackupText, restorePreview } from "../domain/backup";
import { formatMoney } from "../domain/money";

const TODAY = "2026-10-04";
let clock = 10_000;
let ids = 0;

async function device(userAgent: string) {
  const ledger = await Ledger.open(new MemoryStore(), {
    now: () => (clock += 10),
    today: () => TODAY,
    newId: () => `id${++ids}`,
    userAgent,
    locale: "en-GB",
  });
  return ledger;
}
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)";
const eur = (c: number) => formatMoney(c, "EUR", "en-GB");

/** Export the way the app does it: build, "deliver" as JSON text, commit. */
async function send(ledger: Ledger): Promise<string> {
  const { file, commit } = await ledger.prepareExport();
  const text = JSON.stringify(file);
  await ledger.commitExport(commit);
  return text;
}
async function open(ledger: Ledger, text: string) {
  const r = readBackupText(text);
  assert.ok(r.ok, r.ok ? "" : r.message);
  const preview = restorePreview(await ledger.read(), r.file, clock, eur, "en-GB");
  const result = await ledger.importBackup(r.file);
  return { preview, result };
}
async function seed(ledger: Ledger) {
  await ledger.addEntry({ kind: "income", amountCents: 240_000, category: "Salary", date: TODAY });
  await ledger.addEntry({ kind: "expense", amountCents: 1_250, category: "Eating out", date: TODAY, note: "Lunch" });
  const { goalId } = await ledger.createGoal({ name: "Trip", targetCents: 150_000, openingCents: 10_000, dueDate: "2027-06-30" });
  await ledger.addToGoal(goalId, 5_000);
  await ledger.setBudget("Groceries", 30_000);
  await ledger.updateSettings({ currency: "EUR", theme: "dark" });
}

test("export → delete all → import gives identical data; this device keeps its own settings", async () => {
  const pc = await device(PC);
  await seed(pc);
  const before = await pc.read();
  const text = await send(pc);
  const afterExport = await pc.read();
  assert.ok(afterExport.settings.lastBackupAt, "lastBackupAt is set when the file is delivered");
  assert.equal(afterExport.settings.changesSinceSync, 0);

  await pc.deleteAllData();
  const wiped = await pc.read();
  assert.deepEqual([wiped.transactions.length, wiped.goals.length, wiped.budgets.length], [0, 0, 0]);
  assert.equal(wiped.settings.deviceId, before.settings.deviceId);
  assert.equal(wiped.settings.deviceName, "Windows PC");
  assert.equal(wiped.settings.theme, "dark", "theme stays");
  assert.deepEqual(wiped.settings.stateLineage, []);
  assert.equal(wiped.settings.changesSinceSync, 0);
  assert.deepEqual(wiped.settings.deleteLog, []);
  assert.equal(wiped.settings.lastBackupAt, undefined);

  const { preview, result } = await open(pc, text);
  assert.deepEqual(preview.safety, { safe: true }, "an empty device is always safe to restore onto");
  assert.equal(preview.warning, undefined);
  assert.equal(preview.fromThisDevice, true, "this PC's own backup");
  assert.equal(result.repairedGoals, 0);
  const after = await pc.read();
  assert.deepEqual(after.transactions, before.transactions);
  assert.deepEqual(after.goals, before.goals);
  assert.deepEqual(after.budgets, before.budgets);
  assert.equal(after.settings.currency, before.settings.currency);
  assert.deepEqual(after.settings.recentExpenseCategories, before.settings.recentExpenseCategories);
  assert.equal(after.settings.theme, "dark");
  assert.equal(after.settings.changesSinceSync, 0, "an import isn't a change");
  assert.deepEqual(after.settings.lastImport?.fromDeviceName, "Windows PC");
});

test("PC → phone → PC round trip: nothing lost, no warnings, phone keeps its own theme", async () => {
  const pc = await device(PC);
  const phone = await device(PHONE);
  await seed(pc);
  await phone.updateSettings({ theme: "light" });

  const first = await open(phone, await send(pc));
  assert.deepEqual(first.preview.safety, { safe: true });
  assert.equal((await phone.read()).settings.theme, "light");
  assert.equal((await phone.read()).settings.deviceName, "iPhone");

  await phone.addEntry({ kind: "expense", amountCents: 450, category: "Eating out", date: TODAY, note: "Coffee" });
  const back = await open(pc, await send(phone));
  assert.deepEqual(back.preview.safety, { safe: true }, "the PC sent everything it had");
  const pcData = await pc.read();
  const phoneData = await phone.read();
  assert.deepEqual(pcData.transactions, phoneData.transactions);
  assert.deepEqual(pcData.goals, phoneData.goals);
  assert.equal(pcData.transactions.length, 4, "salary, lunch, the goal contribution and the coffee");
  assert.equal(pcData.settings.theme, "dark");
});

test("unsent changes on this device: the preview warns and lists exactly what would be lost", async () => {
  const pc = await device(PC);
  const phone = await device(PHONE);
  await seed(pc);
  await open(phone, await send(pc));
  await pc.addEntry({ kind: "expense", amountCents: 450, category: "Eating out", date: TODAY, note: "Coffee on the PC" });
  await phone.addEntry({ kind: "expense", amountCents: 900, category: "Transport", date: TODAY });
  const { preview } = await open(pc, await send(phone));
  assert.deepEqual(preview.safety, { safe: false, reason: "unsentChanges", changes: 1 });
  assert.equal(preview.warning, "You made 1 change on this Windows PC since you last sent or received data. Restoring will lose them.");
  assert.deepEqual(preview.loss?.lines, ["4 Oct · Eating out · €4.50 · Coffee on the PC"]);
});

test("a routine backup after changing data still warns when the other device's file comes in", async () => {
  const pc = await device(PC);
  const phone = await device(PHONE);
  await seed(pc);
  await open(phone, await send(pc));
  await pc.addEntry({ kind: "expense", amountCents: 450, category: "Eating out", date: TODAY });
  await send(pc); // a backup the phone never opens
  await phone.addEntry({ kind: "expense", amountCents: 900, category: "Transport", date: TODAY });
  const { preview } = await open(pc, await send(phone));
  assert.deepEqual(preview.safety, { safe: false, reason: "neverReceived" });
  assert.equal(preview.loss?.lines.length, 1, "only the change the phone never got");
});

test("import then export straight away reuses the file's state", async () => {
  const pc = await device(PC);
  const phone = await device(PHONE);
  await seed(pc);
  const text = await send(pc);
  await open(phone, text);
  const again = JSON.parse(await send(phone));
  assert.equal(again.state.id, JSON.parse(text).state.id);
});

test("a cancelled share changes nothing: only commitExport records the backup", async () => {
  const pc = await device(PC);
  await seed(pc);
  const before = await pc.read();
  await pc.prepareExport(); // built, then the share sheet was cancelled
  const after = await pc.read();
  assert.deepEqual(after.settings, before.settings);
});

test("changes made while the share sheet was open stay unsent", async () => {
  const pc = await device(PC);
  await seed(pc);
  const { commit } = await pc.prepareExport();
  await pc.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: TODAY });
  await pc.commitExport(commit);
  assert.equal((await pc.read()).settings.changesSinceSync, 1);
});

test("savedCents is repaired on import and reported", async () => {
  const pc = await device(PC);
  await seed(pc);
  const { file } = await pc.prepareExport();
  file.data.goals[0]!.savedCents = 1; // damaged in transit
  const phone = await device(PHONE);
  const { result } = await open(phone, JSON.stringify(file));
  assert.equal(result.repairedGoals, 1);
  assert.equal((await phone.read()).goals[0]!.savedCents, 15_000);
});

test("restoring after delete all never warns, even though the device had data before", async () => {
  const pc = await device(PC);
  const phone = await device(PHONE);
  await seed(pc);
  await seed(phone);
  await phone.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: TODAY });
  const text = await send(pc);
  await phone.deleteAllData();
  const { preview } = await open(phone, text);
  assert.deepEqual(preview.safety, { safe: true });
});

test("an invalid file changes nothing", async () => {
  const pc = await device(PC);
  await seed(pc);
  const before = await pc.read();
  const r = readBackupText('{"app":"pocket-ledger","formatVersion":1}');
  assert.equal(r.ok, false);
  assert.deepEqual(await pc.read(), before);
});

test("import clears the undo and notifies listeners", async () => {
  const pc = await device(PC);
  await seed(pc);
  const text = await send(pc);
  const added = await pc.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: TODAY });
  let calls = 0;
  pc.onChange(() => calls++);
  const r = readBackupText(text);
  assert.ok(r.ok);
  await pc.importBackup(r.file);
  assert.equal(calls, 1);
  await assert.rejects(pc.undo(added.undo!), /nothing to undo/);
});

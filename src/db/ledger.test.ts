import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, type UndoToken } from "./ledger";
import { MemoryStore } from "./memory-store";
import { InputError, QuotaError, RuleError } from "./errors";
import { savingsPosition } from "../domain/totals";
import type { LedgerData } from "../domain/types";

const TODAY = "2026-10-03";

async function make(options: { store?: MemoryStore; today?: string } = {}) {
  let clock = 1_000;
  let ids = 0;
  const store = options.store ?? new MemoryStore();
  const ledger = await Ledger.open(store, {
    now: () => (clock += 1),
    today: () => options.today ?? TODAY,
    newId: () => `id${++ids}`,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    locale: "en-IE",
  });
  return { ledger, store };
}

const pos = (d: LedgerData) => savingsPosition(d.transactions, d.goals);
const goalOf = (d: LedgerData, id: string) => {
  const g = d.goals.find((x) => x.id === id);
  assert.ok(g, "goal exists");
  return g;
};
async function rejectsWith(p: Promise<unknown>, type: new (...a: never[]) => Error, message?: string) {
  await assert.rejects(p, (e: Error) => {
    assert.ok(e instanceof type, `expected ${type.name}, got ${e.name}: ${e.message}`);
    if (message) assert.equal(e.message, message);
    return true;
  });
}

/** Free savings €X with one goal holding €Y (opening amount 0). */
async function withGoal(freeCents: number, goalCents: number) {
  const ctx = await make();
  const { goalId } = await ctx.ledger.createGoal({ name: "Holiday", targetCents: 100_000, openingCents: 0 });
  if (freeCents + goalCents > 0) await ctx.ledger.addEntry({ kind: "save", amountCents: freeCents + goalCents, date: TODAY });
  if (goalCents > 0) {
    // Move money from free savings into the goal: take out of savings, add to goal.
    await ctx.ledger.addToGoal(goalId, goalCents);
    await ctx.ledger.addEntry({ kind: "withdraw", amountCents: goalCents, date: TODAY });
  }
  const d = await ctx.ledger.read();
  assert.equal(pos(d).free, freeCents);
  assert.equal(goalOf(d, goalId).savedCents, goalCents);
  return { ...ctx, goalId };
}

test("first run creates this device's settings", async () => {
  const { ledger } = await make();
  const { settings } = await ledger.read();
  assert.equal(settings.deviceName, "Windows PC");
  assert.equal(settings.currency, "EUR");
  assert.deepEqual(settings.stateLineage, []);
  assert.equal(settings.changesSinceSync, 0);
  assert.deepEqual(settings.recentExpenseCategories, ["Groceries", "Eating out", "Transport", "Shopping"]);
});

test("opening again keeps the existing settings", async () => {
  const { store, ledger } = await make();
  const first = (await ledger.read()).settings.deviceId;
  const { ledger: again } = await make({ store });
  assert.equal((await again.read()).settings.deviceId, first);
});

test("add, edit and delete entries; categories and notes are checked", async () => {
  const { ledger } = await make();
  await ledger.addEntry({ kind: "expense", amountCents: 450, category: "Eating out", date: TODAY, note: "  Coffee  " });
  let d = await ledger.read();
  const t = d.transactions[0];
  assert.ok(t);
  assert.equal(t.note, "Coffee");
  assert.deepEqual(d.settings.recentExpenseCategories, ["Eating out", "Groceries", "Transport", "Shopping"]);
  await ledger.editEntry(t.id, { amountCents: 500, note: null, category: "Groceries" });
  d = await ledger.read();
  assert.equal(d.transactions[0]?.amountCents, 500);
  assert.equal(d.transactions[0]?.note, undefined);
  assert.equal(d.transactions[0]?.category, "Groceries");
  await ledger.deleteEntry(t.id);
  assert.equal((await ledger.read()).transactions.length, 0);

  await rejectsWith(ledger.addEntry({ kind: "expense", amountCents: 100, category: "Salary", date: TODAY }), InputError, "Choose a category.");
  await rejectsWith(ledger.addEntry({ kind: "income", amountCents: 100, category: "Groceries", date: TODAY }), InputError, "Choose a source.");
  await rejectsWith(ledger.addEntry({ kind: "expense", amountCents: 0, category: "Other", date: TODAY }), InputError, "Enter an amount like 12,50");
  await rejectsWith(ledger.addEntry({ kind: "expense", amountCents: 10_000_000_000, category: "Other", date: TODAY }), InputError, "That amount is too large.");
  await rejectsWith(ledger.addEntry({ kind: "expense", amountCents: 1.5, category: "Other", date: TODAY }), InputError);
  await rejectsWith(ledger.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: TODAY, note: "x".repeat(81) }), InputError);
  await ledger.addEntry({ kind: "income", amountCents: 100, category: "Bonus", date: TODAY });
  assert.equal((await ledger.read()).settings.recentIncomeSource, "Bonus");
});

test("SPEC Dates: a date one day after today is refused; today is accepted", async () => {
  const { ledger } = await make();
  await rejectsWith(ledger.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: "2026-10-04" }), InputError, "Dates can't be in the future.");
  await ledger.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: TODAY });
  await rejectsWith(ledger.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: "2026-02-30" }), InputError, "Enter a valid date.");
  const id = (await ledger.read()).transactions[0]!.id;
  await rejectsWith(ledger.editEntry(id, { date: "2027-01-01" }), InputError, "Dates can't be in the future.");
  // Goal target dates can be in the future.
  await ledger.createGoal({ name: "Car", targetCents: 500_000, openingCents: 0, dueDate: "2028-06-30" });
});

test("repository date check: 29 Feb accepted in 2028, refused in 2027; 30 Feb always refused", async () => {
  const { ledger } = await make({ today: "2028-03-15" });
  await ledger.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: "2028-02-29" });
  await rejectsWith(ledger.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: "2027-02-29" }), InputError, "Enter a valid date.");
  await rejectsWith(ledger.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: "2028-02-30" }), InputError, "Enter a valid date.");
  await rejectsWith(ledger.createGoal({ name: "Car", targetCents: 100, openingCents: 0, dueDate: "2029-02-29" }), InputError, "Enter a valid date.");
  await ledger.createGoal({ name: "Car", targetCents: 100, openingCents: 0, dueDate: "2032-02-29" });
});

test("invariant: savedCents follows add, edit and delete of linked movements", async () => {
  const { ledger } = await make();
  const { goalId } = await ledger.createGoal({ name: "Holiday", targetCents: 100_000, openingCents: 10_000 });
  await ledger.addToGoal(goalId, 5_000);
  await ledger.addToGoal(goalId, 2_500);
  await ledger.takeFromGoal(goalId, 1_000);
  let d = await ledger.read();
  assert.equal(goalOf(d, goalId).savedCents, 16_500);
  const save = d.transactions.find((t) => t.kind === "save" && t.amountCents === 5_000)!;
  await ledger.editEntry(save.id, { amountCents: 6_000 });
  d = await ledger.read();
  assert.equal(goalOf(d, goalId).savedCents, 17_500);
  await ledger.deleteEntry(save.id);
  d = await ledger.read();
  assert.equal(goalOf(d, goalId).savedCents, 11_500);
  assert.equal(pos(d).balance, 11_500);
});

test("linked movements: category can't change; the goal link stays", async () => {
  const { ledger } = await make();
  const { goalId } = await ledger.createGoal({ name: "Trip", targetCents: 1_000, openingCents: 0 });
  await ledger.addToGoal(goalId, 500);
  const t = (await ledger.read()).transactions[0]!;
  await rejectsWith(ledger.editEntry(t.id, { category: "Groceries" }), InputError);
  await ledger.editEntry(t.id, { note: "birthday money", date: "2026-09-30" });
  const after = (await ledger.read()).transactions[0]!;
  assert.equal(after.goalId, goalId);
  assert.equal(after.kind, "save");
});

test("refusal: goal Take out at exactly the limit, and one cent over", async () => {
  const { ledger, goalId } = await withGoal(0, 5_000);
  await rejectsWith(ledger.takeFromGoal(goalId, 5_001), RuleError, "This goal only has €50.");
  await ledger.takeFromGoal(goalId, 5_000);
  assert.equal(goalOf(await ledger.read(), goalId).savedCents, 0);
});

test("refusal: Savings tab Take out at exactly free savings, and one cent over", async () => {
  const { ledger } = await withGoal(3_000, 5_000);
  await rejectsWith(
    ledger.addEntry({ kind: "withdraw", amountCents: 3_001, date: TODAY }),
    RuleError,
    "Only €30 is free. The rest is set aside for goals. To use it, take it out of a goal.",
  );
  await ledger.addEntry({ kind: "withdraw", amountCents: 3_000, date: TODAY });
  assert.equal(pos(await ledger.read()).free, 0);
});

test("refusal: deleting a general save that would leave savings short (SPEC example: €200 save, €150 free)", async () => {
  const { ledger } = await withGoal(0, 5_000);
  await ledger.addEntry({ kind: "save", amountCents: 20_000, date: TODAY });
  await ledger.addEntry({ kind: "withdraw", amountCents: 5_000, date: TODAY });
  const d = await ledger.read();
  assert.equal(pos(d).free, 15_000);
  const save = d.transactions.find((t) => t.kind === "save" && t.amountCents === 20_000 && !t.goalId)!;
  await rejectsWith(ledger.deleteEntry(save.id), RuleError, "This would leave your savings €50 short of what's set aside for goals.");
  assert.equal((await ledger.read()).transactions.length, d.transactions.length, "nothing changed");
});

test("refusal: editing a general save down to exactly free savings works, one cent more is refused", async () => {
  const { ledger } = await withGoal(1_000, 5_000);
  const save = (await ledger.read()).transactions.find((t) => t.kind === "save" && !t.goalId)!;
  // The save is €60 and free is €10: lowering it by €10 is fine, by €10.01 is not.
  await rejectsWith(ledger.editEntry(save.id, { amountCents: save.amountCents - 1_001 }), RuleError, "This would leave your savings €0.01 short of what's set aside for goals.");
  await ledger.editEntry(save.id, { amountCents: save.amountCents - 1_000 });
  assert.equal(pos(await ledger.read()).free, 0);
});

test("refusal: a linked withdrawal edited above what the goal has", async () => {
  const { ledger } = await make();
  const { goalId } = await ledger.createGoal({ name: "Trip", targetCents: 10_000, openingCents: 0 });
  await ledger.addToGoal(goalId, 1_000);
  await ledger.takeFromGoal(goalId, 400);
  const w = (await ledger.read()).transactions.find((t) => t.kind === "withdraw")!;
  await ledger.editEntry(w.id, { amountCents: 1_000 });
  await rejectsWith(ledger.editEntry(w.id, { amountCents: 1_001 }), RuleError);
});

test("archive 'I spent it': one linked withdrawal for everything saved; free unchanged; balance down", async () => {
  const { ledger, goalId } = await withGoal(2_000, 7_000);
  const before = pos(await ledger.read());
  await ledger.archiveGoal(goalId, "spent");
  const d = await ledger.read();
  const w = d.transactions.filter((t) => t.goalId === goalId && t.kind === "withdraw");
  assert.equal(w.length, 1);
  assert.equal(w[0]?.amountCents, 7_000);
  assert.equal(w[0]?.date, TODAY);
  assert.equal(w[0]?.note, "Spent: Holiday");
  assert.equal(goalOf(d, goalId).savedCents, 0);
  assert.equal(goalOf(d, goalId).archived, true);
  assert.equal(pos(d).free, before.free);
  assert.equal(pos(d).balance, before.balance - 7_000);
  // Can always be unarchived afterwards.
  await ledger.unarchiveGoal(goalId);
  assert.equal(goalOf(await ledger.read(), goalId).archived, false);
});

test("archive 'Keep it in savings': no movement; free goes up by savedCents", async () => {
  const { ledger, goalId } = await withGoal(2_000, 7_000);
  const count = (await ledger.read()).transactions.length;
  await ledger.archiveGoal(goalId, "keep");
  const d = await ledger.read();
  assert.equal(d.transactions.length, count);
  assert.equal(pos(d).free, 9_000);
});

test("archiving a goal with nothing saved creates no movement in either mode", async () => {
  const { ledger, goalId } = await withGoal(0, 0);
  await ledger.archiveGoal(goalId, "spent");
  const d = await ledger.read();
  assert.equal(d.transactions.length, 0);
  assert.equal(goalOf(d, goalId).archived, true);
});

test("unarchive: allowed when free savings equals what the goal has, refused one cent below", async () => {
  const { ledger, goalId } = await withGoal(0, 7_000);
  await ledger.archiveGoal(goalId, "keep"); // free = 7_000
  await ledger.addEntry({ kind: "withdraw", amountCents: 1, date: TODAY }); // free = 6_999
  await rejectsWith(ledger.unarchiveGoal(goalId), RuleError, "This would leave your savings €0.01 short of what's set aside for goals.");
  await ledger.addEntry({ kind: "save", amountCents: 1, date: TODAY });
  await ledger.unarchiveGoal(goalId);
  assert.equal(pos(await ledger.read()).free, 0);
});

test("delete goal, keep the movements: d > 0, d = 0 and d < 0; no orphaned goalId", async () => {
  // d > 0: opening €50, saved €80 (one €30 linked save).
  {
    const { ledger } = await make();
    const { goalId } = await ledger.createGoal({ name: "A", targetCents: 100_000, openingCents: 5_000 });
    await ledger.addToGoal(goalId, 3_000);
    const before = pos(await ledger.read());
    await ledger.deleteGoal(goalId, "keep");
    const d = await ledger.read();
    assert.equal(pos(d).balance, before.balance - 5_000);
    assert.equal(pos(d).free, before.free + 3_000);
    assert.ok(d.transactions.every((t) => t.goalId === undefined));
    assert.equal(d.transactions.length, 1);
  }
  // d = 0: opening €50, nothing else.
  {
    const { ledger } = await make();
    const { goalId } = await ledger.createGoal({ name: "B", targetCents: 100_000, openingCents: 5_000 });
    const before = pos(await ledger.read());
    await ledger.deleteGoal(goalId, "keep");
    const d = await ledger.read();
    assert.equal(pos(d).balance, before.balance - 5_000);
    assert.equal(pos(d).free, before.free);
  }
  // d < 0: opening €50, €20 taken out, €30 of free savings to absorb it.
  {
    const { ledger } = await make();
    const { goalId } = await ledger.createGoal({ name: "C", targetCents: 100_000, openingCents: 5_000 });
    await ledger.takeFromGoal(goalId, 2_000);
    await ledger.addEntry({ kind: "save", amountCents: 3_000, date: TODAY });
    const before = pos(await ledger.read());
    await ledger.deleteGoal(goalId, "keep");
    const d = await ledger.read();
    assert.equal(pos(d).balance, before.balance - 5_000);
    assert.equal(pos(d).free, before.free - 2_000);
    assert.ok(d.transactions.every((t) => t.goalId === undefined));
  }
});

test("delete goal, keep the movements: refused when free savings is exactly −d minus one cent", async () => {
  const { ledger } = await make();
  const { goalId } = await ledger.createGoal({ name: "C", targetCents: 100_000, openingCents: 5_000 });
  await ledger.takeFromGoal(goalId, 2_000); // d = −2_000
  await ledger.addEntry({ kind: "save", amountCents: 1_999, date: TODAY }); // free = 1_999
  await rejectsWith(ledger.deleteGoal(goalId, "keep"), RuleError, "This would leave your savings balance €0.01 below zero.");
  assert.equal((await ledger.read()).goals.length, 1, "nothing changed");
  await ledger.deleteGoal(goalId, "delete");
  const d = await ledger.read();
  assert.equal(d.goals.length, 0);
  assert.ok(d.transactions.every((t) => t.goalId === undefined));
});

test("delete goal and its movements: balance down by savedCents, free unchanged", async () => {
  const { ledger, goalId } = await withGoal(4_000, 6_000);
  const before = pos(await ledger.read());
  await ledger.deleteGoal(goalId, "delete");
  const d = await ledger.read();
  assert.equal(pos(d).balance, before.balance - 6_000);
  assert.equal(pos(d).free, before.free);
  assert.ok(d.transactions.every((t) => t.goalId === undefined));
});

test("a goal's opening amount edited below what has been withdrawn is refused", async () => {
  const { ledger } = await make();
  const { goalId } = await ledger.createGoal({ name: "Old fund", targetCents: 100_000, openingCents: 10_000 });
  await ledger.takeFromGoal(goalId, 6_000); // saved 4_000
  await rejectsWith(ledger.editGoal(goalId, { openingCents: 5_999 }), RuleError, "This goal only has €40.");
  await ledger.editGoal(goalId, { openingCents: 6_000 });
  assert.equal(goalOf(await ledger.read(), goalId).savedCents, 0);
});

test("SPEC Undo: undo after add, edit and delete restores identical records", async () => {
  const { ledger } = await make();
  const added = await ledger.addEntry({ kind: "expense", amountCents: 450, category: "Eating out", date: TODAY, note: "Coffee" });
  assert.equal(added.undo?.label, "Expense added");
  await ledger.undo(added.undo!);
  assert.equal((await ledger.read()).transactions.length, 0);

  await ledger.addEntry({ kind: "expense", amountCents: 450, category: "Eating out", date: TODAY, note: "Coffee" });
  const original = (await ledger.read()).transactions[0]!;
  const edited = await ledger.editEntry(original.id, { amountCents: 999 });
  assert.equal(edited.undo?.label, "Changes saved");
  await ledger.undo(edited.undo!);
  assert.deepEqual((await ledger.read()).transactions[0], original);

  const deleted = await ledger.deleteEntry(original.id);
  assert.equal(deleted.undo?.label, "Expense deleted");
  await ledger.undo(deleted.undo!);
  assert.deepEqual((await ledger.read()).transactions[0], original);
});

test("SPEC Undo: undoing a goal contribution restores savedCents", async () => {
  const { ledger } = await make();
  const { goalId } = await ledger.createGoal({ name: "Holiday", targetCents: 100_000, openingCents: 1_000 });
  const goalBefore = goalOf(await ledger.read(), goalId);
  const r = await ledger.addToGoal(goalId, 5_000);
  assert.equal(r.undo?.label, "€50 added to Holiday");
  assert.equal(goalOf(await ledger.read(), goalId).savedCents, 6_000);
  await ledger.undo(r.undo!);
  const d = await ledger.read();
  assert.deepEqual(goalOf(d, goalId), goalBefore);
  assert.equal(d.transactions.length, 0);
});

test("SPEC Undo: refused by a savings rule leaves data unchanged (another window spent the money)", async () => {
  const store = new MemoryStore();
  const { ledger: window1 } = await make({ store });
  const { ledger: window2 } = await make({ store });
  const r = await window1.addEntry({ kind: "save", amountCents: 10_000, date: TODAY });
  await window2.addEntry({ kind: "withdraw", amountCents: 10_000, date: TODAY });
  const before = await window1.read();
  await rejectsWith(window1.undo(r.undo!), RuleError, "This would leave your savings balance €100 below zero.");
  assert.deepEqual(await window1.read(), before);
});

test("only the most recent action can be undone", async () => {
  const { ledger } = await make();
  const first = await ledger.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: TODAY });
  await ledger.addEntry({ kind: "expense", amountCents: 200, category: "Other", date: TODAY });
  await rejectsWith(ledger.undo(first.undo as UndoToken), InputError, "There's nothing to undo.");
  assert.equal((await ledger.read()).transactions.length, 2);
});

test("an undo can't be used twice", async () => {
  const { ledger } = await make();
  const r = await ledger.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: TODAY });
  await ledger.undo(r.undo!);
  await rejectsWith(ledger.undo(r.undo!), InputError);
});

test("SPEC Storage errors: a failed write leaves data unchanged and returns the right type", async () => {
  let fail = false;
  const store = new MemoryStore({ failWrite: () => fail });
  const { ledger } = await make({ store });
  await ledger.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: TODAY });
  const before = await ledger.read();
  fail = true;
  await rejectsWith(ledger.addEntry({ kind: "expense", amountCents: 200, category: "Other", date: TODAY }), QuotaError, "Storage is full. Export a backup, then delete old entries.");
  fail = false;
  assert.deepEqual(await ledger.read(), before);
});

test("Phone and PC counters: entries, undos, goals, budgets and currency count; theme and recent lists don't", async () => {
  const { ledger } = await make();
  const s = async () => (await ledger.read()).settings;
  const a = await ledger.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: TODAY });
  assert.equal((await s()).changesSinceSync, 1, "an add (its recent-category update isn't counted separately)");
  await ledger.undo(a.undo!);
  assert.equal((await s()).changesSinceSync, 2, "an undo");
  await ledger.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: TODAY });
  const id = (await ledger.read()).transactions[0]!.id;
  await ledger.editEntry(id, { amountCents: 150 });
  await ledger.deleteEntry(id);
  assert.equal((await s()).changesSinceSync, 5, "add, edit, delete");
  await ledger.setBudget("Groceries", 35_000);
  const { goalId } = await ledger.createGoal({ name: "Trip", targetCents: 1_000, openingCents: 0 });
  assert.equal((await s()).changesSinceSync, 7, "a budget and a goal");
  let changes = (await s()).changesSinceSync;
  await ledger.updateSettings({ theme: "dark", backupSnoozedUntil: 5, iosBrowserAcknowledged: true });
  assert.equal((await s()).changesSinceSync, changes, "per-device settings don't count");
  await ledger.updateSettings({ currency: "EUR" });
  assert.equal((await s()).changesSinceSync, changes, "setting the same currency again doesn't count");
  await ledger.updateSettings({ currency: "USD" });
  assert.equal((await s()).changesSinceSync, changes + 1, "a currency change travels with the data, so it counts");
  changes += 1;
  await ledger.addToGoal(goalId, 100);
  assert.equal((await s()).changesSinceSync, changes + 1);
});

test("delete log: entry, goal and budget deletes are recorded; an undo removes its records", async () => {
  const { ledger } = await make();
  const log = async () => (await ledger.read()).settings.deleteLog.map((d) => d.what);
  await ledger.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: TODAY });
  const id = (await ledger.read()).transactions[0]!.id;
  const del = await ledger.deleteEntry(id);
  assert.deepEqual(await log(), ["entry"]);
  await ledger.undo(del.undo!);
  assert.deepEqual(await log(), [], "undoing the delete takes its record back");
  await ledger.setBudget("Groceries", 35_000);
  await ledger.removeBudget("Groceries");
  const { goalId } = await ledger.createGoal({ name: "Trip", targetCents: 1_000, openingCents: 0 });
  await ledger.addToGoal(goalId, 100);
  await ledger.addToGoal(goalId, 200);
  await ledger.deleteGoal(goalId, "delete");
  assert.deepEqual(await log(), ["budget", "goal", "entry", "entry"]);
  const all = (await ledger.read()).settings.deleteLog;
  assert.ok(all.every((d) => typeof d.at === "number" && d.at > 0));
});

test("a goal contribution changes savedCents but not the goal's updatedAt", async () => {
  const { ledger } = await make();
  const { goalId } = await ledger.createGoal({ name: "Trip", targetCents: 1_000, openingCents: 0 });
  const before = (await ledger.read()).goals.find((g) => g.id === goalId)!;
  await ledger.addToGoal(goalId, 100);
  const after = (await ledger.read()).goals.find((g) => g.id === goalId)!;
  assert.equal(after.savedCents, 100);
  assert.equal(after.updatedAt, before.updatedAt, "derived savedCents isn't a goal edit");
  await ledger.editGoal(goalId, { name: "Big trip" });
  assert.ok((await ledger.read()).goals[0]!.updatedAt > before.updatedAt, "a real edit updates it");
});

test("budgets: set, replace and remove; only expense categories", async () => {
  const { ledger } = await make();
  await ledger.setBudget("Groceries", 35_000);
  await ledger.setBudget("Groceries", 30_000);
  const [b] = (await ledger.read()).budgets;
  assert.equal(b?.category, "Groceries");
  assert.equal(b?.limitCents, 30_000);
  assert.ok((b?.updatedAt ?? 0) > 0, "budgets carry updatedAt");
  await rejectsWith(ledger.setBudget("Salary", 100), InputError);
  await ledger.removeBudget("Groceries");
  assert.deepEqual((await ledger.read()).budgets, []);
});

test("goals: names and amounts are checked", async () => {
  const { ledger } = await make();
  await rejectsWith(ledger.createGoal({ name: "  ", targetCents: 100, openingCents: 0 }), InputError, "Give the goal a name.");
  await rejectsWith(ledger.createGoal({ name: "x".repeat(41), targetCents: 100, openingCents: 0 }), InputError);
  await rejectsWith(ledger.createGoal({ name: "Car", targetCents: 0, openingCents: 0 }), InputError);
  await rejectsWith(ledger.createGoal({ name: "Car", targetCents: 100, openingCents: -1 }), InputError);
  const { goalId } = await ledger.createGoal({ name: " Car ", targetCents: 100, openingCents: 0, dueDate: "2027-06-01" });
  await ledger.editGoal(goalId, { dueDate: null, name: "New car" });
  const g = goalOf(await ledger.read(), goalId);
  assert.equal(g.name, "New car");
  assert.equal(g.dueDate, undefined);
});

test("listeners hear about committed changes only", async () => {
  const { ledger } = await make();
  let calls = 0;
  ledger.onChange(() => calls++);
  await ledger.addEntry({ kind: "expense", amountCents: 100, category: "Other", date: TODAY });
  await assert.rejects(ledger.addEntry({ kind: "expense", amountCents: 0, category: "Other", date: TODAY }));
  assert.equal(calls, 1);
});

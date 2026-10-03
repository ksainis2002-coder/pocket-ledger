import { test } from "node:test";
import assert from "node:assert/strict";
import { allTimeTotals, categoryTotals, monthTotals, savingsPosition } from "./totals";
import { goal, tx } from "../test/builders";

test("month totals count only that month, inclusive of the 1st and the last day", () => {
  const list = [
    tx("income", 240000, "2026-10-01"),
    tx("expense", 4500, "2026-10-31"),
    tx("expense", 1000, "2026-09-30"),
    tx("expense", 2000, "2026-11-01"),
    tx("save", 20000, "2026-10-15"),
    tx("withdraw", 5000, "2026-10-20"),
  ];
  assert.deepEqual(monthTotals(list, "2026-10"), {
    income: 240000,
    expenses: 4500,
    saves: 20000,
    withdrawals: 5000,
    netToSavings: 15000,
    net: 240000 - 4500 - 15000,
  });
});

test("net to savings can be negative and raises net", () => {
  const t = monthTotals([tx("withdraw", 150000, "2026-10-03")], "2026-10");
  assert.equal(t.netToSavings, -150000);
  assert.equal(t.net, 150000);
});

test("zero month", () => {
  assert.deepEqual(monthTotals([], "2026-10"), { income: 0, expenses: 0, saves: 0, withdrawals: 0, netToSavings: 0, net: 0 });
});

test("category totals, largest first", () => {
  const list = [
    tx("expense", 300, "2026-10-02", { category: "Transport" }),
    tx("expense", 5000, "2026-10-02", { category: "Groceries" }),
    tx("expense", 700, "2026-10-09", { category: "Transport" }),
    tx("income", 99, "2026-10-09", { category: "Bonus" }),
  ];
  assert.deepEqual(categoryTotals(list, "2026-10", "expense"), [
    { category: "Groceries", cents: 5000 },
    { category: "Transport", cents: 1000 },
  ]);
});

test("savings position: opening amounts count, archived goals free their money", () => {
  const active = goal({ openingCents: 50000, savedCents: 70000 });
  const archived = goal({ openingCents: 10000, savedCents: 10000, archived: true });
  const list = [tx("save", 20000, "2026-10-01", { goalId: active.id }), tx("save", 5000, "2026-10-02"), tx("withdraw", 1000, "2026-10-03")];
  const p = savingsPosition(list, [active, archived]);
  assert.equal(p.balance, 20000 + 5000 - 1000 + 50000 + 10000);
  assert.equal(p.setAside, 70000);
  assert.equal(p.free, p.balance - 70000);
});

test("all-time totals", () => {
  const list = [tx("income", 100, "2025-01-01"), tx("income", 200, "2026-10-01"), tx("expense", 50, "2026-02-28"), tx("save", 30, "2026-02-28")];
  assert.deepEqual(allTimeTotals(list, [goal({ openingCents: 7 })]), { earned: 300, spent: 50, savingsBalance: 37 });
});

test("month totals across 31 Dec -> 1 Jan stay in their own years", () => {
  const list = [tx("expense", 1_000, "2026-12-31"), tx("expense", 2_000, "2027-01-01"), tx("income", 50_000, "2026-12-31"), tx("income", 70_000, "2027-01-01")];
  const dec = monthTotals(list, "2026-12");
  const jan = monthTotals(list, "2027-01");
  assert.equal(dec.expenses, 1_000);
  assert.equal(dec.income, 50_000);
  assert.equal(jan.expenses, 2_000);
  assert.equal(jan.income, 70_000);
  assert.equal(monthTotals(list, "2026-01").expenses, 0, "same month number, other year");
});

test("1,000 × €0,01 totals exactly €10,00", () => {
  const list = Array.from({ length: 1_000 }, () => tx("expense", 1, "2026-10-03"));
  assert.equal(monthTotals(list, "2026-10").expenses, 1_000);
  const cents = Array.from({ length: 1_000 }, () => tx("save", 1, "2026-10-03"));
  assert.equal(savingsPosition(cents, []).balance, 1_000);
});

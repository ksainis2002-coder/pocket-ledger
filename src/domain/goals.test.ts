import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSaved, deleteGoalEffects, goalPlan, hasLinkedSaveInMonth, planText } from "./goals";
import { formatMoney } from "./money";
import { goal, tx } from "../test/builders";

const eur = (c: number) => formatMoney(c, "EUR", "en-IE");
const G = (remaining: number, dueDate?: string) => ({ targetCents: 100_000, savedCents: 100_000 - remaining, ...(dueDate ? { dueDate } : {}) });

test("SPEC example: €600 by Mar 2027, no October contribution -> 6 months, €100 from this month", () => {
  const p = goalPlan(G(60_000, "2027-03-15"), false, "2026-10-03");
  assert.equal(p.kind, "monthly");
  assert.ok(p.kind === "monthly" && p.months === 6 && p.monthly === 10_000);
  assert.equal(planText(p, eur, "2026-10-03", "en-GB"), "Put aside €100 a month from this month to reach it by Mar 2027");
});

test("SPEC example: same goal, already contributed in October -> Nov to Mar, €120 from November", () => {
  const p = goalPlan(G(60_000, "2027-03-15"), true, "2026-10-03");
  assert.ok(p.kind === "monthly" && p.months === 5 && p.monthly === 12_000);
  assert.equal(planText(p, eur, "2026-10-03", "en-GB"), "Put aside €120 a month from November to reach it by Mar 2027");
});

test("SPEC example: €100 over Nov, Dec, Jan rounds up to €33.34", () => {
  const p = goalPlan(G(10_000, "2027-01-20"), true, "2026-10-03");
  assert.ok(p.kind === "monthly" && p.months === 3 && p.monthly === 3334);
  assert.ok(p.monthly * p.months >= 10_000, "following the plan reaches the target");
});

test("SPEC example: 31 Dec, due 1 Jan, no December contribution -> 2 months", () => {
  const p = goalPlan(G(5_000, "2027-01-01"), false, "2026-12-31");
  assert.ok(p.kind === "monthly" && p.months === 2 && p.monthly === 2500);
});

test("start month in the next year names the year", () => {
  const p = goalPlan(G(5_000, "2027-03-01"), true, "2026-12-10");
  assert.equal(planText(p, eur, "2026-12-10", "en-GB"), "Put aside €16.67 a month from January 2027 to reach it by Mar 2027");
});

test("SPEC example: due this month", () => {
  const p = goalPlan(G(4_200, "2026-10-31"), false, "2026-10-03");
  assert.equal(p.kind, "dueThisMonth");
  assert.equal(planText(p, eur, "2026-10-03", "en-GB"), "€42 due by 31 Oct");
});

test("target date equal to today is due this month, not passed", () => {
  assert.equal(goalPlan(G(100, "2026-10-03"), false, "2026-10-03").kind, "dueThisMonth");
  assert.equal(goalPlan(G(100, "2026-10-02"), false, "2026-10-03").kind, "passed");
});

test("rounding up by exactly one cent", () => {
  const p = goalPlan(G(10_001, "2027-01-31"), false, "2026-10-03"); // Oct..Jan = 4 months
  assert.ok(p.kind === "monthly" && p.monthly === 2501);
});

test("reached exactly, and over", () => {
  assert.equal(goalPlan({ targetCents: 500, savedCents: 500 }, false, "2026-10-03").kind, "reached");
  assert.equal(goalPlan({ targetCents: 500, savedCents: 900 }, false, "2026-10-03").kind, "reached");
});

test("no date and passed copy", () => {
  assert.equal(planText(goalPlan(G(2_550), false, "2026-10-03"), eur, "2026-10-03"), "€25.50 still to go");
  assert.equal(planText(goalPlan(G(2_550, "2026-01-01"), false, "2026-10-03"), eur, "2026-10-03"), "Target date passed. €25.50 still to go");
});

test("computeSaved follows the invariant", () => {
  const g = goal({ openingCents: 1000 });
  const list = [
    tx("save", 500, "2026-10-01", { goalId: g.id }),
    tx("withdraw", 200, "2026-10-02", { goalId: g.id }),
    tx("save", 9999, "2026-10-02"),
    tx("save", 1, "2026-10-02", { goalId: "other" }),
  ];
  assert.equal(computeSaved(g, list), 1300);
  assert.equal(hasLinkedSaveInMonth(g.id, list, "2026-10"), true);
  assert.equal(hasLinkedSaveInMonth(g.id, list, "2026-09"), false);
});

test("delete-goal effects: d > 0, d = 0, d < 0 and the disabled state", () => {
  assert.deepEqual(deleteGoalEffects({ savedCents: 700, openingCents: 500, archived: false }, 0), { d: 200, shortfall: 0, keepAllowed: true });
  assert.deepEqual(deleteGoalEffects({ savedCents: 500, openingCents: 500, archived: false }, 0), { d: 0, shortfall: 0, keepAllowed: true });
  // d = −300: allowed with exactly 300 free, disabled one cent below.
  assert.deepEqual(deleteGoalEffects({ savedCents: 200, openingCents: 500, archived: false }, 300), { d: -300, shortfall: 0, keepAllowed: true });
  assert.deepEqual(deleteGoalEffects({ savedCents: 200, openingCents: 500, archived: false }, 299), { d: -300, shortfall: 1, keepAllowed: false });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetPillText, budgetStatus } from "./budgets";
import { formatMoney } from "./money";

const eur = (c: number) => formatMoney(c, "EUR", "en-IE");

test("budget tones: under 80% green, from 80% amber, at 100% or more red", () => {
  assert.equal(budgetStatus(0, 15_000).tone, "ok");
  assert.equal(budgetStatus(11_999, 15_000).tone, "ok");
  assert.equal(budgetStatus(12_000, 15_000).tone, "warn");
  assert.equal(budgetStatus(14_999, 15_000).tone, "warn");
  assert.equal(budgetStatus(15_000, 15_000).tone, "bad");
  assert.equal(budgetStatus(16_200, 15_000).tone, "bad");
});

test("budget pills: SPEC wording", () => {
  assert.equal(budgetPillText(budgetStatus(10_800, 15_000), 15_000, eur), "€42 left of €150");
  assert.equal(budgetPillText(budgetStatus(16_200, 15_000), 15_000, eur), "Over by €12");
  assert.equal(budgetPillText(budgetStatus(15_000, 15_000), 15_000, eur), "€0 left of €150");
});

test("bar fraction is capped at a full bar", () => {
  assert.equal(budgetStatus(30_000, 15_000).fraction, 1);
  assert.equal(budgetStatus(7_500, 15_000).fraction, 0.5);
});

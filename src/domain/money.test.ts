import { test } from "node:test";
import assert from "node:assert/strict";
import { centsToInput, formatMoney, parseAmount } from "./money";

const ok = (text: string, cents: number, opts?: { allowZero: boolean }) =>
  assert.deepEqual(parseAmount(text, opts), { ok: true, cents }, text);
const bad = (text: string, error: "format" | "tooLarge" = "format") =>
  assert.deepEqual(parseAmount(text), { ok: false, error }, text);

test("SPEC Amount input: required cases", () => {
  ok("12,50", 1250);
  ok("12.50", 1250);
  ok("12,5", 1250);
  ok("0,01", 1);
  ok(",50", 50);
  ok("1.234,56", 123456);
  ok("1,234.56", 123456);
  ok("12,345", 1234500);
  ok("1 234,56", 123456);
  bad("12,");
  bad("12,3456");
  bad("-5");
  bad("abc");
  bad("0");
  bad("0,00");
  ok("99999999,99", 9_999_999_999);
  bad("100000000", "tooLarge");
});

test("more valid inputs", () => {
  ok("12", 1200);
  ok("007,5", 750);
  ok("1.234.567,89", 123456789);
  ok("1,234,567.89", 123456789);
  ok("1.234", 123400);
  ok("  42  ", 4200);
  ok("1 234,56", 123456);
  ok("0,5", 50);
});

test("more invalid inputs", () => {
  bad("");
  bad(" ");
  bad("12.34.5"); // mixed group sizes
  bad("1,234,56"); // thousands group of 2
  bad("1.234.56,7"); // bad group
  bad("1,23.45,67");
  bad("12,34,56");
  bad("1234,567"); // first thousands group longer than 3
  bad("1.234.5");
  bad("€12");
  bad("12e3");
  bad("+5");
  bad(".");
  bad(",");
  bad("1,2,3");
});

test("zero is allowed only for already-saved amounts", () => {
  ok("0", 0, { allowZero: true });
  ok("0,00", 0, { allowZero: true });
  bad("0");
});

test("amounts above the maximum are too large", () => {
  bad("100.000.000,00", "tooLarge");
  bad("999999999", "tooLarge");
});

test("formatMoney drops cents on whole amounts", () => {
  assert.equal(formatMoney(12000, "EUR", "en-IE"), "€120");
  assert.equal(formatMoney(3334, "EUR", "en-IE"), "€33.34");
  assert.equal(formatMoney(450, "EUR", "el-GR"), "4,50 €");
  assert.equal(formatMoney(12000, "EUR", "en-IE", { alwaysCents: true }), "€120.00");
});

test("centsToInput uses the locale's decimal mark and round-trips", () => {
  assert.equal(centsToInput(1250, "el-GR"), "12,50");
  assert.equal(centsToInput(5, "en-GB"), "0.05");
  for (const c of [1, 99, 100, 123456, 9_999_999_999]) {
    const r = parseAmount(centsToInput(c, "el-GR"));
    assert.deepEqual(r, { ok: true, cents: c });
  }
});

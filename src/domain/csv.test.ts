import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "./csv";
import { goal, tx } from "../test/builders";

const lines = (csv: string) => csv.replace(/^﻿/, "").split("\r\n");

test("Greek locale: BOM, semicolons, decimal comma, YYYY-MM-DD dates, CRLF", () => {
  const csv = toCsv([tx("expense", 1250, "2026-10-03", { category: "Eating out" })], [], "el-GR");
  assert.ok(csv.startsWith("﻿"), "UTF-8 BOM");
  assert.ok(csv.includes("\r\n") && !/[^\r]\n/.test(csv), "CRLF only");
  assert.deepEqual(lines(csv).slice(0, 2), ["Date;Type;Category;Amount;Note;Goal", "2026-10-03;Expense;Eating out;12,50;;"]);
});

test("English locale: commas and a decimal point", () => {
  const csv = toCsv([tx("income", 240000, "2026-10-01", { category: "Salary" })], [], "en-GB");
  assert.deepEqual(lines(csv).slice(0, 2), ["Date,Type,Category,Amount,Note,Goal", "2026-10-01,Income,Salary,2400.00,,"]);
});

test("a note with the delimiter and quotes is quoted with quotes doubled", () => {
  const csv = toCsv([tx("expense", 500, "2026-10-03", { note: 'Coffee; "large"' })], [], "el-GR");
  assert.equal(lines(csv)[1], '2026-10-03;Expense;Groceries;5,00;"Coffee; ""large""";');
  const en = toCsv([tx("expense", 500, "2026-10-03", { note: "a, b" })], [], "en-GB");
  assert.equal(lines(en)[1], '2026-10-03,Expense,Groceries,5.00,"a, b",');
});

test("formula injection: cells starting with = + - @ tab or CR get an apostrophe", () => {
  for (const start of ["=", "+", "-", "@", "\t", "\r"]) {
    assert.ok(csvCell(`${start}SUM(A1)`, ";").replace(/^"/, "").startsWith("'"), JSON.stringify(start));
  }
  const csv = toCsv([tx("expense", 500, "2026-10-03", { note: "=HYPERLINK(\"x\")" })], [], "el-GR");
  assert.equal(lines(csv)[1], `2026-10-03;Expense;Groceries;5,00;"'=HYPERLINK(""x"")";`);
});

test("Greek characters survive, goal names fill the Goal column, rows are oldest first", () => {
  const g = goal({ name: "Διακοπές" });
  const csv = toCsv(
    [tx("save", 10000, "2026-10-05", { goalId: g.id, note: "Για το καλοκαίρι" }), tx("withdraw", 2000, "2026-10-01")],
    [g],
    "el-GR",
  );
  assert.deepEqual(lines(csv).slice(1, 3), ["2026-10-01;Taken out;Savings;20,00;;", "2026-10-05;Into savings;Savings;100,00;Για το καλοκαίρι;Διακοπές"]);
  assert.equal(new TextDecoder("utf-8", { ignoreBOM: true }).decode(new TextEncoder().encode(csv)), csv, "survives a UTF-8 round trip");
});

test("large amounts have no thousands separator", () => {
  assert.equal(lines(toCsv([tx("income", 123456789, "2026-10-01")], [], "el-GR"))[1], "2026-10-01;Income;Salary;1234567,89;;");
});

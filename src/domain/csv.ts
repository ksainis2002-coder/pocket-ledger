// CSV export (SPEC CSV export): opens correctly in Excel with Greek settings.
import { kindLabel } from "./categories";
import { centsToInput, decimalMark } from "./money";
import type { Goal, Transaction } from "./types";

const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell: formula-like text gets a leading apostrophe; cells with the delimiter, a quote or a line break are quoted. */
export function csvCell(value: string, delimiter: string): string {
  let v = FORMULA_START.test(value) ? `'${value}` : value;
  if (v.includes(delimiter) || v.includes('"') || v.includes("\n") || v.includes("\r")) v = `"${v.replaceAll('"', '""')}"`;
  return v;
}

/**
 * Transactions as CSV: UTF-8 with a BOM, CRLF line endings, `;` and decimal commas where the locale
 * writes decimals with a comma. Dates are YYYY-MM-DD, which Excel reads as real dates in any language.
 */
export function toCsv(transactions: readonly Transaction[], goals: readonly Goal[], locale?: string): string {
  const delimiter = decimalMark(locale) === "," ? ";" : ",";
  const goalNames = new Map(goals.map((g) => [g.id, g.name]));
  const rows = [["Date", "Type", "Category", "Amount", "Note", "Goal"]];
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  for (const t of sorted) {
    rows.push([t.date, kindLabel(t.kind), t.category, centsToInput(t.amountCents, locale), t.note ?? "", t.goalId ? (goalNames.get(t.goalId) ?? "") : ""]);
  }
  return "﻿" + rows.map((r) => r.map((c) => csvCell(c, delimiter)).join(delimiter)).join("\r\n") + "\r\n";
}

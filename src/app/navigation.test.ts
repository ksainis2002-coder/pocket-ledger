import { test } from "node:test";
import assert from "node:assert/strict";
import { canGoNext, initialNav, nextMonth, onDayChange, prevMonth, selectTab, showsMonthPicker } from "./navigation";

test("opens on the saved tab and the current month", () => {
  assert.deepEqual(initialNav("savings", "2026-10-03"), { tab: "savings", month: "2026-10" });
  assert.deepEqual(initialNav("bogus", "2026-10-03"), { tab: "net", month: "2026-10" });
  assert.deepEqual(initialNav(null, "2026-10-03"), { tab: "net", month: "2026-10" });
});

test("month picker can't move past the current month", () => {
  const s = initialNav("net", "2026-10-03");
  assert.equal(canGoNext(s, "2026-10-03"), false);
  assert.equal(nextMonth(s, "2026-10-03"), s);
  const back = prevMonth(prevMonth(s));
  assert.equal(back.month, "2026-08");
  assert.equal(canGoNext(back, "2026-10-03"), true);
  assert.equal(nextMonth(nextMonth(nextMonth(back, "2026-10-03"), "2026-10-03"), "2026-10-03").month, "2026-10");
});

test("previous month crosses the year boundary", () => {
  assert.equal(prevMonth({ tab: "net", month: "2026-01" }).month, "2025-12");
});

test("picker is hidden only on Goals and Settings", () => {
  assert.equal(showsMonthPicker("goals"), false);
  assert.equal(showsMonthPicker("settings"), false);
  for (const t of ["net", "income", "expenses", "savings"] as const) assert.equal(showsMonthPicker(t), true);
});

test("picker follows into a new month only if it was on the current month", () => {
  const onCurrent = { tab: "net" as const, month: "2026-10" };
  assert.equal(onDayChange(onCurrent, "2026-10-31", "2026-11-01").month, "2026-11");
  const onPast = { tab: "net" as const, month: "2026-08" };
  assert.equal(onDayChange(onPast, "2026-10-31", "2026-11-01").month, "2026-08");
  assert.equal(onDayChange(onCurrent, "2026-10-03", "2026-10-04"), onCurrent);
});

test("selectTab keeps the month", () => {
  const s = { tab: "net" as const, month: "2026-07" };
  assert.deepEqual(selectTab(s, "expenses"), { tab: "expenses", month: "2026-07" });
  assert.equal(selectTab(s, "net"), s);
});

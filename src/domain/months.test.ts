import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  compareMonths,
  dateOf,
  daysInMonth,
  isValidDate,
  lastMonths,
  monthLabel,
  monthOf,
  monthsInclusive,
  parseDate,
} from "./months";

test("dateOf uses local calendar parts", () => {
  assert.equal(dateOf(new Date(2026, 9, 3, 23, 59, 59)), "2026-10-03");
  assert.equal(dateOf(new Date(2026, 0, 1, 0, 0, 0)), "2026-01-01");
});

test("parseDate accepts real dates only", () => {
  assert.deepEqual(parseDate("2026-10-03"), { year: 2026, month: 10, day: 3 });
  assert.equal(parseDate("2026-02-29"), null);
  assert.deepEqual(parseDate("2028-02-29"), { year: 2028, month: 2, day: 29 });
  assert.equal(parseDate("2100-02-29"), null);
  assert.deepEqual(parseDate("2000-02-29"), { year: 2000, month: 2, day: 29 });
  for (const bad of ["2026-13-01", "2026-00-10", "2026-04-31", "2026-1-01", "26-10-03", "2026-10-03T00:00", ""]) {
    assert.equal(isValidDate(bad), false, bad);
  }
});

test("daysInMonth handles leap years", () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2026, 12), 31);
});

test("addMonths crosses year boundaries both ways", () => {
  assert.equal(addMonths("2026-10", 1), "2026-11");
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2027-01", -1), "2026-12");
  assert.equal(addMonths("2026-10", -22), "2024-12");
  assert.equal(addMonths("2026-10", 0), "2026-10");
  assert.throws(() => addMonths("2026-13", 1));
});

test("compareMonths and monthOf", () => {
  assert.ok(compareMonths("2026-09", "2026-10") < 0);
  assert.equal(compareMonths("2026-10", "2026-10"), 0);
  assert.ok(compareMonths("2027-01", "2026-12") > 0);
  assert.equal(monthOf("2026-10-31"), "2026-10");
  assert.throws(() => monthOf("2026-10-32"));
});

test("monthsInclusive counts both ends", () => {
  assert.equal(monthsInclusive("2026-11", "2027-03"), 5);
  assert.equal(monthsInclusive("2026-10", "2027-03"), 6);
  assert.equal(monthsInclusive("2026-12", "2027-01"), 2);
  assert.equal(monthsInclusive("2026-10", "2026-10"), 1);
  assert.equal(monthsInclusive("2026-10", "2026-09"), 0);
});

test("lastMonths ends at the given month, oldest first", () => {
  assert.deepEqual(lastMonths("2027-02", 6), ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
});

test("monthLabel formats without going through UTC", () => {
  assert.equal(monthLabel("2026-10", "en-GB"), "October 2026");
  assert.equal(monthLabel("2027-01", "en-GB"), "January 2027");
});

import { addMonths, compareMonths, monthOf, type DateStr, type MonthKey } from "../domain/months";

export const TABS = [
  { id: "net", label: "Net", title: "Net money" },
  { id: "income", label: "Income", title: "Income" },
  { id: "expenses", label: "Expenses", title: "Expenses" },
  { id: "savings", label: "Savings", title: "Savings" },
  { id: "goals", label: "Goals", title: "Goals" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

/** A tab, or the Settings view (opened from the gear in the header; not in the tab bar). */
export type ViewId = TabId | "settings";

const SETTINGS_INFO = { id: "settings", label: "Settings", title: "Settings" } as const;

export interface NavState {
  tab: ViewId;
  /** The month shown on month-based tabs. Never later than the current month. */
  month: MonthKey;
}

export function isTabId(value: unknown): value is TabId {
  return typeof value === "string" && TABS.some((t) => t.id === value);
}

export function tabInfo(id: ViewId): { id: ViewId; label: string; title: string } {
  if (id === "settings") return SETTINGS_INFO;
  return TABS.find((t) => t.id === id) ?? TABS[0];
}

/** Opens on the last tab used (if known) and the current month. */
export function initialNav(savedTab: unknown, today: DateStr): NavState {
  return { tab: isTabId(savedTab) ? savedTab : "net", month: monthOf(today) };
}

/** The month picker is hidden on Goals and Settings. */
export function showsMonthPicker(tab: ViewId): boolean {
  return tab !== "goals" && tab !== "settings";
}

export function canGoNext(state: NavState, today: DateStr): boolean {
  return compareMonths(state.month, monthOf(today)) < 0;
}

export function prevMonth(state: NavState): NavState {
  return { ...state, month: addMonths(state.month, -1) };
}

/** Moves forward one month, but never past the current month. */
export function nextMonth(state: NavState, today: DateStr): NavState {
  return canGoNext(state, today) ? { ...state, month: addMonths(state.month, 1) } : state;
}

export function selectTab(state: NavState, tab: ViewId): NavState {
  return state.tab === tab ? state : { ...state, tab };
}

/**
 * When the day changes into a new month: if the picker was on the old current month,
 * it follows to the new current month (SPEC Dates and today). Past months stay put.
 */
export function onDayChange(state: NavState, previousToday: DateStr, today: DateStr): NavState {
  const before = monthOf(previousToday);
  const now = monthOf(today);
  if (before !== now && state.month === before) return { ...state, month: now };
  if (compareMonths(state.month, now) > 0) return { ...state, month: now };
  return state;
}

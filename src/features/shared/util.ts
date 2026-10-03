// Small helpers shared by the screens.
import { monthLabel, type MonthKey } from "../../domain/months";
import { h } from "../../components/dom";

/** "this month" for the current month, else "in October" / "in October 2025". */
export function monthPhrase(month: MonthKey, today: string, locale?: string): string {
  if (month === today.slice(0, 7)) return "this month";
  if (month.slice(0, 4) === today.slice(0, 4)) {
    return `in ${new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1))}`;
  }
  return `in ${monthLabel(month, locale)}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function screenEl(name: string): HTMLElement {
  return h("section", { class: "screen stack", "data-screen": name });
}

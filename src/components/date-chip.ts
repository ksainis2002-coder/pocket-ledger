// "Today ▾" date chip: a native date input laid over a chip, so tapping it opens the
// phone's own date picker. Dates can't be later than today (SPEC Dates and today).
import { DATE_LOCALE, parseDate, type DateStr } from "../domain/months";
import { h } from "./dom";
import { icon } from "./icons";

export interface DateChip {
  el: HTMLElement;
  value(): DateStr;
  set(date: DateStr): void;
  /** Back to today. */
  reset(): void;
  /** Call when the day changes: updates the limit, and moves a "today" value to the new today. */
  setToday(today: DateStr): void;
}

export function shortDate(date: DateStr, today: DateStr, locale?: string): string {
  const d = parseDate(date);
  if (!d) return date;
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat(locale ?? DATE_LOCALE, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(d.year, d.month - 1, d.day),
  );
}

export function createDateChip(opts: { id: string; today: DateStr; label?: string; allowFuture?: boolean; locale?: string | undefined }): DateChip {
  let today = opts.today;
  let value = today;
  const text = h("span", { class: "chip-text" });
  const input = h("input", { id: opts.id, class: "date-overlay", type: "date", "aria-label": opts.label ?? "Date" });
  const el = h("span", { class: "chip chip-date" }, text, icon("down"), input);

  const render = (): void => {
    text.textContent = value === today ? "Today" : shortDate(value, today, opts.locale);
    input.value = value;
    if (!opts.allowFuture) input.max = today;
  };
  input.addEventListener("change", () => {
    if (!input.value) {
      value = today; // cleared: back to today
    } else if (!opts.allowFuture && input.value > today) {
      value = today;
    } else {
      value = input.value;
    }
    render();
  });
  render();

  return {
    el,
    value: () => value,
    set(date) {
      value = date;
      render();
    },
    reset() {
      value = today;
      render();
    },
    setToday(next) {
      const wasToday = value === today;
      today = next;
      if (wasToday) value = today;
      render();
    },
  };
}

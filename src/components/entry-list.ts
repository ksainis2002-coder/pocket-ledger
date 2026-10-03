// A list of entries for one month: date, what, note, amount. Each row opens the edit sheet.
import { kindLabel } from "../domain/categories";
import type { DateStr } from "../domain/months";
import type { Goal, Transaction } from "../domain/types";
import { shortDate } from "./date-chip";
import { h } from "./dom";

export function entryList(opts: {
  entries: readonly Transaction[];
  goals: readonly Goal[];
  today: DateStr;
  money: (cents: number) => string;
  onOpen: (t: Transaction) => void;
  empty: string;
  locale?: string | undefined;
}): HTMLElement {
  if (opts.entries.length === 0) return h("p", { class: "list-empty" }, opts.empty);
  const goalNames = new Map(opts.goals.map((g) => [g.id, g.name]));
  const sorted = [...opts.entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  return h(
    "ul",
    { class: "entry-list" },
    ...sorted.map((t) => {
      const sign = t.kind === "income" || t.kind === "save" ? "+" : "−";
      const what = t.kind === "income" || t.kind === "expense" ? t.category : kindLabel(t.kind);
      const goalName = t.goalId ? goalNames.get(t.goalId) : undefined;
      const detail = [goalName ? `For ${goalName}` : "", t.note ?? ""].filter(Boolean).join(" · ");
      const amount = `${sign}${opts.money(t.amountCents)}`;
      return h(
        "li",
        {},
        h(
          "button",
          {
            type: "button",
            class: "entry",
            "data-id": t.id,
            "aria-label": `${what}, ${amount}, ${shortDate(t.date, opts.today, opts.locale)}${detail ? `, ${detail}` : ""}. Edit`,
            onclick: () => opts.onOpen(t),
          },
          h("span", { class: "entry-date num" }, shortDate(t.date, opts.today, opts.locale)),
          h("span", { class: "entry-main" }, h("span", { class: "entry-what" }, what), detail ? h("span", { class: "entry-note" }, detail) : null),
          h("span", { class: `entry-amount num kind-${t.kind}` }, amount),
        ),
      );
    }),
  );
}

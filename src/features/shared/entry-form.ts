// The quick add form used on Income, Expenses and Savings (SPEC Fast entry):
// amount first, category chips, "Today ▾", "Add note", one button.
import { createAmountInput } from "../../components/amount-input";
import { createChips, type Chips } from "../../components/chips";
import { createDateChip } from "../../components/date-chip";
import { h } from "../../components/dom";
import { openSheet } from "../../components/sheet";
import { EXPENSE_CATEGORIES, INCOME_SOURCES } from "../../domain/categories";
import { monthOf } from "../../domain/months";
import { NOTE_MAX, type Kind } from "../../domain/types";
import type { AppContext, View } from "../../app/context";

export type FormKind = "expense" | "income" | "savings";

export interface EntryForm {
  el: HTMLElement;
  update(view: View): void;
  focusAmount(): void;
}

const BUTTON: Record<Exclude<FormKind, "savings">, string> = { expense: "Add expense", income: "Add income" };

/** Recent categories, with the selected one shown first if it isn't among them. */
function chipList(recent: readonly string[], selected: string): string[] {
  return recent.includes(selected) ? [...recent] : [selected, ...recent].slice(0, 4);
}

export function createEntryForm(kind: FormKind, ctx: AppContext): EntryForm {
  const view = ctx.view();
  const id = `${kind}-form`;
  const amount = createAmountInput({ id: `${id}-amount`, label: "Amount", large: true, locale: ctx.locale });
  const date = createDateChip({ id: `${id}-date`, today: view.today, label: "Date", locale: ctx.locale });
  const error = h("p", { class: "form-error", role: "alert" });

  // Category or direction.
  let direction: Kind = "save";
  let category: string;
  let chips: Chips;
  let moreBtn: HTMLButtonElement | null = null;
  if (kind === "expense") {
    category = view.data.settings.recentExpenseCategories[0] ?? "Groceries";
    moreBtn = h("button", { type: "button", class: "chip", "aria-haspopup": "dialog" }, "More…");
    chips = createChips({
      label: "Category",
      options: chipList(view.data.settings.recentExpenseCategories, category).map((c) => ({ value: c, label: c })),
      value: category,
      onChange: (v) => (category = v),
      extra: moreBtn,
    });
    moreBtn.addEventListener("click", () => {
      const grid = h("div", { class: "category-grid" });
      const sheet = openSheet({ title: "Category", content: [grid] });
      for (const c of EXPENSE_CATEGORIES) {
        grid.append(
          h(
            "button",
            {
              type: "button",
              class: `chip${c === category ? " chip-current" : ""}`,
              "aria-pressed": String(c === category),
              onclick: () => {
                category = c;
                chips.setOptions(chipList(ctx.view().data.settings.recentExpenseCategories, c).map((x) => ({ value: x, label: x })));
                chips.set(c);
                sheet.close();
                amount.focus();
              },
            },
            c,
          ),
        );
      }
    });
  } else if (kind === "income") {
    category = view.data.settings.recentIncomeSource ?? "Salary";
    chips = createChips({ label: "Source", options: INCOME_SOURCES.map((c) => ({ value: c, label: c })), value: category, onChange: (v) => (category = v) });
  } else {
    category = "Savings";
    chips = createChips({
      label: "Direction",
      className: "seg",
      options: [
        { value: "save", label: "Into savings" },
        { value: "withdraw", label: "Take out" },
      ],
      value: "save",
      onChange: (v) => {
        direction = v as Kind;
        submit.textContent = direction === "save" ? "Add to savings" : "Take out of savings";
      },
    });
  }

  // Note, revealed on demand.
  const noteInput = h("input", { id: `${id}-note`, class: "input", type: "text", maxlength: NOTE_MAX, autocomplete: "off", placeholder: "e.g. Weekly shop" });
  const noteField = h("div", { class: "field", hidden: true }, h("label", { class: "field-label", for: `${id}-note` }, "Note"), noteInput);
  const noteBtn = h("button", { type: "button", class: "link-btn", "aria-expanded": "false", "aria-controls": `${id}-note` }, "Add note");
  noteBtn.addEventListener("click", () => {
    noteField.hidden = false;
    noteBtn.hidden = true;
    noteBtn.setAttribute("aria-expanded", "true");
    noteInput.focus();
  });

  const submit = h("button", { type: "submit", class: "btn btn-primary btn-block" }, kind === "savings" ? "Add to savings" : BUTTON[kind]);

  const children = kind === "savings" ? [chips.el, amount.el] : [amount.el, chips.el];
  const form = h(
    "form",
    { class: "card form form-card", novalidate: true, "aria-label": kind === "expense" ? "Add an expense" : kind === "income" ? "Add income" : "Move money" },
    ...children,
    h("div", { class: "form-row" }, date.el, noteBtn),
    noteField,
    error,
    submit,
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    const parsed = amount.read();
    if (!parsed.ok) {
      amount.focus();
      return;
    }
    const entryKind: Kind = kind === "savings" ? direction : kind;
    const when = date.value();
    submit.disabled = true;
    const ok = await ctx.write(
      () =>
        ctx.ledger.addEntry({
          kind: entryKind,
          amountCents: parsed.cents,
          ...(kind === "savings" ? {} : { category }),
          date: when,
          note: noteInput.value,
        }),
      { inline: (m) => (error.textContent = m) },
    );
    submit.disabled = false;
    if (!ok) return;
    amount.clear();
    noteInput.value = "";
    noteField.hidden = true;
    noteBtn.hidden = false;
    noteBtn.setAttribute("aria-expanded", "false");
    date.reset();
    if (monthOf(when) !== ctx.view().month) ctx.shell.setMonth(monthOf(when));
    amount.focus();
  });

  return {
    el: form,
    update(v) {
      date.setToday(v.today);
      if (kind === "expense") {
        chips.setOptions(chipList(v.data.settings.recentExpenseCategories, category).map((c) => ({ value: c, label: c })));
        chips.set(category);
      }
    },
    focusAmount: () => amount.focus(),
  };
}

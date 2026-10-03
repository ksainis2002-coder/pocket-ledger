// Expenses tab (SPEC Screens 3): fast add form, expenses this month, categories with budgets, entries.
import { createAmountInput } from "../../components/amount-input";
import { barRow, hero, sectionTitle } from "../../components/display";
import { h, replaceChildren } from "../../components/dom";
import { entryList } from "../../components/entry-list";
import { openSheet } from "../../components/sheet";
import { budgetPillText, budgetStatus } from "../../domain/budgets";
import { EXPENSE_CATEGORIES } from "../../domain/categories";
import { categoryTotals, inMonth, monthTotals } from "../../domain/totals";
import { moneyFor, type AppContext, type Screen } from "../../app/context";
import { createEntryForm } from "../shared/entry-form";
import { openEntrySheet } from "../shared/entry-sheet";
import { capitalize, monthPhrase, screenEl } from "../shared/util";

export function createExpensesScreen(ctx: AppContext): Screen {
  const el = screenEl("expenses");
  const form = createEntryForm("expense", ctx);
  const summary = h("div", { class: "stack" });
  el.append(form.el, summary);

  return {
    el,
    update(view) {
      form.update(view);
      const { data, month, today } = view;
      const money = moneyFor(data, ctx.locale);
      const total = monthTotals(data.transactions, month).expenses;
      const spent = new Map(categoryTotals(data.transactions, month, "expense").map((c) => [c.category, c.cents]));
      const budgets = new Map(data.budgets.map((b) => [b.category, b.limitCents]));
      const cats = [...new Set([...spent.keys(), ...budgets.keys()])].sort((a, b) => (spent.get(b) ?? 0) - (spent.get(a) ?? 0) || a.localeCompare(b));
      const max = Math.max(1, ...spent.values());
      const entries = data.transactions.filter((t) => t.kind === "expense" && inMonth(t, month));
      const phrase = monthPhrase(month, today, ctx.locale);

      const rows = cats.map((c) => {
        const s = spent.get(c) ?? 0;
        const limit = budgets.get(c);
        if (limit === undefined) {
          return barRow({ label: c, value: money(s), fraction: s / max, tone: "spend", onClick: () => openBudgetSheet(ctx, c), ariaLabel: `${c}: ${money(s)}. Set a budget` });
        }
        const st = budgetStatus(s, limit);
        const pill = budgetPillText(st, limit, money);
        return barRow({ label: c, value: money(s), fraction: st.fraction, tone: st.tone, pill: { text: pill, tone: st.tone }, onClick: () => openBudgetSheet(ctx, c), ariaLabel: `${c}: ${money(s)} spent, ${pill}. Change budget` });
      });

      replaceChildren(
        summary,
        hero(capitalize(`expenses ${phrase}`), money(total)),
        h(
          "section",
          { class: "card" },
          sectionTitle("By category", h("button", { type: "button", class: "btn btn-small", onclick: () => openBudgetSheet(ctx) }, "Set a budget")),
          rows.length ? h("div", { class: "bars" }, ...rows) : h("p", { class: "list-empty" }, "Your spending by category will show here. Use Set a budget to give a category a monthly limit."),
        ),
        h(
          "section",
          { class: "card" },
          sectionTitle("Entries"),
          entryList({ entries, goals: data.goals, today, money, locale: ctx.locale, onOpen: (t) => openEntrySheet(t, ctx), empty: `No expenses ${phrase} yet.` }),
        ),
      );
    },
    shown(reason) {
      // SPEC Fast entry: opening Expenses from the tab bar or the shortcut focuses the amount, on the current month.
      const v = ctx.view();
      if ((reason === "tab" || reason === "program") && v.month === v.today.slice(0, 7)) form.focusAmount();
    },
  };
}

/** Set, change or remove the monthly budget for a category. */
export function openBudgetSheet(ctx: AppContext, category?: string): void {
  const { data } = ctx.view();
  const select = h(
    "select",
    { id: "budget-category", class: "select" },
    ...EXPENSE_CATEGORIES.map((c) => h("option", { value: c, selected: c === (category ?? "Groceries") }, c)),
  );
  const amount = createAmountInput({ id: "budget-amount", label: "Monthly limit", locale: ctx.locale });
  const error = h("p", { class: "form-error", role: "alert" });
  const remove = h("button", { type: "button", class: "btn btn-danger btn-block" }, "Remove budget");
  const syncFor = (c: string): void => {
    const b = data.budgets.find((x) => x.category === c);
    amount.setCents(b ? b.limitCents : null);
    remove.hidden = !b;
  };
  select.addEventListener("change", () => syncFor(select.value));
  syncFor(select.value);

  const form = h(
    "form",
    { class: "form", novalidate: true },
    h("div", { class: "field" }, h("label", { class: "field-label", for: "budget-category" }, "Category"), select),
    amount.el,
    error,
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Save budget"),
    remove,
  );
  const sheet = openSheet({ title: "Monthly budget", content: [form] });
  if (category) amount.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const parsed = amount.read();
    if (!parsed.ok) return amount.focus();
    const ok = await ctx.write(() => ctx.ledger.setBudget(select.value, parsed.cents), { inline: (m) => (error.textContent = m), success: `Budget saved for ${select.value}` });
    if (ok) sheet.close();
  });
  remove.addEventListener("click", async () => {
    const ok = await ctx.write(() => ctx.ledger.removeBudget(select.value), { success: `Budget removed for ${select.value}` });
    if (ok) sheet.close();
  });
}

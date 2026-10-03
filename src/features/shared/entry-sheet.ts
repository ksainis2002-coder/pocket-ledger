// Edit an entry or savings movement in a sheet: amount, date, category (income and expenses),
// note. Delete is here too and uses Undo (SPEC Undo).
import { createAmountInput } from "../../components/amount-input";
import { h } from "../../components/dom";
import { openSheet } from "../../components/sheet";
import { categoriesFor, kindLabel } from "../../domain/categories";
import { monthOf } from "../../domain/months";
import { NOTE_MAX, type Transaction } from "../../domain/types";
import type { AppContext } from "../../app/context";

export function openEntrySheet(t: Transaction, ctx: AppContext): void {
  const { data, today } = ctx.view();
  const goal = t.goalId ? data.goals.find((g) => g.id === t.goalId) : undefined;
  const title = t.kind === "income" ? "Edit income" : t.kind === "expense" ? "Edit expense" : "Edit savings movement";

  const amount = createAmountInput({ id: "edit-amount", label: "Amount", locale: ctx.locale });
  amount.setCents(t.amountCents);

  const dateInput = h("input", { id: "edit-date", class: "input", type: "date", value: t.date, max: today, required: true });
  const dateField = h("div", { class: "field" }, h("label", { class: "field-label", for: "edit-date" }, "Date"), dateInput);

  let categorySelect: HTMLSelectElement | null = null;
  let categoryField: HTMLElement | null = null;
  if (t.kind === "income" || t.kind === "expense") {
    categorySelect = h("select", { id: "edit-category", class: "select" }, ...categoriesFor(t.kind).map((c) => h("option", { value: c, selected: c === t.category }, c)));
    categoryField = h("div", { class: "field" }, h("label", { class: "field-label", for: "edit-category" }, t.kind === "income" ? "Source" : "Category"), categorySelect);
  }

  const noteInput = h("input", { id: "edit-note", class: "input", type: "text", maxlength: NOTE_MAX, value: t.note ?? "", autocomplete: "off" });
  const noteField = h("div", { class: "field" }, h("label", { class: "field-label", for: "edit-note" }, "Note"), noteInput);

  const error = h("p", { class: "form-error", role: "alert" });
  const save = h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Save changes");
  const del = h("button", { type: "button", class: "btn btn-danger btn-block" }, "Delete");

  const kindNote =
    t.kind === "save" || t.kind === "withdraw"
      ? h("p", { class: "sheet-text" }, goal ? `${kindLabel(t.kind)} · For ${goal.name}` : kindLabel(t.kind))
      : null;

  const form = h("form", { class: "form", novalidate: true }, kindNote, amount.el, dateField, categoryField, noteField, error, save, del);
  const sheet = openSheet({ title, content: [form] });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    const parsed = amount.read();
    if (!parsed.ok) return amount.focus();
    save.disabled = true;
    const date = dateInput.value;
    const ok = await ctx.write(
      () =>
        ctx.ledger.editEntry(t.id, {
          amountCents: parsed.cents,
          date,
          ...(categorySelect ? { category: categorySelect.value } : {}),
          note: noteInput.value.trim() === "" ? null : noteInput.value,
        }),
      { inline: (m) => (error.textContent = m) },
    );
    save.disabled = false;
    if (!ok) return;
    sheet.close();
    if (date && monthOf(date) !== ctx.view().month) ctx.shell.setMonth(monthOf(date));
  });

  del.addEventListener("click", async () => {
    error.textContent = "";
    del.disabled = true;
    const ok = await ctx.write(() => ctx.ledger.deleteEntry(t.id), { inline: (m) => (error.textContent = m) });
    del.disabled = false;
    if (ok) sheet.close();
  });
}

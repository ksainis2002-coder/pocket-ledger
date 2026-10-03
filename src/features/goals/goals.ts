// Goals tab (SPEC Screens 5 and Goals and savings rules): create, add, take out, edit, archive, delete.
import { createAmountInput } from "../../components/amount-input";
import { createDateChip } from "../../components/date-chip";
import { emptyState, ring } from "../../components/display";
import { h, replaceChildren } from "../../components/dom";
import { openChoiceSheet, openSheet } from "../../components/sheet";
import { deleteGoalEffects, goalPlan, hasLinkedSaveInMonth, planText } from "../../domain/goals";
import { monthOf } from "../../domain/months";
import { savingsPosition } from "../../domain/totals";
import { GOAL_NAME_MAX, type Goal } from "../../domain/types";
import { moneyFor, type AppContext, type Screen } from "../../app/context";
import { screenEl } from "../shared/util";

export function createGoalsScreen(ctx: AppContext): Screen {
  const el = screenEl("goals");
  const newBtn = h("button", { type: "button", class: "btn btn-primary" }, "New goal");
  newBtn.addEventListener("click", () => openGoalForm(ctx));
  const body = h("div", { class: "stack" });
  el.append(h("div", { class: "section-head" }, h("p", { class: "hero-note" }, "Save toward something specific."), newBtn), body);

  return {
    el,
    update(view) {
      const { data, today } = view;
      const money = moneyFor(data, ctx.locale);
      const active = data.goals.filter((g) => !g.archived).sort((a, b) => a.createdAt - b.createdAt);
      const archived = data.goals.filter((g) => g.archived).sort((a, b) => b.updatedAt - a.updatedAt);

      const card = (g: Goal): HTMLElement => {
        const linked = hasLinkedSaveInMonth(g.id, data.transactions, monthOf(today));
        const plan = goalPlan(g, linked, today);
        const fraction = g.targetCents > 0 ? g.savedCents / g.targetCents : 0;
        const planLine =
          plan.kind === "reached"
            ? h("span", { class: "pill pill-ok" }, "Reached")
            : plan.kind === "passed"
              ? h("span", {}, h("span", { class: "pill pill-bad" }, "Target date passed"), ` ${money(plan.remaining)} still to go`)
              : planText(plan, money, today, ctx.locale);
        const actions = g.archived
          ? h(
              "div",
              { class: "goal-actions" },
              h("button", { type: "button", class: "btn btn-small", onclick: () => unarchive(ctx, g) }, "Unarchive"),
              h("button", { type: "button", class: "btn btn-small btn-danger", onclick: () => openDeleteGoal(ctx, g) }, "Delete"),
            )
          : plan.kind === "reached"
            ? h(
                "div",
                { class: "goal-actions" },
                h("button", { type: "button", class: "btn btn-small btn-primary", onclick: () => openArchive(ctx, g) }, "Archive"),
                h("button", { type: "button", class: "btn btn-small", onclick: () => openMoveSheet(ctx, g, "add") }, "Add"),
                h("button", { type: "button", class: "btn btn-small", "aria-label": `More for ${g.name}`, onclick: () => openGoalMenu(ctx, g) }, "More"),
              )
          : h(
              "div",
              { class: "goal-actions" },
              h("button", { type: "button", class: "btn btn-small btn-primary", onclick: () => openMoveSheet(ctx, g, "add") }, "Add"),
              h("button", { type: "button", class: "btn btn-small", onclick: () => openMoveSheet(ctx, g, "take") }, "Take out"),
              h("button", { type: "button", class: "btn btn-small", "aria-label": `More for ${g.name}`, onclick: () => openGoalMenu(ctx, g) }, "More"),
            );
        return h(
          "article",
          { class: "card goal-card", "data-goal": g.id, "aria-label": g.name },
          h(
            "div",
            { class: "goal-top" },
            h("div", {}, h("h2", { class: "goal-name" }, g.name), h("p", { class: "goal-amounts num" }, `${money(g.savedCents)} of ${money(g.targetCents)}`)),
            ring(fraction, `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}% saved`),
          ),
          g.archived ? null : h("p", { class: "goal-plan" }, planLine),
          actions,
        );
      };

      replaceChildren(
        body,
        active.length
          ? h("div", { class: "goal-grid" }, ...active.map(card))
          : emptyState("No goals yet", "Set a target, like an emergency fund or a trip, and see how much to put aside each month."),
        archived.length
          ? h("details", { class: "archived" }, h("summary", {}, `Archived (${archived.length})`), h("div", { class: "goal-grid" }, ...archived.map(card)))
          : null,
      );
    },
  };
}

function goalFields(ctx: AppContext, g?: Goal) {
  const name = h("input", { id: "goal-name", class: "input", type: "text", maxlength: GOAL_NAME_MAX, required: true, value: g?.name ?? "", placeholder: "e.g. Emergency fund", autocomplete: "off" });
  const target = createAmountInput({ id: "goal-target", label: "Target", locale: ctx.locale });
  const opening = createAmountInput({ id: "goal-opening", label: "Already saved", allowZero: true, placeholder: "0", locale: ctx.locale });
  const due = h("input", { id: "goal-due", class: "input", type: "date", value: g?.dueDate ?? "" });
  if (g) {
    target.setCents(g.targetCents);
    opening.setCents(g.openingCents);
  }
  const fields = [
    h("div", { class: "field" }, h("label", { class: "field-label", for: "goal-name" }, "Name"), name),
    target.el,
    opening.el,
    h("div", { class: "field" }, h("label", { class: "field-label", for: "goal-due" }, "Target date (optional)"), due),
  ];
  return { name, target, opening, due, fields };
}

export function openGoalForm(ctx: AppContext, g?: Goal): void {
  const f = goalFields(ctx, g);
  const error = h("p", { class: "form-error", role: "alert" });
  const form = h("form", { class: "form", novalidate: true }, ...f.fields, error, h("button", { type: "submit", class: "btn btn-primary btn-block" }, g ? "Save changes" : "Create goal"));
  const sheet = openSheet({ title: g ? "Edit goal" : "New goal", content: [form] });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    const target = f.target.read();
    const opening = f.opening.input.value.trim() === "" ? { ok: true as const, cents: 0 } : f.opening.read();
    if (!target.ok) return f.target.focus();
    if (!opening.ok) return f.opening.focus();
    const ok = await ctx.write(
      () =>
        g
          ? ctx.ledger.editGoal(g.id, { name: f.name.value, targetCents: target.cents, openingCents: opening.cents, dueDate: f.due.value || null })
          : ctx.ledger.createGoal({ name: f.name.value, targetCents: target.cents, openingCents: opening.cents, ...(f.due.value ? { dueDate: f.due.value } : {}) }),
      { inline: (m) => (error.textContent = m), success: g ? "Goal saved" : "Goal created" },
    );
    if (ok) sheet.close();
  });
}

function openMoveSheet(ctx: AppContext, g: Goal, mode: "add" | "take"): void {
  const money = moneyFor(ctx.view().data, ctx.locale);
  const amount = createAmountInput({ id: "goal-move-amount", label: "Amount", large: true, locale: ctx.locale });
  const date = createDateChip({ id: "goal-move-date", today: ctx.view().today, label: "Date", locale: ctx.locale });
  const error = h("p", { class: "form-error", role: "alert" });
  const note = mode === "take" ? h("p", { class: "sheet-text" }, `This goal has ${money(g.savedCents)}.`) : null;
  const form = h(
    "form",
    { class: "form", novalidate: true },
    note,
    amount.el,
    h("div", { class: "form-row" }, date.el),
    error,
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, mode === "add" ? `Add to ${g.name}` : `Take out of ${g.name}`),
  );
  const sheet = openSheet({ title: mode === "add" ? `Add to ${g.name}` : `Take out of ${g.name}`, content: [form] });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    const parsed = amount.read();
    if (!parsed.ok) return amount.focus();
    const when = date.value();
    const ok = await ctx.write(() => (mode === "add" ? ctx.ledger.addToGoal(g.id, parsed.cents, when) : ctx.ledger.takeFromGoal(g.id, parsed.cents, when)), {
      inline: (m) => (error.textContent = m),
    });
    if (ok) sheet.close();
  });
}

function openGoalMenu(ctx: AppContext, g: Goal): void {
  const sheet = openChoiceSheet({
    title: g.name,
    choices: [
      { label: "Edit goal", onSelect: () => (sheet.close(), openGoalForm(ctx, g)) },
      { label: "Archive goal", onSelect: () => (sheet.close(), openArchive(ctx, g)) },
      { label: "Delete goal", kind: "danger", onSelect: () => (sheet.close(), openDeleteGoal(ctx, g)) },
    ],
  });
}

/** SPEC Archiving: ask what happened to the money; skip the question when nothing is saved. */
function openArchive(ctx: AppContext, g: Goal): void {
  const money = moneyFor(ctx.view().data, ctx.locale);
  if (g.savedCents <= 0) {
    void ctx.write(() => ctx.ledger.archiveGoal(g.id, "keep"), { success: `${g.name} archived` });
    return;
  }
  const sheet = openChoiceSheet({
    title: `What happened to the ${money(g.savedCents)}?`,
    choices: [
      {
        label: "I spent it",
        note: "Records it as taken out of savings today. Log what you bought as expenses so this month adds up.",
        onSelect: async () => {
          if (await ctx.write(() => ctx.ledger.archiveGoal(g.id, "spent"), { success: `${g.name} archived` })) sheet.close();
        },
      },
      {
        label: "Keep it in savings",
        note: "The money stays in your savings balance as free savings.",
        onSelect: async () => {
          if (await ctx.write(() => ctx.ledger.archiveGoal(g.id, "keep"), { success: `${g.name} archived` })) sheet.close();
        },
      },
    ],
  });
}

function unarchive(ctx: AppContext, g: Goal): void {
  void ctx.write(() => ctx.ledger.unarchiveGoal(g.id), { success: `${g.name} is active again` });
}

/** SPEC Deleting a goal: two choices with real figures. */
function openDeleteGoal(ctx: AppContext, g: Goal): void {
  const { data } = ctx.view();
  const money = moneyFor(data, ctx.locale);
  const free = savingsPosition(data.transactions, data.goals).free;
  const fx = deleteGoalEffects(g, free);
  const keepNote =
    !fx.keepAllowed
      ? `Not enough free savings to keep these movements. Delete the movements too, or add ${money(fx.shortfall)} to savings first.`
      : fx.d > 0
        ? `Your savings balance goes down by ${money(g.openingCents)}. ${money(fx.d)} moves to free savings.`
        : fx.d === 0
          ? `Your savings balance goes down by ${money(g.openingCents)}. Free savings doesn't change.`
          : `Your savings balance goes down by ${money(g.openingCents)}. Free savings goes down by ${money(-fx.d)}.`;
  const sheet = openChoiceSheet({
    title: `Delete ${g.name}?`,
    text: ["Past months will be recalculated."],
    choices: [
      {
        label: "Keep the movements",
        note: keepNote,
        disabled: !fx.keepAllowed,
        onSelect: async () => {
          if (await ctx.write(() => ctx.ledger.deleteGoal(g.id, "keep"), { success: `${g.name} deleted` })) sheet.close();
        },
      },
      {
        label: "Delete the movements too",
        kind: "danger",
        note: `Your savings balance goes down by ${money(g.savedCents)}.`,
        onSelect: async () => {
          if (await ctx.write(() => ctx.ledger.deleteGoal(g.id, "delete"), { success: `${g.name} deleted` })) sheet.close();
        },
      },
    ],
  });
}

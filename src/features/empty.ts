import { h } from "../components/dom";
import type { TabId } from "../app/navigation";

// Phase 0: each tab shows its empty state. The real screens arrive in Phase 2.
const EMPTY: Record<TabId, { heading: string; body: string }> = {
  net: {
    heading: "Nothing to show yet",
    body: "Your net for the month will show here: income, minus expenses, minus what you move to savings.",
  },
  income: {
    heading: "No income yet",
    body: "Salary, bonuses, gifts and other money you receive will be listed here.",
  },
  expenses: {
    heading: "No expenses yet",
    body: "What you spend this month will be listed here by category, with your budgets.",
  },
  savings: {
    heading: "No savings yet",
    body: "Money you move into savings, and take out, will show here with your savings balance.",
  },
  goals: {
    heading: "No goals yet",
    body: "Set a target, like an emergency fund, and see how much to put aside each month.",
  },
};

export function renderEmptyTab(tab: TabId): HTMLElement {
  const copy = EMPTY[tab];
  return h(
    "section",
    { class: "empty", "data-tab": tab },
    h("h2", { class: "empty-heading" }, copy.heading),
    h("p", { class: "empty-body" }, copy.body),
  );
}

import type { Kind } from "./types";

export const EXPENSE_CATEGORIES = [
  "Housing",
  "Groceries",
  "Eating out",
  "Transport",
  "Utilities",
  "Health",
  "Shopping",
  "Entertainment",
  "Travel",
  "Subscriptions",
  "Other",
] as const;

export const INCOME_SOURCES = ["Salary", "Bonus", "Gifts", "Freelance", "Interest", "Other income"] as const;

export const SAVINGS_CATEGORY = "Savings";

export const DEFAULT_RECENT_EXPENSE_CATEGORIES = ["Groceries", "Eating out", "Transport", "Shopping"];

/** Categories allowed for a kind of entry. */
export function categoriesFor(kind: Kind): readonly string[] {
  if (kind === "expense") return EXPENSE_CATEGORIES;
  if (kind === "income") return INCOME_SOURCES;
  return [SAVINGS_CATEGORY];
}

export function isExpenseCategory(c: string): boolean {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(c);
}

/** Move a category to the front of the recent list, keeping at most 4. */
export function bumpRecent(recent: readonly string[], category: string, max = 4): string[] {
  return [category, ...recent.filter((c) => c !== category)].slice(0, max);
}

/** Plain-language label for a kind, used in lists and exports. */
export function kindLabel(kind: Kind): string {
  return { income: "Income", expense: "Expense", save: "Into savings", withdraw: "Taken out" }[kind];
}

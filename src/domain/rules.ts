// Goals and savings rules (SPEC): checks that compare the state before and after a write.
import { savingsPosition } from "./totals";
import type { Goal, Transaction } from "./types";

export type Violation =
  | { code: "goalShort"; goalId: string; goalName: string; availableCents: number }
  | { code: "savingsShort"; shortfallCents: number }
  | { code: "balanceNegative"; shortfallCents: number };

interface SavingsState {
  transactions: readonly Transaction[];
  goals: readonly Goal[];
}

/**
 * Returns the first rule a write breaks, or null.
 * - No goal may end with savedCents below 0.
 * - Free savings and the savings balance may not go below 0. If imported data already left them
 *   negative, a write is only refused when it makes them worse, so unrelated changes still work.
 */
export function checkSavingsRules(before: SavingsState, after: SavingsState): Violation | null {
  const beforeGoals = new Map(before.goals.map((g) => [g.id, g]));
  for (const g of after.goals) {
    if (g.savedCents < 0) {
      const prev = beforeGoals.get(g.id);
      return { code: "goalShort", goalId: g.id, goalName: g.name, availableCents: Math.max(0, prev?.savedCents ?? 0) };
    }
  }
  const b = savingsPosition(before.transactions, before.goals);
  const a = savingsPosition(after.transactions, after.goals);
  if (a.free < 0 && a.free < b.free) {
    const shortfallCents = b.free < 0 ? b.free - a.free : -a.free;
    // With nothing set aside, "short of what's set aside for goals" would be confusing: say the balance goes below zero.
    return a.setAside > 0 ? { code: "savingsShort", shortfallCents } : { code: "balanceNegative", shortfallCents };
  }
  if (a.balance < 0 && a.balance < b.balance) return { code: "balanceNegative", shortfallCents: -a.balance };
  return null;
}

/** The message for a violation (SPEC wording). */
export function violationMessage(v: Violation, money: (cents: number) => string): string {
  switch (v.code) {
    case "goalShort":
      return `This goal only has ${money(v.availableCents)}.`;
    case "savingsShort":
      return `This would leave your savings ${money(v.shortfallCents)} short of what's set aside for goals.`;
    case "balanceNegative":
      return `This would leave your savings balance ${money(v.shortfallCents)} below zero.`;
  }
}

/** SPEC message when "Take out" on the Savings tab is more than free savings. */
export function freeSavingsMessage(freeCents: number, money: (cents: number) => string): string {
  return `Only ${money(Math.max(0, freeCents))} is free. The rest is set aside for goals. To use it, take it out of a goal.`;
}

// Budget progress (SPEC Screens 3): green under 80%, amber from 80%, red at 100% or more.
export interface BudgetStatus {
  tone: "ok" | "warn" | "bad";
  /** 0..1 of the bar. */
  fraction: number;
  /** Cents left, or how much over the limit when `over`. */
  cents: number;
  over: boolean;
}

export function budgetStatus(spentCents: number, limitCents: number): BudgetStatus {
  const over = spentCents > limitCents;
  // Integer comparisons: spent ≥ 80% of the limit  <=>  spent × 5 ≥ limit × 4.
  const tone = spentCents >= limitCents ? "bad" : spentCents * 5 >= limitCents * 4 ? "warn" : "ok";
  return { tone, fraction: limitCents > 0 ? Math.min(1, spentCents / limitCents) : 1, cents: over ? spentCents - limitCents : limitCents - spentCents, over };
}

export function budgetPillText(s: BudgetStatus, limitCents: number, money: (c: number) => string): string {
  return s.over ? `Over by ${money(s.cents)}` : `${money(s.cents)} left of ${money(limitCents)}`;
}

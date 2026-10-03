// Goals: saved amounts, the monthly plan (SPEC Goal plan), and the effects of deleting a goal.
import { DATE_LOCALE, compareMonths, monthLabel, monthOf, monthsInclusive, addMonths, parseDate, type DateStr, type MonthKey } from "./months";
import type { Goal, Transaction } from "./types";

/** savedCents = openingCents + linked saves − linked withdrawals (SPEC invariant). */
export function computeSaved(goal: Pick<Goal, "id" | "openingCents">, transactions: readonly Transaction[]): number {
  let saved = goal.openingCents;
  for (const t of transactions) {
    if (t.goalId !== goal.id) continue;
    if (t.kind === "save") saved += t.amountCents;
    else if (t.kind === "withdraw") saved -= t.amountCents;
  }
  return saved;
}

/** True if the goal has a linked save dated in the given month. */
export function hasLinkedSaveInMonth(goalId: string, transactions: readonly Transaction[], month: MonthKey): boolean {
  return transactions.some((t) => t.goalId === goalId && t.kind === "save" && monthOf(t.date) === month);
}

export type GoalPlan =
  | { kind: "reached"; remaining: number }
  | { kind: "noDate"; remaining: number }
  | { kind: "passed"; remaining: number }
  | { kind: "dueThisMonth"; remaining: number; dueDate: DateStr }
  | { kind: "monthly"; remaining: number; monthly: number; months: number; start: MonthKey; startIsThisMonth: boolean; dueMonth: MonthKey };

/** Integer division rounded up, for non-negative integers. */
const ceilDiv = (a: number, b: number): number => Math.floor((a + b - 1) / b);

export function goalPlan(goal: Pick<Goal, "targetCents" | "savedCents" | "dueDate">, linkedThisMonth: boolean, today: DateStr): GoalPlan {
  const remaining = goal.targetCents - goal.savedCents;
  if (remaining <= 0) return { kind: "reached", remaining: 0 };
  if (!goal.dueDate) return { kind: "noDate", remaining };
  if (goal.dueDate < today) return { kind: "passed", remaining };
  const thisMonth = monthOf(today);
  const dueMonth = monthOf(goal.dueDate);
  if (dueMonth === thisMonth) return { kind: "dueThisMonth", remaining, dueDate: goal.dueDate };
  const start = linkedThisMonth ? addMonths(thisMonth, 1) : thisMonth;
  const months = Math.max(1, monthsInclusive(start, dueMonth));
  return { kind: "monthly", remaining, monthly: ceilDiv(remaining, months), months, start, startIsThisMonth: start === thisMonth, dueMonth };
}

/** The plan line shown on a goal card. `money` formats cents. */
export function planText(plan: GoalPlan, money: (cents: number) => string, today: DateStr, locale?: string): string {
  switch (plan.kind) {
    case "reached":
      return "Reached";
    case "noDate":
      return `${money(plan.remaining)} still to go`;
    case "passed":
      return `Target date passed. ${money(plan.remaining)} still to go`;
    case "dueThisMonth": {
      const d = parseDate(plan.dueDate);
      const label = d ? new Intl.DateTimeFormat(locale ?? DATE_LOCALE, { day: "numeric", month: "short" }).format(new Date(d.year, d.month - 1, d.day)) : plan.dueDate;
      return `${money(plan.remaining)} due by ${label}`;
    }
    case "monthly": {
      const sameYear = plan.start.slice(0, 4) === today.slice(0, 4);
      const start = plan.startIsThisMonth
        ? "this month"
        : sameYear
          ? new Intl.DateTimeFormat(locale ?? DATE_LOCALE, { month: "long" }).format(new Date(Number(plan.start.slice(0, 4)), Number(plan.start.slice(5, 7)) - 1, 1))
          : monthLabel(plan.start, locale);
      return `Put aside ${money(plan.monthly)} a month from ${start} to reach it by ${monthLabel(plan.dueMonth, locale, "short")}`;
    }
  }
}

export interface DeleteGoalEffects {
  /** Change to free savings if the movements are kept: savedCents − openingCents for an active goal. */
  d: number;
  /** Amount free savings would fall short by if the movements are kept (0 if none). */
  shortfall: number;
  /** "Keep the movements" is allowed. */
  keepAllowed: boolean;
}

/** SPEC Deleting a goal: the figures for the confirmation sheet. `freeSavings` is the current free savings. */
export function deleteGoalEffects(goal: Pick<Goal, "savedCents" | "openingCents" | "archived">, freeSavings: number): DeleteGoalEffects {
  // An archived goal isn't set aside, so keeping its movements only removes the opening amount from free savings.
  const d = goal.archived ? -goal.openingCents : goal.savedCents - goal.openingCents;
  const shortfall = d < 0 && freeSavings < -d ? -d - freeSavings : 0;
  return { d, shortfall, keepAllowed: shortfall === 0 };
}

/** Months from today's month through a due date, both included (0 if the date has passed). */
export function monthsUntil(dueDate: DateStr, today: DateStr): number {
  return compareMonths(monthOf(dueDate), monthOf(today)) < 0 ? 0 : monthsInclusive(monthOf(today), monthOf(dueDate));
}

// Totals for a month and for all time (SPEC Concepts). Pure functions over plain records.
import { monthOf, type MonthKey } from "./months";
import type { Goal, Kind, Transaction } from "./types";

export interface MonthTotals {
  income: number;
  expenses: number;
  saves: number;
  withdrawals: number;
  /** saves − withdrawals. Can be negative. */
  netToSavings: number;
  /** income − expenses − net to savings. */
  net: number;
}

export function inMonth(t: Transaction, month: MonthKey): boolean {
  return monthOf(t.date) === month;
}

export function monthTotals(transactions: readonly Transaction[], month: MonthKey): MonthTotals {
  let income = 0;
  let expenses = 0;
  let saves = 0;
  let withdrawals = 0;
  for (const t of transactions) {
    if (!inMonth(t, month)) continue;
    if (t.kind === "income") income += t.amountCents;
    else if (t.kind === "expense") expenses += t.amountCents;
    else if (t.kind === "save") saves += t.amountCents;
    else withdrawals += t.amountCents;
  }
  const netToSavings = saves - withdrawals;
  return { income, expenses, saves, withdrawals, netToSavings, net: income - expenses - netToSavings };
}

/** Totals per category for one kind in one month, largest first. */
export function categoryTotals(transactions: readonly Transaction[], month: MonthKey, kind: Kind): { category: string; cents: number }[] {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind === kind && inMonth(t, month)) map.set(t.category, (map.get(t.category) ?? 0) + t.amountCents);
  }
  return [...map].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category));
}

export interface SavingsPosition {
  /** All saves − all withdrawals + opening amounts of every existing goal (archived included). */
  balance: number;
  /** Saved amounts of goals that aren't archived. */
  setAside: number;
  /** balance − set aside. */
  free: number;
}

export function savingsPosition(transactions: readonly Transaction[], goals: readonly Goal[]): SavingsPosition {
  let balance = 0;
  for (const t of transactions) {
    if (t.kind === "save") balance += t.amountCents;
    else if (t.kind === "withdraw") balance -= t.amountCents;
  }
  let setAside = 0;
  for (const g of goals) {
    balance += g.openingCents;
    if (!g.archived) setAside += g.savedCents;
  }
  return { balance, setAside, free: balance - setAside };
}

export interface AllTimeTotals {
  earned: number;
  spent: number;
  savingsBalance: number;
}

export function allTimeTotals(transactions: readonly Transaction[], goals: readonly Goal[]): AllTimeTotals {
  let earned = 0;
  let spent = 0;
  for (const t of transactions) {
    if (t.kind === "income") earned += t.amountCents;
    else if (t.kind === "expense") spent += t.amountCents;
  }
  return { earned, spent, savingsBalance: savingsPosition(transactions, goals).balance };
}

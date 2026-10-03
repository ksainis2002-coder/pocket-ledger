// Shared builders for tests. Not imported by app code.
import type { Goal, Kind, Transaction } from "../domain/types";

let seq = 0;

export function tx(kind: Kind, amountCents: number, date: string, extra: Partial<Transaction> = {}): Transaction {
  seq += 1;
  const category = kind === "income" ? "Salary" : kind === "expense" ? "Groceries" : "Savings";
  return { id: `t${seq}`, kind, amountCents, category, date, createdAt: seq, updatedAt: seq, ...extra };
}

export function goal(extra: Partial<Goal> = {}): Goal {
  seq += 1;
  const openingCents = extra.openingCents ?? 0;
  return {
    id: `g${seq}`,
    name: "Holiday",
    targetCents: 100_000,
    openingCents,
    savedCents: extra.savedCents ?? openingCents,
    archived: false,
    createdAt: seq,
    updatedAt: seq,
    ...extra,
  };
}

// Speed check (ROADMAP Phase 2): 10,000 entries and 20 goals in real IndexedDB, then time
// an add, an edit and an undo. Bundled and run by e2e/perf.test.mjs; results land on window.__perf.
import { IdbStore } from "./idb-store";
import { Ledger } from "./ledger";
import type { Goal, Transaction } from "../domain/types";

declare global {
  interface Window {
    __perf?: { add: number[]; edit: number[]; undo: number[]; read: number; error?: string };
  }
}

async function run(): Promise<void> {
  const name = "perf-check";
  await IdbStore.deleteDatabase(name);
  const store = await IdbStore.open({ name });
  let ids = 0;
  const ledger = await Ledger.open(store, { now: () => Date.now(), today: () => "2026-10-03", newId: () => `n${++ids}` });

  // Seed: 20 goals, 10,000 transactions over three years, some linked to goals.
  const goals: Goal[] = Array.from({ length: 20 }, (_, i) => ({
    id: `g${i}`,
    name: `Goal ${i}`,
    targetCents: 1_000_000,
    openingCents: 10_000,
    savedCents: 10_000,
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  }));
  const kinds = ["expense", "expense", "expense", "income", "save"] as const;
  const txs: Transaction[] = Array.from({ length: 10_000 }, (_, i) => {
    const kind = kinds[i % kinds.length]!;
    const year = 2024 + (i % 3);
    const month = String((i % 12) + 1).padStart(2, "0");
    const day = String((i % 28) + 1).padStart(2, "0");
    const t: Transaction = {
      id: `t${i}`,
      kind,
      amountCents: 100 + (i % 5_000),
      category: kind === "income" ? "Salary" : kind === "save" ? "Savings" : "Groceries",
      date: `${year}-${month}-${day}`,
      createdAt: i,
      updatedAt: i,
    };
    if (kind === "save" && i % 2 === 0) t.goalId = `g${i % 20}`;
    return t;
  });
  for (const g of goals) g.savedCents = g.openingCents + txs.filter((t) => t.goalId === g.id).reduce((s, t) => s + t.amountCents, 0);
  await store.transact(["transactions", "goals"], "readwrite", async (tx) => {
    await Promise.all([...txs.map((t) => tx.put("transactions", t)), ...goals.map((g) => tx.put("goals", g))]);
  });

  const time = async (fn: () => Promise<unknown>): Promise<number> => {
    const t0 = performance.now();
    await fn();
    return performance.now() - t0;
  };
  const result = { add: [] as number[], edit: [] as number[], undo: [] as number[], read: 0 };
  for (let i = 0; i < 5; i++) {
    let token: { id: string; label: string } | undefined;
    result.add.push(await time(async () => (token = (await ledger.addEntry({ kind: "expense", amountCents: 450, category: "Eating out", date: "2026-10-03" })).undo)));
    result.edit.push(await time(() => ledger.editEntry(`t${i * 5}`, { amountCents: 999 + i })));
    const edit = await ledger.editEntry(`t${i * 5 + 1}`, { amountCents: 777 });
    token = edit.undo;
    result.undo.push(await time(() => ledger.undo(token!)));
  }
  result.read = await time(() => ledger.read());
  store.close();
  window.__perf = result;
}

run().catch((e: unknown) => (window.__perf = { add: [], edit: [], undo: [], read: 0, error: String(e) }));

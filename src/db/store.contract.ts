// Store contract: the behavior every Store must have. Run against MemoryStore in Node
// (src/db/memory-store.test.ts) and against IdbStore in Chromium (npm run e2e).
// No node:assert here, so the same file runs in the browser.
import type { Store } from "./store";

export interface ContractCase {
  name: string;
  run(store: Store): Promise<void>;
}

class ContractFailure extends Error {
  override name = "ContractFailure";
}

function equal(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new ContractFailure(`${what}: expected ${e}, got ${a}`);
}

async function rejects(p: Promise<unknown>, what: string, name?: string): Promise<Error> {
  try {
    await p;
  } catch (e) {
    if (name && (e as Error).name !== name) throw new ContractFailure(`${what}: expected ${name}, got ${(e as Error).name}: ${(e as Error).message}`);
    return e as Error;
  }
  throw new ContractFailure(`${what}: expected it to fail`);
}

const entry = (id: string, amountCents = 100) => ({ id, kind: "expense", amountCents, category: "Groceries", date: "2026-10-03", createdAt: 1, updatedAt: 1 });

export const storeContract: ContractCase[] = [
  {
    name: "put then get and getAll return the stored values",
    async run(store) {
      await store.transact(["transactions"], "readwrite", async (tx) => {
        await tx.put("transactions", entry("a"));
        await tx.put("transactions", entry("b", 200));
      });
      const [a, all] = await store.transact(["transactions"], "readonly", async (tx) =>
        Promise.all([tx.get("transactions", "a"), tx.getAll<{ id: string }>("transactions")]),
      );
      equal(a, entry("a"), "get");
      equal(all.map((x) => x.id), ["a", "b"], "getAll ids in key order");
    },
  },
  {
    name: "put replaces a record with the same key",
    async run(store) {
      await store.transact(["transactions"], "readwrite", (tx) => tx.put("transactions", entry("a", 100)));
      await store.transact(["transactions"], "readwrite", (tx) => tx.put("transactions", entry("a", 999)));
      const all = await store.transact(["transactions"], "readonly", (tx) => tx.getAll<{ amountCents: number }>("transactions"));
      equal(all.map((x) => x.amountCents), [999], "one record, new value");
    },
  },
  {
    name: "values are copies: changing a returned object doesn't change the stored one",
    async run(store) {
      const original = entry("a");
      await store.transact(["transactions"], "readwrite", (tx) => tx.put("transactions", original));
      original.amountCents = 1;
      const got = await store.transact(["transactions"], "readonly", (tx) => tx.get<{ amountCents: number }>("transactions", "a"));
      equal(got?.amountCents, 100, "stored value unaffected by changing the input");
      if (got) got.amountCents = 5;
      const again = await store.transact(["transactions"], "readonly", (tx) => tx.get<{ amountCents: number }>("transactions", "a"));
      equal(again?.amountCents, 100, "stored value unaffected by changing the output");
    },
  },
  {
    name: "delete and clear",
    async run(store) {
      await store.transact(["transactions", "goals"], "readwrite", async (tx) => {
        await tx.put("transactions", entry("a"));
        await tx.put("transactions", entry("b"));
        await tx.put("goals", { id: "g", name: "x" });
      });
      await store.transact(["transactions"], "readwrite", (tx) => tx.delete("transactions", "a"));
      equal(await store.transact(["transactions"], "readonly", (tx) => tx.get("transactions", "a")), undefined, "deleted");
      await store.transact(["transactions"], "readwrite", (tx) => tx.delete("transactions", "missing"));
      await store.transact(["transactions"], "readwrite", (tx) => tx.clear("transactions"));
      const [t, g] = await store.transact(["transactions", "goals"], "readonly", async (tx) => Promise.all([tx.getAll("transactions"), tx.getAll("goals")]));
      equal(t.length, 0, "cleared");
      equal(g.length, 1, "other table untouched");
    },
  },
  {
    name: "the second of three writes fails, and none are saved",
    async run(store) {
      await rejects(
        store.transact(["transactions"], "readwrite", async (tx) => {
          await tx.put("transactions", entry("one"));
          await tx.put("transactions", { kind: "expense" }); // no key: fails
          await tx.put("transactions", entry("three"));
        }),
        "a write without its key",
      );
      const all = await store.transact(["transactions"], "readonly", (tx) => tx.getAll("transactions"));
      equal(all.length, 0, "nothing saved");
    },
  },
  {
    name: "an error thrown by the function rolls back its writes and is passed through",
    async run(store) {
      class Refused extends Error {}
      const err = await rejects(
        store.transact(["transactions", "goals"], "readwrite", async (tx) => {
          await tx.put("transactions", entry("x"));
          await tx.put("goals", { id: "g1", name: "Trip" });
          throw new Refused("no");
        }),
        "a refused write",
      );
      equal(err instanceof Refused, true, "the original error reaches the caller");
      equal(err.message, "no", "with its message");
      const [t, g] = await store.transact(["transactions", "goals"], "readonly", async (tx) => Promise.all([tx.getAll("transactions"), tx.getAll("goals")]));
      equal([t.length, g.length], [0, 0], "nothing saved in either table");
    },
  },
  {
    name: "a read-only transaction can't write",
    async run(store) {
      await rejects(store.transact(["transactions"], "readonly", (tx) => tx.put("transactions", entry("a"))), "write in read-only");
      const all = await store.transact(["transactions"], "readonly", (tx) => tx.getAll("transactions"));
      equal(all.length, 0, "nothing saved");
    },
  },
  {
    name: "each table uses its own key field",
    async run(store) {
      await store.transact(["budgets", "settings"], "readwrite", async (tx) => {
        await tx.put("budgets", { category: "Groceries", limitCents: 35000, updatedAt: 1 });
        await tx.put("settings", { key: "settings", currency: "EUR" });
      });
      const [b, s] = await store.transact(["budgets", "settings"], "readonly", async (tx) =>
        Promise.all([tx.get("budgets", "Groceries"), tx.get("settings", "settings")]),
      );
      equal(b, { category: "Groceries", limitCents: 35000, updatedAt: 1 }, "budget by category");
      equal(s, { key: "settings", currency: "EUR" }, "settings by key");
    },
  },
  {
    name: "transactions that follow each other see each other's writes",
    async run(store) {
      for (let i = 0; i < 5; i++) {
        await store.transact(["settings"], "readwrite", async (tx) => {
          const s = await tx.get<{ key: string; n: number }>("settings", "settings");
          await tx.put("settings", { key: "settings", n: (s?.n ?? 0) + 1 });
        });
      }
      const s = await store.transact(["settings"], "readonly", (tx) => tx.get<{ n: number }>("settings", "settings"));
      equal(s?.n, 5, "five increments");
    },
  },
  {
    name: "concurrent read-modify-write transactions don't lose updates",
    async run(store) {
      await Promise.all(
        Array.from({ length: 10 }, () =>
          store.transact(["settings"], "readwrite", async (tx) => {
            const s = await tx.get<{ key: string; n: number }>("settings", "settings");
            await tx.put("settings", { key: "settings", n: (s?.n ?? 0) + 1 });
          }),
        ),
      );
      const s = await store.transact(["settings"], "readonly", (tx) => tx.get<{ n: number }>("settings", "settings"));
      equal(s?.n, 10, "ten increments");
    },
  },
];

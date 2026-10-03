// Browser entry for running the store contract against IndexedDB (bundled by e2e/store.test.mjs).
// Results land on window.__contract for Playwright to read.
import { IdbStore } from "./idb-store";
import { storeContract } from "./store.contract";
import { StorageError } from "./errors";

interface Result {
  name: string;
  ok: boolean;
  error?: string;
}

declare global {
  interface Window {
    __contract?: Result[];
  }
}

async function fresh(name: string): Promise<IdbStore> {
  await IdbStore.deleteDatabase(name);
  return IdbStore.open({ name });
}

async function runAll(): Promise<Result[]> {
  const results: Result[] = [];
  const record = async (name: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, error: `${(e as Error).name}: ${(e as Error).message}` });
    }
  };

  let i = 0;
  for (const c of storeContract) {
    await record(c.name, async () => {
      const store = await fresh(`contract-${i++}`);
      try {
        await c.run(store);
      } finally {
        store.close();
      }
    });
  }

  // Browser-only behavior.
  await record("data survives closing and reopening the database", async () => {
    const name = "contract-reopen";
    const a = await fresh(name);
    await a.transact(["goals"], "readwrite", (tx) => tx.put("goals", { id: "g", name: "Trip" }));
    a.close();
    const b = await IdbStore.open({ name });
    const g = await b.transact(["goals"], "readonly", (tx) => tx.get<{ name: string }>("goals", "g"));
    b.close();
    if (g?.name !== "Trip") throw new Error("record missing after reopen");
  });

  await record("an upgrade from another window closes this connection and calls onVersionChange", async () => {
    const name = "contract-versionchange";
    await IdbStore.deleteDatabase(name);
    let called = false;
    const store = await IdbStore.open({ name, onVersionChange: () => (called = true) });
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(name, 2);
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    if (!called) throw new Error("onVersionChange was not called");
    let refused = false;
    try {
      await store.transact(["goals"], "readonly", (tx) => tx.getAll("goals"));
    } catch (e) {
      refused = e instanceof StorageError;
    }
    if (!refused) throw new Error("the closed connection still accepted work");
  });

  await record("awaiting something else inside a transaction is reported as a storage error", async () => {
    const store = await fresh("contract-await");
    let failed = false;
    try {
      await store.transact(["goals"], "readwrite", async (tx) => {
        await new Promise((r) => setTimeout(r, 50)); // breaks the rule on purpose
        await tx.put("goals", { id: "late", name: "x" });
      });
    } catch (e) {
      failed = e instanceof StorageError;
    }
    store.close();
    if (!failed) throw new Error("a late write after a non-IndexedDB await was not reported");
  });

  return results;
}

runAll().then(
  (r) => (window.__contract = r),
  (e) => (window.__contract = [{ name: "contract runner", ok: false, error: String(e) }]),
);

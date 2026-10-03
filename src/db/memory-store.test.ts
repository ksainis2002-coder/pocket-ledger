import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "./memory-store";
import { storeContract } from "./store.contract";
import { QuotaError, StorageError } from "./errors";

for (const c of storeContract) {
  test(`store contract (MemoryStore): ${c.name}`, async () => {
    await c.run(new MemoryStore());
  });
}

test("MemoryStore: an injected quota failure maps to QuotaError and saves nothing", async () => {
  const store = new MemoryStore({ failWrite: ({ index }) => index === 1 });
  await assert.rejects(
    store.transact(["transactions"], "readwrite", async (tx) => {
      await tx.put("transactions", { id: "a" });
      await tx.put("transactions", { id: "b" });
    }),
    QuotaError,
  );
  const all = await store.transact(["transactions"], "readonly", (tx) => tx.getAll("transactions"));
  assert.equal(all.length, 0);
});

test("MemoryStore: other engine errors map to StorageError", async () => {
  const store = new MemoryStore();
  await assert.rejects(store.transact(["transactions"], "readwrite", (tx) => tx.put("transactions", {})), StorageError);
});

test("MemoryStore: closed store refuses work", async () => {
  const store = new MemoryStore();
  store.close();
  await assert.rejects(store.transact(["transactions"], "readonly", (tx) => tx.getAll("transactions")), StorageError);
});

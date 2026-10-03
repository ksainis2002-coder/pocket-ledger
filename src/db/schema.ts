// IndexedDB schema. Version 1 has not shipped, so it holds everything in SPEC Data model.
// Any later change needs a new version, an upgrade step below, and a test that upgrades old data.

export const DB_NAME = "pocket-ledger";
export const DB_VERSION = 1;

export function upgrade(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    const tx = db.createObjectStore("transactions", { keyPath: "id" });
    tx.createIndex("date", "date");
    tx.createIndex("kind", "kind");
    tx.createIndex("kind_date", ["kind", "date"]);
    tx.createIndex("goalId", "goalId");
    tx.createIndex("updatedAt", "updatedAt");
    db.createObjectStore("goals", { keyPath: "id" });
    db.createObjectStore("budgets", { keyPath: "category" });
    db.createObjectStore("settings", { keyPath: "key" });
  }
}

// The storage interface repositories use. Two adapters implement it:
// IdbStore (the browser) and MemoryStore (Node tests). Both pass src/db/store.contract.ts.
//
// Rule for everyone writing a transaction function (CLAUDE.md IndexedDB rules):
// inside `transact`, await only the operations on `tx`. Read everything first, compute with pure
// functions, then write. Awaiting anything else lets IndexedDB commit half a write.

export type TableName = "transactions" | "goals" | "budgets" | "settings";

export const TABLES: readonly TableName[] = ["transactions", "goals", "budgets", "settings"];

/** The key field of each table. */
export const KEY_PATH: Record<TableName, string> = {
  transactions: "id",
  goals: "id",
  budgets: "category",
  settings: "key",
};

export interface TxOps {
  get<T>(table: TableName, key: string): Promise<T | undefined>;
  getAll<T>(table: TableName): Promise<T[]>;
  put(table: TableName, value: object): Promise<void>;
  delete(table: TableName, key: string): Promise<void>;
  clear(table: TableName): Promise<void>;
}

export type TxMode = "readonly" | "readwrite";

export interface Store {
  /**
   * Run `fn` in one transaction over `tables`. All or nothing: if `fn` throws or any operation
   * fails, nothing it wrote is saved. Resolves with `fn`'s result once the transaction has committed.
   * Errors are mapped to InputError, RuleError (passed through), QuotaError or StorageError.
   */
  transact<R>(tables: readonly TableName[], mode: TxMode, fn: (tx: TxOps) => Promise<R>): Promise<R>;
  close(): void;
}

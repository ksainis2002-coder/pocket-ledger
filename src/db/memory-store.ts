// In-memory Store for Node tests. Behaves like IndexedDB where it matters:
// values are copied in and out, a transaction is all-or-nothing, transactions run one at a time,
// writes in a read-only transaction fail, and a value without its key fails.
import { mapTransactionError, toAppError } from "./errors";
import { KEY_PATH, TABLES, type Store, type TableName, type TxMode, type TxOps } from "./store";

type Tables = Map<TableName, Map<string, unknown>>;

export interface MemoryStoreOptions {
  /** Test hook: return true to make a write fail with a QuotaExceededError. `index` counts writes in the transaction from 0. */
  failWrite?: (op: { type: "put" | "delete" | "clear"; table: TableName; index: number }) => boolean;
}

function domError(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

export class MemoryStore implements Store {
  private tables: Tables = new Map(TABLES.map((t) => [t, new Map()]));
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(private readonly options: MemoryStoreOptions = {}) {}

  transact<R>(tables: readonly TableName[], mode: TxMode, fn: (tx: TxOps) => Promise<R>): Promise<R> {
    const run = async (): Promise<R> => {
      if (this.closed) throw toAppError(domError("InvalidStateError", "The database is closed"));
      // Work on copies of the tables in scope; swap them in only if everything succeeds.
      const working = new Map<TableName, Map<string, unknown>>();
      for (const t of tables) working.set(t, new Map(this.tables.get(t)));
      let writes = 0;

      const table = (name: TableName): Map<string, unknown> => {
        const m = working.get(name);
        if (!m) throw domError("NotFoundError", `Table ${name} is not part of this transaction`);
        return m;
      };
      const write = (type: "put" | "delete" | "clear", name: TableName): void => {
        if (mode === "readonly") throw domError("ReadOnlyError", "The transaction is read-only");
        const index = writes++;
        if (this.options.failWrite?.({ type, table: name, index })) throw domError("QuotaExceededError", "Quota exceeded");
      };

      const ops: TxOps = {
        get: async <T>(name: TableName, key: string) => {
          const v = table(name).get(key);
          return v === undefined ? undefined : (structuredClone(v) as T);
        },
        getAll: async <T>(name: TableName) =>
          [...table(name)]
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([, v]) => structuredClone(v) as T),
        put: async (name: TableName, value: object) => {
          write("put", name);
          const key = (value as Record<string, unknown>)[KEY_PATH[name]];
          if (typeof key !== "string" || key === "") throw domError("DataError", `Missing key ${KEY_PATH[name]}`);
          table(name).set(key, structuredClone(value));
        },
        delete: async (name: TableName, key: string) => {
          write("delete", name);
          table(name).delete(key);
        },
        clear: async (name: TableName) => {
          write("clear", name);
          table(name).clear();
        },
      };

      try {
        const result = await fn(ops);
        for (const [name, m] of working) this.tables.set(name, m);
        return result;
      } catch (e) {
        throw mapTransactionError(e);
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  close(): void {
    this.closed = true;
  }
}

// The browser Store: IndexedDB with one transaction per `transact` call.
import { StorageError, isAppError, mapTransactionError, toAppError } from "./errors";
import { DB_NAME, DB_VERSION, upgrade } from "./schema";
import type { Store, TableName, TxMode, TxOps } from "./store";

export interface IdbStoreOptions {
  name?: string;
  /** Another window is upgrading the database: this connection has been closed (SPEC App updates). */
  onVersionChange?: () => void;
  /** This window is upgrading, but another window still has the old version open. */
  onBlocked?: () => void;
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}

export class IdbStore implements Store {
  private constructor(private readonly db: IDBDatabase) {}

  static open(options: IdbStoreOptions = {}): Promise<IdbStore> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new StorageError("Can't open your data. This browser has no storage for web apps."));
        return;
      }
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(options.name ?? DB_NAME, DB_VERSION);
      } catch (e) {
        reject(new StorageError("Can't open your data.", { cause: e }));
        return;
      }
      req.onupgradeneeded = (event) => upgrade(req.result, event.oldVersion);
      req.onblocked = () => options.onBlocked?.();
      req.onerror = () => reject(new StorageError("Can't open your data.", { cause: req.error }));
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          options.onVersionChange?.();
        };
        resolve(new IdbStore(db));
      };
    });
  }

  transact<R>(tables: readonly TableName[], mode: TxMode, fn: (tx: TxOps) => Promise<R>): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = this.db.transaction([...tables], mode);
      } catch (e) {
        reject(toAppError(e));
        return;
      }

      let failure: unknown = null;
      let result: R;
      const ops: TxOps = {
        get: (t, key) => request(tx.objectStore(t).get(key)),
        getAll: (t) => request(tx.objectStore(t).getAll()),
        put: async (t, value) => {
          await request(tx.objectStore(t).put(value));
        },
        delete: async (t, key) => {
          await request(tx.objectStore(t).delete(key));
        },
        clear: async (t) => {
          await request(tx.objectStore(t).clear());
        },
      };

      const done = Promise.resolve()
        .then(() => fn(ops))
        .then(
          (r) => {
            result = r;
          },
          (e) => {
            failure = mapTransactionError(e);
            try {
              tx.abort();
            } catch {
              // Already finished or aborting.
            }
            throw failure;
          },
        );
      done.catch(() => undefined);

      tx.oncomplete = () => {
        // If `fn` awaited something other than IndexedDB, the transaction may commit before `fn` ends.
        // Wait for it, and report a late failure as a storage error (part of the write may be saved).
        done.then(
          () => resolve(result),
          (e) => reject(isAppError(e) ? e : new StorageError("Part of a change may not have been saved. Reload and check your entries.", { cause: e })),
        );
      };
      tx.onabort = () => reject(failure ?? toAppError(tx.error));
    });
  }

  close(): void {
    this.db.close();
  }

  /** Delete a database (tests and "Delete all data"). */
  static deleteDatabase(name = DB_NAME): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new StorageError("Couldn't delete your data.", { cause: req.error }));
      req.onblocked = () => undefined;
    });
  }
}

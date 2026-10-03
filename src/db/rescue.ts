// Best-effort export when the database won't open normally (SPEC Storage errors): read each table
// on its own, skip the ones that fail, and build a normal backup file from whatever was read.
import { settingsForExport } from "../domain/sync";
import { SCHEMA_VERSION, type Budget, type Goal, type Settings, type Transaction } from "../domain/types";
import type { BackupFile } from "../domain/backup";
import { detectDeviceName } from "../domain/device";
import { DB_NAME } from "./schema";

function readStore<T>(db: IDBDatabase, name: string): Promise<T[] | null> {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(name, "readonly").objectStore(name).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export interface RescueResult {
  file: BackupFile;
  /** Tables that couldn't be read. */
  missing: string[];
}

/** Returns null if nothing at all could be read. */
export async function rescueExport(now = Date.now()): Promise<RescueResult | null> {
  let db: IDBDatabase;
  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME); // no version: open whatever is there, never upgrade
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        req.transaction?.abort(); // there was no database; don't create one
      };
    });
  } catch {
    return null;
  }
  const [transactions, goals, budgets, settingsRows] = await Promise.all([
    readStore<Transaction>(db, "transactions"),
    readStore<Goal>(db, "goals"),
    readStore<Budget>(db, "budgets"),
    readStore<Settings>(db, "settings"),
  ]);
  db.close();
  if (!transactions && !goals && !budgets && !settingsRows) return null;
  const settings = settingsRows?.find((s) => s.key === "settings");
  const id = `rescue-${now.toString(36)}`;
  const file: BackupFile = {
    app: "pocket-ledger",
    formatVersion: 1,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    fromDevice: { id: settings?.deviceId ?? "unknown", name: settings?.deviceName ?? detectDeviceName(navigator.userAgent, navigator.maxTouchPoints ?? 0) },
    state: { id, lineage: [{ id, at: now }] },
    data: {
      transactions: transactions ?? [],
      goals: goals ?? [],
      budgets: budgets ?? [],
      settings: settings ? settingsForExport(settings) : { schemaVersion: SCHEMA_VERSION, currency: "EUR", recentExpenseCategories: [] },
    },
  };
  const missing = [!transactions && "entries", !goals && "goals", !budgets && "budgets"].filter((x): x is string => Boolean(x));
  return { file, missing };
}

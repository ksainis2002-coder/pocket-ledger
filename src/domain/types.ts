// The data model (SPEC Data model). Amounts are integer cents; dates are local "YYYY-MM-DD".

export type Kind = "income" | "expense" | "save" | "withdraw";

export interface Transaction {
  id: string;
  kind: Kind;
  amountCents: number;
  category: string;
  date: string;
  note?: string;
  goalId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Goal {
  id: string;
  name: string;
  targetCents: number;
  openingCents: number;
  savedCents: number;
  dueDate?: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Budget {
  category: string;
  limitCents: number;
  updatedAt: number;
}

/** A data state this device has held (SPEC Phone and PC). `at` is when this device took it on: its export, or its import. */
export interface StateRef {
  id: string;
  at: number;
}

/** A delete since the last import, for the "what would be lost" list. */
export interface DeleteRecord {
  at: number;
  what: "entry" | "goal" | "budget";
}

export type Theme = "system" | "light" | "dark";

export interface Settings {
  key: "settings";
  currency: string;
  locale?: string;
  theme: Theme;
  lastBackupAt?: number;
  backupSnoozedUntil?: number;
  iosBrowserAcknowledged?: boolean;
  deviceId: string;
  deviceName: string;
  stateLineage: StateRef[];
  changesSinceSync: number;
  deleteLog: DeleteRecord[];
  lastSyncAt?: number;
  lastImport?: { fromDeviceName: string; exportedAt: number; importedAt: number };
  recentExpenseCategories: string[];
  recentIncomeSource?: string;
  schemaVersion: number;
}

/** Everything the app stores, as plain arrays. */
export interface LedgerData {
  transactions: Transaction[];
  goals: Goal[];
  budgets: Budget[];
  settings: Settings;
}

/** Largest amount: 99,999,999.99. */
export const MAX_CENTS = 9_999_999_999;
export const NOTE_MAX = 80;
export const GOAL_NAME_MAX = 40;
export const SCHEMA_VERSION = 1;
export const LINEAGE_MAX = 50;
export const DELETE_LOG_MAX = 2000;

/** Settings that travel with the data in a backup. Everything else stays on the device (SPEC Phone and PC). */
export const TRAVELING_SETTINGS = ["currency", "locale", "recentExpenseCategories", "recentIncomeSource"] as const;
export type TravelingSettings = Pick<Settings, (typeof TRAVELING_SETTINGS)[number]>;

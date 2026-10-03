// Backup files (SPEC Backup): building, validating, previewing a restore, and the backup reminder.
// Pure functions; the Ledger and the screens do the reading, writing and sharing.
import { EXPENSE_CATEGORIES, INCOME_SOURCES, categoriesFor } from "./categories";
import { isValidDate, type DateStr } from "./months";
import { lossCutoff, lostSince, nextExportState, restoreSafety, restoreWarning, settingsForExport, type LossList, type RestoreSafety } from "./sync";
import { GOAL_NAME_MAX, MAX_CENTS, NOTE_MAX, SCHEMA_VERSION, type Budget, type Goal, type Kind, type LedgerData, type StateRef, type Transaction, type TravelingSettings } from "./types";

export interface BackupFile {
  app: "pocket-ledger";
  formatVersion: 1;
  schemaVersion: number;
  exportedAt: number;
  fromDevice: { id: string; name: string };
  state: { id: string; lineage: StateRef[] };
  data: {
    transactions: Transaction[];
    goals: Goal[];
    budgets: Budget[];
    settings: TravelingSettings & { schemaVersion: number };
  };
}

/** What an export changes on this device once the file is really delivered. */
export interface ExportCommit {
  lineage: StateRef[];
  /** changesSinceSync when the file was built; changes made after that stay unsent. */
  changesAtBuild: number;
}

export function buildBackup(data: LedgerData, now: number, newId: () => string): { file: BackupFile; commit: ExportCommit } {
  const s = data.settings;
  const st = nextExportState(s, newId, now);
  const file: BackupFile = {
    app: "pocket-ledger",
    formatVersion: 1,
    schemaVersion: s.schemaVersion,
    exportedAt: now,
    fromDevice: { id: s.deviceId, name: s.deviceName },
    state: { id: st.id, lineage: st.lineage },
    data: { transactions: data.transactions, goals: data.goals, budgets: data.budgets, settings: settingsForExport(s) },
  };
  return { file, commit: { lineage: st.lineage, changesAtBuild: s.changesSinceSync } };
}

export function backupFileName(today: DateStr): string {
  return `pocket-ledger-backup-${today}.json`;
}

export function csvFileName(today: DateStr): string {
  return `pocket-ledger-transactions-${today}.csv`;
}

// ---------- Validation ----------

export type ValidationResult = { ok: true; file: BackupFile } | { ok: false; message: string };

const NOT_A_BACKUP = "This file isn't a Pocket Ledger backup.";
const KINDS: readonly Kind[] = ["income", "expense", "save", "withdraw"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isCents = (v: unknown, min: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= MAX_CENTS;

class Invalid extends Error {}
const fail = (message: string): never => {
  throw new Invalid(message);
};

/**
 * Check every part of a parsed backup before anything is changed (SPEC Import step 1).
 * Returns a clean copy (unknown fields dropped) or the first problem as one plain sentence.
 */
export function validateBackup(input: unknown): ValidationResult {
  try {
    if (!isObj(input) || input["app"] !== "pocket-ledger" || input["formatVersion"] !== 1) fail(NOT_A_BACKUP);
    const root = input as Obj;
    const schemaVersion = root["schemaVersion"];
    if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion) || schemaVersion < 1) fail(NOT_A_BACKUP);
    if ((schemaVersion as number) > SCHEMA_VERSION) fail("This backup was made by a newer version of Pocket Ledger. Update the app, then try again.");
    if (!isTime(root["exportedAt"])) fail(NOT_A_BACKUP);
    const fromDevice = root["fromDevice"];
    if (!isObj(fromDevice) || !isNonEmpty(fromDevice["id"]) || !isNonEmpty(fromDevice["name"])) fail(NOT_A_BACKUP);
    const state = root["state"];
    if (!isObj(state) || !isNonEmpty(state["id"]) || !Array.isArray(state["lineage"])) fail(NOT_A_BACKUP);
    const lineage = (state as Obj)["lineage"] as unknown[];
    const cleanLineage: StateRef[] = lineage.map((s) => {
      if (!isObj(s) || !isNonEmpty(s["id"]) || !isTime(s["at"])) return fail(NOT_A_BACKUP);
      return { id: s["id"] as string, at: s["at"] as number };
    });
    if (cleanLineage[cleanLineage.length - 1]?.id !== (state as Obj)["id"]) fail(NOT_A_BACKUP);

    const data = root["data"];
    if (!isObj(data) || !Array.isArray(data["transactions"]) || !Array.isArray(data["goals"]) || !Array.isArray(data["budgets"]) || !isObj(data["settings"])) fail(NOT_A_BACKUP);
    const d = data as Obj;

    // Goals first, so entries can be checked against them.
    const goalIds = new Set<string>();
    const goals: Goal[] = (d["goals"] as unknown[]).map((raw, i) => {
      const n = i + 1;
      if (!isObj(raw)) return fail(`Goal ${n} is damaged.`);
      const id = raw["id"];
      if (!isNonEmpty(id) || goalIds.has(id)) fail(`Goal ${n} has a missing or repeated id.`);
      goalIds.add(id as string);
      const name = raw["name"];
      if (!isStr(name) || name.trim() === "" || name.length > GOAL_NAME_MAX) fail(`Goal ${n} has an invalid name.`);
      if (!isCents(raw["targetCents"], 1)) fail(`Goal ${n} has an invalid target.`);
      if (!isCents(raw["openingCents"], 0)) fail(`Goal ${n} has an invalid "already saved" amount.`);
      const saved = raw["savedCents"];
      if (typeof saved !== "number" || !Number.isSafeInteger(saved)) fail(`Goal ${n} has an invalid saved amount.`);
      if (raw["dueDate"] !== undefined && (!isStr(raw["dueDate"]) || !isValidDate(raw["dueDate"]))) fail(`Goal ${n} has an invalid target date.`);
      if (typeof raw["archived"] !== "boolean") fail(`Goal ${n} is damaged.`);
      if (!isTime(raw["createdAt"]) || !isTime(raw["updatedAt"])) fail(`Goal ${n} is damaged.`);
      const g: Goal = {
        id: id as string,
        name: name as string,
        targetCents: raw["targetCents"] as number,
        openingCents: raw["openingCents"] as number,
        savedCents: saved as number,
        archived: raw["archived"] as boolean,
        createdAt: raw["createdAt"] as number,
        updatedAt: raw["updatedAt"] as number,
      };
      if (raw["dueDate"] !== undefined) g.dueDate = raw["dueDate"] as string;
      return g;
    });

    const txIds = new Set<string>();
    const transactions: Transaction[] = (d["transactions"] as unknown[]).map((raw, i) => {
      const n = i + 1;
      if (!isObj(raw)) return fail(`Entry ${n} is damaged.`);
      const id = raw["id"];
      if (!isNonEmpty(id) || txIds.has(id)) fail(`Entry ${n} has a missing or repeated id.`);
      txIds.add(id as string);
      const kind = raw["kind"];
      if (!KINDS.includes(kind as Kind)) fail(`Entry ${n} has an unknown type.`);
      if (!isCents(raw["amountCents"], 1)) fail(`Entry ${n} has an invalid amount.`);
      if (!isStr(raw["category"]) || !categoriesFor(kind as Kind).includes(raw["category"])) fail(`Entry ${n} has an unknown category.`);
      if (!isStr(raw["date"]) || !isValidDate(raw["date"])) fail(`Entry ${n} has an invalid date.`);
      if (raw["note"] !== undefined && (!isStr(raw["note"]) || raw["note"].length > NOTE_MAX)) fail(`Entry ${n} has an invalid note.`);
      const goalId = raw["goalId"];
      if (goalId !== undefined) {
        if (kind !== "save" && kind !== "withdraw") fail(`Entry ${n} is linked to a goal but isn't a savings movement.`);
        if (!isStr(goalId) || !goalIds.has(goalId)) fail(`Entry ${n} is linked to a goal that isn't in the file.`);
      }
      if (!isTime(raw["createdAt"]) || !isTime(raw["updatedAt"])) fail(`Entry ${n} is damaged.`);
      const t: Transaction = {
        id: id as string,
        kind: kind as Kind,
        amountCents: raw["amountCents"] as number,
        category: raw["category"] as string,
        date: raw["date"] as string,
        createdAt: raw["createdAt"] as number,
        updatedAt: raw["updatedAt"] as number,
      };
      if (raw["note"] !== undefined && raw["note"] !== "") t.note = raw["note"] as string;
      if (goalId !== undefined) t.goalId = goalId as string;
      return t;
    });

    const budgetCats = new Set<string>();
    const budgets: Budget[] = (d["budgets"] as unknown[]).map((raw, i) => {
      const n = i + 1;
      if (!isObj(raw)) return fail(`Budget ${n} is damaged.`);
      const c = raw["category"];
      if (!isStr(c) || !(EXPENSE_CATEGORIES as readonly string[]).includes(c) || budgetCats.has(c)) fail(`Budget ${n} has an unknown or repeated category.`);
      budgetCats.add(c as string);
      if (!isCents(raw["limitCents"], 1)) fail(`Budget ${n} has an invalid limit.`);
      if (!isTime(raw["updatedAt"])) fail(`Budget ${n} is damaged.`);
      return { category: c as string, limitCents: raw["limitCents"] as number, updatedAt: raw["updatedAt"] as number };
    });

    const s = d["settings"] as Obj;
    if (!isStr(s["currency"]) || !/^[A-Z]{3}$/.test(s["currency"])) fail("The backup's settings are damaged.");
    if (s["locale"] !== undefined && !isStr(s["locale"])) fail("The backup's settings are damaged.");
    const recent = s["recentExpenseCategories"];
    if (!Array.isArray(recent) || recent.some((c) => !(EXPENSE_CATEGORIES as readonly string[]).includes(c))) fail("The backup's settings are damaged.");
    if (s["recentIncomeSource"] !== undefined && !(INCOME_SOURCES as readonly unknown[]).includes(s["recentIncomeSource"])) fail("The backup's settings are damaged.");
    const settings: TravelingSettings & { schemaVersion: number } = {
      schemaVersion: schemaVersion as number,
      currency: s["currency"] as string,
      recentExpenseCategories: (recent as string[]).slice(0, 4),
    };
    if (s["locale"] !== undefined) settings.locale = s["locale"] as string;
    if (s["recentIncomeSource"] !== undefined) settings.recentIncomeSource = s["recentIncomeSource"] as string;

    return {
      ok: true,
      file: {
        app: "pocket-ledger",
        formatVersion: 1,
        schemaVersion: schemaVersion as number,
        exportedAt: root["exportedAt"] as number,
        fromDevice: { id: (fromDevice as Obj)["id"] as string, name: (fromDevice as Obj)["name"] as string },
        state: { id: (state as Obj)["id"] as string, lineage: cleanLineage },
        data: { transactions, goals, budgets, settings },
      },
    };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, message: e.message };
    throw e;
  }
}

/** Parse the text of a picked file and validate it. */
export function readBackupText(text: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { ok: false, message: NOT_A_BACKUP };
  }
  return validateBackup(parsed);
}

// ---------- Restore preview ----------

export interface RestorePreview {
  fromDeviceName: string;
  /** "12 minutes ago", "yesterday", "3 Oct". */
  madeAgo: string;
  counts: { transactions: number; goals: number; budgets: number };
  newestEntryDate?: DateStr;
  safety: RestoreSafety;
  /** Set when it isn't safe to restore. */
  warning?: string;
  loss?: LossList;
  /** SPEC Import step 3. */
  older?: { count: number; since: number };
}

/** "just now", "12 minutes ago", "3 hours ago", "yesterday", "4 days ago", or a date. */
export function timeAgo(then: number, now: number, locale = "en-GB"): string {
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(then));
}

export function restorePreview(current: LedgerData, file: BackupFile, now: number, money: (cents: number) => string, locale?: string): RestorePreview {
  const hasData = current.transactions.length + current.goals.length + current.budgets.length > 0;
  const safety = restoreSafety({ hasData, stateLineage: current.settings.stateLineage, changesSinceSync: current.settings.changesSinceSync }, file.state.lineage);
  const newest = file.data.transactions.reduce<string | undefined>((m, t) => (m === undefined || t.date > m ? t.date : m), undefined);
  const preview: RestorePreview = {
    fromDeviceName: file.fromDevice.name,
    madeAgo: timeAgo(file.exportedAt, now),
    counts: { transactions: file.data.transactions.length, goals: file.data.goals.length, budgets: file.data.budgets.length },
    safety,
  };
  if (newest) preview.newestEntryDate = newest;
  if (!safety.safe) {
    preview.warning = restoreWarning(safety, current.settings.deviceName, file.fromDevice.name);
    const cutoff = lossCutoff(current.settings.stateLineage, file.state.lineage, current.settings.lastImport);
    preview.loss = lostSince({ ...current, deleteLog: current.settings.deleteLog }, cutoff, money, locale);
  }
  if (hasData) {
    const newer = current.transactions.filter((t) => t.updatedAt > file.exportedAt);
    if (newer.length > 0) preview.older = { count: newer.length, since: file.exportedAt };
  }
  return preview;
}

// ---------- Reminder ----------

export interface ReminderStatus {
  due: boolean;
  /** Whole days since the last backup, if there was one. */
  daysSince?: number;
}

const DAY = 86_400_000;

/** SPEC Reminder: when to show the backup banner. */
export function backupReminder(
  now: number,
  settings: { lastBackupAt?: number; backupSnoozedUntil?: number },
  changedCount: number,
  totalCount: number,
): ReminderStatus {
  const daysSince = settings.lastBackupAt === undefined ? undefined : Math.floor((now - settings.lastBackupAt) / DAY);
  const base: ReminderStatus = daysSince === undefined ? { due: false } : { due: false, daysSince };
  if (settings.backupSnoozedUntil !== undefined && settings.backupSnoozedUntil > now) return base;
  if (settings.lastBackupAt === undefined) return { ...base, due: totalCount >= 10 };
  if ((daysSince ?? 0) >= 30 && changedCount >= 1) return { ...base, due: true };
  if (changedCount >= 50) return { ...base, due: true };
  return base;
}

export function reminderText(r: ReminderStatus): string {
  if (r.daysSince === undefined) return "No backup yet.";
  if (r.daysSince === 0) return "Last backup today, with many changes since.";
  return `Last backup ${r.daysSince} day${r.daysSince === 1 ? "" : "s"} ago.`;
}

export const SNOOZE_MS = 7 * DAY;

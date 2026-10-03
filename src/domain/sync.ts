// Moving data between phone and PC (SPEC Phone and PC): state lineage, restore safety,
// the list of what a restore would lose, and which settings travel with the data. Pure functions.
import { kindLabel } from "./categories";
import { DATE_LOCALE, parseDate } from "./months";
import {
  LINEAGE_MAX,
  TRAVELING_SETTINGS,
  type Budget,
  type DeleteRecord,
  type Goal,
  type Settings,
  type StateRef,
  type Transaction,
  type TravelingSettings,
} from "./types";

type SyncFields = Pick<Settings, "stateLineage" | "changesSinceSync">;

const currentId = (lineage: readonly StateRef[]): string | undefined => lineage[lineage.length - 1]?.id;

/**
 * The state an export carries. A new state only when something changed since the last export or
 * import; otherwise the current one is reused, so repeated backups don't look like new data.
 */
export function nextExportState(settings: SyncFields, newId: () => string, now: number): { id: string; lineage: StateRef[]; created: boolean } {
  const current = currentId(settings.stateLineage);
  if (current && settings.changesSinceSync === 0) return { id: current, lineage: settings.stateLineage.map((s) => ({ ...s })), created: false };
  const id = newId();
  return { id, lineage: [...settings.stateLineage.map((s) => ({ ...s })), { id, at: now }].slice(-LINEAGE_MAX), created: true };
}

export type RestoreSafety =
  | { safe: true }
  | { safe: false; reason: "unsentChanges"; changes: number }
  | { safe: false; reason: "neverReceived" };

/**
 * Safe when this device has no data, or it has no unsent changes and its current state
 * is in the incoming file's lineage (the other device received everything this one had).
 */
export function restoreSafety(device: SyncFields & { hasData: boolean }, fileLineage: readonly StateRef[]): RestoreSafety {
  if (!device.hasData) return { safe: true };
  if (device.changesSinceSync > 0) return { safe: false, reason: "unsentChanges", changes: device.changesSinceSync };
  const current = currentId(device.stateLineage);
  if (current && fileLineage.some((s) => s.id === current)) return { safe: true };
  return { safe: false, reason: "neverReceived" };
}

export function restoreWarning(s: Exclude<RestoreSafety, { safe: true }>, deviceName: string, fromDeviceName: string): string {
  return s.reason === "unsentChanges"
    ? `You made ${s.changes} change${s.changes === 1 ? "" : "s"} on this ${deviceName} since you last sent or received data. Restoring will lose them.`
    : `This ${deviceName} has data your ${fromDeviceName} never received. Restoring will lose it.`;
}

/**
 * From when changes on this device are at risk: the time this device took on its newest state
 * that the file also has; else the last import; else everything (-Infinity).
 */
export function lossCutoff(deviceLineage: readonly StateRef[], fileLineage: readonly StateRef[], lastImport: Settings["lastImport"]): number {
  const fileIds = new Set(fileLineage.map((s) => s.id));
  for (let i = deviceLineage.length - 1; i >= 0; i--) {
    const s = deviceLineage[i];
    if (s && fileIds.has(s.id)) return s.at;
  }
  return lastImport?.importedAt ?? -Infinity;
}

export interface LossList {
  /** Every affected entry, newest first. */
  lines: string[];
  /** The first 10, for the preview. */
  shown: string[];
  /** How many more beyond the shown ones. */
  more: number;
  /** Entries deleted after the cutoff. */
  deleted: number;
  /** Goals and budgets created, changed or deleted after the cutoff. */
  goalBudgetChanges: number;
  /** Plain text for "Copy list". */
  copyText: string;
}

/** What a restore would lose on this device: everything changed after `cutoff` (epoch ms). */
export function lostSince(
  data: { transactions: readonly Transaction[]; goals: readonly Goal[]; budgets: readonly Budget[]; deleteLog: readonly DeleteRecord[] },
  cutoff: number,
  money: (cents: number) => string,
  locale?: string,
): LossList {
  const changed = data.transactions.filter((t) => t.updatedAt > cutoff).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
  const dayFmt = new Intl.DateTimeFormat(locale ?? DATE_LOCALE, { day: "numeric", month: "short" });
  const lines = changed.map((t) => {
    const d = parseDate(t.date);
    const day = d ? dayFmt.format(new Date(d.year, d.month - 1, d.day)) : t.date;
    const what = t.kind === "income" || t.kind === "expense" ? t.category : kindLabel(t.kind);
    return [day, what, money(t.amountCents), t.note].filter(Boolean).join(" · ");
  });
  const recentDeletes = data.deleteLog.filter((d) => d.at > cutoff);
  const deleted = recentDeletes.filter((d) => d.what === "entry").length;
  const goalBudgetChanges =
    data.goals.filter((g) => g.updatedAt > cutoff).length +
    data.budgets.filter((b) => b.updatedAt > cutoff).length +
    recentDeletes.filter((d) => d.what !== "entry").length;
  const extra = [
    deleted > 0 ? `${deleted} deleted entr${deleted === 1 ? "y" : "ies"}` : "",
    goalBudgetChanges > 0 ? `${goalBudgetChanges} goal or budget change${goalBudgetChanges === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return { lines, shown: lines.slice(0, 10), more: Math.max(0, lines.length - 10), deleted, goalBudgetChanges, copyText: [...lines, ...extra].join("\n") };
}

/** The settings a backup carries: only the ones that travel with the data. */
export function settingsForExport(settings: Settings): TravelingSettings & { schemaVersion: number } {
  const out: Record<string, unknown> = { schemaVersion: settings.schemaVersion };
  for (const k of TRAVELING_SETTINGS) if (settings[k] !== undefined) out[k] = settings[k];
  return out as TravelingSettings & { schemaVersion: number };
}

/**
 * This device's settings after importing a file: traveling settings come from the file, everything
 * else stays; the device takes on the file's lineage (the newest state stamped with `now`), and the
 * sync counters start again.
 */
export function settingsAfterImport(
  device: Settings,
  file: { settings: Partial<TravelingSettings>; state: { lineage: readonly StateRef[] }; fromDevice: { name: string }; exportedAt: number },
  now: number,
): Settings {
  const next: Settings = { ...device };
  for (const k of TRAVELING_SETTINGS) {
    const v = file.settings[k];
    if (v === undefined) delete next[k];
    else (next as unknown as Record<string, unknown>)[k] = Array.isArray(v) ? [...v] : v;
  }
  if (next.currency === undefined) next.currency = device.currency;
  if (next.recentExpenseCategories === undefined) next.recentExpenseCategories = [...device.recentExpenseCategories];
  const lineage = file.state.lineage.map((s) => ({ ...s }));
  const last = lineage[lineage.length - 1];
  if (last) last.at = now;
  next.stateLineage = lineage;
  next.changesSinceSync = 0;
  next.deleteLog = [];
  next.lastImport = { fromDeviceName: file.fromDevice.name, exportedAt: file.exportedAt, importedAt: now };
  next.lastSyncAt = now;
  return next;
}

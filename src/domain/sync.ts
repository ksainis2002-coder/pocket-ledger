// Moving data between phone and PC (SPEC Phone and PC): state lineage, restore safety,
// and the list of what a restore would lose. Pure functions.
import { kindLabel } from "./categories";
import { parseDate } from "./months";
import { LINEAGE_MAX, type Settings, type Transaction } from "./types";

type SyncFields = Pick<Settings, "stateLineage" | "changesSinceSync">;

/** The state id an export carries. A new id only when something changed since the last export or import. */
export function nextExportState(settings: SyncFields, newId: () => string): { id: string; lineage: string[]; created: boolean } {
  const current = settings.stateLineage[settings.stateLineage.length - 1];
  if (current && settings.changesSinceSync === 0) return { id: current, lineage: [...settings.stateLineage], created: false };
  const id = newId();
  return { id, lineage: [...settings.stateLineage, id].slice(-LINEAGE_MAX), created: true };
}

export type RestoreSafety =
  | { safe: true }
  | { safe: false; reason: "unsentChanges"; changes: number }
  | { safe: false; reason: "neverReceived" };

/**
 * Safe when this device has no data, or it has no unsent changes and its current state
 * is in the incoming file's lineage (the other device received everything this one had).
 */
export function restoreSafety(device: SyncFields & { hasData: boolean }, fileLineage: readonly string[]): RestoreSafety {
  if (!device.hasData) return { safe: true };
  if (device.changesSinceSync > 0) return { safe: false, reason: "unsentChanges", changes: device.changesSinceSync };
  const current = device.stateLineage[device.stateLineage.length - 1];
  if (current && fileLineage.includes(current)) return { safe: true };
  return { safe: false, reason: "neverReceived" };
}

export function restoreWarning(s: Exclude<RestoreSafety, { safe: true }>, deviceName: string, fromDeviceName: string): string {
  const here = `this ${deviceName}`;
  return s.reason === "unsentChanges"
    ? `You made ${s.changes} change${s.changes === 1 ? "" : "s"} on ${here} since you last sent or received data. Restoring will lose them.`
    : `This ${deviceName} has data your ${fromDeviceName} never received. Restoring will lose it.`;
}

export interface LossList {
  /** Every affected entry, newest first. */
  lines: string[];
  /** The first 10, for the preview. */
  shown: string[];
  /** How many more beyond the shown ones. */
  more: number;
  deleted: number;
  goalBudgetChanges: number;
  /** Plain text for "Copy list". */
  copyText: string;
}

/**
 * What a restore would lose on this device: entries added or changed since the last import
 * (all of them if there was never an import), plus counts of deletes and goal or budget changes.
 */
export function lossList(
  transactions: readonly Transaction[],
  settings: Pick<Settings, "lastImport" | "deletesSinceImport" | "goalBudgetChangesSinceImport">,
  money: (cents: number) => string,
  locale?: string,
): LossList {
  const since = settings.lastImport?.importedAt ?? -Infinity;
  const changed = transactions
    .filter((t) => t.updatedAt > since)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const lines = changed.map((t) => {
    const d = parseDate(t.date);
    const day = d ? dayFmt.format(new Date(d.year, d.month - 1, d.day)) : t.date;
    const what = t.kind === "income" || t.kind === "expense" ? t.category : kindLabel(t.kind);
    return [day, what, money(t.amountCents), t.note].filter(Boolean).join(" · ");
  });
  const deleted = settings.deletesSinceImport;
  const goalBudgetChanges = settings.goalBudgetChangesSinceImport;
  const extra = [
    deleted > 0 ? `${deleted} deleted entr${deleted === 1 ? "y" : "ies"}` : "",
    goalBudgetChanges > 0 ? `${goalBudgetChanges} goal or budget change${goalBudgetChanges === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return {
    lines,
    shown: lines.slice(0, 10),
    more: Math.max(0, lines.length - 10),
    deleted,
    goalBudgetChanges,
    copyText: [...lines, ...extra].join("\n"),
  };
}

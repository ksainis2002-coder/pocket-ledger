// Opening the data layer at startup (Phase 1). The screens that use it arrive in Phase 2,
// including the full-screen "Can't open your data" and "Pocket Ledger was updated" messages.
import { IdbStore } from "../db/idb-store";
import { Ledger } from "../db/ledger";
import type { TodayClock } from "./today";

export type DataEvent = "versionchange" | "blocked";

/** Ask the browser to keep our storage when space runs low (SPEC Non-negotiable 5). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Opens IndexedDB and the Ledger. Rejects with StorageError if the data can't be opened. */
export async function openData(clock: TodayClock, onEvent: (e: DataEvent) => void): Promise<Ledger> {
  const store = await IdbStore.open({
    onVersionChange: () => onEvent("versionchange"),
    onBlocked: () => onEvent("blocked"),
  });
  const ledger = await Ledger.open(store, {
    now: () => Date.now(),
    today: () => clock.get(),
    newId: () => crypto.randomUUID(),
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });
  void requestPersistentStorage();
  return ledger;
}

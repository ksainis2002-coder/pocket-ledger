// Small per-device UI preferences (last tab). Not user data: that lives in IndexedDB.
// localStorage can be missing or throw (private mode, blocked storage), so every access is guarded.

const PREFIX = "pocket-ledger:";

export function readPref(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(PREFIX + key) ?? null;
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, value);
  } catch {
    // Not critical: the app just opens on the default tab next time.
  }
}

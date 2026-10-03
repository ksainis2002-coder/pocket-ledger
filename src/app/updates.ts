// Service worker registration with the "prompt" update pattern (SPEC App updates).
// A new version waits. It is only activated when the owner taps "Reload now",
// or when every Pocket Ledger window is closed and the app is opened again.
import { BASE_PATH, IS_DEV, IS_PREVIEW } from "./env";

type Listener = (ready: boolean) => void;

let waiting: ServiceWorker | null = null;
const listeners = new Set<Listener>();

function setWaiting(worker: ServiceWorker | null): void {
  waiting = worker;
  for (const fn of listeners) fn(worker !== null);
}

/** Subscribe to "an update is ready". Called immediately with the current state. */
export function onUpdateReady(fn: Listener): () => void {
  listeners.add(fn);
  fn(waiting !== null);
  return () => listeners.delete(fn);
}

export async function registerServiceWorker(): Promise<void> {
  if (IS_DEV || IS_PREVIEW || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register(BASE_PATH + "sw.js", { scope: BASE_PATH });
    // Only a worker that is waiting while another one controls the page is an update.
    if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const incoming = reg.installing;
      if (!incoming) return;
      incoming.addEventListener("statechange", () => {
        if (incoming.state === "installed" && navigator.serviceWorker.controller) setWaiting(incoming);
      });
    });
    // Look for a new version when the app comes back to the foreground.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => undefined);
    });
  } catch {
    // Offline support is unavailable (e.g. private mode). The app still works online.
  }
}

/** Only called from the owner's "Reload now" tap. Activates the waiting version, then reloads once. */
export function applyUpdate(): void {
  if (!waiting) return;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
  waiting.postMessage({ type: "SKIP_WAITING" });
}

/** Reload the app. Only ever called from a button the owner taps ("Reload"), never on its own. */
export function reloadApp(): void {
  location.reload();
}

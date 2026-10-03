import { dateOf, monthOf, type DateStr } from "../domain/months";

export interface TodayClock {
  /** Today's local date, always current. */
  get(): DateStr;
  /** Called whenever the date changes, with the new and the previous date. Returns an unsubscribe function. */
  subscribe(fn: (today: DateStr, previous: DateStr) => void): () => void;
  /** Re-read the clock now. Safe to call often; listeners only fire when the date changed. */
  refresh(): void;
  /** Stop timers and event listeners. */
  stop(): void;
}

export interface ClockHost {
  now(): Date;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  /** Subscribe to "the app became visible" and "the window got focus". Returns a cleanup function. */
  onWake(fn: () => void): () => void;
  isVisible(): boolean;
}

/**
 * "Today" as app state (SPEC Dates and today): recomputed when the app becomes visible,
 * when the window gets focus, and once a minute while visible. Nothing reads the date once at load.
 */
export function createTodayClock(host: ClockHost): TodayClock {
  let today = dateOf(host.now());
  const listeners = new Set<(t: DateStr, prev: DateStr) => void>();

  const refresh = (): void => {
    const next = dateOf(host.now());
    if (next === today) return;
    const previous = today;
    today = next;
    for (const fn of listeners) fn(today, previous);
  };

  const timer = host.setInterval(() => {
    if (host.isVisible()) refresh();
  }, 60_000);
  const offWake = host.onWake(refresh);

  return {
    get: () => today,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    refresh,
    stop() {
      host.clearInterval(timer);
      offWake();
      listeners.clear();
    },
  };
}

/** The browser host: real clock, visibilitychange and focus. */
export function browserClockHost(win: Window = window): ClockHost {
  return {
    now: () => new Date(),
    setInterval: (fn, ms) => win.setInterval(fn, ms),
    clearInterval: (h) => win.clearInterval(h as number),
    isVisible: () => win.document.visibilityState === "visible",
    onWake(fn) {
      const onVisibility = (): void => {
        if (win.document.visibilityState === "visible") fn();
      };
      win.document.addEventListener("visibilitychange", onVisibility);
      win.addEventListener("focus", fn);
      return () => {
        win.document.removeEventListener("visibilitychange", onVisibility);
        win.removeEventListener("focus", fn);
      };
    },
  };
}

/** Current month of a clock. */
export const currentMonth = (clock: TodayClock): string => monthOf(clock.get());

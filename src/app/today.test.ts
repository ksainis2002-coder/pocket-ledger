import { test } from "node:test";
import assert from "node:assert/strict";
import { createTodayClock, type ClockHost } from "./today";

function fakeHost(start: Date) {
  let now = start;
  let tick: (() => void) | null = null;
  let wake: (() => void) | null = null;
  let visible = true;
  const host: ClockHost = {
    now: () => now,
    setInterval: (fn) => {
      tick = fn;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
    onWake: (fn) => {
      wake = fn;
      return () => {
        wake = null;
      };
    },
    isVisible: () => visible,
  };
  return {
    host,
    set: (d: Date) => {
      now = d;
    },
    tick: () => tick?.(),
    wake: () => wake?.(),
    hide: () => {
      visible = false;
    },
  };
}

test("today crosses midnight into the 1st of a month on the minute tick", () => {
  const f = fakeHost(new Date(2026, 9, 31, 23, 59, 30));
  const clock = createTodayClock(f.host);
  const seen: string[] = [];
  clock.subscribe((t, prev) => seen.push(`${prev}->${t}`));
  assert.equal(clock.get(), "2026-10-31");
  f.set(new Date(2026, 10, 1, 0, 0, 30));
  f.tick();
  assert.equal(clock.get(), "2026-11-01");
  assert.deepEqual(seen, ["2026-10-31->2026-11-01"]);
});

test("today refreshes when the app wakes, even after days in the background", () => {
  const f = fakeHost(new Date(2026, 9, 3, 12, 0));
  const clock = createTodayClock(f.host);
  f.hide();
  f.set(new Date(2026, 9, 7, 9, 0));
  f.tick(); // hidden: the minute timer doesn't refresh
  assert.equal(clock.get(), "2026-10-03");
  f.wake();
  assert.equal(clock.get(), "2026-10-07");
});

test("listeners only fire when the date actually changes", () => {
  const f = fakeHost(new Date(2026, 9, 3, 8, 0));
  const clock = createTodayClock(f.host);
  let calls = 0;
  clock.subscribe(() => calls++);
  f.set(new Date(2026, 9, 3, 18, 0));
  f.tick();
  f.wake();
  assert.equal(calls, 0);
});

test("stop removes timers and listeners", () => {
  const f = fakeHost(new Date(2026, 9, 3));
  const clock = createTodayClock(f.host);
  let calls = 0;
  clock.subscribe(() => calls++);
  clock.stop();
  f.set(new Date(2026, 9, 4));
  f.tick();
  f.wake();
  assert.equal(calls, 0);
});

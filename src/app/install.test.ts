import { test } from "node:test";
import assert from "node:assert/strict";
import { isIOSDevice, shouldGate } from "./install";

test("shouldGate: every combination", () => {
  const cases: [boolean, boolean, boolean, string][] = [
    // isIOS, isStandalone, acknowledged -> result
    [false, false, false, "open"],
    [false, false, true, "open"],
    [false, true, false, "open"],
    [false, true, true, "open"],
    [true, true, false, "open"],
    [true, true, true, "open"],
    [true, false, false, "gate"],
    [true, false, true, "safari-banner"],
  ];
  for (const [isIOS, isStandalone, acknowledged, expected] of cases) {
    assert.equal(shouldGate({ isIOS, isStandalone, acknowledged }), expected, JSON.stringify({ isIOS, isStandalone, acknowledged }));
  }
});

test("iOS detection, including iPadOS reporting as a Mac", () => {
  assert.equal(isIOSDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)", 5), true);
  assert.equal(isIOSDevice("Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X)", 5), true);
  assert.equal(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5), true);
  assert.equal(isIOSDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 0), false);
  assert.equal(isIOSDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile", 5), false);
  assert.equal(isIOSDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0), false);
});

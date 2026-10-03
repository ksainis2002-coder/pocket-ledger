// Contrast check (WCAG AA): computes text/background contrast from src/styles/tokens.css for both
// themes, for every pair the screens use, including the tinted pills (color-mix over the surface).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = await readFile(path.join(ROOT, "src/styles/tokens.css"), "utf8");

function block(selector) {
  const i = css.indexOf(selector);
  assert.ok(i >= 0, `missing ${selector}`);
  const body = css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

const light = block(":root {");
const dark = { ...light, ...block(':root[data-theme="dark"] {') };

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const [x, y] = [rgb(a), rgb(b)];
  return "#" + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, "0")).join("");
};
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function contrast(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** [what, text token, background] where background is a token name or a function of the theme. */
const PAIRS = [
  ["body text", "fg", "bg"],
  ["body text on cards", "fg", "surface"],
  ["muted text", "muted", "bg"],
  ["muted text on cards", "muted", "surface"],
  ["income figures", "income", "surface"],
  ["income hero", "income", "bg"],
  ["savings figures", "save", "surface"],
  ["savings hero", "save", "bg"],
  ["negative net", "bad", "bg"],
  ["errors on cards", "bad", "surface"],
  ["links and active tab", "accent", "surface"],
  ["active tab on its tint", "accent", (t) => t["accent-soft"]],
  ["primary buttons and chips", "accent-ink", "accent"],
  ["toast", "bg", "fg"],
  ["pill: ok", "accent", (t) => t["accent-soft"]],
  ["pill: warning", "warn-ink", (t) => mix(t.warn, t.surface, 0.18)],
  ["pill: over budget", "bad-ink", (t) => mix(t.bad, t.surface, 0.15)],
  ["banner text", "fg", (t) => mix(t.warn, t.surface, 0.16)],
];

for (const [name, theme] of [["light", light], ["dark", dark]]) {
  test(`AA contrast (4.5:1) for every text pair in the ${name} theme`, () => {
    const failures = [];
    for (const [what, fg, bg] of PAIRS) {
      const text = theme[fg];
      const back = typeof bg === "function" ? bg(theme) : theme[bg];
      assert.ok(text && back, `${what}: missing token ${fg} or background`);
      const ratio = contrast(text, back);
      if (ratio < 4.5) failures.push(`${what}: ${text} on ${back} = ${ratio.toFixed(2)}:1`);
    }
    assert.deepEqual(failures, []);
  });
}

test("the dark block for the system setting matches the explicit dark theme", () => {
  const i = css.indexOf("@media (prefers-color-scheme: dark)");
  const body = css.slice(css.indexOf("{", css.indexOf(":root:not", i)) + 1, css.indexOf("}", css.indexOf(":root:not", i)));
  const system = Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(system, block(':root[data-theme="dark"] {'));
});

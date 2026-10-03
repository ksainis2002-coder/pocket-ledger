// Speed check: add, edit and undo with 10,000 entries and 20 goals, each under 150 ms (median of 5).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { chromium } from "playwright";
import { startServer } from "../scripts/serve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "e2e/out/perf");
const LIMIT_MS = 150;

let server;
let browser;

before(async () => {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await esbuild({ entryPoints: [path.join(ROOT, "src/db/perf.browser.ts")], bundle: true, format: "esm", minify: true, outfile: path.join(OUT, "perf.js"), logLevel: "silent" });
  await writeFile(path.join(OUT, "index.html"), '<!doctype html><meta charset="utf-8"><title>Speed check</title><script type="module" src="perf.js"></script>');
  await writeFile(path.join(OUT, "build-info.json"), JSON.stringify({ base: "/" }));
  server = await startServer({ dir: OUT, port: 0, quiet: true });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test(`add, edit and undo stay under ${LIMIT_MS} ms with 10,000 entries`, async () => {
  const page = await browser.newPage();
  await page.goto(server.url);
  await page.waitForFunction(() => window.__perf, null, { timeout: 120_000 });
  const r = await page.evaluate(() => window.__perf);
  assert.equal(r.error, undefined, r.error);
  const summary = { add: median(r.add), edit: median(r.edit), undo: median(r.undo), read: r.read };
  console.log(`# speed (ms, median of 5): add ${summary.add.toFixed(1)}, edit ${summary.edit.toFixed(1)}, undo ${summary.undo.toFixed(1)}, full read ${summary.read.toFixed(1)}`);
  assert.ok(summary.add < LIMIT_MS, `add took ${summary.add} ms`);
  assert.ok(summary.edit < LIMIT_MS, `edit took ${summary.edit} ms`);
  assert.ok(summary.undo < LIMIT_MS, `undo took ${summary.undo} ms`);
  await page.close();
});

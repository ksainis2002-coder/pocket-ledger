// Runs the store contract against the real IndexedDB store in Chromium.
// WebKit isn't available in the build environment; Safari is checked on a real iPhone in Phase 4.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { chromium } from "playwright";
import { startServer } from "../scripts/serve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "e2e/out/contract");

let server;
let browser;

before(async () => {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await esbuild({
    entryPoints: [path.join(ROOT, "src/db/store.contract.browser.ts")],
    bundle: true,
    format: "esm",
    outfile: path.join(OUT, "contract.js"),
    logLevel: "silent",
  });
  await writeFile(path.join(OUT, "index.html"), '<!doctype html><meta charset="utf-8"><title>Store contract</title><script type="module" src="contract.js"></script>');
  await writeFile(path.join(OUT, "build-info.json"), JSON.stringify({ base: "/" }));
  server = await startServer({ dir: OUT, port: 0, quiet: true });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

test("store contract passes against IndexedDB in Chromium", async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.url);
  await page.waitForFunction(() => Array.isArray(window.__contract), null, { timeout: 30_000 });
  const results = await page.evaluate(() => window.__contract);
  const failed = results.filter((r) => !r.ok);
  assert.deepEqual(failed, [], failed.map((f) => `${f.name}: ${f.error}`).join("\n"));
  assert.ok(results.length >= 13, `ran ${results.length} cases`);
  assert.deepEqual(errors, []);
  await page.close();
});

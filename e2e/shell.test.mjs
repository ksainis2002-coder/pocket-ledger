// Phase 0 end-to-end checks in Chromium at a phone-sized viewport, for both base paths:
// the shell renders 5 tabs, the app is installable, works offline, remembers the last tab,
// never reloads itself when an update arrives, and makes no requests to other hosts.
//
// First run on a new computer: npx playwright install chromium
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "../scripts/build.mjs";
import { startServer } from "../scripts/serve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "e2e/out");
const PHONE = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/** Poll an async in-page check until it returns true. (page.waitForFunction treats an async check as already true.) */
async function waitInPage(page, fn, { timeout = 10_000, message = "condition" } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await page.evaluate(fn)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${message}`);
}

let browser;
before(async () => {
  await mkdir(OUT, { recursive: true });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

for (const base of ["/", "/pocket-ledger/"]) {
  const slug = base === "/" ? "root" : "pages";

  describe(`app shell at base ${base}`, () => {
    let server;
    let outdir;

    before(async () => {
      outdir = path.join(OUT, `dist-${slug}`);
      await build({ base, outdir, quiet: true });
      server = await startServer({ dir: outdir, port: 0, quiet: true });
    });
    after(async () => {
      await server?.close();
    });

    test("renders, installs, works offline and never reloads itself", async () => {
      const context = await browser.newContext({ ...PHONE, colorScheme: "light" });
      const page = await context.newPage();
      const foreignHosts = new Set();
      page.on("request", (req) => {
        const host = new URL(req.url()).hostname;
        if (host !== "127.0.0.1" && host !== "localhost") foreignHosts.add(host);
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(server.url);

      // Shell: 5 tabs, Net selected, month picker on the current month with "next" disabled.
      const tabs = page.getByRole("tab");
      assert.equal(await tabs.count(), 5);
      assert.deepEqual(await tabs.allInnerTexts(), ["Net", "Income", "Expenses", "Savings", "Goals"]);
      assert.equal(await page.locator("#page-title").innerText(), "Net money");
      assert.equal(await page.getByRole("tab", { name: "Net" }).getAttribute("aria-selected"), "true");
      const label = page.locator(".picker-label");
      const now = new Date();
      const currentLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(now.getFullYear(), now.getMonth(), 1));
      assert.equal(await label.innerText(), currentLabel);
      assert.equal(await page.getByRole("button", { name: "Next month" }).isDisabled(), true);

      // Month picker: back two months, forward again, never past the current month.
      await page.getByRole("button", { name: "Previous month" }).click();
      await page.getByRole("button", { name: "Previous month" }).click();
      assert.notEqual(await label.innerText(), currentLabel);
      assert.equal(await page.getByRole("button", { name: "Next month" }).isDisabled(), false);
      await page.getByRole("button", { name: "Next month" }).click();
      await page.getByRole("button", { name: "Next month" }).click();
      assert.equal(await label.innerText(), currentLabel);
      assert.equal(await page.getByRole("button", { name: "Next month" }).isDisabled(), true);

      // Picker hidden on Goals, and the header keeps its height so content doesn't jump.
      const headerHeight = (await page.locator(".topbar").boundingBox()).height;
      await page.getByRole("tab", { name: "Goals" }).click();
      assert.equal((await page.locator(".topbar").boundingBox()).height, headerHeight);
      assert.equal(await page.locator(".picker").isVisible(), false);
      assert.equal(await page.locator("#page-title").innerText(), "Goals");

      // Installable: manifest at the base path, icons reachable, service worker controls the page.
      const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
      assert.equal(manifestHref, base + "manifest.webmanifest");
      const manifest = await (await page.request.get(new URL(manifestHref, server.url).href)).json();
      assert.equal(manifest.start_url, base);
      assert.equal(manifest.scope, base);
      assert.equal(manifest.display, "standalone");
      for (const icon of manifest.icons) {
        const res = await page.request.get(new URL(icon.src, server.url).href);
        assert.equal(res.status(), 200, icon.src);
      }
      const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
      assert.equal(new URL(scope).pathname, base);
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

      const cdp = await context.newCDPSession(page);
      const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
      assert.deepEqual(installabilityErrors, [], JSON.stringify(installabilityErrors));

      // Last tab remembered: open Expenses, reload, still on Expenses.
      await page.getByRole("tab", { name: "Expenses" }).click();
      await page.reload();
      assert.equal(await page.locator("#page-title").innerText(), "Expenses");

      // Offline: reload and deep link both work with no network.
      await context.setOffline(true);
      await page.reload();
      assert.equal(await page.getByRole("tab").count(), 5);
      assert.equal(await page.locator("#page-title").innerText(), "Expenses");
      await page.goto(server.url + "?add=expense");
      assert.equal(await page.getByRole("tab").count(), 5);
      await context.setOffline(false);

      // An update arrives: the new worker waits, and the page is not reloaded.
      await page.evaluate(() => {
        window.__marker = "still here";
      });
      // Simulate the next release: same files, new version id (a real build changes it when any file changes).
      const swPath = path.join(outdir, "sw.js");
      const sw = await readFile(swPath, "utf8");
      const nextVersion = Date.now().toString(16).padStart(12, "0").slice(-12);
      await writeFile(swPath, sw.replace(/const VERSION = "[0-9a-f]{12}";/, `const VERSION = "${nextVersion}";`));
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
      await waitInPage(page, async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting), { message: "the update to be waiting" });
      await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(() => window.__marker), "still here");

      // When the waiting version is activated, the old cache is deleted and only the new one remains.
      const cachesBefore = await page.evaluate(() => caches.keys());
      assert.equal(cachesBefore.length, 2, JSON.stringify(cachesBefore));
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        const changed = new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        await changed;
      });
      await waitInPage(page, async () => (await caches.keys()).length === 1, { message: "the old cache to be deleted" });
      const cachesAfter = await page.evaluate(() => caches.keys());
      assert.equal(cachesAfter[0], "pocket-ledger-" + nextVersion);
      assert.equal(await page.evaluate(() => window.__marker), "still here", "the app reloaded itself on activation");

      assert.deepEqual([...foreignHosts], [], "requests to other hosts");
      assert.deepEqual(errors, [], "page errors");
      await context.close();
    });

    test("phone screenshots in light and dark", async () => {
      for (const colorScheme of ["light", "dark"]) {
        const context = await browser.newContext({ ...PHONE, colorScheme });
        const page = await context.newPage();
        await page.goto(server.url);
        await page.screenshot({ path: path.join(OUT, `shell-${slug}-${colorScheme}.png`) });
        // The tab bar sits inside the viewport and the page doesn't scroll sideways.
        const box = await page.locator(".tabbar").boundingBox();
        assert.ok(box && box.y + box.height <= 812 + 0.5);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        assert.equal(overflow, false);
        await context.close();
      }
    });
  });
}

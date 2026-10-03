// Phase 3 end-to-end checks in Chromium: Settings, backup and restore, moving data between two
// browser profiles (standing in for a phone and a PC), CSV, the reminder, delete all, and the rescue export.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "../scripts/build.mjs";
import { startServer } from "../scripts/serve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const PHONE = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block", userAgent: ANDROID_UA };
const PC = { viewport: { width: 1280, height: 800 }, serviceWorkers: "block" };

let browser;
let server;

before(async () => {
  const outdir = path.join(ROOT, "e2e/out/dist-settings");
  await build({ base: "/", outdir, quiet: true });
  server = await startServer({ dir: outdir, port: 0, quiet: true });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

async function openApp(options = {}) {
  const context = await browser.newContext({ ...PC, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.url);
  await page.locator("#page-title").waitFor();
  return { context, page, errors };
}

const tab = (page, name) => page.getByRole("tab", { name }).click();
const settings = async (page) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator('[data-screen="settings"]').waitFor();
};
const toast = (page, text) => page.locator(".toast-text", { hasText: text }).waitFor();

async function addExpense(page, amount, category, note) {
  await tab(page, "Expenses");
  await page.locator("#expense-form-amount").fill(amount);
  if (category) {
    const chip = page.getByRole("radio", { name: category });
    if (await chip.count()) await chip.click();
    else {
      await page.getByRole("button", { name: "More…" }).click();
      await page.locator(".category-grid").getByRole("button", { name: category }).click();
    }
  }
  if (note) {
    await page.getByRole("button", { name: "Add note" }).click();
    await page.locator("#expense-form-note").fill(note);
  }
  await page.getByRole("button", { name: "Add expense" }).click();
  await toast(page, "Expense added");
}

async function addIncome(page, amount) {
  await tab(page, "Income");
  await page.locator("#income-form-amount").fill(amount);
  await page.getByRole("button", { name: "Add income" }).click();
  await toast(page, "Income added");
}

/** Click something that downloads a file; return the file's path. */
async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent("download"), click()]);
  return dl.path();
}

async function sendFrom(page) {
  await settings(page);
  await page.locator("#send-device").click();
  const file = await download(page, () => page.locator("#send-confirm").click());
  await toast(page, "Backup saved");
  return file;
}

/** Open a file through "Open from my other device"; leaves the preview sheet open. */
async function openOn(page, file) {
  await settings(page);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator("#open-device").click()]);
  await chooser.setFiles(file);
  await page.locator(".restore-source").waitFor();
}

const netFigure = async (page) => {
  await tab(page, "Net");
  return page.locator("#net-hero .hero-value").innerText();
};
const entries = (page, screen) => page.locator(`[data-screen="${screen}"] .entry`);

describe("Phase 3: safety net", () => {
  test("Settings: sections, theme choice that lasts, currency change", async () => {
    const { context, page, errors } = await openApp();
    await settings(page);
    assert.equal(await page.locator("#page-title").innerText(), "Settings");
    assert.equal(await page.getByRole("button", { name: "Settings" }).getAttribute("aria-pressed"), "true");
    for (const heading of ["Phone and PC", "Backup", "Spreadsheet", "Preferences", "Storage", "Delete all data"]) {
      assert.equal(await page.getByRole("heading", { name: heading, exact: true }).count(), 1, heading);
    }
    assert.match(await page.locator("#settings-devices").innerText(), /This device: Linux PC/);
    assert.match(await page.locator("#last-moved").innerText(), /Not moved yet/);
    assert.match(await page.locator("#last-backup").innerText(), /Never/);
    assert.match(await page.locator("#settings-install").innerText(), /iPhone: Safari → Share → Add to Home Screen/, "iPhone steps show on the PC too");

    await page.getByRole("radio", { name: "Dark" }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    await page.locator("#currency").selectOption("USD");
    await toast(page, "Currency changed");
    await page.reload();
    await page.locator("#page-title").waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark", "theme lasts");
    await addIncome(page, "10");
    assert.match(await netFigure(page), /^\$10/);
    // The gear toggles back to the last tab.
    await settings(page);
    await page.getByRole("button", { name: "Settings" }).click();
    assert.notEqual(await page.locator("#page-title").innerText(), "Settings");
    assert.deepEqual(errors, []);
    await context.close();
  });

  test("PC → phone → PC: nothing lost, no warnings, Last moved names the device", async () => {
    const pc = await openApp();
    const phone = await openApp(PHONE);
    await addIncome(pc.page, "2400");
    await addExpense(pc.page, "12,50", "Eating out", "Lunch");
    const fromPc = await sendFrom(pc.page);

    await openOn(phone.page, fromPc);
    assert.match(await phone.page.locator(".restore-source").innerText(), /From your Linux PC · made (just now|1 minute ago)/);
    assert.match(await phone.page.locator(".restore").innerText(), /2 entries · 0 goals · 0 budgets · newest entry/);
    assert.equal(await phone.page.locator(".restore-warning").count(), 0, "an empty phone is safe");
    assert.equal(await phone.page.locator("#restore-confirm").innerText(), "Replace my data");
    await phone.page.locator("#restore-confirm").click();
    await toast(phone.page, "Backup restored");
    assert.match(await phone.page.locator("#last-moved").innerText(), /Last moved: from Linux PC/);
    assert.equal(await netFigure(phone.page), await netFigure(pc.page));

    await addExpense(phone.page, "4,50", "Eating out", "Coffee");
    const fromPhone = await sendFrom(phone.page);
    await openOn(pc.page, fromPhone);
    assert.match(await pc.page.locator(".restore-source").innerText(), /From your Android phone/);
    assert.equal(await pc.page.locator(".restore-warning").count(), 0, "the PC sent everything it had");
    await pc.page.locator("#restore-confirm").click();
    await toast(pc.page, "Backup restored");
    await tab(pc.page, "Expenses");
    assert.equal(await entries(pc.page, "expenses").count(), 2);
    assert.equal(await netFigure(pc.page), await netFigure(phone.page));
    assert.deepEqual([...pc.errors, ...phone.errors], []);
    await pc.context.close();
    await phone.context.close();
  });

  test("unsent changes: warning, lost list, Copy list, Save a copy first, then Restore anyway", async () => {
    const pc = await openApp({ permissions: ["clipboard-read", "clipboard-write"] });
    const phone = await openApp(PHONE);
    await addIncome(pc.page, "2400");
    await openOn(phone.page, await sendFrom(pc.page));
    await phone.page.locator("#restore-confirm").click();
    await toast(phone.page, "Backup restored");

    await addExpense(pc.page, "4,50", "Eating out", "Coffee on the PC");
    await addExpense(phone.page, "9", "Transport");
    const fromPhone = await sendFrom(phone.page);

    await openOn(pc.page, fromPhone);
    const warning = pc.page.locator(".restore-warning");
    assert.match(await warning.innerText(), /You made 1 change on this Linux PC since you last sent or received data\. Restoring will lose them\./);
    assert.match(await pc.page.locator(".loss-list").innerText(), /Eating out · €4\.50 · Coffee on the PC/);
    assert.doesNotMatch(await pc.page.locator(".sheet").innerText(), /older than/, "one warning, not two");
    await pc.page.getByRole("button", { name: "Copy list" }).click();
    await toast(pc.page, "List copied");
    assert.match(await pc.page.evaluate(() => navigator.clipboard.readText()), /Coffee on the PC/);

    // Save a copy first: a file is saved and the preview stays open.
    const copy = await download(pc.page, () => pc.page.getByRole("button", { name: "Save a copy first" }).click());
    assert.ok((await readFile(copy, "utf8")).includes("Coffee on the PC"), "the copy holds this device's data");
    assert.equal(await pc.page.locator(".restore-source").isVisible(), true);
    assert.equal(await pc.page.locator("#restore-confirm").innerText(), "Restore anyway");
    await pc.page.locator("#restore-confirm").click();
    await toast(pc.page, "Backup restored");
    assert.equal(await netFigure(pc.page), await netFigure(phone.page));
    await pc.context.close();
    await phone.context.close();
  });

  test("CSV on a Greek PC: BOM, semicolons, 12,50, YYYY-MM-DD, Greek text, formula escaping", async () => {
    const { context, page } = await openApp({ locale: "el-GR" });
    await addExpense(page, "12,50", "Eating out", "Καφές =1+1");
    await settings(page);
    const file = await download(page, () => page.locator("#export-csv").click());
    const bytes = await readFile(file);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 BOM");
    const text = bytes.toString("utf8").slice(1);
    const lines = text.split("\r\n");
    assert.equal(lines[0], "Date;Type;Category;Amount;Note;Goal");
    assert.match(lines[1], /^\d{4}-\d{2}-\d{2};Expense;Eating out;12,50;Καφές =1\+1;$/);
    await toast(page, "Spreadsheet saved");
    await context.close();
  });

  test("delete all, then restoring a backup never warns", async () => {
    const { context, page } = await openApp();
    await addIncome(page, "100");
    await settings(page);
    const backup = await download(page, () => page.locator("#backup-now").click());
    await toast(page, "Backup saved");
    assert.doesNotMatch(await page.locator("#last-backup").innerText(), /Never/);
    await addExpense(page, "5", "Groceries");

    await settings(page);
    await page.locator("#delete-all").click();
    assert.equal(await page.locator("#delete-confirm").isDisabled(), true);
    await page.locator("#delete-confirm-text").fill("delete");
    assert.equal(await page.locator("#delete-confirm").isDisabled(), true, "must be DELETE");
    await page.locator("#delete-confirm-text").fill("DELETE");
    await page.locator("#delete-confirm").click();
    await toast(page, "All data deleted");
    assert.equal(await page.locator("#page-title").innerText(), "Net money");
    assert.equal(await page.getByRole("heading", { name: "Nothing to show yet" }).count(), 1);

    await settings(page);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator("#restore-backup").click()]);
    await chooser.setFiles(backup);
    await page.locator(".restore-source").waitFor();
    assert.match(await page.locator(".restore-source").innerText(), /^From this Linux PC · made /, "its own backup");
    assert.equal(await page.locator(".restore-warning").count(), 0);
    assert.equal(await page.locator("#restore-confirm").innerText(), "Replace my data");
    await page.locator("#restore-confirm").click();
    await toast(page, "Backup restored");
    assert.equal(await netFigure(page), "€100");

    // A change after that, then the same older backup again: the same-device warning.
    await addExpense(page, "7", "Groceries");
    await settings(page);
    const [chooser2] = await Promise.all([page.waitForEvent("filechooser"), page.locator("#restore-backup").click()]);
    await chooser2.setFiles(backup);
    await page.locator(".restore-source").waitFor();
    assert.equal(await page.locator(".restore-warning").innerText(), "This backup doesn't include your latest changes. Restoring will lose them.");
    assert.match(await page.locator(".loss-list").innerText(), /Groceries · €7/);
    await page.locator("#restore-confirm").click();
    await toast(page, "Backup restored");
    assert.equal(await netFigure(page), "€100");
    await context.close();
  });

  test("a file that isn't a backup is refused with one sentence and changes nothing", async () => {
    const { context, page } = await openApp();
    await addIncome(page, "100");
    await settings(page);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator("#restore-backup").click()]);
    await chooser.setFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"hello":"world"}') });
    await toast(page, "This file isn't a Pocket Ledger backup.");
    assert.equal(await page.locator(".restore-source").count(), 0);
    assert.equal(await netFigure(page), "€100");
    await context.close();
  });

  test("backup reminder: shows with 10 entries and no backup; Later snoozes it; Back up now clears it", async () => {
    const { context, page } = await openApp();
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open("pocket-ledger");
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("transactions", "readwrite");
            const d = new Date();
            const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
            for (let i = 0; i < 10; i++) tx.objectStore("transactions").put({ id: `r${i}`, kind: "expense", amountCents: 100, category: "Other", date, createdAt: i, updatedAt: i });
            tx.oncomplete = () => (db.close(), resolve(undefined));
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.reload();
    await page.locator("#page-title").waitFor();
    await tab(page, "Net");
    assert.equal(await page.locator("#backup-reminder").innerText().then((t) => t.includes("No backup yet.")), true);
    await page.locator("#backup-reminder").getByRole("button", { name: "Later" }).click();
    await page.locator("#backup-reminder").waitFor({ state: "detached" });
    await page.reload();
    await page.locator("#page-title").waitFor();
    await tab(page, "Net");
    assert.equal(await page.locator("#backup-reminder").count(), 0, "snoozed for 7 days");

    // Un-snooze by hand, then back up from the banner.
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("pocket-ledger");
          req.onsuccess = () => {
            const db = req.result;
            const st = db.transaction("settings", "readwrite").objectStore("settings");
            const g = st.get("settings");
            g.onsuccess = () => {
              const s = g.result;
              delete s.backupSnoozedUntil;
              st.put(s).onsuccess = () => (db.close(), resolve(undefined));
            };
          };
        }),
    );
    await page.reload();
    await page.locator("#page-title").waitFor();
    await tab(page, "Net");
    await download(page, () => page.locator("#backup-reminder").getByRole("button", { name: "Back up now" }).click());
    await page.locator("#backup-reminder").waitFor({ state: "detached" });
    await context.close();
  });

  test("storage that won't open offers 'Export what can be read'", async () => {
    const context = await browser.newContext(PHONE);
    await context.addInitScript(() => {
      indexedDB.open = () => {
        throw new DOMException("blocked by test", "UnknownError");
      };
    });
    const page = await context.newPage();
    await page.goto(server.url);
    await page.getByRole("heading", { name: "Can't open your data" }).waitFor();
    await page.locator("#rescue-export").click();
    await page.locator(".rescue-status", { hasText: "Nothing could be read" }).waitFor();
    await context.close();
  });

  test("Settings fits a phone: no sideways scroll, header with gear fits at 375", async () => {
    const { context, page } = await openApp(PHONE);
    for (const name of ["Net", "Income", "Expenses", "Savings", "Goals"]) {
      await tab(page, name);
      const gear = await page.getByRole("button", { name: "Settings" }).boundingBox();
      assert.ok(gear && gear.x + gear.width <= 375, `gear visible on ${name}`);
    }
    await settings(page);
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 375);
    await context.close();
  });
});

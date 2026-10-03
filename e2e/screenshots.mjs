// Saves screenshots for layout review (no phone can reach a dev server from the build environment):
// every tab at phone and PC sizes in light and dark, with sample data and empty, plus every form and
// sheet, the install gate and the error screens. Output: e2e/screenshots/.
//
//   npm run screenshots
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "../scripts/build.mjs";
import { startServer } from "../scripts/serve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(ROOT, "e2e/screenshots");
const SIZES = [
  { width: 375, height: 812, phone: true }, // iPhone with a notch
  { width: 375, height: 667, phone: true }, // iPhone SE / small phones
  { width: 1280, height: 800, phone: false }, // laptop
  { width: 1920, height: 1080, phone: false }, // desktop monitor
];
const TABS = ["Net", "Income", "Expenses", "Savings", "Goals"];
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

/** Sample data for screenshots only, written straight into the app's IndexedDB after first load. */
function seed() {
  const now = new Date();
  const ym = (offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const day = (offset, d) => `${ym(offset)}-${String(Math.min(d, offset === 0 ? now.getDate() : 28)).padStart(2, "0")}`;
  const txs = [];
  let n = 0;
  const t = (kind, cents, date, category, extra = {}) => txs.push({ id: `s${++n}`, kind, amountCents: cents, category, date, createdAt: n, updatedAt: n, ...extra });
  for (let m = 5; m >= 0; m--) {
    t("income", 240_000, day(m, 1), "Salary");
    if (m % 2 === 0) t("income", 38_000 + m * 1000, day(m, 14), "Freelance", { note: "Logo design" });
    t("expense", 75_000, day(m, 2), "Housing", { note: "Rent" });
    t("expense", 28_000 + m * 900, day(m, 9), "Groceries");
    t("expense", 9_500 + m * 400, day(m, 16), "Eating out");
    t("expense", 6_000, day(m, 11), "Transport");
    t("expense", 2_700, day(m, 3), "Subscriptions", { note: "Music, cloud" });
    t("save", 20_000, day(m, 2), "Savings", { goalId: "goal-1" });
  }
  t("withdraw", 15_000, day(1, 20), "Savings", { note: "Car repair" });
  t("save", 30_000, day(0, 1), "Savings");
  const goals = [
    { id: "goal-1", name: "Emergency fund", targetCents: 600_000, openingCents: 100_000, savedCents: 100_000 + 6 * 20_000, archived: false, createdAt: 1, updatedAt: 1, dueDate: `${now.getFullYear() + 1}-06-30` },
    { id: "goal-2", name: "Summer trip", targetCents: 150_000, openingCents: 0, savedCents: 0, archived: false, createdAt: 2, updatedAt: 2 },
    { id: "goal-3", name: "New phone", targetCents: 90_000, openingCents: 90_000, savedCents: 90_000, archived: false, createdAt: 3, updatedAt: 3 },
  ];
  const budgets = [
    { category: "Groceries", limitCents: 30_000, updatedAt: 1 },
    { category: "Eating out", limitCents: 10_000, updatedAt: 1 },
    { category: "Shopping", limitCents: 15_000, updatedAt: 1 },
  ];
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("pocket-ledger");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["transactions", "goals", "budgets"], "readwrite");
      for (const x of txs) tx.objectStore("transactions").put(x);
      for (const g of goals) tx.objectStore("goals").put(g);
      for (const b of budgets) tx.objectStore("budgets").put(b);
      tx.oncomplete = () => (db.close(), resolve(undefined));
      tx.onerror = () => reject(tx.error);
    };
  });
}

await rm(SHOTS, { recursive: true, force: true });
await mkdir(SHOTS, { recursive: true });
const outdir = path.join(ROOT, "e2e/out/dist-shots");
await build({ base: "/", outdir, quiet: true });
const server = await startServer({ dir: outdir, port: 0, quiet: true });
const browser = await chromium.launch();
const saved = [];
const shot = async (page, name) => {
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(SHOTS, name) });
  saved.push(name);
};
const contextFor = (size, colorScheme, extra = {}) => {
  const { phone, ...viewport } = size;
  const device = phone ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { deviceScaleFactor: 1 };
  return browser.newContext({ viewport, colorScheme, ...device, serviceWorkers: "block", ...extra });
};
const open = async (context, withData) => {
  const page = await context.newPage();
  await page.goto(server.url);
  await page.locator("#page-title").waitFor();
  if (withData) {
    await page.evaluate(seed);
    await page.reload();
    await page.locator("#page-title").waitFor();
  }
  return page;
};

try {
  // Every tab, every size, both themes: with data and empty.
  for (const size of SIZES) {
    for (const colorScheme of ["light", "dark"]) {
      for (const withData of [true, false]) {
        if (!withData && size.width === 1920) continue;
        const context = await contextFor(size, colorScheme);
        const page = await open(context, withData);
        for (const tab of TABS) {
          await page.getByRole("tab", { name: tab }).click();
          await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
          await shot(page, `${withData ? "data" : "empty"}-${tab.toLowerCase()}-${size.width}x${size.height}-${colorScheme}.png`);
        }
        await context.close();
      }
    }
  }

  // Forms and sheets on a small phone (both themes) and a laptop (light).
  for (const [size, colorScheme] of [[SIZES[1], "light"], [SIZES[1], "dark"], [SIZES[2], "light"]]) {
    const context = await contextFor(size, colorScheme);
    const page = await open(context, true);
    const tag = `${size.width}x${size.height}-${colorScheme}`;
    const close = () => page.getByRole("button", { name: "Close" }).click();

    await page.getByRole("tab", { name: "Expenses" }).click();
    await shot(page, `form-expense-focused-${tag}.png`);
    await page.locator("#expense-form-amount").fill("12,345,6");
    await page.getByRole("button", { name: "Add expense" }).click();
    await page.getByRole("button", { name: "Add note" }).click();
    await shot(page, `form-expense-error-note-${tag}.png`);
    await page.getByRole("button", { name: "More…" }).click();
    await shot(page, `sheet-categories-${tag}.png`);
    await close();
    await page.locator('[data-screen="expenses"] .entry').first().click();
    await shot(page, `sheet-edit-entry-${tag}.png`);
    await close();
    await page.getByRole("button", { name: "Set a budget", exact: true }).click();
    await shot(page, `sheet-budget-${tag}.png`);
    await close();

    await page.getByRole("tab", { name: "Savings" }).click();
    await page.getByRole("radio", { name: "Take out" }).click();
    await page.locator("#savings-form-amount").fill("99999");
    await page.getByRole("button", { name: "Take out of savings" }).click();
    await page.locator('[data-screen="savings"] .form-error', { hasText: "free" }).waitFor();
    await shot(page, `form-savings-refused-${tag}.png`);

    await page.getByRole("tab", { name: "Goals" }).click();
    await page.getByRole("button", { name: "New goal" }).click();
    await shot(page, `sheet-new-goal-${tag}.png`);
    await close();
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await shot(page, `sheet-goal-add-${tag}.png`);
    await close();
    await page.getByRole("button", { name: "More for Emergency fund" }).click();
    await shot(page, `sheet-goal-menu-${tag}.png`);
    await page.getByRole("button", { name: "Archive goal" }).click();
    await shot(page, `sheet-archive-${tag}.png`);
    await close();
    await page.getByRole("button", { name: "More for Emergency fund" }).click();
    await page.getByRole("button", { name: "Delete goal" }).click();
    await shot(page, `sheet-delete-goal-${tag}.png`);
    await close();

    await page.getByRole("tab", { name: "Income" }).click();
    await page.locator("#income-form-amount").fill("50");
    await page.getByRole("button", { name: "Add income" }).click();
    await page.locator(".toast-text").waitFor();
    await shot(page, `toast-undo-${tag}.png`);
    await context.close();
  }

  // A Greek phone (decimal comma), light and dark: every tab with data, and the edit sheet.
  for (const colorScheme of ["light", "dark"]) {
    const context = await contextFor(SIZES[0], colorScheme, { locale: "el-GR" });
    const page = await open(context, true);
    for (const tab of TABS) {
      await page.getByRole("tab", { name: tab }).click();
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await shot(page, `el-GR-${tab.toLowerCase()}-${colorScheme}.png`);
    }
    await page.getByRole("tab", { name: "Expenses" }).click();
    await page.locator('[data-screen="expenses"] .entry').first().click();
    await shot(page, `el-GR-edit-sheet-${colorScheme}.png`);
    await context.close();
  }

  // Settings, the send and delete sheets, restore previews (safe, and with a warning), and the reminder.
  for (const [size, colorScheme] of [[SIZES[0], "light"], [SIZES[0], "dark"], [SIZES[2], "light"]]) {
    const tag = `${size.width}x${size.height}-${colorScheme}`;
    const context = await contextFor(size, colorScheme);
    const page = await open(context, true);
    await page.getByRole("button", { name: "Settings" }).click();
    await page.locator('[data-screen="settings"]').waitFor();
    await shot(page, `settings-top-${tag}.png`);
    await page.screenshot({ path: path.join(SHOTS, `settings-full-${tag}.png`), fullPage: true });
    saved.push(`settings-full-${tag}.png`);
    await page.locator("#send-device").click();
    await shot(page, `sheet-send-${tag}.png`);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("#send-confirm").click()]);
    const backupPath = path.join(ROOT, `e2e/out/shot-backup-${tag}.json`);
    await dl.saveAs(backupPath);
    await page.locator("#delete-all").click();
    await page.locator("#delete-confirm-text").fill("DELETE");
    await shot(page, `sheet-delete-all-${tag}.png`);
    await page.getByRole("button", { name: "Close" }).click();

    // An unsent change, then restore this device's own file made above: "From this …" and the same-device warning.
    await page.getByRole("tab", { name: "Expenses" }).click();
    await page.locator("#expense-form-amount").fill("4,50");
    await page.getByRole("radio", { name: "Eating out" }).click();
    await page.getByRole("button", { name: "Add note" }).click();
    await page.locator("#expense-form-note").fill("Coffee");
    await page.getByRole("button", { name: "Add expense" }).click();
    await page.locator(".toast-text", { hasText: "Expense added" }).waitFor();
    await page.getByRole("button", { name: "Settings" }).click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator("#restore-backup").click()]);
    await chooser.setFiles(backupPath);
    await page.locator(".restore-source").waitFor();
    await shot(page, `restore-warning-same-device-${tag}.png`);
    await page.getByRole("button", { name: "Close" }).click();
    await context.close();

    // The same file on an empty device: safe, no warning.
    const fresh = await contextFor(size, colorScheme);
    const p2 = await open(fresh, false);
    await p2.getByRole("button", { name: "Settings" }).click();
    const [ch2] = await Promise.all([p2.waitForEvent("filechooser"), p2.locator("#open-device").click()]);
    await ch2.setFiles(backupPath);
    await p2.locator(".restore-source").waitFor();
    await shot(p2, `restore-safe-${tag}.png`);
    // Restore it, make a change here, then open the other device's file again: the other-device warning.
    await p2.locator("#restore-confirm").click();
    await p2.locator(".toast-text", { hasText: "Backup restored" }).waitFor();
    await p2.getByRole("tab", { name: "Expenses" }).click();
    await p2.locator("#expense-form-amount").fill("9");
    await p2.getByRole("radio", { name: "Transport" }).click();
    await p2.getByRole("button", { name: "Add expense" }).click();
    await p2.locator(".toast-text", { hasText: "Expense added" }).waitFor();
    await p2.getByRole("button", { name: "Settings" }).click();
    const [ch3] = await Promise.all([p2.waitForEvent("filechooser"), p2.locator("#open-device").click()]);
    await ch3.setFiles(backupPath);
    await p2.locator(".restore-warning").waitFor();
    await shot(p2, `restore-warning-other-device-${tag}.png`);
    await fresh.close();
  }

  // The backup reminder on Net (sample data, never backed up).
  {
    const context = await contextFor(SIZES[0], "light");
    const page = await open(context, true);
    await page.getByRole("tab", { name: "Net" }).click();
    await page.locator("#backup-reminder").waitFor();
    await shot(page, "net-reminder-375x812-light.png");
    await context.close();
  }

  // Install gate, Safari banner and error screens on a phone.
  for (const colorScheme of ["light", "dark"]) {
    const context = await contextFor(SIZES[0], colorScheme, { userAgent: IPHONE_UA });
    const page = await context.newPage();
    await page.goto(server.url);
    await page.getByRole("heading", { name: "Install Pocket Ledger first" }).waitFor();
    await shot(page, `gate-${colorScheme}.png`);
    await page.getByRole("button", { name: "Use in Safari anyway" }).click();
    await shot(page, `gate-confirm-${colorScheme}.png`);
    await page.getByRole("button", { name: "Use in Safari", exact: true }).click();
    await page.locator("#page-title").waitFor();
    await shot(page, `safari-banner-${colorScheme}.png`);
    await context.close();

    const broken = await contextFor(SIZES[0], colorScheme);
    await broken.addInitScript(() => {
      indexedDB.open = () => {
        throw new DOMException("blocked", "UnknownError");
      };
    });
    const p2 = await broken.newPage();
    await p2.goto(server.url);
    await p2.getByRole("heading", { name: "Can't open your data" }).waitFor();
    await shot(p2, `error-cant-open-${colorScheme}.png`);
    await broken.close();
  }
} catch (e) {
  for (const c of browser.contexts()) for (const p of c.pages()) await p.screenshot({ path: path.join(SHOTS, "FAILED.png") }).catch(() => undefined);
  throw e;
} finally {
  await browser.close();
  await server.close();
}

console.log(`Saved ${saved.length} screenshots to e2e/screenshots/.`);

// Phase 2 end-to-end checks in Chromium: the screens, fast entry, Undo, budgets, goals,
// the install gate, and the storage error screens.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "../scripts/build.mjs";
import { startServer } from "../scripts/serve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHONE = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" };
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

let browser;
let server;

before(async () => {
  const outdir = path.join(ROOT, "e2e/out/dist-app");
  await build({ base: "/", outdir, quiet: true });
  server = await startServer({ dir: outdir, port: 0, quiet: true });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

async function openApp(options = {}) {
  const context = await browser.newContext({ ...PHONE, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.url);
  await page.locator("#page-title").waitFor();
  return { context, page, errors };
}

const tab = (page, name) => page.getByRole("tab", { name }).click();
const toastText = (page) => page.locator(".toast-text").innerText();
const title = (page) => page.locator("#page-title").innerText();

async function addIncome(page, amount, source) {
  await tab(page, "Income");
  await page.locator("#income-form-amount").fill(amount);
  if (source) await page.getByRole("radio", { name: source }).click();
  await page.getByRole("button", { name: "Add income" }).click();
  await page.locator(".toast-text", { hasText: "Income added" }).waitFor();
}

describe("Phase 2 screens", () => {
  test("smoke: salary, an expense in 3 steps, a saving and a goal contribution add up on Net; delete and undo", async () => {
    const { context, page, errors } = await openApp();
    await addIncome(page, "2.400", "Salary");

    // Expense in 3 steps: amount, chip, Enter. Opening the tab focused the amount field.
    await tab(page, "Expenses");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "expense-form-amount");
    await page.keyboard.type("12,50");
    await page.getByRole("radio", { name: "Eating out" }).click();
    await page.locator("#expense-form-amount").press("Enter");
    await page.locator(".toast-text", { hasText: "Expense added" }).waitFor();
    assert.equal(await page.locator("#expense-form-amount").inputValue(), "", "amount clears");
    assert.equal(await page.getByRole("radio", { name: "Eating out" }).getAttribute("aria-checked"), "true", "category stays");

    await tab(page, "Savings");
    await page.locator("#savings-form-amount").fill("300");
    await page.getByRole("button", { name: "Add to savings" }).click();
    await page.locator(".toast-text", { hasText: "Moved into savings" }).waitFor();

    await tab(page, "Goals");
    await page.getByRole("button", { name: "New goal" }).click();
    await page.locator("#goal-name").fill("Summer trip");
    await page.locator("#goal-target").fill("1500");
    await page.getByRole("button", { name: "Create goal" }).click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.locator("#goal-move-amount").fill("100");
    await page.getByRole("button", { name: "Add to Summer trip" }).click();
    await page.locator(".toast-text", { hasText: "€100 added to Summer trip" }).waitFor();
    assert.match(await page.locator(".goal-card").innerText(), /€100 of €1,500/);

    await tab(page, "Net");
    assert.equal(await page.locator("#net-hero .hero-value").innerText(), "€1,987.50");
    const stats = await page.locator("#net-stats").innerText();
    assert.match(stats, /€2,400/);
    assert.match(stats, /€12\.50/);
    assert.match(stats, /€400/);

    // Delete the expense from its edit sheet, then undo.
    await tab(page, "Expenses");
    const expenses = page.locator('[data-screen="expenses"] .entry');
    await expenses.first().click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.locator(".toast-text", { hasText: "Expense deleted" }).waitFor();
    assert.equal(await expenses.count(), 0);
    await page.locator(".toast-action").click();
    await expenses.first().waitFor();
    assert.match(await expenses.first().innerText(), /Eating out/);

    // Everything survives a reload.
    await page.reload();
    await page.locator("#page-title").waitFor();
    await tab(page, "Net");
    assert.equal(await page.locator("#net-hero .hero-value").innerText(), "€1,987.50");
    assert.deepEqual(errors, []);
    await context.close();
  });

  test("editing an entry, and an entry dated last month moves the month picker", async () => {
    const { context, page } = await openApp();
    await addIncome(page, "100", "Gifts");
    const income = page.locator('[data-screen="income"] .entry');
    await income.first().click();
    await page.locator("#edit-amount").fill("150");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.locator(".toast-text", { hasText: "Changes saved" }).waitFor();
    assert.match(await income.first().innerText(), /\+€150/);

    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const iso = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-15`;
    await page.locator("#income-form-amount").fill("50");
    await page.locator("#income-form-date").fill(iso);
    await page.getByRole("button", { name: "Add income" }).click();
    await page.locator(".toast-text", { hasText: "Income added" }).waitFor();
    const label = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(last);
    assert.equal(await page.locator(".picker-label").innerText(), label);
    assert.match(await income.first().innerText(), /\+€50/);
    assert.equal(await page.locator("#income-form-date").getAttribute("max"), `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`, "date picker capped at today");
    await context.close();
  });

  test("invalid input stays in the form with a message; rule refusals explain themselves", async () => {
    const { context, page } = await openApp();
    await tab(page, "Expenses");
    await page.locator("#expense-form-amount").fill("12,345,6");
    await page.getByRole("button", { name: "Add expense" }).click();
    assert.equal(await page.locator("#expense-form-amount-error").innerText(), "Enter an amount like 12,50");
    assert.equal(await page.locator("#expense-form-amount").inputValue(), "12,345,6", "what was typed stays");

    await tab(page, "Savings");
    await page.getByRole("radio", { name: "Take out" }).click();
    await page.locator("#savings-form-amount").fill("5");
    await page.getByRole("button", { name: "Take out of savings" }).click();
    await page.locator(".form-error", { hasText: "Only €0 is free" }).waitFor();
    assert.equal(await page.locator("#savings-form-amount").inputValue(), "5");
    await context.close();
  });

  test("budgets: set one from the sheet, then the pill shows what's left", async () => {
    const { context, page } = await openApp();
    await tab(page, "Expenses");
    await page.getByRole("button", { name: "Set a budget", exact: true }).click();
    await page.locator("#budget-category").selectOption("Groceries");
    await page.locator("#budget-amount").fill("150");
    await page.getByRole("button", { name: "Save budget" }).click();
    await page.locator(".toast-text", { hasText: "Budget saved for Groceries" }).waitFor();
    await page.locator("#expense-form-amount").fill("108");
    await page.getByRole("radio", { name: "Groceries" }).click();
    await page.getByRole("button", { name: "Add expense" }).click();
    await page.locator(".pill", { hasText: "€42 left of €150" }).waitFor();
    await page.locator("#expense-form-amount").fill("54");
    await page.getByRole("button", { name: "Add expense" }).click();
    await page.locator(".pill", { hasText: "Over by €12" }).waitFor();
    await context.close();
  });

  test("goals: take out more than saved is refused; archive 'I spent it'; delete", async () => {
    const { context, page } = await openApp();
    await tab(page, "Goals");
    await page.getByRole("button", { name: "New goal" }).click();
    await page.locator("#goal-name").fill("Laptop");
    await page.locator("#goal-target").fill("1000");
    await page.locator("#goal-opening").fill("200");
    await page.getByRole("button", { name: "Create goal" }).click();
    await page.locator(".goal-card").waitFor();

    await page.getByRole("button", { name: "Take out", exact: true }).click();
    await page.locator("#goal-move-amount").fill("250");
    await page.getByRole("button", { name: "Take out of Laptop" }).click();
    await page.locator(".form-error", { hasText: "This goal only has €200." }).waitFor();
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "More for Laptop" }).click();
    await page.getByRole("button", { name: "Archive goal" }).click();
    await page.getByRole("button", { name: "I spent it" }).click();
    await page.locator(".toast-text", { hasText: "Laptop archived" }).waitFor();
    await page.locator("summary", { hasText: "Archived (1)" }).click();
    assert.match(await page.locator(".goal-card").innerText(), /€0 of €1,000/);

    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete the movements too" }).click();
    await page.locator(".toast-text", { hasText: "Laptop deleted" }).waitFor();
    assert.equal(await page.locator(".goal-card").count(), 0);
    await context.close();
  });

  test("install gate on iPhone in Safari: install steps, then 'Use in Safari anyway' with a lasting banner", async () => {
    const { context, page } = await (async () => {
      const context = await browser.newContext({ ...PHONE, userAgent: IPHONE_UA });
      const page = await context.newPage();
      await page.goto(server.url);
      return { context, page };
    })();
    await page.getByRole("heading", { name: "Install Pocket Ledger first" }).waitFor();
    assert.equal(await page.getByRole("tab").count(), 0, "no tabs behind the gate");
    await page.getByRole("button", { name: "Use in Safari anyway" }).click();
    await page.getByRole("button", { name: "Use in Safari", exact: true }).click();
    await page.locator("#page-title").waitFor();
    assert.match(await page.locator("#safari-banner").innerText(), /Not installed: your data may be deleted/);
    await page.reload();
    await page.locator("#page-title").waitFor();
    assert.equal(await page.locator("#safari-banner").isVisible(), true, "the choice and the banner last");
    await context.close();
  });

  test("storage that won't open shows 'Can't open your data' with Reload", async () => {
    const context = await browser.newContext(PHONE);
    await context.addInitScript(() => {
      indexedDB.open = () => {
        throw new DOMException("blocked by test", "UnknownError");
      };
    });
    const page = await context.newPage();
    await page.goto(server.url);
    await page.getByRole("heading", { name: "Can't open your data" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Reload" }).isVisible(), true);
    await context.close();
  });

  test("an upgrade from another window shows 'Pocket Ledger was updated'", async () => {
    const { context, page } = await openApp();
    const other = await context.newPage();
    await other.goto(server.url + "icons/icon.svg");
    await other.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open("pocket-ledger", 2);
          req.onsuccess = () => (req.result.close(), resolve(undefined));
          req.onerror = () => reject(req.error);
        }),
    );
    await page.getByRole("heading", { name: "Pocket Ledger was updated" }).waitFor();
    await context.close();
  });

  test("small iPhone: with the amount focused, Add expense stays above the decimal keypad", async () => {
    // iPhone SE: 667 tall; the decimal keypad plus the bar above it take about 260 px.
    const { context, page } = await openApp({ viewport: { width: 375, height: 667 } });
    await tab(page, "Expenses");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "expense-form-amount");
    const box = await page.getByRole("button", { name: "Add expense" }).boundingBox();
    assert.ok(box && box.y + box.height <= 667 - 260, `Add expense ends at ${box && box.y + box.height}px; the keypad starts at 407px`);
    await context.close();
  });

  test("Greek phone: amounts use a decimal comma everywhere, cents always show two digits, dates stay English", async () => {
    const { context, page } = await openApp({ locale: "el-GR" });
    await tab(page, "Income");
    assert.equal(await page.locator("#income-form-amount").getAttribute("placeholder"), "0,00");
    await page.locator("#income-form-amount").fill("2400");
    await page.getByRole("button", { name: "Add income" }).click();
    await page.locator(".toast-text", { hasText: "Income added" }).waitFor();
    await tab(page, "Expenses");
    await page.keyboard.type("12,5");
    await page.getByRole("button", { name: "Add expense" }).click();
    await page.locator(".toast-text", { hasText: "Expense added" }).waitFor();
    const entry = page.locator('[data-screen="expenses"] .entry').first();
    assert.match(await entry.innerText(), /−12,50\s€/);
    await entry.click();
    assert.equal(await page.locator("#edit-amount").inputValue(), "12,50", "the edit sheet prefills with a comma");
    await page.getByRole("button", { name: "Close" }).click();
    await tab(page, "Net");
    assert.match(await page.locator("#net-hero .hero-value").innerText(), /^2\.387,50\s€$/);
    assert.match(await page.locator("#net-stats").innerText(), /12,50\s€/);
    const month = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date());
    assert.equal(await page.locator(".picker-label").innerText(), month, "month names are English, like the rest of the app");
    await context.close();
  });

  test("no sideways scroll on any tab at 375 wide, with data", async () => {
    const { context, page } = await openApp();
    await addIncome(page, "2400", "Salary");
    for (const name of ["Net", "Income", "Expenses", "Savings", "Goals"]) {
      await tab(page, name);
      assert.equal(await title(page), name === "Net" ? "Net money" : name);
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 375, `${name} fits`);
    }
    assert.match(await toastText(page), /Income added/);
    await context.close();
  });
});

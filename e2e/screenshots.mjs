// Saves a screenshot of every tab at phone and PC sizes, in light and dark, to e2e/screenshots/.
// This is the layout check when no phone can reach a dev server on the same Wi-Fi.
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

await rm(SHOTS, { recursive: true, force: true });
await mkdir(SHOTS, { recursive: true });
const outdir = path.join(ROOT, "e2e/out/dist-shots");
await build({ base: "/", outdir, quiet: true });
const server = await startServer({ dir: outdir, port: 0, quiet: true });
const browser = await chromium.launch();
const saved = [];

try {
  for (const { phone, ...viewport } of SIZES) {
    for (const colorScheme of ["light", "dark"]) {
      const device = phone ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { deviceScaleFactor: 1 };
      const context = await browser.newContext({ viewport, colorScheme, ...device, serviceWorkers: "block" });
      const page = await context.newPage();
      await page.goto(server.url);
      for (const tab of TABS) {
        await page.getByRole("tab", { name: tab }).click();
        const file = `${tab.toLowerCase()}-${viewport.width}x${viewport.height}-${colorScheme}.png`;
        await page.screenshot({ path: path.join(SHOTS, file) });
        saved.push(file);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}

console.log(`Saved ${saved.length} screenshots to e2e/screenshots/:\n` + saved.map((f) => "  " + f).join("\n"));

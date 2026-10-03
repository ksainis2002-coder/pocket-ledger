// Saves a screenshot of every tab at phone sizes, in light and dark, to e2e/screenshots/.
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
  { width: 375, height: 812 }, // iPhone with a notch
  { width: 375, height: 667 }, // iPhone SE / small phones
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
  for (const viewport of SIZES) {
    for (const colorScheme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport, colorScheme, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
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

// Development: rebuild on every change in src/ or public/ and serve the result.
// No service worker in dev, so changes always show up on reload.
//
//   npm run dev             -> http://localhost:5173/
//   npm run dev -- --host   -> also reachable from a phone on the same Wi-Fi
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";
import { startServer } from "./serve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(ROOT, ".dev-dist");
const host = process.argv.includes("--host") ? "0.0.0.0" : "127.0.0.1";

async function rebuild() {
  try {
    await build({ dev: true, outdir, quiet: true });
    console.log(`[${new Date().toLocaleTimeString()}] Rebuilt. Reload the page to see changes.`);
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] Build failed:`, err instanceof Error ? err.message : err);
  }
}

await rebuild();
await startServer({ dir: outdir, host, port: 5173 });

let timer;
for (const dir of ["src", "public"]) {
  try {
    watch(path.join(ROOT, dir), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 80);
    });
  } catch {
    // public/ may not exist
  }
}

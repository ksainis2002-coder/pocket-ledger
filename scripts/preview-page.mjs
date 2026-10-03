// Builds the app as one self-contained page for trying it out (e.g. hosted as a claude.ai artifact):
// CSS and JS inlined, no service worker, no install gate. Output: e2e/out/preview/pocket-ledger-preview.html
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(ROOT, "e2e/out/preview-build");
await build({ base: "/", preview: true, outdir, quiet: true });
const assets = await readdir(path.join(outdir, "assets"));
const css = await readFile(path.join(outdir, "assets", assets.find((f) => f.endsWith(".css"))), "utf8");
const js = await readFile(path.join(outdir, "assets", assets.find((f) => f.endsWith(".js"))), "utf8");
const icon = await readFile(path.join(ROOT, "public/icons/icon.svg"), "utf8");
if (js.includes("</script")) throw new Error("The bundle contains </script; it can't be inlined safely.");
const iconUri = "data:image/svg+xml;base64," + Buffer.from(icon).toString("base64");
const page = `<title>Pocket Ledger Preview</title>
<meta name="color-scheme" content="light dark">
<style>${css}</style>
<div id="app"></div>
<script type="module">${js.replaceAll("/icons/icon.svg", iconUri)}</script>
`;
await mkdir(path.join(ROOT, "e2e/out/preview"), { recursive: true });
const file = path.join(ROOT, "e2e/out/preview/pocket-ledger-preview.html");
await writeFile(file, page);
console.log(`Preview page: ${path.relative(ROOT, file)} (${Math.round(page.length / 1024)} KB)`);

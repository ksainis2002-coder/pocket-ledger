// Project lint: enforces the CLAUDE.md non-negotiables that a type-checker can't see.
// Runs after `tsc --noEmit` in `npm run lint`. Exits 1 with a list of problems.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const RULES = [
  { re: /\bparseFloat\s*\(/, msg: "Don't use parseFloat. Parse amounts with parseAmount from src/domain/money.ts." },
  { re: /\bNumber\.parseFloat\b/, msg: "Don't use Number.parseFloat. Parse amounts with parseAmount." },
  { re: /new Date\(\s*["'`]\d{4}-\d{2}-\d{2}/, msg: "Don't parse YYYY-MM-DD strings with new Date(); that goes through UTC. Use the helpers in src/domain/months.ts." },
  { re: /new Date\(\s*[a-zA-Z_$][\w$.]*\.date\s*\)/, msg: "Don't pass an entry's date string to new Date(); use the helpers in src/domain/months.ts." },
  { re: /\b(window\.)?confirm\s*\(/, msg: "Don't use confirm(). Use an in-app confirmation sheet or Undo." },
  { re: /\b(window\.)?(alert|prompt)\s*\(/, msg: "Don't use alert() or prompt()." },
  { re: /\.innerHTML\s*[+]?=/, msg: "Don't assign innerHTML. Build DOM with src/components/dom.ts and set text with textContent." },
  { re: /\.outerHTML\s*=|insertAdjacentHTML\s*\(/, msg: "Don't inject HTML strings. Build DOM with src/components/dom.ts." },
  { re: /https?:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org\/2000\/svg)/, msg: "No external URLs in src/. All data stays on the device and nothing is loaded from other hosts." },
  { re: /\blocation\.reload\s*\(/, msg: "The app never reloads itself. Only src/app/updates.ts may reload, after the owner taps Reload.", allow: ["src/app/updates.ts"] },
];

async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p)));
    else if (/\.(ts|css|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

const problems = [];
for (const file of await files(path.join(ROOT, "src"))) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const isTest = rel.endsWith(".test.ts");
  const lines = (await readFile(file, "utf8")).split("\n");
  lines.forEach((line, i) => {
    if (/lint-ignore/.test(line)) return;
    for (const rule of RULES) {
      if (rule.allow?.includes(rel)) continue;
      if (isTest && rule.re.source.includes("Date")) continue;
      if (rule.re.test(line)) problems.push(`${rel}:${i + 1}  ${rule.msg}\n    ${line.trim()}`);
    }
  });
}

if (problems.length) {
  console.error(`Lint found ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n\n` + problems.join("\n\n"));
  process.exit(1);
}
console.log("Lint passed.");

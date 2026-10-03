// Base path helpers shared by the build, the preview server and the e2e tests.
// The base is where the app lives on its host: "/" locally, "/pocket-ledger/" on GitHub Pages.

/** Normalize a base path to start and end with "/". Throws on anything unsafe. */
export function normalizeBase(input) {
  let base = String(input ?? "/").trim();
  if (base === "" || base === ".") base = "/";
  if (!base.startsWith("/")) base = "/" + base;
  if (!base.endsWith("/")) base = base + "/";
  if (!/^\/([A-Za-z0-9._~-]+\/)*$/.test(base) || base.includes("/../") || base.includes("/./")) {
    throw new Error(`Invalid base path: "${input}". Use something like / or /pocket-ledger/`);
  }
  return base;
}

/** Read the base from a --base=... argument, else the BASE env variable, else "/". */
export function readBase(argv = process.argv.slice(2), env = process.env) {
  const arg = argv.find((a) => a.startsWith("--base="));
  if (arg) return normalizeBase(arg.slice("--base=".length));
  if (env.BASE) return normalizeBase(env.BASE);
  return "/";
}

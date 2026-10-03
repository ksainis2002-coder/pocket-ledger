// Static server for a built dist/ folder, served at the build's base path.
//
//   node scripts/serve.mjs            -> http://localhost:4173/<base>
//   node scripts/serve.mjs --host     -> also reachable from a phone on the same Wi-Fi
//   node scripts/serve.mjs --port=5000
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/**
 * @param {{ dir?: string, port?: number, host?: string, quiet?: boolean }} [options]
 * @returns {Promise<{ url: string, base: string, close: () => Promise<void> }>}
 */
export async function startServer({ dir = path.join(ROOT, "dist"), port = 4173, host = "127.0.0.1", quiet = false } = {}) {
  const info = JSON.parse(await readFile(path.join(dir, "build-info.json"), "utf8"));
  const base = info.base;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === base.slice(0, -1)) pathname = base;
      if (!pathname.startsWith(base)) return send(res, 404, "Not found. The app is at " + base);
      let rel = pathname.slice(base.length) || "index.html";
      if (rel.endsWith("/")) rel += "index.html";
      const file = path.resolve(dir, rel);
      if (!file.startsWith(path.resolve(dir) + path.sep)) return send(res, 403, "Forbidden");
      const s = await stat(file).catch(() => null);
      if (!s || !s.isFile()) return send(res, 404, "Not found");
      const body = await readFile(file);
      const type = TYPES[path.extname(file)] ?? "application/octet-stream";
      const headers = { "Content-Type": type, "Cache-Control": rel === "sw.js" || rel === "index.html" ? "no-cache" : "max-age=0" };
      if (rel === "sw.js") headers["Service-Worker-Allowed"] = base;
      res.writeHead(200, headers);
      res.end(body);
    } catch {
      send(res, 500, "Server error");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://${host === "0.0.0.0" ? "localhost" : host}:${actualPort}${base}`;
  if (!quiet) {
    console.log(`Serving ${path.relative(ROOT, dir) || "."} at ${url}`);
    if (host === "0.0.0.0") for (const ip of lanAddresses()) console.log(`  On your phone (same Wi-Fi): http://${ip}:${actualPort}${base}`);
  }
  return { url, base, close: () => new Promise((r) => server.close(() => r())) };
}

function send(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const portArg = args.find((a) => a.startsWith("--port="));
  startServer({
    host: args.includes("--host") ? "0.0.0.0" : "127.0.0.1",
    port: portArg ? Number(portArg.slice(7)) : 4173,
  }).catch((err) => {
    console.error(err.code === "ENOENT" ? "Nothing to serve yet. Run npm run build first." : err.message);
    process.exit(1);
  });
}

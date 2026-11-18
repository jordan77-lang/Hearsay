// Minimal static file server for local development (HearSay site).
// Usage: node tools/serve.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative, isAbsolute } from "node:path";
import { createAiHandler } from "./createai-api.mjs";
import { handleSupabaseConfig } from "./supabase-browser-config.mjs";

const ROOT = process.cwd();
const PORT = Number(process.argv[2]) || 8123;
const handleAi = createAiHandler(PORT);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (urlPath === "/api/supabase/config") { await handleSupabaseConfig(req, res, PORT); return; }
    if (await handleAi(req, res, urlPath)) return;
    if (urlPath.endsWith("/")) urlPath += "index.html";
    // Local service credentials must never be served to a browser.
    if (urlPath.toLowerCase().split(/[\\/]/).some(part => ["config.local.json", "examples.local.json", "examples"].includes(part.split(":")[0].replace(/[. ]+$/, "")))) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const filePath = normalize(join(ROOT, urlPath));
    const relativePath = relative(ROOT, filePath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(filePath)] ?? "application/octet-stream",
      // Dev server: never cache, so edits to JS/CSS/HTML always load on refresh.
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`));

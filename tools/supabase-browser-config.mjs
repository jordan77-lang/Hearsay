import { readFile } from "node:fs/promises";
import { localRequestAllowed } from "./local-request.mjs";

// Only the browser-safe connection fields leave the local server. In particular,
// config.local.json can also hold a serviceRoleKey used by CLI tools.
export function browserSupabaseConfig(config) {
  if (typeof config?.url !== "string" || typeof config?.anonKey !== "string" || !config.url.trim() || !config.anonKey.trim()) return null;
  return { url: config.url.trim().replace(/\/+$/, ""), anonKey: config.anonKey.trim(),
    ...(typeof config.courseId === "string" ? { courseId: config.courseId } : {}) };
}

export async function handleSupabaseConfig(req, res, port) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (req.method !== "POST" || !await localRequestAllowed(req, port)) {
    res.writeHead(403, headers).end(JSON.stringify({ error: "Open HearSay on the local server." })); return;
  }
  let config = null;
  try { config = browserSupabaseConfig(JSON.parse(await readFile(new URL("../supabase/config.local.json", import.meta.url), "utf8"))); } catch { /* Manual connection remains available. */ }
  res.writeHead(config ? 200 : 404, headers).end(JSON.stringify(config || { error: "No local connection configured." }));
}

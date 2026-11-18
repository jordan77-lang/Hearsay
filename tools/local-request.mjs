import { readFile } from "node:fs/promises";

export function sameLocalOrigin(req, port) {
  return [`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host) && req.headers.origin === `http://${req.headers.host}`;
}

export async function localRequestAllowed(req, port, loadAllowedIds = async () => {
  const config = JSON.parse(await readFile(new URL("../createai/config.local.json", import.meta.url), "utf8"));
  return config.allowedExtensionIds;
}) {
  if (sameLocalOrigin(req, port)) return true;
  if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host)) return false;
  const match = /^chrome-extension:\/\/([a-p]{32})$/.exec(req.headers.origin || "");
  if (!match) return false;
  try { const ids = await loadAllowedIds(); return Array.isArray(ids) && ids.includes(match[1]); }
  catch { return false; }
}

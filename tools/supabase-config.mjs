// Load Supabase config from supabase/config.local.json (gitignored).
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function loadLocalConfig() {
  const path = join(process.cwd(), "supabase", "config.local.json");
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

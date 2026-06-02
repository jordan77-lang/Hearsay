// Rebuild course_id=all from every class-specific dictionary.
// npm run sync:dict

import { createDictionaryApi } from "../src/supabase/dictionary-api.js";
import { loadLocalConfig } from "./supabase-config.mjs";

async function main() {
  const config = await loadLocalConfig();
  const key = config.serviceRoleKey ?? config.anonKey;
  if (!key) {
    console.error("Add anonKey or serviceRoleKey to supabase/config.local.json.");
    process.exit(1);
  }

  const api = createDictionaryApi({ url: config.url, anonKey: key, serviceRoleKey: key });
  const { count } = await api.rebuildCombinedDictionary();
  console.log(`Combined dictionary rebuilt: ${count} rules.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

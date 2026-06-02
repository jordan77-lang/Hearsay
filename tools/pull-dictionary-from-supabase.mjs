// Pull dictionary rules from Supabase → .dic file → rebuild dictionary-data.js
//
// Uses anonKey (read-only) or serviceRoleKey from supabase/config.local.json.
// npm run pull:dict

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDictionaryApi } from "../src/supabase/dictionary-api.js";
import { rowsToDic } from "../src/supabase/dictionary-format.js";
import { loadLocalConfig } from "./supabase-config.mjs";
import { execSync } from "node:child_process";

const DIC = join(process.cwd(), "DSL_chemistry_NVDA_default_cH_gmol_no_mol.dic");

async function main() {
  const config = await loadLocalConfig();
  const key = config.serviceRoleKey ?? config.anonKey;
  if (!key) {
    console.error("Add anonKey (or serviceRoleKey) to supabase/config.local.json.");
    process.exit(1);
  }

  const classSlug = config.courseId ?? "chem113";
  const api = createDictionaryApi({ url: config.url, anonKey: key, serviceRoleKey: key });
  const rows = await api.fetchRules(classSlug);

  if (!rows?.length) {
    console.error(
      "No rows found. Run supabase/setup-dictionary-rules.sql (or schema.sql), then npm run push:dict.",
    );
    process.exit(1);
  }

  const dic = rowsToDic(rows);
  await writeFile(DIC, dic, "utf8");
  console.log(`Wrote ${rows.length} rules to ${DIC}`);

  execSync("node tools/build-dictionary.mjs", { stdio: "inherit" });
  console.log("Rebuilt src/core/dictionary-data.js");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

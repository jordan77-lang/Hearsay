// Push the bundled .dic file to Supabase (requires service role key in config).
//
// Existing projects: run supabase/setup-dictionary-rules.sql first.
// Greenfield: run supabase/schema.sql instead.
// Add serviceRoleKey to supabase/config.local.json, then: npm run push:dict

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSupabaseClient } from "../src/supabase/client.js";
import { dicToRows } from "../src/supabase/dictionary-format.js";
import { loadLocalConfig } from "./supabase-config.mjs";

const DIC = join(process.cwd(), "DSL_chemistry_NVDA_default_cH_gmol_no_mol.dic");
const BATCH = 100;

async function deleteClassRules(client, classSlug) {
  try {
    await client.rest(`dictionary_rules?class_slug=eq.${encodeURIComponent(classSlug)}`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
  } catch (err) {
    if (String(err.message).includes("class_slug")) {
      await client.rest(`dictionary_rules?course_id=eq.${encodeURIComponent(classSlug)}`, {
        method: "DELETE",
        prefer: "return=minimal",
      });
      return;
    }
    throw err;
  }
}

async function insertRules(client, rows) {
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      await client.rest("dictionary_rules", {
        method: "POST",
        body: chunk,
        prefer: "return=minimal",
      });
      console.log(`Inserted ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
    }
  } catch (err) {
    if (String(err.message).includes("class_slug")) {
      const legacy = rows.map(({ class_slug, course_id, ...rest }) => ({
        course_id: class_slug ?? course_id,
        ...rest,
      }));
      for (let i = 0; i < legacy.length; i += BATCH) {
        const chunk = legacy.slice(i, i + BATCH);
        await client.rest("dictionary_rules", {
          method: "POST",
          body: chunk,
          prefer: "return=minimal",
        });
        console.log(`Inserted ${Math.min(i + BATCH, legacy.length)} / ${legacy.length}`);
      }
      return;
    }
    throw err;
  }
}

async function main() {
  const config = await loadLocalConfig();
  const key = config.serviceRoleKey;
  if (!key) {
    console.error("Add serviceRoleKey to supabase/config.local.json (never commit it).");
    process.exit(1);
  }

  const raw = await readFile(DIC, "utf8");
  const classSlug = config.courseId ?? "chem113";
  const rows = dicToRows(raw, classSlug);
  const client = createSupabaseClient({ url: config.url, serviceRoleKey: key });

  await deleteClassRules(client, classSlug);
  await insertRules(client, rows);

  console.log(`Pushed ${rows.length} rules for class "${classSlug}".`);
  console.log("Run npm run sync:dict to rebuild the combined (all) dictionary.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

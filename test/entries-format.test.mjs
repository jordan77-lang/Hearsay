import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { entriesToRuleRows, rowsToDic, inferRuleType, mergeRuleRowsByPattern } from "../src/supabase/dictionary-format.js";
import {
  shouldMergeBundledBase,
  mergeRulesForCombined,
  COMBINED_COURSE_ID,
  migrateBuilderSupabaseCredentials,
  setStoredSupabaseConfig,
  clearStoredSupabaseConfig,
  getStoredSupabaseConfig,
} from "../src/supabase/dictionary-api.js";
import { loadClassDictionary, loadDictionary, lookup, ruleCount } from "../src/core/dictionary.js";
import { toDictionarySpeech } from "../src/core/transform.js";

test("entriesToRuleRows maps Dictionary Builder columns", () => {
  const rows = entriesToRuleRows([
    {
      class_slug: "chem113",
      text: "q_solution",
      substitution: "q of solution",
      ignore_case: "Yes",
      note: "test note",
      position: 139,
    },
    {
      class_slug: "chem113",
      text: "J/g°C",
      substitution: "jools per gram degree Celsius",
      ignore_case: "No",
      note: "",
      position: 2,
    },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].pattern, "q_solution");
  assert.equal(rows[0].replacement, "q of solution");
  assert.equal(rows[0].case_sensitive, false);
  assert.equal(rows[0].sort_order, 139);
  assert.equal(rows[0].comment, "test note");
  assert.equal(rows[1].case_sensitive, true);
});

test("shouldMergeBundledBase applies to chem classes only", () => {
  assert.equal(shouldMergeBundledBase("chem113"), true);
  assert.equal(shouldMergeBundledBase("chem116"), true);
  assert.equal(shouldMergeBundledBase("bio181"), false);
});

test("chem113 entries CSV loads and overrides bundled speech", () => {
  const csvPath = join(process.cwd(), "entries_rows.csv");
  const raw = readFileSync(csvPath, "utf8");
  const lines = raw.trim().split(/\r?\n/).slice(1);
  const entries = lines.map((line) => {
    const parts = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuote = !inQuote;
      else if (ch === "," && !inQuote) {
        parts.push(cur);
        cur = "";
      } else cur += ch;
    }
    parts.push(cur);
    return {
      class_slug: parts[1],
      text: parts[2],
      substitution: parts[3],
      ignore_case: parts[5],
      note: parts[6],
      position: Number(parts[7]) || 0,
    };
  });
  const rules = entriesToRuleRows(entries);
  assert.equal(rules.length, 148);

  const dic = rowsToDic(rules);
  loadClassDictionary(dic, "supabase-entries:chem113");
  assert.ok(ruleCount() > 200, "bundled base plus entries");
  assert.equal(lookup("q_solution"), "q of solution");
  assert.equal(toDictionarySpeech("q = mcΔT"), "q equals m c delta T");
});

test("mergeRulesForCombined works with entry-shaped rows", () => {
  const rows = entriesToRuleRows([
    { class_slug: "chem113", text: "mL", substitution: "milliliters", ignore_case: "Yes", position: 1 },
    { class_slug: "bio181", text: "mL", substitution: "milliliters bio", ignore_case: "Yes", position: 1 },
  ]);
  const merged = mergeRulesForCombined(rows, [COMBINED_COURSE_ID, "chem113", "bio181"]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].replacement, "milliliters");
});

test("migrateBuilderSupabaseCredentials copies Dictionary Builder keys", () => {
  if (typeof localStorage === "undefined") return;
  clearStoredSupabaseConfig();
  localStorage.setItem("screenReaderBackendUrl", "https://example.supabase.co");
  localStorage.setItem("screenReaderBackendAnonKey", "test-anon-key");
  migrateBuilderSupabaseCredentials();
  assert.deepEqual(getStoredSupabaseConfig(), {
    url: "https://example.supabase.co",
    anonKey: "test-anon-key",
  });
  clearStoredSupabaseConfig();
  localStorage.removeItem("screenReaderBackendUrl");
  localStorage.removeItem("screenReaderBackendAnonKey");
});

test("mergeRuleRowsByPattern lets dictionary_rules override entries", () => {
  const merged = mergeRuleRowsByPattern(
    [{ pattern: "mL", replacement: "milliliters", sort_order: 1, class_slug: "chem113" }],
    [{ pattern: "mL", replacement: "custom mL", sort_order: 99, class_slug: "chem113" }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].replacement, "custom mL");
});

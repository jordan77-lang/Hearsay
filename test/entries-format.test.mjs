import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  entriesToRuleRows,
  ruleRowsToEntryRows,
  rowsToDic,
  inferRuleType,
  isLiteralLatexPattern,
  mergeRuleRowsByPattern,
} from "../src/supabase/dictionary-format.js";
import {
  shouldMergeBundledBase,
  mergeRulesForCombined,
  COMBINED_COURSE_ID,
  migrateBuilderSupabaseCredentials,
  setStoredSupabaseConfig,
  clearStoredSupabaseConfig,
  getStoredSupabaseConfig,
} from "../src/supabase/dictionary-api.js";
import { loadBareClassDictionary, loadDictionary, lookup, ruleCount, previewTermSpeech } from "../src/core/dictionary.js";
import { toDictionarySpeech } from "../src/core/transform.js";

test("ruleRowsToEntryRows maps dictionary_rules back to editor rows", () => {
  const entries = ruleRowsToEntryRows([
    {
      class_slug: "chem116",
      pattern: "ΔT",
      replacement: "delta T",
      case_sensitive: false,
      rule_type: 0,
      comment: "heat",
    },
    {
      class_slug: "chem116",
      pattern: "(?<=\\d)mL",
      replacement: "milliliters",
      case_sensitive: 0,
      rule_type: 1,
    },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].text, "ΔT");
  assert.equal(entries[0].substitution, "delta T");
  assert.equal(entries[0].ignore_case, "Yes");
  assert.equal(entries[0].note, "heat");
});

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

test("shouldMergeBundledBase applies to demo dictionary only", () => {
  assert.equal(shouldMergeBundledBase("demo"), true);
  assert.equal(shouldMergeBundledBase("chem113"), false);
  assert.equal(shouldMergeBundledBase("bio181"), false);
});

test("empty chem class stays empty without bundled demo base", () => {
  loadBareClassDictionary("chem116-empty");
  assert.equal(ruleCount(), 0);
  assert.notEqual(lookup("mL"), "milliliters");
});

test("chem113 entries CSV loads and overrides bundled speech", () => {
  const csvPath = join(process.cwd(), "test/fixtures/entries_rows.csv");
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
  loadDictionary(dic, "supabase-entries:chem113");
  assert.ok(ruleCount() >= 148, "class rows plus pinned helpers only");
  assert.ok(ruleCount() < 220, "does not merge offline demo base");
  assert.equal(lookup("q_solution"), "q of solution");
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

test("inferRuleType treats LaTeX \\frac and command patterns as literal", () => {
  assert.equal(isLiteralLatexPattern("\\frac{200 g}{mass of H2O2 in solution}"), true);
  assert.equal(inferRuleType("\\frac{200 g}{mass of H2O2 in solution}"), 0);
  assert.equal(inferRuleType("\\Delta"), 0);
  assert.equal(inferRuleType("(?<=\\d)mL"), 1);
});

test("LaTeX fraction dictionary row compiles and previews", () => {
  const pattern = "\\frac{200 g}{mass of H2O2 in solution}";
  const spoken = "200 g divided by mass of H2O2 in solution";
  const rows = entriesToRuleRows([
    { class_slug: "chem113", text: pattern, substitution: spoken, ignore_case: "Yes" },
  ]);
  assert.equal(rows[0].rule_type, 0);
  loadDictionary(rowsToDic(rows), "test-frac");
  assert.equal(
    previewTermSpeech(`use ${pattern} here`, { pattern, substitution: spoken, ignore_case: "Yes" }),
    `use ${spoken} here`,
  );
});

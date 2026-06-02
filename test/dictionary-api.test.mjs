import { test } from "node:test";
import assert from "node:assert/strict";

import {
  mergeRulesForCombined,
  guessRuleType,
  COMBINED_COURSE_ID,
} from "../src/supabase/dictionary-api.js";
import { addonEntriesToRows } from "../src/supabase/dictionary-format.js";

test("mergeRulesForCombined dedupes by pattern across classes", () => {
  const rows = [
    { course_id: "chem113", sort_order: 0, pattern: "J/g°C", replacement: "jools per gram degree Celsius", case_sensitive: false, rule_type: 0 },
    { course_id: "chem113", sort_order: 1, pattern: "mL", replacement: "milliliters", case_sensitive: false, rule_type: 2 },
    { course_id: "chem114", sort_order: 0, pattern: "J/g°C", replacement: "other reading", case_sensitive: false, rule_type: 0 },
    { course_id: "chem114", sort_order: 1, pattern: "kPa", replacement: "kilopascals", case_sensitive: false, rule_type: 2 },
  ];
  const merged = mergeRulesForCombined(rows, ["all", "chem113", "chem114"]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].course_id, COMBINED_COURSE_ID);
  assert.equal(merged[0].pattern, "J/g°C");
  assert.equal(merged[0].replacement, "jools per gram degree Celsius");
  assert.equal(merged[2].pattern, "kPa");
});

test("guessRuleType picks whole word vs regex vs anywhere", () => {
  assert.equal(guessRuleType("mL"), 2);
  assert.equal(guessRuleType("J/g°C"), 0);
  assert.equal(guessRuleType("\\(J/°C\\)"), 1);
});

test("addonEntriesToRows converts classes.addon_defaults seed entries", () => {
  const rows = addonEntriesToRows("chem113", {
    nvdaRegexEntries: [
      { pattern: "mL", replacement: "milliliters", caseSensitive: false, type: 2 },
      { pattern: "\\(J/°C\\)", replacement: "jools per degree Celsius", type: 1, comments: ["unit"] },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].class_slug, "chem113");
  assert.equal(rows[0].pattern, "mL");
  assert.equal(rows[1].comment, "unit");
});

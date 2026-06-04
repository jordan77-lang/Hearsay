import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getAllStarterRows,
  getStarterRowIdsForPreset,
  getStarterRowsByIds,
} from "../src/starter-pronunciation-catalog.js";
import { loadEditorPreviewDictionary } from "../src/core/dictionary.js";
import { rowsToDic } from "../src/supabase/dictionary-format.js";
import { entriesToRuleRows } from "../src/supabase/dictionary-format.js";
import { toDictionarySpeechByLine, formatDictionarySpeechHtmlByLine, toLabDictionarySpeechByLine } from "../src/core/transform.js";

const LAB_SAMPLE = `Heat 10 mL of DI water from 25°C to 30°C. The specific heat capacity is (J/g°C).

Calculate q = mcΔT. Report energy in kJ/mol.`;

function loadStarterPreset(presetId) {
  const rows = getStarterRowsByIds(getStarterRowIdsForPreset(presetId));
  const ruleRows = entriesToRuleRows(
    rows.map((r, i) => ({ ...r, class_slug: "test", position: i + 1 })),
  );
  loadEditorPreviewDictionary(rowsToDic(ruleRows), `starter:${presetId}`);
}

test("starter catalog excludes bare t and in patterns that false-match prose", () => {
  const patterns = new Set(getAllStarterRows().map((r) => r.text));
  assert.ok(!patterns.has("t"));
  assert.ok(!patterns.has("in"));
  assert.ok(!patterns.has("in."));
  assert.ok(!patterns.has("NO"));
  assert.ok(!patterns.has("°"));
  assert.ok(!patterns.has("J"));
});

test("full starter preset speaks lab sample with spaces and without metric tons in delta T", () => {
  loadStarterPreset("all");
  const spoken = toDictionarySpeechByLine(LAB_SAMPLE).replace(/\s+/g, " ").trim();
  assert.doesNotMatch(spoken, /metric ton/i);
  assert.match(spoken, /delta T/i);
  assert.match(spoken, /10 milliliters/i);
  assert.match(spoken, /D I water/i);
  assert.match(spoken, /jools per gram degree Celsius/i);
  assert.match(spoken, /killuh jools per mol/i);
  assert.doesNotMatch(spoken, /millilitersof/i);
  assert.doesNotMatch(spoken, /wordperiod/i);
});

test("full starter preset lab HTML matches combined default SR and dictionary speech", () => {
  loadStarterPreset("all");
  const html = formatDictionarySpeechHtmlByLine(LAB_SAMPLE);
  const plain = html
    .replace(/<div[^>]*>/g, "")
    .replace(/<\/div>/g, " ")
    .replace(/<span[^>]*>/g, "")
    .replace(/<\/span>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const spoken = toLabDictionarySpeechByLine(LAB_SAMPLE).replace(/\s+/g, " ").trim();
  assert.equal(plain, spoken);
  assert.match(plain, /open parenthesis jools per gram degree Celsius close parenthesis/i);
  assert.doesNotMatch(plain, /open parenthesisJ/i);
});

test("essentials preset does not turn Report energy in into inches", () => {
  loadStarterPreset("essentials");
  const spoken = toDictionarySpeechByLine("Report energy in kJ/mol.").replace(/\s+/g, " ").trim();
  assert.doesNotMatch(spoken, /inches/i);
  assert.match(spoken, /killuh jools per mol/i);
});

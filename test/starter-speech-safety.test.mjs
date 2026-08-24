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

test("SI unit rules are case-sensitive so mM is not read as mm", () => {
  loadStarterPreset("all");
  const molar = toDictionarySpeechByLine("Add 5 mM NaCl.").replace(/\s+/g, " ");
  assert.match(molar, /millimolar/i);
  assert.doesNotMatch(molar, /millimeters/i);

  const length = toDictionarySpeechByLine("Cut 5 mm of wire.").replace(/\s+/g, " ");
  assert.match(length, /millimeters/i);
  assert.doesNotMatch(length, /millimolar/i);
});

test("symbol replacements are padded so words do not weld together", () => {
  loadStarterPreset("all");
  const delta = toDictionarySpeechByLine("Record ΔT.").replace(/\s+/g, " ");
  assert.match(delta, /delta T/i);
  assert.doesNotMatch(delta, /deltaT/i);

  const degrees = toDictionarySpeechByLine("Heat to 100°C.").replace(/\s+/g, " ");
  assert.match(degrees, /100 degrees Celsius/i);
  assert.doesNotMatch(degrees, /100degrees/i);

  const paren = toDictionarySpeechByLine("Optical density (OD) was 0.6.").replace(/\s+/g, " ");
  assert.doesNotMatch(paren, /parenthesisO/i);
  assert.doesNotMatch(paren, /Dclose/i);
});

test("hyphenated prose words are not spoken as minus", () => {
  loadStarterPreset("all");
  for (const word of ["well-known", "pre-lab", "step-by-step"]) {
    const spoken = toDictionarySpeechByLine(`A ${word} result.`).replace(/\s+/g, " ");
    assert.doesNotMatch(spoken, /minus/i, `${word} should not speak "minus"`);
  }
});

test("unit patterns that are ordinary English words need a preceding number", () => {
  loadStarterPreset("all");
  const prose = [
    ["Compare the min and max values.", /minutes/i],
    ["A ton of students attended.", /tons/i],
    ["Bring a cup of ice.", /cups/i],
    ["Bake for one min more.", /minutes/i],
  ];
  for (const [sentence, forbidden] of prose) {
    const spoken = toDictionarySpeechByLine(sentence).replace(/\s+/g, " ");
    assert.doesNotMatch(spoken, forbidden, sentence);
  }
  // …but still fire when they are genuinely units.
  assert.match(toDictionarySpeechByLine("Wait 5 min.").replace(/\s+/g, " "), /minutes/i);
  assert.match(toDictionarySpeechByLine("A 2 ton load.").replace(/\s+/g, " "), /tons/i);
});

test("state symbols survive the parenthesis rules", () => {
  loadStarterPreset("all");
  const gas = toDictionarySpeechByLine("CO2 (g) escapes.").replace(/\s+/g, " ");
  assert.match(gas, /gas/i);
  assert.doesNotMatch(gas, /open parenthesis g close parenthesis/i);

  const liquid = toDictionarySpeechByLine("H2O (l) freezes.").replace(/\s+/g, " ");
  assert.match(liquid, /liquid/i);
});

test("formula spoken text does not cascade through unit rules", () => {
  loadStarterPreset("all");
  const spoken = toDictionarySpeechByLine("Add 0.10 M HCl.").replace(/\s+/g, " ");
  assert.match(spoken, /molar/i);
  assert.match(spoken, /hydrochloric acid/i);
  // "H C L" would be rewritten to "H C liters" by the liters rule.
  assert.doesNotMatch(spoken, /liters/i);
});

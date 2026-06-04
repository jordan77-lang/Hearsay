import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizePastedContent } from "../src/core/paste-normalize.js";
import { loadDictionary } from "../src/core/dictionary.js";
import {
  toDictionarySpeech,
  toDictionarySpeechByLine,
  toBaselineSpeechByLine,
  toDefaultScreenReaderSpeechByLine,
  formatBaselineSpeechHtmlByLine,
  formatDictionarySpeechHtmlByLine,
  labFlaggedSpeechTokens,
  createLabTokenLinkResolver,
  setLabTokenLinkResolver,
} from "../src/core/transform.js";
import { loadBareClassDictionary, withEmptyDictionary, loadEditorPreviewDictionary } from "../src/core/dictionary.js";
import { getStarterRowIdsForPreset, getStarterRowsByIds } from "../src/starter-pronunciation-catalog.js";
import { rowsToDic, entriesToRuleRows } from "../src/supabase/dictionary-format.js";
import { findTokens } from "../src/core/detect.js";
import { DICTIONARY_DIC } from "../src/core/dictionary-data.js";

const CALORIMETRY = `ΔT = T2 −T1

Next, calculate the heat absorbed by the calorimeter (qcalorimeter). This quantity depends on the heat capacity of the calorimeter (Ccalorimeter = 40 J/°C) and the temperature change (ΔT):

qcalorimeter = Ccalorimeter × ΔT

\u200B\u180ERecord the value of qcalorimeter in cell B5 of your Google sheet.

Next, calculate the heat absorbed by the solution (qsolution). This quantity depends on the temperature change (ΔT), the mass of the solution (msolution = 60 g), and the specific heat capacity of the solution (csolution = 4.18 J/g°C):

qsolution = msolution × csolution × ΔT

Record the value of qsolution in cell B6 of your Google sheet.

Finally, use the principle of energy conservation to calculate the energy released by the reaction (qreaction). In this case, the principle implies that any energy absorbed by the calorimeter and the liquid must have been released by the reaction:

qreaction =  - ( qcalorimeter  +  qsolution )

Record the value of qreaction in cell B7 of your Google sheet.`;

test("toDictionarySpeech reads calorimetry block without brace markup leaking", () => {
  loadDictionary(DICTIONARY_DIC);
  const spoken = toDictionarySpeech(CALORIMETRY);
  assert.doesNotMatch(spoken, /q_\{/);
  assert.doesNotMatch(spoken, /C_\{/);
  assert.doesNotMatch(spoken, /c_\{/);
  assert.match(spoken, /q of calorimeter/i);
  assert.match(spoken, /capital C of calorimeter/i);
  assert.match(spoken, /q of reaction/i);
  assert.match(spoken, /Record the value/i);
  assert.doesNotMatch(spoken, /re cord/i);
  assert.match(spoken, /cell B5/i);
  assert.match(spoken, /jools per degree Celsius/i);
});

test("toDictionarySpeechByLine preserves paragraph breaks", () => {
  loadDictionary(DICTIONARY_DIC);
  const spoken = toDictionarySpeechByLine("ΔT = T2 −T1\n\nqcalorimeter = Ccalorimeter × ΔT");
  assert.match(spoken, /delta T equals T of 2/i);
  assert.match(spoken, /q of calorimeter/i);
  assert.match(spoken, /\n\n/);
  const lines = spoken.split("\n").filter((l) => l.trim());
  assert.equal(lines.length, 2);
});

test("toBaselineSpeechByLine keeps mL literal not milliliters", () => {
  loadBareClassDictionary("test");
  const spoken = toBaselineSpeechByLine("Heat 10 mL of water.");
  assert.match(spoken, /10\s+mL/i);
  assert.doesNotMatch(spoken, /milliliters/i);
});

test("toBaselineSpeechByLine reads glued variables not internal brace markup", () => {
  loadBareClassDictionary("test");
  const spoken = toBaselineSpeechByLine("qcalorimeter = Ccalorimeter × ΔT");
  assert.match(spoken, /qcalorimeter/i);
  assert.doesNotMatch(spoken, /q_\{/);
  assert.doesNotMatch(spoken, /calorimeter\}/);
});

test("formatBaselineSpeechHtmlByLine does not leak detection markup", () => {
  loadBareClassDictionary("test");
  const html = formatBaselineSpeechHtmlByLine("qcalorimeter = Ccalorimeter");
  assert.doesNotMatch(html, /q_\{/);
  assert.match(html, /qcalorimeter/i);
});

test("formatBaselineSpeechHtmlByLine uses blue for default screen reader pronunciation changes", () => {
  loadBareClassDictionary("test");
  const html = formatBaselineSpeechHtmlByLine("T2 − T1");
  assert.match(html, /hs-lab-speech-baseline/);
});

test("formatBaselineSpeechHtmlByLine spells °C in blue as degrees C", () => {
  loadBareClassDictionary("test");
  const html = formatBaselineSpeechHtmlByLine("Heat from 25°C to 30°C.");
  assert.match(html, /<span class="hs-lab-speech-baseline">degrees C<\/span>/);
  assert.doesNotMatch(html, />°C</);
  assert.doesNotMatch(html, /Celsius/);
});

test("labFlaggedSpeechTokens lists default SR in blue order then class dict in green", () => {
  loadBareClassDictionary("test");
  const base = labFlaggedSpeechTokens("Heat 10 mL from 25°C.");
  assert.ok(base.some((t) => t.kind === "baseline" && /degrees C/i.test(t.spoken)));
  assert.ok(base.every((t) => t.kind === "baseline"));

  const rows = getStarterRowsByIds(getStarterRowIdsForPreset("essentials"));
  loadEditorPreviewDictionary(
    rowsToDic(entriesToRuleRows(rows.map((r, i) => ({ ...r, class_slug: "test", position: i + 1 })))),
    "starter",
  );
  const sample = "Heat 10 mL from 25°C. The specific heat capacity is (J/g°C).";
  const mixed = labFlaggedSpeechTokens(sample, { classDictActive: true });
  assert.ok(mixed.length > 1);
  const kinds = mixed.map((t) => t.kind);
  assert.ok(kinds.includes("dict"));
  assert.ok(kinds.includes("baseline"));
  const ml = mixed.find((t) => t.raw === "mL");
  assert.equal(ml?.kind, "dict");
  assert.match(ml?.spoken ?? "", /milliliters/i);
  const idxMl = mixed.indexOf(ml);
  const idxParen = mixed.findIndex((t) => t.spoken.includes("jools per gram"));
  assert.ok(idxMl >= 0 && idxParen > idxMl, "passage order: mL before parenthetical unit");
  assert.equal(mixed[0]?.id, 0);
  assert.ok(mixed.every((t, i) => t.id === i));
});

test("formatBaselineSpeechHtmlByLine links highlighted speech to flagged token ids", () => {
  loadBareClassDictionary("test");
  const text = "Heat from 25°C.";
  const flagged = labFlaggedSpeechTokens(text);
  const resolver = createLabTokenLinkResolver(flagged);
  setLabTokenLinkResolver(resolver);
  const html = formatBaselineSpeechHtmlByLine(text);
  setLabTokenLinkResolver(null);
  assert.match(html, /data-lab-token="0"/);
  assert.match(html, /hs-lab-speech-link/);
  assert.match(html, /degrees C/);
});

test("toDefaultScreenReaderSpeechByLine uses NVDA symbols not unit lexicon", () => {
  loadBareClassDictionary("test");
  const spoken = toDefaultScreenReaderSpeechByLine("Heat 10 mL from 25°C.");
  assert.match(spoken, /25 degrees C/i);
  assert.match(spoken, /10 mL/i);
  assert.doesNotMatch(spoken, /milliliters/i);
});

test("formatDictionarySpeechHtmlByLine colors dictionary-changed segments green", () => {
  loadDictionary(DICTIONARY_DIC);
  const html = formatDictionarySpeechHtmlByLine("Heat 10 mL of DI water.");
  assert.match(html, /<span class="hs-lab-speech-dict">milliliters<\/span>/);
  assert.match(html, /<span class="hs-lab-speech-dict">D I water<\/span>/);
  assert.doesNotMatch(html, /<span[^>]*>D<\/span> <span[^>]*>I<\/span>/);
});

test("formatDictionarySpeechHtmlByLine shows green class and blue default on same line", () => {
  loadEditorPreviewDictionary("mL\tmilliliters\t0\t0");
  const html = formatDictionarySpeechHtmlByLine("Heat 10 mL from 25°C.");
  assert.match(html, /<span class="hs-lab-speech-dict">milliliters<\/span>/);
  assert.match(html, /<span class="hs-lab-speech-baseline">degrees C<\/span>/);
  assert.doesNotMatch(html, />°C</);
});

test("empty class dictionary column matches baseline until terms are saved", () => {
  loadBareClassDictionary("test-empty");
  const sample = "Heat 10 mL of water.";
  const base = toBaselineSpeechByLine(sample).replace(/\s+/g, " ").trim();
  const withClass = toDictionarySpeechByLine(sample).replace(/\s+/g, " ").trim();
  assert.match(base, /mL/i);
  assert.doesNotMatch(base, /milliliters/i);
  // Lab uses baseline for the dictionary column when class has no rows (see screen-reader-lab.js).
  assert.equal(base, withClass.replace(/\s+/g, " ").trim());
});

test("formatDictionarySpeechHtmlByLine has no dict color when no class dictionary loaded", () => {
  withEmptyDictionary(() => {
    const html = formatDictionarySpeechHtmlByLine("Heat 10 mL of DI water.");
    assert.doesNotMatch(html, /hs-lab-speech-dict/);
  });
});

test("toBaselineSpeechByLine differs from full dictionary for dictionary-only terms", () => {
  loadDictionary(DICTIONARY_DIC);
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const base = toBaselineSpeechByLine("DI water");
  const full = toDictionarySpeechByLine("DI water");
  assert.notEqual(norm(base), norm(full));
  assert.match(full, /D I water/i);
});

test("formatDictionarySpeechHtmlByLine highlights calorimetry variables as phrases", () => {
  loadDictionary(DICTIONARY_DIC);
  const html = formatDictionarySpeechHtmlByLine("qcalorimeter = Ccalorimeter × ΔT");
  assert.match(html, /<span class="hs-lab-speech-dict">q of calorimeter<\/span>/);
  assert.match(html, /<span class="hs-lab-speech-dict">capital C of calorimeter<\/span>/);
});

test("normalized paste uses internal brace markup for detection only", () => {
  const norm = normalizePastedContent(CALORIMETRY);
  assert.match(norm, /q_\{calorimeter\}/);
  assert.match(norm, /Record the value of q_\{calorimeter\} in cell B5/);
});

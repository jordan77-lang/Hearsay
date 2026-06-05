import { test } from "node:test";
import assert from "node:assert/strict";

import { loadEditorPreviewDictionary, loadDictionary } from "../src/core/dictionary.js";
import { DICTIONARY_DIC } from "../src/core/dictionary-data.js";
import {
  formatDictionarySpeechHtmlByLine,
  toDefaultScreenReaderSpeechByLine,
  toLabDictionarySpeechByLine,
} from "../src/core/transform.js";

test("toLabDictionarySpeechByLine uses class dictionary over default SR", () => {
  loadEditorPreviewDictionary("mL\tmilliliters\t0\t0");
  const spoken = toLabDictionarySpeechByLine("Heat 10 mL from 25°C.");
  assert.match(spoken, /milliliters/i);
  assert.match(spoken, /degrees C/i);
  assert.doesNotMatch(spoken, /\bcomma\b/i);
});

test("toLabDictionarySpeechByLine matches dictionary column HTML speech", () => {
  loadEditorPreviewDictionary("mL\tmilliliters\t0\t0");
  const html = formatDictionarySpeechHtmlByLine("Heat 10 mL from 25°C.");
  const plain = html
    .replace(/<div[^>]*>/g, "")
    .replace(/<\/div>/g, "")
    .replace(/<span[^>]*>/g, "")
    .replace(/<\/span>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  assert.equal(plain, toLabDictionarySpeechByLine("Heat 10 mL from 25°C.").replace(/\s+/g, " ").trim());
});

test("toLabDictionarySpeechByLine without class rules matches default SR", () => {
  loadEditorPreviewDictionary("");
  const text = "q = mcΔT, then (ΔT).";
  assert.equal(
    toLabDictionarySpeechByLine(text).replace(/\s+/g, " ").trim(),
    toDefaultScreenReaderSpeechByLine(text).replace(/\s+/g, " ").trim(),
  );
});

test("formatDictionarySpeechHtmlByLine spaces after open parenthesis dict terms", () => {
  loadDictionary(DICTIONARY_DIC);
  const strip = (html) => html.replace(/<[^>]+>/g, "");
  assert.match(strip(formatDictionarySpeechHtmlByLine("(qcalorimeter)")), /open parenthesis q of calorimeter close parenthesis/);
  assert.match(
    strip(formatDictionarySpeechHtmlByLine("qreaction = − (qcalorimeter + qsolution)")),
    /minus open parenthesis q of calorimeter plus q of solution close parenthesis/,
  );
  assert.doesNotMatch(strip(formatDictionarySpeechHtmlByLine("(qcalorimeter)")), /parenthesisq/i);
});

test("toLabDictionarySpeechByLine applies long class phrases and symbol rules", () => {
  const timesSign = "\u2715";
  loadEditorPreviewDictionary(
    "200 gmass of H2O2 in solution\t200 grams mass of H two O two in solution\t0\t0\n" +
      `${timesSign}\ttimes sign\t0\t0`,
  );
  assert.match(
    toLabDictionarySpeechByLine("The sample is 200 gmass of H2O2 in solution today."),
    /200 grams mass of H two O two in solution/i,
  );
  assert.match(toLabDictionarySpeechByLine(`Rate ${timesSign} time`), /times sign/i);
});

test("bundled dictionary speaks ✕ as times without a class override", () => {
  const timesSign = "\u2715";
  loadDictionary(DICTIONARY_DIC);
  assert.match(toLabDictionarySpeechByLine(`energy ${timesSign} mass`), /times/i);
  assert.doesNotMatch(toLabDictionarySpeechByLine(`energy ${timesSign} mass`), /✕/);
});

test("bundled dictionary does not read in as inches after H2O2", () => {
  loadDictionary(DICTIONARY_DIC);
  const spoken = toLabDictionarySpeechByLine("H2O2 in solution");
  assert.match(spoken, /H two O two in solution/i);
  assert.doesNotMatch(spoken, /inches/i);
});

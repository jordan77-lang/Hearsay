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

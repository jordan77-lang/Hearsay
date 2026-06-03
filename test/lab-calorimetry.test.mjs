import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizePastedContent } from "../src/core/paste-normalize.js";
import { loadDictionary } from "../src/core/dictionary.js";
import { toDictionarySpeech, toDictionarySpeechByLine, formatDictionarySpeechHtmlByLine } from "../src/core/transform.js";
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

test("formatDictionarySpeechHtmlByLine bolds dictionary-changed segments", () => {
  loadDictionary(DICTIONARY_DIC);
  const html = formatDictionarySpeechHtmlByLine("Heat 10 mL of DI water.");
  assert.match(html, /<strong class="hs-lab-speech-changed">milliliters<\/strong>/);
  assert.match(html, /<strong class="hs-lab-speech-changed">D I water<\/strong>/);
  assert.doesNotMatch(html, /<strong[^>]*>D<\/strong> <strong[^>]*>I<\/strong>/);
});

test("formatDictionarySpeechHtmlByLine highlights calorimetry variables as phrases", () => {
  loadDictionary(DICTIONARY_DIC);
  const html = formatDictionarySpeechHtmlByLine("qcalorimeter = Ccalorimeter × ΔT");
  assert.match(html, /<strong class="hs-lab-speech-changed">q of calorimeter<\/strong>/);
  assert.match(html, /<strong class="hs-lab-speech-changed">capital C of calorimeter<\/strong>/);
});

test("normalized paste uses internal brace markup for detection only", () => {
  const norm = normalizePastedContent(CALORIMETRY);
  assert.match(norm, /q_\{calorimeter\}/);
  assert.match(norm, /Record the value of q_\{calorimeter\} in cell B5/);
});

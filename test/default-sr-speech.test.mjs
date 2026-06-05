import { test } from "node:test";
import assert from "node:assert/strict";

import { defaultSrSpeakVisible } from "../src/core/default-sr-speech.js";
import {
  formatBaselineSpeechHtmlByLine,
  formatDictionarySpeechHtmlByLine,
  toDefaultScreenReaderSpeechByLine,
} from "../src/core/transform.js";
import {
  loadBareClassDictionary,
  loadEditorPreviewDictionary,
  loadDictionary,
} from "../src/core/dictionary.js";
import { DICTIONARY_DIC } from "../src/core/dictionary-data.js";

test("defaultSrSpeakVisible reads J/g°C as letters and slash not joules per gram", () => {
  const spoken = defaultSrSpeakVisible("J/g°C");
  assert.match(spoken, /J slash g degrees C/i);
  assert.doesNotMatch(spoken, /joules/i);
  assert.doesNotMatch(spoken, /Celsius/i);
});

test("defaultSrSpeakVisible keeps mL literal", () => {
  const spoken = defaultSrSpeakVisible("Heat 10 mL of water.");
  assert.match(spoken, /10 mL/i);
  assert.doesNotMatch(spoken, /milliliters/i);
});

test("defaultSrSpeakVisible expands slash and degree symbol only", () => {
  assert.match(defaultSrSpeakVisible("25°C"), /25 degrees C/i);
  assert.match(defaultSrSpeakVisible("a/b"), /a slash b/i);
});

test("defaultSrSpeakVisible speaks multiplication cross ✕ as times", () => {
  assert.match(defaultSrSpeakVisible("\u2715 q"), /times q/i);
});

test("defaultSrSpeakVisible does not speak comma at factory level some", () => {
  assert.doesNotMatch(defaultSrSpeakVisible("A, B"), /\bcomma\b/i);
});

test("formatBaselineSpeechHtmlByLine spells °C in blue as degrees C not Celsius", () => {
  loadBareClassDictionary("test");
  const html = formatBaselineSpeechHtmlByLine("Heat from 25°C to 30°C.");
  assert.match(html, /<span class="hs-lab-speech-baseline">degrees C<\/span>/);
  assert.doesNotMatch(html, /Celsius/);
});

test("formatBaselineSpeechHtmlByLine highlights J/g°C as slash and degrees C", () => {
  loadBareClassDictionary("test");
  const html = formatBaselineSpeechHtmlByLine("4.18 J/g°C");
  assert.match(html, /hs-lab-speech-baseline/);
  assert.match(html, /slash/);
  assert.match(html, /degrees C/);
  assert.doesNotMatch(html, /joules/i);
});

test("toDefaultScreenReaderSpeechByLine does not expand chemistry units", () => {
  loadBareClassDictionary("test");
  const spoken = toDefaultScreenReaderSpeechByLine("Heat 10 mL from 25°C.");
  assert.match(spoken, /10 mL/i);
  assert.match(spoken, /25 degrees C/i);
  assert.doesNotMatch(spoken, /milliliters/i);
});

test("formatDictionarySpeechHtmlByLine shows green class and blue default on same line", () => {
  loadEditorPreviewDictionary("mL\tmilliliters\t0\t0");
  const html = formatDictionarySpeechHtmlByLine("Heat 10 mL from 25°C.");
  assert.match(html, /<span class="hs-lab-speech-dict">milliliters<\/span>/);
  assert.match(html, /<span class="hs-lab-speech-baseline">degrees C<\/span>/);
});

test("formatDictionarySpeechHtmlByLine colors class J/g°C green not joules baseline", () => {
  loadDictionary(DICTIONARY_DIC);
  const html = formatDictionarySpeechHtmlByLine("csolution = 4.18 J/g°C");
  assert.match(html, /<span class="hs-lab-speech-dict">jools per gram degree Celsius<\/span>/i);
  assert.doesNotMatch(html, /hs-lab-speech-baseline.*joules/i);
});

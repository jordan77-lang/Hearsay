import { test } from "node:test";
import assert from "node:assert/strict";

import {
  defaultSrSpeakVisible,
  defaultSrVisibleSegments,
  DEFAULT_SR_PUNCTUATION_LEVEL,
  LAB_DEFAULT_SR_PUNCTUATION_LEVEL,
} from "../src/core/default-sr-speech.js";
import { labSpeechNeedsGap } from "../src/core/lab-speech-gap.js";
import {
  formatBaselineSpeechHtmlByLine,
  formatDictionarySpeechHtmlByLine,
  toDefaultScreenReaderSpeechByLine,
} from "../src/core/transform.js";
import { loadBareClassDictionary, loadDictionary } from "../src/core/dictionary.js";
import { DICTIONARY_DIC } from "../src/core/dictionary-data.js";

test("defaultSrSpeakVisible does not say comma at factory punctuation level some", () => {
  const spoken = defaultSrSpeakVisible("First, calculate the value.");
  assert.doesNotMatch(spoken, /\bcomma\b/i);
  assert.match(spoken, /First, calculate/i);
});

test("defaultSrSpeakVisible speaks left paren at lab default level most", () => {
  const spoken = defaultSrSpeakVisible("(ΔT)", LAB_DEFAULT_SR_PUNCTUATION_LEVEL);
  assert.match(spoken, /left paren ΔT right paren/);
});

test("defaultSrSpeakVisible still says times and minus at lab default level", () => {
  assert.match(defaultSrSpeakVisible("× ΔT", LAB_DEFAULT_SR_PUNCTUATION_LEVEL), /times ΔT/);
  assert.match(defaultSrSpeakVisible("T₂ − T₁", LAB_DEFAULT_SR_PUNCTUATION_LEVEL), /T₂ minus T₁/);
});

test("defaultSrSpeakVisible reads comma when punctuation level is all", () => {
  const spoken = defaultSrSpeakVisible("First, next", "all");
  assert.match(spoken, /comma/i);
});

test("labSpeechNeedsGap separates spoken symbols from math tokens", () => {
  assert.equal(labSpeechNeedsGap("left paren", "ΔT"), false);
  assert.equal(labSpeechNeedsGap("T₂", "minus"), true);
  assert.equal(labSpeechNeedsGap("ΔT", "right paren"), false);
  assert.equal(labSpeechNeedsGap("10", "milliliters"), true);
});

test("formatBaselineSpeechHtmlByLine uses NVDA left paren not class open parenthesis", () => {
  loadBareClassDictionary("test");
  const strip = (html) => html.replace(/<[^>]+>/g, "");
  assert.match(strip(formatBaselineSpeechHtmlByLine("(ΔT)")), /left paren ΔT right paren/);
  assert.doesNotMatch(strip(formatBaselineSpeechHtmlByLine("(ΔT)")), /open parenthesis/i);
  assert.match(strip(formatBaselineSpeechHtmlByLine("× ΔT")), /times ΔT/);
  assert.match(strip(formatBaselineSpeechHtmlByLine("T2 −T1")), /T₂ minus T₁/);
});

test("formatDictionarySpeechHtmlByLine uses class open parenthesis over default left paren", () => {
  loadDictionary(DICTIONARY_DIC);
  const strip = (html) => html.replace(/<[^>]+>/g, "");
  assert.match(strip(formatDictionarySpeechHtmlByLine("(ΔT)")), /open parenthesis delta T close parenthesis/i);
  assert.doesNotMatch(strip(formatDictionarySpeechHtmlByLine("(ΔT)")), /left paren/i);
});

test("formatBaselineSpeechHtmlByLine keeps Record intact", () => {
  loadBareClassDictionary("test");
  const strip = (html) => html.replace(/<[^>]+>/g, "");
  assert.match(strip(formatBaselineSpeechHtmlByLine("Record your answer in cell B4.")), /Record your answer/i);
  assert.doesNotMatch(strip(formatBaselineSpeechHtmlByLine("Record your answer in cell B4.")), /re cord/i);
});

test("formatDictionarySpeechHtmlByLine keeps Record intact and spaces after open parenthesis", () => {
  loadDictionary(DICTIONARY_DIC);
  const strip = (html) => html.replace(/<[^>]+>/g, "");
  assert.match(
    strip(formatDictionarySpeechHtmlByLine("Record the value of qcalorimeter in cell B5.")),
    /Record the value of q of calorimeter/i,
  );
  assert.doesNotMatch(strip(formatDictionarySpeechHtmlByLine("(qcalorimeter)")), /parenthesisq/i);
});

test("toDefaultScreenReaderSpeechByLine matches baseline column speech", () => {
  loadBareClassDictionary("test");
  const line = "(Ccalorimeter = 40 J/°C) and (ΔT).";
  const html = formatBaselineSpeechHtmlByLine(line).replace(/<[^>]+>/g, "");
  const spoken = toDefaultScreenReaderSpeechByLine(line);
  assert.equal(html.replace(/\s+/g, " ").trim(), spoken.replace(/\s+/g, " ").trim());
});

test("DEFAULT_SR_PUNCTUATION_LEVEL is some and LAB level is most", () => {
  assert.equal(DEFAULT_SR_PUNCTUATION_LEVEL, "some");
  assert.equal(LAB_DEFAULT_SR_PUNCTUATION_LEVEL, "most");
});

test("defaultSrVisibleSegments marks slash and degrees at level some", () => {
  const segs = defaultSrVisibleSegments("J/g°C");
  assert.ok(segs.some((s) => s.changed && /slash/i.test(s.spoken)));
  assert.ok(segs.some((s) => s.changed && /degrees C/i.test(s.spoken)));
});

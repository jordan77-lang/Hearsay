import { test } from "node:test";
import assert from "node:assert/strict";

import {
  defaultSrSpeakVisible,
  defaultSrVisibleSegments,
  DEFAULT_SR_PUNCTUATION_LEVEL,
  SR_PROFILES,
  setDefaultSrProfile,
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

test("defaultSrSpeakVisible speaks left paren at punctuation level most", () => {
  const spoken = defaultSrSpeakVisible("(ΔT)", "most");
  assert.match(spoken, /left paren delta T right paren/);
});

test("factory NVDA profile passes parens through as pauses", () => {
  setDefaultSrProfile("nvda");
  assert.doesNotMatch(defaultSrSpeakVisible("(ΔT)"), /paren/i);
});

test("JAWS profile names parens at factory settings", () => {
  setDefaultSrProfile("jaws");
  assert.match(defaultSrSpeakVisible("(ΔT)"), /left paren delta T right paren/);
  setDefaultSrProfile("nvda");
});

test("defaultSrSpeakVisible still says times and minus at factory NVDA", () => {
  setDefaultSrProfile("nvda");
  assert.match(defaultSrSpeakVisible("× ΔT"), /times delta T/);
  // NVDA factory reads unicode subscript digits as "subscript N" (en/symbols.dic, level some).
  assert.match(defaultSrSpeakVisible("T₂ − T₁"), /T subscript 2 minus T subscript 1/);
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

test("formatBaselineSpeechHtmlByLine follows the selected reader profile", () => {
  loadBareClassDictionary("test");
  const strip = (html) => html.replace(/<[^>]+>/g, "");
  setDefaultSrProfile("nvda");
  assert.doesNotMatch(strip(formatBaselineSpeechHtmlByLine("(ΔT)")), /paren/i);
  assert.match(strip(formatBaselineSpeechHtmlByLine("× ΔT")), /times delta T/);
  assert.match(strip(formatBaselineSpeechHtmlByLine("T2 −T1")), /T subscript 2 minus T subscript 1/);
  setDefaultSrProfile("jaws");
  assert.match(strip(formatBaselineSpeechHtmlByLine("(ΔT)")), /left paren delta T right paren/);
  assert.doesNotMatch(strip(formatBaselineSpeechHtmlByLine("(ΔT)")), /open parenthesis/i);
  assert.match(strip(formatBaselineSpeechHtmlByLine("T2 −T1")), /T 2 minus T 1/);
  setDefaultSrProfile("nvda");
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

test("profiles use true factory levels: NVDA some, JAWS most", () => {
  assert.equal(DEFAULT_SR_PUNCTUATION_LEVEL, "some");
  assert.equal(SR_PROFILES.nvda.level, "some");
  assert.equal(SR_PROFILES.jaws.level, "most");
});

test("defaultSrVisibleSegments marks slash and degrees at level some", () => {
  const segs = defaultSrVisibleSegments("J/g°C");
  assert.ok(segs.some((s) => s.changed && /slash/i.test(s.spoken)));
  assert.ok(segs.some((s) => s.changed && /degrees C/i.test(s.spoken)));
});

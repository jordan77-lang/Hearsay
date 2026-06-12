import { test } from "node:test";
import assert from "node:assert/strict";

import { defaultSrSpeakVisible, setDefaultSrProfile } from "../src/core/default-sr-speech.js";
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

test("sentence-ending period is a pause, never dot, below punctuation all", () => {
  assert.doesNotMatch(defaultSrSpeakVisible("Heat the water."), /\bdot\b/i);
  assert.doesNotMatch(defaultSrSpeakVisible("Heat the water.", "most"), /\bdot\b/i);
  assert.match(defaultSrSpeakVisible("Heat the water.", "all"), /water dot/i);
});

test("dots inside web and file names still say dot like NVDA", () => {
  assert.match(defaultSrSpeakVisible("see uh.edu now"), /uh dot edu/i);
});

test("decimal point stays silent at every level", () => {
  assert.match(defaultSrSpeakVisible("4.18 J", "all"), /4\.18/);
});

test("ellipsis pauses below all and says dot dot dot at all", () => {
  assert.doesNotMatch(defaultSrSpeakVisible("wait… then", "most"), /dot/i);
  assert.doesNotMatch(defaultSrSpeakVisible("wait... then", "most"), /dot/i);
  assert.match(defaultSrSpeakVisible("wait... then", "all"), /dot dot dot/i);
});

test("negative numbers say minus at every level even with a hyphen", () => {
  assert.match(defaultSrSpeakVisible("cooled to -5"), /minus 5/);
  assert.match(defaultSrSpeakVisible("cooled to −5", "none"), /minus 5/);
  // A hyphen between word characters is not a negative number.
  assert.doesNotMatch(defaultSrSpeakVisible("pages 3-5"), /minus/);
});

test("bullets and list markers are spoken at factory level some", () => {
  assert.match(defaultSrSpeakVisible("• Heat the water"), /bullet Heat the water/i);
  assert.match(defaultSrSpeakVisible("◦ stir"), /white bullet stir/i);
});

test("tab characters are silent whitespace during reading", () => {
  assert.doesNotMatch(defaultSrSpeakVisible("Name\tValue", "most"), /\btab\b/i);
});

test("unicode sub and superscript digits read as subscript and superscript", () => {
  assert.match(defaultSrSpeakVisible("H₂O"), /H subscript 2 O/);
  assert.match(defaultSrSpeakVisible("cm²"), /cm superscript 2/);
});

test("Greek letters read by name like real synthesizers", () => {
  assert.match(defaultSrSpeakVisible("ΔT = 5"), /delta T equals 5/);
  assert.match(defaultSrSpeakVisible("ΔH"), /delta H/);
  assert.match(defaultSrSpeakVisible("λ = 500 nm", "none"), /lambda/);
  assert.match(defaultSrSpeakVisible("π r²"), /pi r superscript 2/);
  assert.match(defaultSrSpeakVisible("Σx and ∑x"), /sigma x and n-ary summation x/);
});

test("en and em dashes are named at most but pause at some", () => {
  assert.match(defaultSrSpeakVisible("A – B", "most"), /en dash/i);
  assert.match(defaultSrSpeakVisible("A — B", "most"), /em dash/i);
  assert.doesNotMatch(defaultSrSpeakVisible("A – B"), /dash/i);
});

test("curly quotes are named at most but apostrophes in words stay natural", () => {
  assert.match(defaultSrSpeakVisible("“heat”", "most"), /left quote heat right quote/i);
  assert.match(defaultSrSpeakVisible("don’t stop", "most"), /don’t stop/);
});

test("subscript Latin and Greek letters read as their base letters", () => {
  assert.match(defaultSrSpeakVisible("Kₐ value"), /K a value/);
  assert.match(defaultSrSpeakVisible("vᵢ and vᵣ"), /v i and v r/);
  assert.match(defaultSrSpeakVisible("xᵦ"), /x beta/);
  assert.match(defaultSrSpeakVisible("Tᵧ", "none"), /T gamma/);
});

test("superscript i reads as base letter like real synthesizers", () => {
  assert.match(defaultSrSpeakVisible("xⁱ"), /x i/);
});

test("fullwidth comparison signs read like ASCII ones", () => {
  assert.match(defaultSrSpeakVisible("a ＞ b"), /a greater b/);
  assert.match(defaultSrSpeakVisible("a ＜ b"), /a less b/);
});

test("extended arrows are spoken by name at factory level", () => {
  assert.match(defaultSrSpeakVisible("A ↔ B"), /left-right arrow/i);
  assert.match(defaultSrSpeakVisible("up ↕ down"), /up-down arrow/i);
  assert.match(defaultSrSpeakVisible("redo ↻"), /clockwise open circle arrow/i);
  assert.match(defaultSrSpeakVisible("go ⇢ there"), /rightwards dashed arrow/i);
});

test("always-spoken math symbols read at any punctuation level", () => {
  assert.match(defaultSrSpeakVisible("x ≤ 5", "none"), /less- than or equal to/i);
  assert.match(defaultSrSpeakVisible("≈ 4", "none"), /almost Equal to 4/i);
  assert.match(defaultSrSpeakVisible("½ cup", "none"), /one half cup/i);
});

test("factory NVDA keeps parens quotes colons and semis as pauses", () => {
  setDefaultSrProfile("nvda");
  const spoken = defaultSrSpeakVisible('Note: add "heat" (twice); done.');
  assert.doesNotMatch(spoken, /colon|quote|paren|semi/i);
});

test("JAWS profile speaks its verified factory set", () => {
  setDefaultSrProfile("jaws");
  assert.match(defaultSrSpeakVisible("(ΔT)"), /left paren delta T right paren/);
  assert.match(defaultSrSpeakVisible("Gaseous: a gas"), /Gaseous colon a gas/);
  assert.match(defaultSrSpeakVisible("pause; here"), /pause semi-colon here/);
  assert.match(defaultSrSpeakVisible("blue-green"), /blue dash green/);
  assert.match(defaultSrSpeakVisible("A – B"), /A n dash B/);
  assert.match(defaultSrSpeakVisible("“heat”"), /left quote heat right quote/);
  setDefaultSrProfile("nvda");
});

test("JAWS profile reads subscript digits as plain digits not subscript", () => {
  setDefaultSrProfile("jaws");
  assert.match(defaultSrSpeakVisible("H₂O"), /H 2 O/);
  assert.doesNotMatch(defaultSrSpeakVisible("H₂O"), /subscript/i);
  setDefaultSrProfile("nvda");
});

test("JAWS profile uses JAWS wording: mu, divided by, n dash", () => {
  setDefaultSrProfile("jaws");
  assert.match(defaultSrSpeakVisible("5 µ"), /5 mu/);
  assert.match(defaultSrSpeakVisible("5 ÷ 2"), /5 divided by 2/);
  setDefaultSrProfile("nvda");
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

// Default screen reader speech (no class / user speech dictionary).
//
// Models NVDA on a fresh install with factory punctuation level "some":
//   - locale/en/symbols.dic symbol replacements only
//   - letters, numbers, and unit tokens (J, g, mL, °C) pass through to TTS unchanged
//
// NVDA does NOT ship chemistry unit expansions (no "joules per gram…"). Those come
// from user speech dictionaries or course add-ons — the green column in Lab.
//
// Symbol source (English):
//   https://github.com/nvaccess/nvda/blob/master/source/locale/en/symbols.dic
// Cross-check: Eleven Ways screen reader character test (NVDA 2022.4, punctuation some).

import { labSpeechNeedsGap } from "./lab-speech-gap.js";

/** @typedef {{ display: string, spoken: string, changed: boolean }} DefaultSrSegment */

/** Factory-default NVDA punctuation level for general reading. */
export const DEFAULT_SR_PUNCTUATION_LEVEL = "some";

/** Lab default column: speak symbols through NVDA level "most" (includes parentheses). */
export const LAB_DEFAULT_SR_PUNCTUATION_LEVEL = "most";

/** @type {Record<string, number>} */
const LEVEL_RANK = { none: 0, some: 1, most: 2, all: 3, char: 4 };

/** @typedef {{ spoken: string, level: keyof typeof LEVEL_RANK }} NvdaSymbolEntry */

/** char → NVDA replacement + minimum level (from en/symbols.dic). */
/** @type {Map<string, NvdaSymbolEntry>} */
const NVDA_SYMBOLS = new Map([
  ["!", { spoken: "bang", level: "all" }],
  ["?", { spoken: "question", level: "all" }],
  ['"', { spoken: "quote", level: "most" }],
  ["#", { spoken: "number", level: "some" }],
  ["$", { spoken: "dollar", level: "all" }],
  ["%", { spoken: "percent", level: "some" }],
  ["&", { spoken: "and", level: "some" }],
  ["'", { spoken: "tick", level: "all" }],
  ["(", { spoken: "left paren", level: "most" }],
  [")", { spoken: "right paren", level: "most" }],
  ["*", { spoken: "star", level: "some" }],
  [",", { spoken: "comma", level: "all" }],
  ["-", { spoken: "dash", level: "most" }],
  [".", { spoken: "dot", level: "some" }],
  ["/", { spoken: "slash", level: "some" }],
  [":", { spoken: "colon", level: "most" }],
  [";", { spoken: "semi", level: "most" }],
  ["@", { spoken: "at", level: "some" }],
  ["\\", { spoken: "backslash", level: "most" }],
  ["^", { spoken: "caret", level: "most" }],
  ["_", { spoken: "line", level: "most" }],
  ["`", { spoken: "graav", level: "most" }],
  ["|", { spoken: "bar", level: "most" }],
  ["~", { spoken: "tilda", level: "most" }],
  ["[", { spoken: "left bracket", level: "most" }],
  ["]", { spoken: "right bracket", level: "most" }],
  ["{", { spoken: "left brace", level: "most" }],
  ["}", { spoken: "right brace", level: "most" }],
  ["+", { spoken: "plus", level: "some" }],
  ["<", { spoken: "less", level: "some" }],
  ["=", { spoken: "equals", level: "some" }],
  [">", { spoken: "greater", level: "some" }],
  ["°", { spoken: "degrees", level: "some" }],
  ["×", { spoken: "times", level: "some" }],
  ["\u2715", { spoken: "times", level: "some" }], // multiplication cross (Google Docs / UI), distinct from ×
  ["÷", { spoken: "divide by", level: "some" }],
  ["−", { spoken: "minus", level: "some" }],
  ["±", { spoken: "plus or Minus", level: "some" }],
  ["·", { spoken: "middle dot", level: "most" }],
  ["µ", { spoken: "micro", level: "some" }],
]);

function symbolSpokenAtLevel(ch, userLevel = DEFAULT_SR_PUNCTUATION_LEVEL) {
  const entry = NVDA_SYMBOLS.get(ch);
  if (!entry) return null;
  const need = LEVEL_RANK[entry.level] ?? LEVEL_RANK.all;
  const have = LEVEL_RANK[userLevel] ?? LEVEL_RANK.some;
  if (need > have) return null;
  return entry.spoken;
}

/**
 * @param {string} visible
 * @param {keyof typeof LEVEL_RANK} [userLevel]
 * @returns {string}
 */
export function defaultSrSpeakVisible(visible, userLevel = DEFAULT_SR_PUNCTUATION_LEVEL) {
  let out = "";
  let afterSpokenSymbol = false;
  for (const seg of defaultSrVisibleSegments(visible, userLevel)) {
    const piece = seg.spoken;
    if (!piece) continue;
    if (out && seg.changed && !/\s$/.test(out)) out += " ";
    else if (out && afterSpokenSymbol) out += " ";
    else if (out && labSpeechNeedsGap(out, piece)) out += " ";
    out += piece;
    afterSpokenSymbol = seg.changed;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Split visible text into unchanged runs and NVDA symbol substitutions.
 * @param {string} visible
 * @param {keyof typeof LEVEL_RANK} [userLevel]
 * @returns {DefaultSrSegment[]}
 */
export function defaultSrVisibleSegments(visible, userLevel = DEFAULT_SR_PUNCTUATION_LEVEL) {
  if (!visible) return [];
  /** @type {DefaultSrSegment[]} */
  const segments = [];
  let plain = "";

  function flushPlain() {
    if (!plain) return;
    segments.push({ display: plain, spoken: plain, changed: false });
    plain = "";
  }

  for (let i = 0; i < visible.length; i++) {
    const ch = visible[i];
    if (ch === "." && i > 0 && i + 1 < visible.length && /\d/.test(visible[i - 1]) && /\d/.test(visible[i + 1])) {
      plain += ch;
      continue;
    }
    const spoken = symbolSpokenAtLevel(ch, userLevel);
    if (spoken) {
      flushPlain();
      segments.push({ display: ch, spoken, changed: true });
    } else {
      plain += ch;
    }
  }
  flushPlain();
  return coalesceDefaultSrSegments(segments);
}

/** NVDA reads °C as “degrees C”, not “degrees” then a separate letter. */
function coalesceDefaultSrSegments(segments) {
  /** @type {DefaultSrSegment[]} */
  const out = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const next = segments[i + 1];
    if (seg.display === "°" && next?.display === "C" && !next.changed) {
      out.push({ display: "°C", spoken: "degrees C", changed: true });
      i += 1;
      continue;
    }
    if (seg.display === "°" && next?.display === "F" && !next.changed) {
      out.push({ display: "°F", spoken: "degrees F", changed: true });
      i += 1;
      continue;
    }
    out.push(seg);
  }
  return out;
}

// NVDA speech-dictionary engine.
//
// Parses the bundled .dic (tab-separated: pattern, replacement, caseSensitive,
// type) and simulates how NVDA would rewrite text, so Sci-Speak's spoken
// previews and accessible-text fixes default to the SAME pronunciations the
// course's NVDA add-on produces.
//
// Type column (per this dictionary's convention):
//   0 = literal, match anywhere
//   1 = regular expression
//   2 = literal, whole word (word-boundary matched)
// caseSensitive column: 0 = ignore case, 1 = case sensitive.
//
// Rules are applied in file order (specific entries precede general ones), each
// operating on the running text, exactly like NVDA processes its dictionary.

import { DICTIONARY_DIC } from "./dictionary-data.js";
import { BOND_NOTATION } from "./lexicon.js";

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Convert NVDA/Python-style backreferences (\1) to JS ($1) in replacements.
function convertReplacement(rep) {
  return rep.replace(/\$/g, "$$$$").replace(/\\(\d+)/g, "$$$1");
}

function compile(line) {
  const parts = line.split("\t");
  if (parts.length < 4) return null;
  const [pattern, replacement, caseSensitive, type] = parts;
  const flags = "g" + (caseSensitive === "1" ? "" : "i");
  let source;
  if (type === "1") source = pattern;
  else if (type === "2") source = `\\b${escapeRegex(pattern)}\\b`;
  else source = escapeRegex(pattern);
  let regex;
  let single;
  try {
    regex = new RegExp(source, flags);
    // A non-global twin used to compute the replacement for ONE match without
    // disturbing the global regex's lastIndex during span scanning.
    single = new RegExp(source, flags.replace("g", ""));
  } catch {
    return null; // skip patterns that aren't valid in JS regex
  }
  return {
    regex,
    single,
    replacement: convertReplacement(replacement),
    raw: pattern,
    type,
    caseSensitive: caseSensitive === "1",
  };
}

function parse(raw) {
  const rules = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const rule = compile(line);
    if (rule) rules.push(rule);
  }
  return rules;
}

// Always keep standalone parentheses and unicode minus in the active rule set —
// remote/partial dictionaries often omit them and TTS/NVDA skip them silently.
const PINNED_DIC =
  "(\t open parenthesis \t0\t0\n)\t close parenthesis \t0\t0\n" +
  "−\t minus \t0\t0\n" +
  "DI water\t D I water \t0\t2\n" +
  "DIwater\t D I water \t0\t2\n" +
  "DI-water\t D I water \t0\t2\n" +
  "DI\t D I \t0\t2\n" +
  "qcalorimeter\t q of calorimeter \t0\t2\n" +
  "q_calorimeter\t q of calorimeter \t0\t2\n" +
  "Ccalorimeter\t capital C of calorimeter \t1\t2\n" +
  "C_calorimeter\t capital C of calorimeter \t1\t2\n" +
  "msolution\t m sub solution \t0\t2\n" +
  "csolution\t c sub solution \t0\t2";

function mergePinnedRules(rules) {
  const pinned = parse(PINNED_DIC);
  const have = new Set(rules.map((r) => r.raw));
  return insertRulesBeforeStandaloneParens(rules, pinned.filter((r) => !have.has(r.raw)));
}

/** NVDA applies rules in file order; `(≡)` must precede standalone `(`. */
function indexBeforeStandaloneParens(rules) {
  const idx = rules.findIndex((r) => r.raw === "(" && String(r.type) === "0");
  return idx >= 0 ? idx : 0;
}

function insertRulesBeforeStandaloneParens(rules, toInsert) {
  if (!toInsert.length) return rules;
  const at = indexBeforeStandaloneParens(rules);
  return [...rules.slice(0, at), ...toInsert, ...rules.slice(at)];
}

/** Class rules override bundled patterns; new patterns append at end (NVDA order). */
export function mergeBundledWithClassRules(classRules) {
  const bundled = parse(DICTIONARY_DIC);
  const overrideByPattern = new Map(classRules.map((r) => [r.raw, r]));
  const merged = bundled.map((r) => overrideByPattern.get(r.raw) ?? r);
  const bundledPatterns = new Set(bundled.map((r) => r.raw));
  const additions = classRules.filter((r) => !bundledPatterns.has(r.raw));
  return insertRulesBeforeStandaloneParens(merged, additions);
}

let RULES = mergePinnedRules(parse(DICTIONARY_DIC));
let dictionarySourceLabel = "bundled";

function rebuildCompositionRules() {
  COMPOSITION_RULES = RULES.filter(isCompositionRule);
}

// Replace in-memory rules (e.g. after fetching from Supabase). Falls back to
// bundled dictionary on the next page load if remote sync is unavailable.
export function loadDictionary(raw, sourceLabel = "remote") {
  RULES = mergePinnedRules(parse(raw));
  rebuildCompositionRules();
  dictionarySourceLabel = sourceLabel;
}

// Load a class dictionary: bundled base + class overrides/additions.
export function loadClassDictionary(raw, sourceLabel = "remote") {
  RULES = mergePinnedRules(mergeBundledWithClassRules(parse(raw)));
  rebuildCompositionRules();
  dictionarySourceLabel = sourceLabel;
}

export function dictionarySource() {
  return dictionarySourceLabel;
}

// An equation rule has a real "=" operator (not a regex lookaround like
// "(?<=\d)").
function isEquationRule(rule) {
  const stripped = rule.raw.replace(/\(\?<?[=!][^)]*\)/g, "");
  return stripped.includes("=");
}

// Sci-Speak composes spoken output from short, atomic dictionary entries (units,
// formulas, symbols). It skips long / parenthesized equation rules so
// punctuation — especially parentheses — stays in the stream and NVDA reads it.
// Short paren-free equations (e.g. "q = mcΔT") are included so they match
// inline in sentences as well as on their own line.
// Short parenthetical literals like (=), (–), (≡) — not full equations.
function isParentheticalLiteralRule(rule) {
  const p = rule.raw;
  if (String(rule.type) !== "0") return false;
  if (!/^\([^)]+\)$/.test(p) || p.length > 10) return false;
  const inner = p.slice(1, -1);
  return inner.length <= 3 && !inner.includes("/") && !inner.includes("°");
}

function isCompositionRule(rule) {
  if (isParentheticalLiteralRule(rule)) return true;
  const p = rule.raw;
  if (p.length > 40) return false;
  if (p.includes("=") && !BOND_NOTATION.test(p)) {
    if (!isEquationRule(rule)) return false;
    if (p.includes("(") || p.includes(")")) return false;
  }
  if ((p.match(/\s/g) || []).length >= 3) return false;
  // e.g. \(J/°C\) — keep literal parens; the inner unit rule handles J/°C.
  if (/^\\\([^\\=]+\\\)$/.test(p)) return false;
  return true;
}

let COMPOSITION_RULES = RULES.filter(isCompositionRule);

export function ruleCount() {
  return RULES.length;
}

// The full effective dictionary currently in memory (bundled base + any class
// rules merged on top). Used by the viewer so authors see every active rule,
// not only the class-specific rows stored in Supabase.
export function getActiveRules() {
  return RULES.map((r) => ({
    pattern: r.raw,
    replacement: String(r.replacement ?? "").trim(),
    rule_type: Number(r.type) || 0,
    case_sensitive: Boolean(r.caseSensitive),
  }));
}

// Apply the whole dictionary to a string (NVDA simulation).
export function applyDictionary(text) {
  let out = text;
  for (const r of RULES) {
    r.regex.lastIndex = 0;
    out = out.replace(r.regex, r.replacement);
  }
  return out;
}

// Get the dictionary's pronunciation for a single token, or null if the
// dictionary leaves it unchanged.
export function lookup(token) {
  const result = applyDictionary(token);
  return result === token ? null : result.trim();
}

function spokenForMatch(text, m, rule) {
  let result = m[0];
  const re = new RegExp(rule.single.source, rule.single.flags + "g");
  text.replace(re, (match, ...args) => {
    const offset = args[args.length - 2];
    if (offset !== m.index) return match;
    const groups = args.slice(0, -2);
    result = rule.replacement.replace(/\$(\d+)/g, (_, n) => groups[Number(n) - 1] ?? "");
    return match;
  });
  return result;
}

// Type-0 "match anywhere" dictionary rules (e.g. NO, mL) must not fire inside
// English words like "nozzle" or "firmly" when Sci-Speak composes speech.
function isSafeCompositionMatch(text, start, end, rule) {
  if (rule.type !== "0") return true;
  const before = start > 0 ? text[start - 1] : "";
  const after = end < text.length ? text[end] : "";
  const letterBefore = /[A-Za-z]/.test(before);
  const letterAfter = /[A-Za-z]/.test(after);
  if (letterBefore && letterAfter) return false;
  const matched = text.slice(start, end);
  if (
    !letterBefore &&
    letterAfter &&
    !rule.caseSensitive &&
    /^[A-Za-z]+$/.test(rule.raw) &&
    matched === matched.toLowerCase()
  ) {
    return false;
  }
  return true;
}

function segmentWithRules(text, rules, { compositionSafe = false } = {}) {
  if (!text) return [];
  const raw = [];
  let i = 0;
  while (i < text.length) {
    let best = null;
    for (const r of rules) {
      r.regex.lastIndex = i;
      const m = r.regex.exec(text);
      if (m && m.index === i && (!best || m[0].length > best.len)) {
        const end = m.index + m[0].length;
        if (compositionSafe && !isSafeCompositionMatch(text, m.index, end, r)) continue;
        best = {
          text: m[0],
          spoken: spokenForMatch(text, m, r),
          len: m[0].length,
        };
      }
    }
    if (best) {
      raw.push({ text: best.text, spoken: best.spoken });
      i += best.len;
    } else {
      let j = i + 1;
      while (j < text.length && !matchAt(text, j, rules, compositionSafe)) j++;
      raw.push({ text: text.slice(i, j), spoken: null });
      i = j;
    }
  }
  const out = [];
  for (const span of raw) {
    const prev = out[out.length - 1];
    if (prev && prev.spoken === null && span.spoken === null) prev.text += span.text;
    else out.push(span);
  }
  return out;
}

// All dictionary rules (includes whole-sentence NVDA add-on rules).
export function segmentByDictionary(text) {
  return segmentWithRules(text, RULES);
}

// Atomic rules only — Sci-Speak stitches these together and leaves punctuation
// (parentheses, equals, plus, …) in the spoken stream.
export function segmentForComposition(text) {
  return segmentWithRules(text, COMPOSITION_RULES, { compositionSafe: true });
}

function matchAt(text, index, rules, compositionSafe = false) {
  for (const r of rules) {
    r.regex.lastIndex = index;
    const m = r.regex.exec(text);
    if (m && m.index === index) {
      if (compositionSafe && !isSafeCompositionMatch(text, m.index, m.index + m[0].length, r)) {
        continue;
      }
      return true;
    }
  }
  return false;
}

/** Build effective rules with one preview entry replacing the same pattern. */
export function rulesWithPreview({ pattern, substitution, ignore_case = "Yes" }) {
  const trimmedPattern = String(pattern ?? "").trim();
  const trimmedSpoken = String(substitution ?? "").trim();
  if (!trimmedPattern || !trimmedSpoken) return RULES;
  const cs = String(ignore_case ?? "Yes").toLowerCase() === "no" ? "1" : "0";
  let ruleType = "0";
  if (/[\\^$.*+?[\](){}|]/.test(trimmedPattern) && trimmedPattern.includes("\\")) ruleType = "1";
  else if (/^[A-Za-z][A-Za-z0-9/-]*$/.test(trimmedPattern) && trimmedPattern.length <= 24) ruleType = "2";
  const previewRule = compile(`${trimmedPattern}\t${trimmedSpoken}\t${cs}\t${ruleType}`);
  if (!previewRule) return RULES;
  return insertRulesBeforeStandaloneParens(
    RULES.filter((r) => r.raw !== trimmedPattern),
    [previewRule],
  );
}

function applyRules(text, rules) {
  let out = text;
  for (const r of rules) {
    r.regex.lastIndex = 0;
    out = out.replace(r.regex, r.replacement);
  }
  return out;
}

/** Hear how `text` would read with a proposed dictionary row applied. */
export function previewTermSpeech(text, preview) {
  const sample = String(text ?? "").trim();
  if (!sample) return "";
  return applyRules(sample, rulesWithPreview(preview)).replace(/\s+/g, " ").trim();
}

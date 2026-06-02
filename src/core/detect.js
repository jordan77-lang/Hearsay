// Detection engine: scans a string and returns located findings (with offsets)
// that screen-reader TTS is likely to mispronounce. Chemistry-focused.
//
// Findings never overlap: ranges are claimed greedily in priority order
// (compound units > formulae > units > states > symbols).

import {
  UNITS,
  COMPOUND_UNITS,
  SYMBOLS,
  STATES,
  BOND_NOTATION_MATCHER,
} from "./lexicon.js";
import { parseFormula } from "./formula.js";
import { SCRIPT_VAR_SOURCE } from "./math.js";
import { EXPLICIT_SUB_MATCHER, EXPLICIT_SUP_MATCHER } from "./vars.js";

const FRAC_MATCHER = /\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g;
const SCRIPT_VAR_MATCHER = new RegExp(SCRIPT_VAR_SOURCE, "g");

const LATEX_CMD =
  String.raw`\\(?:frac|Delta|times|div|sqrt|cdot|pm|mp|to|rightarrow|rightleftharpoons|degree|circ|alpha|beta|gamma|theta|lambda|mu|pi|rho|sigma|omega|Omega|Sigma|leq|geq|neq|approx)\b`;
const LATEX_CMD_RE = new RegExp(LATEX_CMD);
const LATEX_START_RE = new RegExp(`(?:${LATEX_CMD}|[A-Za-z][\\^_])`, "g");

function looksLikeLatexEquation(raw) {
  if (!raw || raw.length < 2) return false;
  if (/\s[A-Za-z]{3,}\s/.test(raw) && !LATEX_CMD_RE.test(raw)) return false;
  if (LATEX_CMD_RE.test(raw)) return true;
  const scripts = (raw.match(/[_^]/g) || []).length;
  if (scripts >= 2 && /=/.test(raw)) return true;
  if (scripts >= 2 && /[+\-*]/.test(raw)) return true;
  return false;
}

function findLatexEquations(text, claimed) {
  const findings = [];
  for (const m of text.matchAll(LATEX_START_RE)) {
    const start = m.index;
    let end = start + m[0].length;
    while (end < text.length && /[A-Za-z0-9\\=+\-*(){}.,°^_\s]/.test(text[end])) {
      const tail = text.slice(end);
      if (/^\s+[a-z]{3,}\b/.test(tail) && !/^\\[a-zA-Z]/.test(tail.trimStart())) break;
      end++;
    }
    let raw = text.slice(start, end).replace(/[.,;\s]+$/, "");
    end = start + raw.length;
    if (!looksLikeLatexEquation(raw)) continue;
    if (claimed.overlaps(start, end)) continue;
    claimed.claim(start, end);
    findings.push({ type: "latex-equation", raw, start, end });
  }
  return findings;
}

const FORMULA_CANDIDATE =
  /\d*[A-Za-z][A-Za-z0-9\u2080-\u2089\u2070-\u2079\(\)\[\]\u00b7\u2022\^]*(?:\^?\d*[+\-]|[\u207a\u207b])?/g;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build a number-prefixed unit matcher. Units in science prose almost always
// follow a numeral, which is a strong, low-false-positive signal.
function buildUnitMatcher(unitKeys) {
  const alternation = unitKeys
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|");
  // capture: number, gap, unit
  return new RegExp(
    `(\\d+(?:[.,]\\d+)?\\s*(?:[×x*]\\s*10\\s*\\^?[-\\d]+)?)\\s*(${alternation})(?![A-Za-z])`,
    "g",
  );
}

const COMPOUND_UNIT_MATCHER = buildUnitMatcher(Object.keys(COMPOUND_UNITS));
const UNIT_MATCHER = buildUnitMatcher(Object.keys(UNITS));

/** Diatomic formulae that look like column+row refs (H2, O2) — keep as formulae. */
const FORMULA_NOT_CELL = new Set(["H2", "O2", "N2", "F2", "CL2", "BR2", "I2", "D2", "T2"]);

/** Excel / Google Sheet / well-plate refs (B5, AA12) — not chemical formulae. */
function isSpreadsheetCellRef(raw, text, start) {
  const token = raw.trim();
  if (!/^[A-Za-z]{1,3}\d{1,7}$/.test(token)) return false;
  if (FORMULA_NOT_CELL.has(token.toUpperCase())) return false;

  const before = text.slice(Math.max(0, start - 24), start);
  if (/\b(?:cell|well|row|column|sheet)\s+$/i.test(before)) return true;
  if (/^[A-Za-z]{2,3}\d+$/i.test(token)) return true;
  if (/^[A-Za-z]\d+$/i.test(token)) {
    const after = text.slice(start + token.length);
    if (/^\s*(?:[+\\-→=×]|(?:\(aq\)|\(s\)|\(l\)|\(g\)))/.test(after)) return false;
    if (/\d\s*$/.test(before)) return false;
    return true;
  }
  return false;
}

class RangeSet {
  constructor() {
    this.ranges = [];
  }
  overlaps(start, end) {
    return this.ranges.some((r) => start < r.end && end > r.start);
  }
  claim(start, end) {
    this.ranges.push({ start, end });
  }
}

export function findTokens(text) {
  const findings = [];
  const claimed = new RangeSet();

  // 1a. Parenthetical compound units, e.g. (J/g°C), without a leading number.
  for (const unit of Object.keys(COMPOUND_UNITS).sort((a, b) => b.length - a.length)) {
    const wrapped = `(${unit})`;
    const re = new RegExp(escapeRegex(wrapped), "g");
    for (const m of text.matchAll(re)) {
      const start = m.index;
      const end = start + wrapped.length;
      if (claimed.overlaps(start, end)) continue;
      claimed.claim(start, end);
      findings.push({ type: "compound-unit", raw: wrapped, start, end, inner: unit });
    }
  }

  // 1c. Standalone compound units not preceded by a number (e.g. "= J/g°C").
  for (const unit of Object.keys(COMPOUND_UNITS).sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegex(unit)}(?![A-Za-z0-9])`, "g");
    for (const m of text.matchAll(re)) {
      const start = m.index;
      const end = start + unit.length;
      if (claimed.overlaps(start, end)) continue;
      claimed.claim(start, end);
      findings.push({ type: "compound-unit", raw: unit, start, end });
    }
  }

  // 1. Compound units (mol/L, kJ/mol, ...). The unit token is the second group.
  for (const m of text.matchAll(COMPOUND_UNIT_MATCHER)) {
    const unit = m[2];
    const start = m.index + m[0].indexOf(unit, m[1].length);
    const end = start + unit.length;
    if (claimed.overlaps(start, end)) continue;
    claimed.claim(start, end);
    findings.push({ type: "compound-unit", raw: unit, start, end });
  }

  // 1b. LaTeX fractions \frac{..}{..}.
  for (const m of text.matchAll(FRAC_MATCHER)) {
    const start = m.index;
    const end = start + m[0].length;
    if (claimed.overlaps(start, end)) continue;
    claimed.claim(start, end);
    findings.push({
      type: "fraction",
      raw: m[0],
      start,
      end,
      numerator: m[1],
      denominator: m[2],
    });
  }

  // 1d. Reserve bond notation (O=O, H-H) so formulae don't claim H- or split O=O.
  for (const m of text.matchAll(BOND_NOTATION_MATCHER)) {
    const start = m.index;
    const end = start + m[0].length;
    if (claimed.overlaps(start, end)) continue;
    claimed.claim(start, end);
  }

  // 1e. Explicit sub/superscript from the editor (q_{calorimeter}, T_{2}, x^{2}).
  for (const m of text.matchAll(EXPLICIT_SUB_MATCHER)) {
    const start = m.index;
    const end = start + m[0].length;
    if (claimed.overlaps(start, end)) continue;
    claimed.claim(start, end);
    findings.push({
      type: "described-var",
      raw: m[0],
      start,
      end,
      base: m[1],
      sub: m[2],
    });
  }
  for (const m of text.matchAll(EXPLICIT_SUP_MATCHER)) {
    const start = m.index;
    const end = start + m[0].length;
    if (claimed.overlaps(start, end)) continue;
    claimed.claim(start, end);
    findings.push({
      type: "described-sup",
      raw: m[0],
      start,
      end,
      base: m[1],
      sup: m[2],
    });
  }

  // 1f. Inline LaTeX equations (from the equation typer), e.g. T_2 = T_1 + \Delta T.
  findings.push(...findLatexEquations(text, claimed));

  // 2. Chemical formulae / equation species.
  for (const m of text.matchAll(FORMULA_CANDIDATE)) {
    let raw = m[0];
    const start = m.index;
    let end = start + raw.length;
    if (claimed.overlaps(start, end)) continue;
    let parsed = parseFormula(raw);
    // The greedy candidate may glue a trailing state annotation, e.g.
    // "Ca(OH)2(aq)". If parsing fails, strip a trailing state and retry the
    // head; the state pass below then claims the "(aq)" separately.
    if (!parsed) {
      const stateMatch = raw.match(/(\((?:aq|s|l|g)\))$/);
      if (stateMatch) {
        const head = raw.slice(0, raw.length - stateMatch[0].length);
        const headParsed = parseFormula(head);
        if (headParsed) {
          raw = head;
          end = start + head.length;
          parsed = headParsed;
        }
      }
    }
    if (!parsed) continue;
    if (isSpreadsheetCellRef(raw, text, start)) continue;
    claimed.claim(start, end);
    findings.push({ type: "formula", raw, start, end, parsed });
  }

  // 2b. Scripted variables (T2, x^2, v0) that aren't chemical formulae.
  for (const m of text.matchAll(SCRIPT_VAR_MATCHER)) {
    const start = m.index;
    const end = start + m[0].length;
    if (claimed.overlaps(start, end)) continue;
    claimed.claim(start, end);
    findings.push({
      type: "scripted-var",
      raw: m[0],
      start,
      end,
      base: m[1],
      scripts: m[2],
    });
  }

  // 3. Single units following a number.
  for (const m of text.matchAll(UNIT_MATCHER)) {
    const unit = m[2];
    const start = m.index + m[0].lastIndexOf(unit);
    const end = start + unit.length;
    if (claimed.overlaps(start, end)) continue;
    claimed.claim(start, end);
    findings.push({ type: "unit", raw: unit, start, end });
  }

  // 4. State annotations (aq), (s), (l), (g).
  for (const key of Object.keys(STATES)) {
    const re = new RegExp(escapeRegex(key), "g");
    for (const m of text.matchAll(re)) {
      const start = m.index;
      const end = start + key.length;
      if (claimed.overlaps(start, end)) continue;
      claimed.claim(start, end);
      findings.push({ type: "state", raw: key, start, end });
    }
  }

  // 5. Standalone symbols / Greek letters / operators.
  for (const sym of Object.keys(SYMBOLS)) {
    let idx = text.indexOf(sym);
    while (idx !== -1) {
      // Skip degree sign when it is part of °C (handled as a unit/compound).
      if (sym === "\u00b0" && text[idx + 1] === "C") {
        idx = text.indexOf(sym, idx + sym.length);
        continue;
      }
      const end = idx + sym.length;
      if (!claimed.overlaps(idx, end)) {
        claimed.claim(idx, end);
        findings.push({ type: "symbol", raw: sym, start: idx, end });
      }
      idx = text.indexOf(sym, idx + sym.length);
    }
  }

  findings.sort((a, b) => a.start - b.start);
  return findings;
}

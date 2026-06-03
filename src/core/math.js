// Lightweight math helpers (non-chemistry): scripted variables (T2, x^2, v0)
// and simple \frac{..}{..} fractions. These produce MathML (for Canvas/MathJax/
// MathCAT) and an approximate spoken form (for the Web Speech preview).

import { UNITS, SUBSCRIPTS, SUPERSCRIPTS, unitSpoken } from "./lexicon.js";
import { applyDictionary } from "./dictionary.js";

const SUB_CLASS = "\u2080-\u2089";
const SUP_CLASS = "\u2070\u00b9\u00b2\u00b3\u2074-\u2079";

// Regex source for "a variable letter followed by unicode sub/superscripts".
export const SCRIPT_VAR_SOURCE = `([A-Za-z\u0394\u03b1-\u03c9])([${SUB_CLASS}${SUP_CLASS}]+)`;

function splitScripts(scriptRun) {
  let sub = "";
  let sup = "";
  for (const ch of scriptRun) {
    if (SUBSCRIPTS[ch]) sub += SUBSCRIPTS[ch];
    else if (SUPERSCRIPTS[ch]) sup += SUPERSCRIPTS[ch];
  }
  return { sub, sup };
}

export function scriptVarMathML(base, scriptRun) {
  const { sub, sup } = splitScripts(scriptRun);
  const mi = `<mi>${base}</mi>`;
  if (sub && sup) return `<math xmlns="http://www.w3.org/1998/Math/MathML"><msubsup>${mi}<mn>${sub}</mn><mn>${sup}</mn></msubsup></math>`;
  if (sub) return `<math xmlns="http://www.w3.org/1998/Math/MathML"><msub>${mi}<mn>${sub}</mn></msub></math>`;
  return `<math xmlns="http://www.w3.org/1998/Math/MathML"><msup>${mi}<mn>${sup}</mn></msup></math>`;
}

export function scriptVarSpeech(base, scriptRun) {
  const { sub, sup } = splitScripts(scriptRun);
  let s = base;
  if (sub) s += ` sub ${sub}`;
  if (sup) s += ` ${supWord(sup)}`;
  return s;
}

function supWord(sup) {
  if (sup === "2") return "squared";
  if (sup === "3") return "cubed";
  return `to the power of ${sup}`;
}

// ---- Fractions -------------------------------------------------------------

// Visible gap between a numeric value and its unit inside a fraction (e.g. 14 J).
// Regular spaces inside <mtext> collapse in Canvas/HTML MathML; use mspace + nbsp.
const UNIT_GAP = '<mspace width="0.25em"/><mtext>\u00A0</mtext>';

// Parse a simple fraction part like "14J", "23 g", "5.0", "ΔT" into MathML +
// spoken pieces. Falls back to literal text for anything unrecognized.
function parseFracPart(text) {
  const t = normalizeNumberUnitSpacing(text.trim());
  const m = t.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z\u00b0\u00b5\u03bc/]+)?$/);
  if (m) {
    const num = m[1];
    const unit = m[2];
    if (unit) {
      return {
        mathml: `<mn>${num}</mn>${UNIT_GAP}<mi mathvariant="normal">${escapeXml(unit)}</mi>`,
        spoken: `${num} ${unitSpoken(unit)}`,
      };
    }
    return { mathml: `<mn>${num}</mn>`, spoken: num };
  }
  return { mathml: `<mi>${escapeXml(t)}</mi>`, spoken: t };
}

export function fracMathML(numerator, denominator) {
  const a = parseFracPart(numerator);
  const b = parseFracPart(denominator);
  return (
    `<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac>` +
    `<mrow>${a.mathml}</mrow><mrow>${b.mathml}</mrow></mfrac></math>`
  );
}

export function fracSpeech(numerator, denominator) {
  const a = parseFracPart(numerator);
  const b = parseFracPart(denominator);
  return `${a.spoken} divided by ${b.spoken}`;
}

/** Spoken form for one fraction part (number + unit), with dictionary + course conventions. */
export function speakFracPart(text) {
  const normalized = normalizeNumberUnitSpacing(String(text ?? "").trim());
  const spoken = parseFracPart(normalized).spoken;
  return applyDictionary(spoken).replace(/\s+/g, " ").trim();
}

export function speakFracParts(numerator, denominator) {
  return `${speakFracPart(numerator)} divided by ${speakFracPart(denominator)}`;
}

function fracMathMLInner(numerator, denominator) {
  return fracMathML(numerator, denominator)
    .replace(/^<math xmlns="http:\/\/www.w3.org\/1998\/Math\/MathML">/, "")
    .replace(/<\/math>$/, "");
}

export { fracMathMLInner };

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Wrap literal notation (units, arrows) as a single MathML object — no hidden speech. */
export function literalMathML(text) {
  return `<math xmlns="http://www.w3.org/1998/Math/MathML"><mtext>${escapeXml(text)}</mtext></math>`;
}

// Unit tokens sorted longest-first so "kJ" wins over "J", etc.
const NUMBER_UNIT_KEYS = Object.keys(UNITS).sort((a, b) => b.length - a.length);

// Insert a space between a number and a following unit: 14J -> 14 J, 23g -> 23 g.
// Skips tokens inside chemical formulae (no digit+letter merge across word chars).
export function normalizeNumberUnitSpacing(text) {
  let out = text;
  for (const unit of NUMBER_UNIT_KEYS) {
    const esc = unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(
      new RegExp(`(\\d+(?:\\.\\d+)?)(${esc})(?![A-Za-z0-9])`, "g"),
      "$1 $2",
    );
  }
  return out;
}

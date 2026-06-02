// Explicit sub/superscript markup (from the Sci-Speak editor buttons).
// Only marked-up text renders as scripts — plain words like "compare" stay as-is.

import { parseFormula, formulaToMathML } from "./formula.js";
import { normalizeSubscripts } from "./lexicon.js";

// Author-inserted subscript: q_{calorimeter}, T_{2}, c_{H2O}
export const EXPLICIT_SUB_MATCHER = /([A-Za-z\u0394])_\{([^{}]+)\}/g;

// Author-inserted superscript: x^{2}
export const EXPLICIT_SUP_MATCHER = /([A-Za-z\u0394])\^\{([^{}]+)\}/g;

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function scriptInnerMathML(sub) {
  const normalized = normalizeSubscripts(sub);
  const parsed = parseFormula(normalized);
  if (parsed) {
    return formulaToMathML(parsed)
      .replace(/^<math[^>]*>/, "")
      .replace(/<\/math>$/, "")
      .replace(/^<mrow>/, "")
      .replace(/<\/mrow>$/, "");
  }
  return `<mtext>${escapeXml(sub)}</mtext>`;
}

export function wordSubscriptMathML(base, sub) {
  return (
    `<math xmlns="http://www.w3.org/1998/Math/MathML">` +
    `<msub><mi>${escapeXml(base)}</mi>${scriptInnerMathML(sub)}</msub></math>`
  );
}

export function wordSuperscriptMathML(base, sup) {
  return (
    `<math xmlns="http://www.w3.org/1998/Math/MathML">` +
    `<msup><mi>${escapeXml(base)}</mi>${scriptInnerMathML(sup)}</msup></math>`
  );
}

export function wordSubscriptSpeech(base, sub) {
  return `${base} sub ${normalizeSubscripts(sub)}`;
}

export function wordSuperscriptSpeech(base, sup) {
  const s = normalizeSubscripts(sup);
  if (s === "2") return `${base} squared`;
  if (s === "3") return `${base} cubed`;
  return `${base} to the power of ${s}`;
}

/** Glued token for dictionary lookup (qcalorimeter) when speech exists. */
export function gluedToken(base, script) {
  return `${base}${normalizeSubscripts(script)}`;
}

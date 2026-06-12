// MathSay: speech-aware Canvas export for single equations (LaTeX → MathML / plain text).

import { parseLatex } from "./latex.js";
import { applyDictionary } from "./dictionary.js";
import { literalMathML, normalizeNumberUnitSpacing, speakFracParts } from "./math.js";
import {
  analyzeEquation,
  preprocessEquationInput,
  spokenForDictionary,
} from "./transform.js";

/** @typedef {'quiz' | 'page'} MathsayDestination */
/** @typedef {'auto' | 'mathml-stacked' | 'linear-mtext' | 'dual-notation' | 'accessible-text' | 'page-spoken'} MathsayStrategy */

export const MATHSAY_TEMPLATES = [
  { label: "Fraction (units)", latex: "\\frac{14 J}{23 g}" },
  { label: "Fraction (word denominator)", latex: "\\frac{200 g}{mass of H2O2 in solution}" },
  { label: "Temperature change", latex: "T_2 = T_1 + \\Delta T" },
  { label: "Heat variable", latex: "q_{calorimeter}" },
  { label: "Reaction", latex: "2H_2 + O_2 \\to 2H_2O" },
  { label: "Specific heat unit", latex: "4.18 J/g^\\circ C" },
];

export const STRATEGY_LABELS = {
  auto: "Auto (recommended)",
  "mathml-stacked": "Stacked MathML (navigation + braille)",
  "linear-mtext": "Linear MathML (dictionary words in mtext)",
  "dual-notation": "Dual notation (symbol + spoken gloss)",
  "accessible-text": "Accessible text only (plain words)",
  "page-spoken": "Page spoken (aria-label + visible math)",
};

const FRAC_RE = /\\frac\{([^}]*)\}\{([^}]*)\}/;

/** Denominator is prose (lab labels), not a compact number+unit token. */
export function isWordHeavyFraction(numerator, denominator) {
  const den = String(denominator ?? "").trim();
  if (!den) return false;
  if (/^\d+(?:\.\d+)?\s+[A-Za-z°µ\/]+/.test(den) && !/\s[A-Za-z]{2,}\s/.test(den)) return false;
  if (/\s[A-Za-z]{2,}\s/.test(den)) return true;
  if (/^[A-Za-z]{4,}/.test(den) && !/^\d/.test(den)) return true;
  if (/mass|solution|calorimeter|reaction|peroxide|water/i.test(den)) return true;
  return false;
}

export function extractFraction(latex) {
  const m = String(latex ?? "").match(FRAC_RE);
  if (!m) return null;
  return {
    numerator: normalizeNumberUnitSpacing(m[1].trim()),
    denominator: normalizeNumberUnitSpacing(m[2].trim()),
    raw: m[0],
  };
}

/** Always parse as equation (skip prose detection in analyzeEquation). */
export function analyzeMathsayEquation(input) {
  return analyzeEquation(String(input ?? "").trim(), { forceEquation: true });
}

function parseEquationParts(latex) {
  const normalized = preprocessEquationInput(String(latex ?? "").trim());
  const { mathml, spoken } = parseLatex(normalized);
  const dictSpoken = applyDictionary(spokenForDictionary(spoken)).replace(/\s+/g, " ").trim();
  return { normalized, mathml, spokenRaw: spoken, spoken: dictSpoken };
}

/**
 * @param {MathsayDestination} destination
 * @param {string} latex
 * @returns {MathsayStrategy}
 */
export function suggestStrategy(destination, latex) {
  const frac = extractFraction(latex);
  if (destination === "page") {
    if (frac && isWordHeavyFraction(frac.numerator, frac.denominator)) return "page-spoken";
    return "mathml-stacked";
  }
  if (frac && isWordHeavyFraction(frac.numerator, frac.denominator)) return "dual-notation";
  if (frac) return "mathml-stacked";
  return "mathml-stacked";
}

export function resolveStrategy(destination, latex, strategy) {
  if (strategy && strategy !== "auto") return strategy;
  return suggestStrategy(destination, latex);
}

/** Human-readable visible line (for dual notation and factory SR preview). */
export function latexToVisual(latex) {
  let s = preprocessEquationInput(String(latex ?? "").trim());
  s = s.replace(FRAC_RE, (_, num, den) => `${num.trim()} / ${den.trim()}`);
  s = s
    .replace(/\\Delta/g, "\u0394")
    .replace(/\\times/g, "\u00d7")
    .replace(/\\div/g, "\u00f7")
    .replace(/\\to/g, "\u2192")
    .replace(/\\degree/g, "\u00b0")
    .replace(/\\circ/g, "\u2218")
    .replace(/\\pm/g, "\u00b1")
    .replace(/\\leq/g, "\u2264")
    .replace(/\\geq/g, "\u2265")
    .replace(/\\approx/g, "\u2248")
    .replace(/_\{([^}]+)\}/g, (_, sub) => sub.replace(/\s+/g, ""))
    .replace(/_(\d+)/g, (_, d) => {
      const cp = 0x2080 + Number(d);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : d;
    })
    .replace(/\^\{([^}]+)\}/g, "^$1")
    .replace(/\\[A-Za-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/**
 * @param {string} latex
 * @param {{ destination?: MathsayDestination, strategy?: MathsayStrategy }} opts
 */
export function buildMathsayExport(latex, { destination = "quiz", strategy = "auto" } = {}) {
  const trimmed = String(latex ?? "").trim();
  if (!trimmed) {
    return {
      html: "",
      mathml: "",
      spoken: "",
      visual: "",
      strategy: "accessible-text",
      warnings: [],
    };
  }

  const resolved = resolveStrategy(destination, trimmed, strategy);
  const parts = parseEquationParts(trimmed);
  const visual = latexToVisual(trimmed);
  const warnings = buildWarnings(trimmed, resolved, destination);

  let html = "";
  switch (resolved) {
    case "mathml-stacked":
      html = parts.mathml ? `<p>${parts.mathml}</p>` : `<p>${escapeHtml(visual)}</p>`;
      break;
    case "linear-mtext":
      html = `<p>${literalMathML(parts.spoken || visual)}</p>`;
      break;
    case "dual-notation": {
      const gloss = parts.spoken || speakFracPartsFromLatex(trimmed);
      html =
        gloss && gloss.replace(/\s+/g, " ").trim() !== visual.replace(/\s+/g, " ").trim()
          ? `<p>${escapeHtml(visual)} (${escapeHtml(gloss)})</p>`
          : `<p>${escapeHtml(visual)}</p>`;
      break;
    }
    case "accessible-text":
      html = `<p>${escapeHtml(parts.spoken || visual)}</p>`;
      break;
    case "page-spoken":
      if (parts.mathml && parts.spoken && parts.spoken !== visual) {
        html = `<p aria-label="${escapeAttr(parts.spoken)}"><span aria-hidden="true">${parts.mathml}</span></p>`;
      } else if (parts.spoken) {
        html = `<p aria-label="${escapeAttr(parts.spoken)}"><span aria-hidden="true">${escapeHtml(visual)}</span></p>`;
      } else {
        html = `<p>${parts.mathml || escapeHtml(visual)}</p>`;
      }
      break;
    default:
      html = `<p>${parts.mathml || escapeHtml(visual)}</p>`;
  }

  return {
    html,
    mathml: parts.mathml,
    spoken: parts.spoken,
    spokenRaw: parts.spokenRaw,
    visual,
    strategy: resolved,
    warnings,
  };
}

function speakFracPartsFromLatex(latex) {
  const frac = extractFraction(latex);
  if (!frac) return "";
  return speakFracParts(frac.numerator, frac.denominator);
}

/** @returns {{ level: 'info' | 'warn', text: string }[]} */
export function buildWarnings(latex, strategy, destination) {
  /** @type {{ level: 'info' | 'warn', text: string }[]} */
  const warnings = [];
  const frac = extractFraction(latex);
  const wordHeavy = frac && isWordHeavyFraction(frac.numerator, frac.denominator);

  if (strategy === "mathml-stacked" && wordHeavy) {
    warnings.push({
      level: "warn",
      text:
        "Stacked MathML reads as “fraction … over …” in JAWS/NVDA MathCAT — not your dictionary wording. " +
        "Use Dual notation or Accessible text for quizzes with word denominators.",
    });
  }
  if (strategy === "mathml-stacked" && frac && !wordHeavy) {
    warnings.push({
      level: "info",
      text: "MathML speech is chosen by the reader’s math engine (MathCAT). Unit expansions like “grams” may not match your dictionary.",
    });
  }
  if (destination === "quiz" && strategy === "page-spoken") {
    warnings.push({
      level: "warn",
      text: "New Quizzes strip aria-label. Choose Dual notation or Accessible text instead.",
    });
  }
  if (destination === "page" && strategy === "page-spoken") {
    warnings.push({
      level: "info",
      text: "Page aria-label carries dictionary speech. Canvas may strip it — verify in Student View.",
    });
  }
  if (strategy === "dual-notation") {
    warnings.push({
      level: "info",
      text: "Students read the words in parentheses — reliable for NVDA in New Quizzes.",
    });
  }
  return warnings;
}

/** Approximate MathCAT-style reading for factory preview when MathML is stacked. */
export function approximateMathmlSpeech(latex) {
  const frac = extractFraction(latex);
  if (frac) {
    return `fraction ${latexToVisual(frac.numerator)} over ${latexToVisual(frac.denominator)}`;
  }
  return latexToVisual(latex);
}

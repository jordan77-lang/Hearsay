// Detect flattened and LaTeX fractions in curriculum text (paste, pull, or typed).

import {
  GLUED_GDOCS_FRAC_RE,
  normalizePastedContent,
  repairFlattenedGdocsFraction,
  detectFlattenedGdocsEquation,
  pasteDataFromEvent,
} from "./paste-normalize.js";
import { speakFracParts } from "./math.js";

export { FLATTENED_FRACTION_NOTICE, FLATTENED_GDOCS_EQUATION_NOTICE } from "./paste-normalize.js";

const FRAC_MATCHER = /\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g;

/** Text after HearSay inserts “divided by” for a flattened fraction. */
const REPAIRED_FRAC_RE =
  /(\d+(?:\.\d+)?(?:\s+[^\d\n/]+?)?)\s+divided by\s+(\d+(?:\.\d+)?(?:\s+[^\d\n/]+?)?)(?=\s|$|[,.;:!?]|\n| divided by )/gi;

function fracKey(num, den) {
  return `${String(num).trim().toLowerCase()}|${String(den).trim().toLowerCase()}`;
}

function buildCandidate({ kind, numerator, denominator, sourceText, start, end }) {
  const num = String(numerator ?? "").trim();
  const den = String(denominator ?? "").trim();
  if (!num || !den) return null;
  const latex = `\\frac{${num}}{${den}}`;
  return {
    kind,
    numerator: num,
    denominator: den,
    latex,
    sourceText: sourceText ?? latex,
    spoken: speakFracParts(num, den),
    start: start ?? -1,
    end: end ?? -1,
  };
}

/**
 * Find fraction candidates in text (LaTeX, glued Docs-style, or repaired “divided by”).
 * @param {string} text Current lab textarea content (normalized or raw).
 * @returns {Array<{ kind: string, numerator: string, denominator: string, latex: string, sourceText: string, spoken: string, start: number, end: number }>}
 */
export function findFractionCandidatesInText(text) {
  const raw = String(text ?? "");
  if (!raw.trim()) return [];

  const preRepair = normalizePastedContent(raw, { skipGluedFractionRepair: true });
  const normalized = repairFlattenedGdocsFraction(preRepair);
  const seen = new Set();
  /** @type {ReturnType<typeof buildCandidate>[]} */
  const out = [];

  function push(candidate) {
    if (!candidate) return;
    const key = fracKey(candidate.numerator, candidate.denominator);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  }

  FRAC_MATCHER.lastIndex = 0;
  for (const m of normalized.matchAll(FRAC_MATCHER)) {
    push(
      buildCandidate({
        kind: "latex",
        numerator: m[1],
        denominator: m[2],
        sourceText: m[0],
        start: m.index,
        end: m.index + m[0].length,
      }),
    );
  }

  GLUED_GDOCS_FRAC_RE.lastIndex = 0;
  for (const m of preRepair.matchAll(GLUED_GDOCS_FRAC_RE)) {
    const num = m[1].trim();
    const den = m[2].trim();
    if (seen.has(fracKey(num, den))) continue;
    push(
      buildCandidate({
        kind: "glued",
        numerator: num,
        denominator: den,
        sourceText: m[0],
        start: m.index,
        end: m.index + m[0].length,
      }),
    );
  }

  REPAIRED_FRAC_RE.lastIndex = 0;
  for (const m of normalized.matchAll(REPAIRED_FRAC_RE)) {
    const num = m[1].trim();
    const den = m[2].trim();
    if (seen.has(fracKey(num, den))) continue;
    push(
      buildCandidate({
        kind: "repaired",
        numerator: num,
        denominator: den,
        sourceText: m[0],
        start: m.index,
        end: m.index + m[0].length,
      }),
    );
  }

  return out.filter(Boolean);
}

/**
 * Detect flattened fraction (paste or pull) — not limited to Google Docs clipboard.
 * @returns {{ kind: "glued" | "repaired" | "gdocs-glued" | "gdocs-multi-span" } | null}
 */
export function detectFlattenedFraction({ html = "", normalized = "", preRepair = "", clipboardTypes = [] } = {}) {
  const pre = preRepair || normalizePastedContent(normalized, { skipGluedFractionRepair: true });
  const norm = normalized || repairFlattenedGdocsFraction(pre);

  if (/\\frac\s*\{/.test(norm)) return null;

  const gdocs = detectFlattenedGdocsEquation({ html, normalized: pre, clipboardTypes });
  if (gdocs) return { kind: gdocs.kind === "glued-spans" ? "gdocs-glued" : "gdocs-multi-span" };

  GLUED_GDOCS_FRAC_RE.lastIndex = 0;
  if (GLUED_GDOCS_FRAC_RE.test(pre)) return { kind: "glued" };

  REPAIRED_FRAC_RE.lastIndex = 0;
  if (REPAIRED_FRAC_RE.test(norm)) return { kind: "repaired" };

  return null;
}

/** Normalize pasted/pulled text and detect flattened fractions + candidates. */
export function inspectCurriculumText(raw, { html = "", clipboardTypes = [], source = "text" } = {}) {
  const preRepair = normalizePastedContent(raw, { skipGluedFractionRepair: true });
  const normalized = repairFlattenedGdocsFraction(preRepair);
  const flattenedFraction = detectFlattenedFraction({
    html: source === "paste" ? html : "",
    normalized,
    preRepair,
    clipboardTypes: source === "paste" ? clipboardTypes : [],
  });
  const fractions = findFractionCandidatesInText(normalized);
  return { raw, preRepair, normalized, flattenedFraction, fractions };
}

/** Clipboard paste: normalize, detect flattened fractions, list candidates. */
export function inspectPasteFromEvent(event) {
  const html = event.clipboardData?.getData("text/html") ?? "";
  const clipboardTypes = event.clipboardData ? [...event.clipboardData.types] : [];
  const raw = pasteDataFromEvent(event);
  const result = inspectCurriculumText(raw, { html, clipboardTypes, source: "paste" });
  return {
    raw,
    normalized: result.normalized,
    flattenedEquation: result.flattenedFraction,
    fractions: result.fractions,
  };
}

/** Pulled page text (extension): same fraction detection as paste. */
export function inspectPulledText(raw) {
  const result = inspectCurriculumText(raw, { source: "pull" });
  return {
    normalized: result.normalized,
    flattenedEquation: result.flattenedFraction,
    fractions: result.fractions,
  };
}

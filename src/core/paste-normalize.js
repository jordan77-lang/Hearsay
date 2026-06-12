// Normalize pasted curriculum text: HTML sub/sup, unicode scripts, plain T2, glued q/m/c variables.

import { toUnicodeSubscript } from "../script-editor.js";

/** Glued variable base + subscript word (from course dictionary conventions). */
const GLUED_CHEM_VARS = [
  ["q", "calorimeter"],
  ["q", "solution"],
  ["q", "reaction"],
  ["m", "solution"],
  ["c", "solution"],
  ["C", "calorimeter"],
];

/** Single-letter variables that use digit subscripts in plain pasted text (T2 → T₂). */
const DIGIT_SUBSCRIPT_BASES = "Ttvxn";

/** Windows CF_HTML wrappers, LMS spans, Word/Docs markup in text/plain or text/html. */
const HTML_PASTE_RE =
  /<!--\s*StartFragment|<\/?(?:html|body|head|meta|span|div|p|br|b|i|strong|em)\b|<sub|<sup|docs-internal-guid/i;

const NAMED_HTML_ENTITIES = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  deg: "\u00b0",
};

export function looksLikeHtmlPaste(s) {
  return HTML_PASTE_RE.test(String(s ?? ""));
}

/** Decode &#…;, &#x…;, and common named entities (Word, Canvas, web exports). */
export function decodeHtmlEntities(s) {
  return String(s ?? "")
    .replace(/&([a-z0-9]+);/gi, (match, name) => NAMED_HTML_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/&#(\d+);/g, (_, dec) => {
      const cp = Number(dec);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : _;
    });
}

function normalizeLineEndings(s) {
  return String(s ?? "")
    .replace(/\u2029/g, "\n\n")
    .replace(/\u2028/g, "\n")
    .replace(/\r\n?/g, "\n");
}

function stripHtmlToText(html) {
  let s = String(html ?? "");
  const frag = /<!--\s*StartFragment\s*-->([\s\S]*?)<!--\s*EndFragment\s*-->/i.exec(s);
  if (frag) s = frag[1];
  return decodeHtmlEntities(
    normalizeLineEndings(
      s
        .replace(/<hr\b[^>]*>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(?:p|div|h[1-6]|li|tr|td|th|blockquote|section|article|header|footer|pre|table|ul|ol)\s*>/gi, "\n")
        .replace(/<[^>]+>/g, ""),
    ),
  );
}

function normalizeHtmlSubSup(html) {
  let s = String(html ?? "");
  // Digit-only subscripts after letters: T<sub>2</sub>→T2, B<sub>5</sub>→B5 (table cells).
  // Word subscripts: q<sub>solution</sub>→q_{solution}.
  s = s.replace(/([A-Za-z]{1,3})<sub>([\s\S]*?)<\/sub>/gi, (_, base, inner) => {
    const sub = stripHtmlToText(inner).trim();
    if (/^\d+$/.test(sub)) return `${base}${sub}`;
    return `${base}_{${sub}}`;
  });
  s = s.replace(/<sub>([\s\S]*?)<\/sub>/gi, (_, inner) => `_{${stripHtmlToText(inner).trim()}}`);
  s = s.replace(/([A-Za-z]{1,3})<sup>([\s\S]*?)<\/sup>/gi, (_, base, inner) =>
    `${base}^{${stripHtmlToText(inner).trim()}}`,
  );
  s = s.replace(/<sup>([\s\S]*?)<\/sup>/gi, (_, inner) => `^{${stripHtmlToText(inner).trim()}}`);
  if (/<[a-z][\s\S]*>/i.test(s)) s = stripHtmlToText(s);
  return s;
}

/** Spreadsheet / well-plate refs (B5, AA12) — not chemistry subscripts. */
function normalizeSpreadsheetCellRefs(s) {
  return s.replace(/\b([A-Za-z]{1,3})_\{(\d{1,7})\}\b/g, (_, col, row) => `${col}${row}`);
}

function normalizeMathSymbols(s) {
  return s
    .replace(/\u2212/g, " − ")
    .replace(/×/g, " × ")
    .replace(/\u2715/g, " ✕ ")
    .replace(/÷/g, " ÷ ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/ \./g, ".");
}

/** Remove invisible chars and leading/trailing junk whitespace from pasted docs. */
function normalizeWhitespaceCleanup(s) {
  let out = normalizeLineEndings(s)
    .replace(/[\u200B-\u200D\uFEFF\u180E\u00AD\u2060\u2800\u202F\u115F\u1160\u3164]/g, "")
    .replace(/\u00a0/g, " ");
  const lines = out.split(/\r?\n/).map((line) => line.replace(/[ \t]+/g, " ").trim());
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function normalizeChemGluedVariables(s) {
  let out = s;
  for (const [base, sub] of GLUED_CHEM_VARS) {
    const re = new RegExp(`\\b${base}${sub}\\b`, "g");
    out = out.replace(re, `${base}_{${sub}}`);
  }
  out = out.replace(/\bDI-water\b/gi, "DI water");
  out = out.replace(/\bDIwater\b/gi, "DI water");
  out = out.replace(/\bDI[\s\u00a0]+water\b/gi, "DI water");
  return out;
}

function normalizePlainDigitSubscripts(s) {
  const baseClass = DIGIT_SUBSCRIPT_BASES;
  return s.replace(new RegExp(`\\b([${baseClass}])([0-9])\\b`, "g"), (_, letter, digit) => {
    return `${letter}${toUnicodeSubscript(digit)}`;
  });
}

/**
 * Prepare pasted or typed curriculum text for Sci-Speak analysis.
 * Handles Word/HTML subscripts, unicode scripts, T2→T₂, and qcalorimeter→q_{calorimeter}.
 * @param {{ skipGluedFractionRepair?: boolean, skipChemGluedBraceMarkup?: boolean }} [opts]
 */
export function normalizePastedContent(
  input,
  { skipGluedFractionRepair = false, skipChemGluedBraceMarkup = false } = {},
) {
  let s = String(input ?? "");
  if (looksLikeHtmlPaste(s)) {
    if (/<sub|<sup/i.test(s)) s = normalizeHtmlSubSup(s);
    else s = stripHtmlToText(s);
  } else {
    s = decodeHtmlEntities(s);
  }
  s = normalizeSpreadsheetCellRefs(s);
  s = normalizeMathSymbols(s);
  if (!skipChemGluedBraceMarkup) s = normalizeChemGluedVariables(s);
  s = normalizePlainDigitSubscripts(s);
  s = normalizeWhitespaceCleanup(s);
  if (!skipGluedFractionRepair) s = repairFlattenedGdocsFraction(s);
  return s;
}

/**
 * Text as a typical screen reader receives it from plain quiz/LMS paste:
 * unicode subscripts and spacing, but not internal HearSay detection markup
 * (e.g. qcalorimeter stays glued, not q_{calorimeter}).
 */
export function normalizeBaselinePaste(input, { skipGluedFractionRepair = true } = {}) {
  return normalizePastedContent(input, {
    skipGluedFractionRepair,
    skipChemGluedBraceMarkup: true,
  });
}

/** Google Docs copy often glues numerator/denominator (e.g. 29 dogs30 rats). */
export const GLUED_GDOCS_FRAC_RE = /(\d+\s+[^\d\n]+?)(?<=[a-zA-Z])(\d+\s+[^\d\n]+)/g;

/** Insert “divided by” at glued Google Docs fraction boundaries. */
export function repairFlattenedGdocsFraction(text) {
  return String(text ?? "").replace(GLUED_GDOCS_FRAC_RE, "$1 divided by $2");
}

/** Extract plain or HTML from a clipboard paste event. */
export function pasteDataFromEvent(event) {
  const html = event.clipboardData?.getData("text/html") ?? "";
  const plain = event.clipboardData?.getData("text/plain") ?? "";
  if (html && /<sub|<sup/i.test(html)) return html;
  if (html && looksLikeHtmlPaste(html)) return html;
  if (plain && looksLikeHtmlPaste(plain)) return plain;
  if (html && /<[a-z]/i.test(html)) return html;
  return plain;
}

export const GDOCS_CLIPBOARD_TYPE = "application/x-vnd.google-docs-document-slice-clip+wrapped";

/** True when clipboard HTML or MIME type indicates Google Docs. */
export function isGoogleDocsPaste({ html = "", clipboardTypes = [] } = {}) {
  if (/docs-internal-guid/i.test(html)) return true;
  return clipboardTypes.some((t) => t === GDOCS_CLIPBOARD_TYPE);
}

/** Word chunk ending in letters run into a digit (e.g. "dogs30" from flattened fraction spans). */
const GLUED_FRAC_CHUNK_RE = /[a-zA-Z]{2,}(?=\d)/;

/**
 * Heuristic: Google Docs equation copied to clipboard often loses the fraction bar
 * and merges numerator/denominator into adjacent spans or glued text.
 * @returns {{ kind: "glued-spans" | "multi-span" } | null}
 */
export function detectFlattenedGdocsEquation({ html = "", normalized = "", clipboardTypes = [] } = {}) {
  if (!isGoogleDocsPaste({ html, clipboardTypes })) return null;
  const text = String(normalized ?? "").trim();
  if (!text) return null;
  if (/\\frac\s*\{/.test(text)) return null;
  if (/[÷/]/.test(text)) return null;

  if (GLUED_FRAC_CHUNK_RE.test(text)) {
    return { kind: "glued-spans" };
  }

  const spanCount = (html.match(/<span\b/gi) || []).length;
  if (
    spanCount >= 2 &&
    /<\/span>\s*<span/i.test(html) &&
    !/<br\b/i.test(html) &&
    text.length <= 120 &&
    !/\n/.test(text)
  ) {
    return { kind: "multi-span" };
  }

  return null;
}

export const FLATTENED_FRACTION_NOTICE =
  "Flattened fraction detected — the fraction bar was lost on copy or pull. HearSay inserted “divided by”. " +
  "Use the Fractions section below to convert to \\frac{numerator}{denominator} or save a dictionary pronunciation.";

/** @deprecated use FLATTENED_FRACTION_NOTICE */
export const FLATTENED_GDOCS_EQUATION_NOTICE = FLATTENED_FRACTION_NOTICE;

/** Normalize pasted content and detect flattened Google Docs equations. */
export function inspectPasteFromEvent(event) {
  const html = event.clipboardData?.getData("text/html") ?? "";
  const plain = event.clipboardData?.getData("text/plain") ?? "";
  const clipboardTypes = event.clipboardData ? [...event.clipboardData.types] : [];
  const raw = pasteDataFromEvent(event);
  const preRepair = normalizePastedContent(raw, { skipGluedFractionRepair: true });
  const flattenedEquation = detectFlattenedGdocsEquation({
    html,
    plain,
    normalized: preRepair,
    clipboardTypes,
  });
  const normalized = repairFlattenedGdocsFraction(preRepair);
  return { raw, normalized, flattenedEquation };
}

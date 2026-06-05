// Transform layer: turns raw findings into actionable suggestions, and provides
// analyze() (detect + enrich) plus helpers to emit accessible markup.
//
// Each suggestion makes the *trade-offs* explicit, because there is no single
// mechanism that fixes pronunciation for every screen reader without a cost:
//   - "rewrite": change the literal text (changes the visual; universal).
//   - "hidden": visible symbol hidden from AT + visually-hidden spoken text
//     (keeps the visual, gives AT/braille the spoken form). Recommended default.
//   - "aria-label": overrides accessible name (also overrides BRAILLE - warn).
//   - "mathml": real semantic math/chemistry (MathCAT/SRE speak + braille it).

import { UNITS, COMPOUND_UNITS, SYMBOLS, STATES, unitSpoken } from "./lexicon.js";
import {
  formulaToSymbolSpeech,
  formulaToNameSpeech,
  formulaToMathML,
} from "./formula.js";
import { findTokens } from "./detect.js";
import {
  scriptVarMathML,
  scriptVarSpeech,
  fracMathML,
  fracSpeech,
  speakFracParts,
  normalizeNumberUnitSpacing,
  literalMathML,
} from "./math.js";
import {
  wordSubscriptMathML,
  wordSubscriptSpeech,
  wordSuperscriptMathML,
  wordSuperscriptSpeech,
  gluedToken,
} from "./vars.js";
import {
  applyDictionary,
  segmentForComposition,
  segmentByDictionary,
  ruleCount,
  lookup,
  ruleForVisibleToken,
} from "./dictionary.js";
import { defaultSrSpeakVisible, defaultSrVisibleSegments, LAB_DEFAULT_SR_PUNCTUATION_LEVEL } from "./default-sr-speech.js";
import { labSpeechNeedsGap } from "./lab-speech-gap.js";
import { parseLatex } from "./latex.js";
import { normalizeBaselinePaste, normalizePastedContent } from "./paste-normalize.js";

// A dictionary reading is only trustworthy for a token when it consumes the
// WHOLE token into words. Partial matches (e.g. "H2"->"H two" inside
// "CuSO4·5H2O") leave residual notation like a letter adjacent to a digit or a
// middot; in that case we fall back to Sci-Speak's clean parser instead.
function dictWholeReading(raw) {
  const segs = segmentForComposition(raw.trim());
  if (segs.length !== 1 || !segs[0].spoken) return null;
  if (segs[0].text !== raw.trim()) return null;
  const out = segs[0].spoken.replace(/\s+/g, " ").trim();
  if (/[A-Za-z][0-9]|[0-9][A-Za-z]|[·•\u2080-\u2089]/.test(out)) return null;
  return out;
}

// Prefer the course dictionary's pronunciation when it cleanly covers this
// token; otherwise fall back to Sci-Speak's computed spoken form.
function preferredSpoken(raw, fallback) {
  return dictWholeReading(raw) ?? fallback;
}

function describedVarSpoken(finding) {
  const glued = gluedToken(finding.base, finding.sub);
  const underscored = `${finding.base}_${finding.sub}`;
  return (
    dictWholeReading(glued) ??
    dictWholeReading(underscored) ??
    wordSubscriptSpeech(finding.base, finding.sub)
  );
}

// Inline (class-free) screen-reader-only style. Canvas strips unknown CSS
// classes and may strip clip-path / off-screen positioning; prefer aria-label
// on paragraphs in spoken mode. This style is used for per-token fixes in MathML mode.
const SR_ONLY_INLINE =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;" +
  "clip:rect(0,0,0,0);white-space:nowrap;border:0;";

export function enrich(finding) {
  switch (finding.type) {
    case "formula":
      return enrichFormula(finding);
    case "fraction": {
      const num = normalizeNumberUnitSpacing(finding.numerator.trim());
      const den = normalizeNumberUnitSpacing(finding.denominator.trim());
      const fracRaw = `\\frac{${num}}{${den}}`;
      const fromDict = applyDictionary(fracRaw);
      const clean =
        fromDict !== fracRaw && !fromDict.includes("\\frac")
          ? fromDict.replace(/\\/g, "").trim()
          : speakFracParts(num, den);
      return enrichMath(
        finding,
        fracMathML(num, den),
        clean,
        `LaTeX fraction is read literally as "frac" with braces. Render as MathML so it speaks as a fraction.`,
      );
    }
    case "scripted-var":
      return enrichMath(
        finding,
        scriptVarMathML(finding.base, finding.scripts),
        preferredSpoken(finding.raw, scriptVarSpeech(finding.base, finding.scripts)),
        `Sub/superscript "${finding.raw}" is often read flat (e.g. "T2"). MathML preserves it as a subscript/exponent.`,
      );
    case "described-var":
      return enrichMath(
        finding,
        wordSubscriptMathML(finding.base, finding.sub),
        describedVarSpoken(finding),
        `"${finding.raw}" uses an explicit subscript marker from the editor.`,
      );
    case "described-sup":
      return enrichMath(
        finding,
        wordSuperscriptMathML(finding.base, finding.sup),
        wordSuperscriptSpeech(finding.base, finding.sup),
        `"${finding.raw}" uses an explicit superscript marker from the editor.`,
      );
    case "latex-equation": {
      const normalized = preprocessEquationInput(finding.raw);
      const { mathml, spoken } = parseLatex(normalized);
      const dictSpoken = applyDictionary(spokenForDictionary(spoken))
        .replace(/\s+/g, " ")
        .trim();
      return enrichMath(
        finding,
        mathml,
        dictSpoken,
        `LaTeX equation "${finding.raw}" is read literally unless rendered as MathML.`,
      );
    }
    case "compound-unit":
      return enrichSimple(
        finding,
        COMPOUND_UNITS[finding.inner ?? finding.raw],
        "high",
      );
    case "unit":
      return enrichSimple(finding, UNITS[finding.raw]?.spoken, UNITS[finding.raw]?.risk ?? "medium");
    case "state":
      return enrichSimple(finding, STATES[finding.raw], "high");
    case "symbol": {
      const s = SYMBOLS[finding.raw];
      return enrichSimple(finding, s?.spoken, s?.risk ?? "high", s?.note);
    }
    default:
      return finding;
  }
}

function enrichFormula(finding) {
  const parsed = finding.parsed;
  const symbolSpeech = formulaToSymbolSpeech(parsed);
  const nameSpeech = formulaToNameSpeech(parsed);
  const mathml = formulaToMathML(parsed);
  const primary = preferredSpoken(finding.raw, symbolSpeech);

  const alternatives = [];
  const dict = dictWholeReading(finding.raw);
  if (dict) alternatives.push({ id: "dict", label: "Course dictionary", spoken: dict });
  alternatives.push({ id: "symbol", label: "Read as symbols", spoken: symbolSpeech });
  if (nameSpeech && nameSpeech !== symbolSpeech) {
    alternatives.push({ id: "name", label: "Read as name", spoken: nameSpeech });
  }

  return {
    ...finding,
    risk: "high",
    primarySpoken: primary,
    alternatives,
    mathml,
    message:
      `Chemical formula "${finding.raw}" is read inconsistently: subscripts may be dropped ` +
      `or symbols read as words (e.g. "NaCl" \u2192 "nackle"). Prefer MathML so screen ` +
      `readers (MathCAT/SRE) speak and braille it; otherwise expose a spoken expansion.`,
    fixes: buildFixes(finding.raw, primary, mathml),
  };
}

function enrichMath(finding, mathml, spoken, message) {
  return {
    ...finding,
    risk: "high",
    primarySpoken: spoken,
    mathml,
    message,
    fixes: buildFixes(finding.raw, spoken, mathml),
  };
}

function enrichSimple(finding, spoken, risk, note) {
  const primary = preferredSpoken(finding.raw, spoken);
  if (!primary) return { ...finding, risk: risk ?? "medium", primarySpoken: finding.raw };
  return {
    ...finding,
    risk: risk ?? "medium",
    primarySpoken: primary,
    note,
    message: messageFor(finding, primary),
    fixes: buildFixes(finding.raw, primary, null),
  };
}

function messageFor(finding, spoken) {
  switch (finding.type) {
    case "unit":
    case "compound-unit":
      return `Unit "${finding.raw}" is often spelled out letter-by-letter or skipped. Intended: "${spoken}".`;
    case "state":
      return `State symbol "${finding.raw}" should be spoken as "${spoken}".`;
    case "symbol":
      return `Symbol "${finding.raw}" is frequently misread or silent. Intended: "${spoken}".`;
    default:
      return `Intended pronunciation: "${spoken}".`;
  }
}

// Concrete markup fixes the author can copy/paste, ordered best-first.
function buildFixes(raw, spoken, mathml) {
  const fixes = [];
  if (mathml) {
    fixes.push({
      id: "mathml",
      label: "MathML (best for screen readers + braille)",
      support: "Screen readers with MathML support (e.g. MathCAT, browser math engines) speak and braille this with no user setup.",
      caveat: "Replaces the visual rendering; verify it displays as expected.",
      snippet: mathml,
    });
  }
  fixes.push({
    id: "hidden",
    label: "Visually-hidden spoken text (keeps the visual)",
    support: "Works in all screen readers and on braille displays.",
    caveat: "Adds DOM; sighted users see the original, AT users hear the expansion.",
    snippet:
      `<span aria-hidden="true">${escapeHtml(raw)}</span>` +
      `<span class="sr-only">${escapeHtml(spoken)}</span>`,
  });
  fixes.push({
    id: "hidden-inline",
    label: "Visually-hidden spoken text \u2014 Canvas-safe (inline styles)",
    support: "Uses inline styles instead of a CSS class, so it survives Canvas/LMS sanitizers.",
    caveat: "Some strict sanitizers may drop clip/position; verify it's hidden in Student View.",
    snippet:
      `<span aria-hidden="true">${escapeHtml(raw)}</span>` +
      `<span style="${SR_ONLY_INLINE}">${escapeHtml(spoken)}</span>`,
  });
  fixes.push({
    id: "aria-label",
    label: "aria-label override",
    support: "Widely supported by screen readers.",
    caveat:
      "WARNING: also overrides BRAILLE output, so braille users get the spoken " +
      "hint instead of the real text. Avoid if braille fidelity matters.",
    snippet: `<span role="text" aria-label="${escapeAttr(spoken)}">${escapeHtml(raw)}</span>`,
  });
  return fixes;
}

export function analyze(text, findTokensFn) {
  const normalizedText = normalizePastedContent(text);
  const findings = findTokensFn(normalizedText).map(enrich);
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.risk ?? "medium"]++;
  return { findings, counts, total: findings.length, normalizedText };
}

// Produce a plain-text "spoken preview": the string a TTS engine would receive
// if every finding were replaced by its primary spoken form. Used by the
// before/after Web Speech preview.
export function toSpokenText(text, findings) {
  let out = "";
  let cursor = 0;
  for (const f of findings) {
    out += text.slice(cursor, f.start);
    out += ` ${f.primarySpoken ?? f.raw} `;
    cursor = f.end;
  }
  out += text.slice(cursor);
  return out.replace(/\s+/g, " ").trim();
}

// Rewrite the source text, replacing each finding with the snippet from its
// chosen fix (by id). Findings missing that fix fall back to `fallbackId`,
// then to their raw text. This is both the test-document builder and the
// foundation for in-editor auto-fixing.
export function rewriteWith(text, findings, fixId, fallbackId = "hidden") {
  let out = "";
  let cursor = 0;
  for (const f of findings) {
    out += text.slice(cursor, f.start);
    const fixes = f.fixes ?? [];
    const fix =
      fixes.find((x) => x.id === fixId) ??
      fixes.find((x) => x.id === fallbackId) ??
      null;
    out += fix ? fix.snippet : text.slice(f.start, f.end);
    cursor = f.end;
  }
  out += text.slice(cursor);
  return out;
}

const MATH_TYPES = new Set([
  "formula",
  "fraction",
  "scripted-var",
  "described-var",
  "described-sup",
  "latex-equation",
]);

function hiddenSpokenSpan(spoken) {
  return `<span style="${SR_ONLY_INLINE}">${escapeHtml(spoken)}</span>`;
}

const UNIT_KEYS_BY_LEN = Object.keys(UNITS).sort((a, b) => b.length - a.length);

/** Speak "60 g" as "60 grams" when dictionary rows for units are missing (partial remote sync). */
export function applyUnitLexiconToPlainText(text) {
  if (!text) return text;
  let out = normalizeNumberUnitSpacing(text);
  for (const unit of UNIT_KEYS_BY_LEN) {
    const esc = unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const spoken = unitSpoken(unit);
    out = out.replace(
      new RegExp(`(\\d+(?:\\.\\d+)?)(\\s+)${esc}(?![A-Za-z0-9])`, "gi"),
      (_, num, sp) => `${num}${sp}${spoken}`,
    );
  }
  return out;
}

function compositionSpoken(seg) {
  return normalizeMathMinusSpeech(applyUnitLexiconToPlainText(seg.spoken ?? seg.text));
}

/** Insert a space when dictionary segments would otherwise glue (10milliliters, wordperiod). */
function needsCompositionGap(left, right) {
  return labSpeechNeedsGap(left, right);
}

function stitchCompositionSpoken(segments, speakFn) {
  let out = "";
  for (const seg of segments) {
    const spoken = speakFn(seg);
    const piece = spoken != null && spoken !== "" ? String(spoken) : seg.text ?? "";
    if (!piece) continue;
    if (out && needsCompositionGap(out, piece)) out += " ";
    out += piece;
  }
  return out;
}

/** Normalize hyphens in math to unicode minus for NVDA symbol segmentation. */
export function normalizeMathMinusVisible(text) {
  if (!text) return text;
  let s = String(text);
  s = s.replace(/(?<=\s)-(?=\s)/g, "\u2212");
  s = s.replace(/(?<=[0-9Ttvxn])-(?=[0-9Ttvxn])/gi, "\u2212");
  return s;
}

/** Speak unicode or ASCII minus in math contexts without breaking chemistry prefixes like -OH. */
export function normalizeMathMinusSpeech(text) {
  if (!text) return text;
  return normalizeMathMinusVisible(text).replace(/\u2212/g, " minus ");
}

function ariaHide(mathml) {
  return mathml.replace(/^<math /, '<math aria-hidden="true" ');
}

// Render a run of plain prose (the text BETWEEN detected tokens), applying the
// course dictionary so curriculum terms the token detector doesn't model --
// scenario names, acronyms, bonds, phonetic words like "isooctane" -- still get
// the right spoken wording. Returns { html, count } where count is how many
// spans were rewritten.
function emitPlain(run) {
  if (!run) return { html: "", count: 0 };
  let html = "";
  let count = 0;
  for (const seg of segmentForComposition(run)) {
    const spoken = compositionSpoken(seg).replace(/\s+/g, " ").trim();
    if (spoken !== seg.text.replace(/\s+/g, " ").trim()) {
      html +=
        `<span aria-hidden="true">${escapeHtml(seg.text)}</span>` +
        hiddenSpokenSpan(spoken);
      count++;
    } else {
      html += escapeHtml(seg.text);
    }
  }
  return { html, count };
}

function emitPlainVisible(run) {
  if (!run) return { html: "", count: 0 };
  return { html: escapeHtml(run), count: 0 };
}

const QUIZ_SPOKEN_UNIT_TYPES = new Set(["unit", "compound-unit", "symbol", "state"]);

/** Visible symbol plus spoken gloss — the only NQ-safe way to get dictionary unit speech. */
function quizDualNotation(raw, spoken) {
  if (!spoken || spoken.replace(/\s+/g, " ").trim() === raw.replace(/\s+/g, " ").trim()) {
    return escapeHtml(raw);
  }
  return `${escapeHtml(raw)} (${escapeHtml(spoken)})`;
}

/**
 * New Quizzes MathML: normal <p> wrapping, MathML for formulae/fractions only,
 * units/symbols as visible dual notation so NVDA reads dictionary speech without
 * hidden spans or one unbreakable math line.
 */
function canvasLineAsQuizMathml(line) {
  const pre = normalizeNumberUnitSpacing(line);
  const { findings, normalizedText } = analyze(pre, findTokens);
  let html = "";
  let cursor = 0;
  let mathCount = 0;
  for (const f of findings) {
    html += escapeHtml(normalizedText.slice(cursor, f.start));
    const raw = normalizedText.slice(f.start, f.end);
    const spoken = f.primarySpoken;
    const isMath = MATH_TYPES.has(f.type) && f.mathml;

    if (isMath) {
      html += f.mathml;
      mathCount++;
    } else if (QUIZ_SPOKEN_UNIT_TYPES.has(f.type)) {
      html += quizDualNotation(raw, spoken);
    } else {
      html += escapeHtml(raw);
    }
    cursor = f.end;
  }
  html += escapeHtml(normalizedText.slice(cursor));
  if (!html.trim()) return { html: "", mathCount: 0 };
  return { html: `<p>${html}</p>`, mathCount };
}

function canvasFromQuizMathml(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) {
    return { html: "", mathCount: 0, textCount: 0, spoken: canvasSpokenFromText(text) };
  }
  let html = "";
  let mathCount = 0;
  for (const line of lines) {
    const block = canvasLineAsQuizMathml(line);
    html += block.html;
    mathCount += block.mathCount;
  }
  return { html, mathCount, textCount: 0, spoken: canvasSpokenFromText(text) };
}

const CANVAS_ENRICHED_TYPES = new Set([
  "fraction",
  "formula",
  "described-var",
  "described-sup",
  "latex-equation",
]);

function canvasMarkedFindings(findings) {
  return findings
    .filter((f) => CANVAS_ENRICHED_TYPES.has(f.type))
    .sort((a, b) => a.start - b.start);
}

// Build the sighted-student visual line. Spoken mode uses plain text (not MathML)
// so Canvas pages and quizzes keep one font and avoid MathML sanitizer breakage.
function visualForFinding(f, text) {
  if (f.type === "fraction") {
    const num = String(f.numerator ?? "").trim();
    const den = String(f.denominator ?? "").trim();
    return escapeHtml(`${num} / ${den}`);
  }
  return escapeHtml(text.slice(f.start, f.end));
}

function buildCanvasVisual(text, findings) {
  const marked = canvasMarkedFindings(findings);
  let html = "";
  let cursor = 0;
  for (const f of marked) {
    html += escapeHtml(text.slice(cursor, f.start));
    html += visualForFinding(f, text);
    cursor = f.end;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

// Compose spoken text from dictionary terms, with enriched readings for
// fractions and chemical formulae (e.g. CuSO4 -> C U S O 4, not "c u so 4").
function canvasSpokenLine(normalized, findings) {
  const marked = canvasMarkedFindings(findings);
  let spoken = "";
  let cursor = 0;
  const stitch = (chunk) =>
    stitchCompositionSpoken(segmentForComposition(chunk), (seg) => compositionSpoken(seg));
  for (const f of marked) {
    spoken += stitch(normalized.slice(cursor, f.start));
    spoken += f.primarySpoken ?? stitch(normalized.slice(f.start, f.end));
    cursor = f.end;
  }
  spoken += stitch(normalized.slice(cursor));
  return normalizeMathMinusSpeech(spoken.replace(/\s+/g, " ").trim());
}

// One Canvas block per line: aria-label carries the composed spoken stream;
// the visual line is aria-hidden plain text (Canvas-safe — no MathML, no
// off-screen clip hacks that sanitizers strip). Fragmenting inline pairs breaks NVDA.
function canvasLineBlock(line) {
  const pre = normalizeNumberUnitSpacing(line);
  const { findings, normalizedText } = analyze(pre, findTokens);
  const spoken = canvasSpokenLine(normalizedText, findings);
  const visual = buildCanvasVisual(normalizedText, findings);
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  if (norm(spoken) === norm(normalizedText) && visual === escapeHtml(normalizedText)) {
    return { content: escapeHtml(line), count: 0, label: null };
  }
  return { content: visual, count: 1, label: spoken };
}

function wrapCanvasParagraph({ content, count, label }) {
  if (label) {
    return {
      html: `<p aria-label="${escapeAttr(label)}"><span aria-hidden="true">${content}</span></p>`,
      count,
    };
  }
  return { html: `<p>${content}</p>`, count: count ?? 0 };
}

function canvasFromDictionary(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { html: "", count: 0 };
  if (lines.length === 1) return wrapCanvasParagraph(canvasLineBlock(lines[0]));
  let html = "";
  let count = 0;
  for (const line of lines) {
    const wrapped = wrapCanvasParagraph(canvasLineBlock(line));
    html += wrapped.html;
    count += wrapped.count;
  }
  return { html, count };
}

/** New Quizzes / Classic Quizzes: plain visible text only (no aria-label / aria-hidden). */
function canvasFromQuizSafe(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { html: "", count: 0 };
  let html = "";
  for (const line of lines) {
    const pre = normalizeNumberUnitSpacing(line);
    const { findings, normalizedText } = analyze(pre, findTokens);
    const spoken = canvasSpokenLine(normalizedText, findings);
    html += `<p>${escapeHtml(spoken)}</p>`;
  }
  return { html, count: lines.length };
}

// Build a single Canvas-ready HTML string for the whole passage.
//
// mode "quiz" (New Quizzes): dictionary speech as plain visible text in <p> tags.
//   Canvas quiz views ignore aria-label and hidden markup — students must read the
//   visible line. Chemical symbols (J/g°C, mL) become spoken words on screen.
// mode "spoken" (Pages / assignments): aria-label speech + aria-hidden visual symbols.
// mode "quiz-mathml" (New Quizzes): <p> per line; MathML for formulae/fractions;
//   units/symbols as visible dual notation, e.g. J/g°C (jools per gram degree Celsius),
//   because MathCAT reads mtext literally and hidden spans double-announce in NQ.
// mode "mathml" (Pages): MathML for math; units/symbols use hidden spoken text.
//
// NOTE: aria-label on inline <span>s is intentionally NOT used here -- NVDA does
// not reliably expose it as an accessible name, so it gets ignored.
function canvasFromMathml(text, findings, { quizSafe = false } = {}) {
  const emitGap = quizSafe ? emitPlainVisible : emitPlain;
  let html = "";
  let cursor = 0;
  let mathCount = 0;
  let textCount = 0;
  for (const f of findings) {
    const gap = emitGap(text.slice(cursor, f.start));
    html += gap.html;
    textCount += gap.count;
    const raw = text.slice(f.start, f.end);
    const spoken = f.primarySpoken;
    const isMath = MATH_TYPES.has(f.type) && f.mathml;

    if (isMath) {
      html += f.mathml;
      mathCount++;
    } else if (quizSafe && spoken && spoken !== raw) {
      html += literalMathML(raw);
      mathCount++;
    } else if (!quizSafe && spoken && spoken !== raw) {
      html += `<span aria-hidden="true">${escapeHtml(raw)}</span>` + hiddenSpokenSpan(spoken);
      textCount++;
    } else {
      html += escapeHtml(raw);
    }
    cursor = f.end;
  }
  const tail = emitGap(text.slice(cursor));
  html += tail.html;
  textCount += tail.count;
  return { html, mathCount, textCount, spoken: toSpokenText(text, findings) };
}

export function toCanvasHtml(text, findings, { mode = "quiz-mathml" } = {}) {
  if (mode === "quiz") {
    const body = canvasFromQuizSafe(text);
    return {
      html: body.html,
      mathCount: 0,
      textCount: body.count,
      spoken: canvasSpokenFromText(text),
    };
  }
  if (mode === "spoken") {
    const body = canvasFromDictionary(text);
    return {
      html: body.html,
      mathCount: 0,
      textCount: body.count,
      spoken: canvasSpokenFromText(text),
    };
  }
  if (mode === "quiz-mathml") {
    return canvasFromQuizMathml(text);
  }
  return canvasFromMathml(text, findings, { quizSafe: false });
}

// Spoken stream for Canvas "spoken" mode — one composed line per input line,
// matching canvasFromDictionary() so preview matches pasted HTML.
export function canvasSpokenFromText(text) {
  return canvasSpokenLinesFromText(text).join(" ").replace(/\s+/g, " ").trim();
}

/** One composed spoken string per input line (for line-by-line Hear preview). */
export function canvasSpokenLinesFromText(text) {
  if (ruleCount() === 0) return canvasSpokenLinesFromLiteralText(text);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  return lines.map((line) => {
    const pre = normalizeNumberUnitSpacing(line);
    const { findings, normalizedText } = analyze(pre, findTokens);
    return canvasSpokenLine(normalizedText, findings);
  });
}

/** Line-by-line spoken preview for Canvas output (spoken vs MathML mode). */
export function canvasOutputHearLines(text, findings, { mode = "spoken" } = {}) {
  if (mode === "spoken" || mode === "quiz" || mode === "quiz-mathml") {
    return canvasSpokenLinesFromText(text);
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  return lines.map((line) => {
    const pre = normalizeNumberUnitSpacing(line);
    const { findings: lineFindings, normalizedText } = analyze(pre, findTokens);
    return toSpokenText(normalizedText, lineFindings);
  });
}

// Composed curriculum speech: dictionary terms plus enriched formulae/fractions.
export function toDictionarySpeech(text) {
  return canvasSpokenFromText(text);
}

/** Same as toDictionarySpeech but keeps blank lines and one spoken line per input line. */
export function toDictionarySpeechByLine(text) {
  if (ruleCount() === 0) return toBaselineSpeechByLine(text);
  const normalized = normalizePastedContent(text);
  const spoken = canvasSpokenLinesFromText(text);
  let i = 0;
  return normalized
    .split(/\r?\n/)
    .map((line) => (line.trim() ? spoken[i++] ?? "" : ""))
    .join("\n");
}

function normSpeech(s) {
  return String(s).replace(/\s+/g, " ").trim().toLowerCase();
}

/** @typedef {(kind: 'baseline'|'dict', raw: string, spoken: string) => number|null} LabTokenLinkResolver */

/** @type {{ resolve: LabTokenLinkResolver } | null} */
let activeLabTokenLinkResolver = null;

/** Wire speech-column highlights to flagged-token ids for one preview render. */
export function setLabTokenLinkResolver(resolver) {
  activeLabTokenLinkResolver = resolver;
}

/**
 * @param {Array<{ id?: number, raw: string, spoken: string, kind: 'baseline'|'dict' }>} tokens
 */
export function createLabTokenLinkResolver(tokens) {
  const list = tokens.map((t, i) => ({ ...t, id: t.id ?? i }));
  const cursors = { baseline: 0, dict: 0 };
  return {
    tokens: list,
    resolve(kind, raw, spoken) {
      const lit = String(raw ?? "")
        .replace(/\s+/g, " ")
        .trim();
      const sp = String(spoken ?? "")
        .replace(/\s+/g, " ")
        .trim();
      const start = cursors[kind] ?? 0;
      for (let i = start; i < list.length; i++) {
        const t = list[i];
        if (t.kind === kind && t.raw === lit && t.spoken === sp) {
          cursors[kind] = i + 1;
          return t.id;
        }
      }
      return null;
    },
  };
}

/** @param {"plain"|"baseline"|"dict"} kind */
function wrapLabSpeechKind(kind, spoken, rawDisplay) {
  const esc = escapeHtml(spoken);
  if (kind === "dict" || kind === "baseline") {
    const id = activeLabTokenLinkResolver?.resolve(kind, rawDisplay, spoken);
    const cls = kind === "dict" ? "hs-lab-speech-dict" : "hs-lab-speech-baseline";
    if (id != null) {
      return `<span class="${cls} hs-lab-speech-link" data-lab-token="${id}" role="button" tabindex="0" title="Jump to flagged token">${esc}</span>`;
    }
    return `<span class="${cls}">${esc}</span>`;
  }
  return esc;
}

/** Student-visible characters for a normalized analyze slice (no internal brace markup). */
function labVisibleSlice(text) {
  let s = normalizeBaselinePaste(text);
  // analyze() uses q_{calorimeter} markers — show glued text students see.
  s = s.replace(/([A-Za-z])_\{([A-Za-z][A-Za-z0-9]*)\}/g, "$1$2");
  return s;
}

/**
 * Typical screen reader on plain visible text: number–unit spacing and minus
 * wording only — no speech dictionary, no HearSay unit lexicon or formula speech.
 */
function literalPlainSpeech(text) {
  if (!text) return "";
  return normalizeMathMinusSpeech(normalizeNumberUnitSpacing(text));
}

/** Saved class dictionary pronunciation for a single composed segment. */
function classDictSegmentSpoken(seg) {
  if (!seg.spoken) return null;
  const out = normalizeMathMinusSpeech(String(seg.spoken).replace(/\s+/g, " ").trim());
  return normSpeech(out) !== normSpeech(seg.text) ? out : null;
}

/** Default SR: NVDA factory symbols only — no HearSay lexicon or enrich(). */
function defaultSrVisibleSpeech(rawSlice) {
  const visible = labVisibleSlice(rawSlice);
  if (!visible) return "";
  return defaultSrSpeakVisible(normalizeMathMinusVisible(visible));
}

function defaultSrLinePlain(line) {
  const visible = normalizeBaselinePaste(line);
  if (!visible) return "";
  return defaultSrSpeakVisible(normalizeMathMinusVisible(visible), LAB_DEFAULT_SR_PUNCTUATION_LEVEL);
}

/** @typedef {{ html: string, tail: string, afterSpokenSymbol: boolean }} LabHtmlState */

function pushLabSpeech(state, literal, spoken, kind) {
  const lit = String(literal ?? "");
  if (!lit.trim()) return state;
  const leadingWs = /^\s/.test(lit);
  const litDisplay = lit.replace(/\s+/g, " ").trim();
  const spokenNorm = String(spoken ?? litDisplay).replace(/\s+/g, " ").trim();
  const differs = normSpeech(spokenNorm) !== normSpeech(litDisplay);
  const show = differs ? spokenNorm : litDisplay;
  if (state.tail && show) {
    const needsSpace =
      (leadingWs && !/\s$/.test(state.tail)) ||
      (differs && kind && !/\s$/.test(state.tail)) ||
      (state.afterSpokenSymbol && !/\s$/.test(state.tail)) ||
      labSpeechNeedsGap(state.tail, show);
    if (needsSpace) {
      state.html += " ";
      state.tail += " ";
    }
  }
  if (differs && kind) {
    state.html += wrapLabSpeechKind(kind, spokenNorm, litDisplay);
  } else {
    state.html += escapeHtml(litDisplay);
  }
  state.tail += show;
  state.afterSpokenSymbol = Boolean(differs && kind);
  return state;
}

function appendBaselineVisible(state, visible) {
  const normalized = normalizeMathMinusVisible(String(visible ?? ""));
  for (const seg of defaultSrVisibleSegments(normalized, LAB_DEFAULT_SR_PUNCTUATION_LEVEL)) {
    pushLabSpeech(state, seg.display, seg.spoken, seg.changed ? "baseline" : null);
  }
  return state;
}

/** @typedef {{ id?: number, raw: string, spoken: string, kind: 'baseline'|'dict', pattern?: string, hasRule?: boolean }} LabFlaggedToken */

function dictFlaggedMeta(raw) {
  const rule = ruleForVisibleToken(raw);
  return { pattern: rule?.pattern ?? raw, hasRule: Boolean(rule) };
}

function pushLabFlaggedToken(tokens, raw, spoken, kind) {
  const litDisplay = String(raw ?? "").replace(/\s+/g, " ").trim();
  const spokenNorm = String(spoken ?? litDisplay).replace(/\s+/g, " ").trim();
  if (!litDisplay || !kind) return;
  if (normSpeech(spokenNorm) === normSpeech(litDisplay)) return;
  /** @type {LabFlaggedToken} */
  const entry = { raw: litDisplay, spoken: spokenNorm, kind };
  if (kind === "dict") Object.assign(entry, dictFlaggedMeta(litDisplay));
  tokens.push(entry);
}

function collectBaselineVisible(tokens, visible) {
  for (const seg of defaultSrVisibleSegments(visible, LAB_DEFAULT_SR_PUNCTUATION_LEVEL)) {
    if (seg.changed) pushLabFlaggedToken(tokens, seg.display, seg.spoken, "baseline");
  }
}

/** Lab dictionary column: full NVDA rule set (includes long class phrases). */
function labDictionarySegments(visible) {
  return segmentByDictionary(String(visible ?? ""));
}

function collectDictionaryComposition(tokens, chunk) {
  const visible = labVisibleSlice(chunk);
  if (!visible) return;
  for (const seg of labDictionarySegments(visible)) {
    const classSp = classDictSegmentSpoken(seg);
    if (classSp) {
      pushLabFlaggedToken(tokens, seg.text, classSp, "dict");
    } else {
      collectBaselineVisible(tokens, seg.text);
    }
  }
}

function collectDictionaryEnrichedFinding(tokens, f, rawSlice) {
  const visible = labVisibleSlice(rawSlice);
  if (!visible) return;
  const dictSp =
    dictWholeReading(visible) ??
    (f.type === "described-var" ? dictWholeReading(gluedToken(f.base, f.sub)) : null) ??
    (f.type === "described-var" ? dictWholeReading(`${f.base}_${f.sub}`) : null);
  if (dictSp && normSpeech(dictSp) !== normSpeech(visible)) {
    pushLabFlaggedToken(tokens, visible, dictSp, "dict");
    return;
  }
  const spoken = String(enrich(f).primarySpoken ?? visible)
    .replace(/\s+/g, " ")
    .trim();
  if (normSpeech(spoken) !== normSpeech(visible)) {
    pushLabFlaggedToken(tokens, visible, spoken, "dict");
  } else {
    collectBaselineVisible(tokens, visible);
  }
}

function collectDictionaryLineFlaggedTokens(line, tokens) {
  const pre = normalizeNumberUnitSpacing(line);
  const visible = normalizeBaselinePaste(pre);
  if (!visible.trim()) return;
  collectDictionaryComposition(tokens, visible);
}

function collectBaselineLineFlaggedTokens(line, tokens) {
  const pre = normalizeNumberUnitSpacing(line);
  const { findings, normalizedText } = analyze(pre, findTokens);
  const sorted = [...findings].sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const f of sorted) {
    collectBaselineVisible(tokens, labVisibleSlice(normalizedText.slice(cursor, f.start)));
    collectBaselineVisible(tokens, labVisibleSlice(normalizedText.slice(f.start, f.end)));
    cursor = f.end;
  }
  collectBaselineVisible(tokens, labVisibleSlice(normalizedText.slice(cursor)));
}

/**
 * Tokens in passage order where speech differs from on-screen text.
 * Blue (baseline) = default NVDA; green (dict) = saved class dictionary (when active).
 */
export function labFlaggedSpeechTokens(text, { classDictActive = false } = {}) {
  const normalized = normalizePastedContent(text);
  /** @type {LabFlaggedToken[]} */
  const tokens = [];
  for (const line of normalized.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (classDictActive) {
      collectDictionaryLineFlaggedTokens(line, tokens);
    } else {
      collectBaselineLineFlaggedTokens(line, tokens);
    }
  }
  return tokens.map((t, id) => ({ ...t, id }));
}

function appendDictionaryComposition(state, chunk) {
  const visible = labVisibleSlice(chunk);
  if (!visible) return state;
  for (const seg of labDictionarySegments(visible)) {
    const classSp = classDictSegmentSpoken(seg);
    if (classSp) {
      pushLabSpeech(state, seg.text, classSp, "dict");
    } else {
      appendBaselineVisible(state, seg.text);
    }
  }
  return state;
}

function appendDictionaryEnrichedFinding(state, f, rawSlice) {
  const visible = labVisibleSlice(rawSlice);
  if (!visible) return state;
  const dictSp =
    dictWholeReading(visible) ??
    (f.type === "described-var" ? dictWholeReading(gluedToken(f.base, f.sub)) : null) ??
    (f.type === "described-var" ? dictWholeReading(`${f.base}_${f.sub}`) : null);
  if (dictSp && normSpeech(dictSp) !== normSpeech(visible)) {
    pushLabSpeech(state, visible, dictSp, "dict");
    return state;
  }
  const spoken = String(enrich(f).primarySpoken ?? visible)
    .replace(/\s+/g, " ")
    .trim();
  if (normSpeech(spoken) !== normSpeech(visible)) {
    pushLabSpeech(state, visible, spoken, "dict");
  } else {
    appendBaselineVisible(state, visible);
  }
  return state;
}

/** Dictionary column: class rules override default SR; same walk for HTML and Hear. */
function walkLabDictionaryLine(line) {
  const pre = normalizeNumberUnitSpacing(line);
  const visible = normalizeBaselinePaste(pre);
  if (!visible.trim()) return { html: "", tail: "", afterSpokenSymbol: false };
  let state = { html: "", tail: "", afterSpokenSymbol: false };
  appendDictionaryComposition(state, visible);
  return state;
}

function formatDictionaryLineHtml(line) {
  return walkLabDictionaryLine(line).html;
}

/** Plain speech for Lab dictionary column (default SR + class dictionary). */
export function labDictionaryLinePlain(line) {
  return walkLabDictionaryLine(line).tail.replace(/\s+/g, " ").trim();
}

/** Line-by-line Lab dictionary speech — matches the green/blue column and Hear. */
export function toLabDictionarySpeechByLine(text) {
  if (ruleCount() === 0) return toDefaultScreenReaderSpeechByLine(text);
  const normalized = normalizePastedContent(text);
  return normalized
    .split(/\r?\n/)
    .map((line) => (line.trim() ? labDictionaryLinePlain(line) : ""))
    .join("\n");
}

function appendBaselineFinding(state, f, rawSlice) {
  const visible = labVisibleSlice(rawSlice);
  if (!visible) return state;
  return appendBaselineVisible(state, visible);
}

function appendBaselineGap(state, rawSlice) {
  const visible = labVisibleSlice(rawSlice);
  if (!visible) return state;
  return appendBaselineVisible(state, visible);
}

function formatBaselineGapHtml(chunk) {
  const state = appendBaselineGap({ html: "", tail: "", afterSpokenSymbol: false }, chunk);
  return state.html;
}

function formatBaselineFindingHtml(f, rawSlice) {
  const state = appendBaselineFinding({ html: "", tail: "", afterSpokenSymbol: false }, f, rawSlice);
  return state.html;
}

function formatLabSpeechLineHtml(line, column) {
  if (column === "dictionary") return formatDictionaryLineHtml(line);
  const pre = normalizeNumberUnitSpacing(line);
  const { findings, normalizedText } = analyze(pre, findTokens);
  const marked = canvasMarkedFindings(findings);
  let state = { html: "", tail: "", afterSpokenSymbol: false };
  let cursor = 0;
  for (const f of marked) {
    state = appendBaselineGap(state, normalizedText.slice(cursor, f.start));
    state = appendBaselineFinding(state, f, normalizedText.slice(f.start, f.end));
    cursor = f.end;
  }
  state = appendBaselineGap(state, normalizedText.slice(cursor));
  return state.html;
}

/** One line of default screen-reader speech (student-visible characters only). */
function baselineSpeechFromVisibleLine(line) {
  const visible = normalizeBaselinePaste(line);
  return literalPlainSpeech(visible).replace(/\s+/g, " ").trim();
}

function formatBaselineLineHtml(line) {
  return formatLabSpeechLineHtml(line, "baseline");
}

/** One spoken line per input line — typical screen reader (no HearSay expansions). */
export function canvasSpokenLinesFromLiteralText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  return lines.map((line) => baselineSpeechFromVisibleLine(line));
}

/** Plain speech for Lab “default screen reader” column (literal symbols, no HearSay expansions). */
export function toBaselineSpeechByLine(text) {
  const spoken = canvasSpokenLinesFromLiteralText(text);
  let i = 0;
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => (line.trim() ? spoken[i++] ?? "" : ""))
    .join("\n");
}

/** Default screen reader speech — matches Lab default column / Hear (line indices preserved). */
export function toDefaultScreenReaderSpeechByLine(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => (line.trim() ? defaultSrLinePlain(line) : ""))
    .join("\n");
}

/** Wrap line HTML for scrollable Lab columns and hear highlighting (data-line = input row index). */
export function wrapLabSpeechOutputHtml(htmlByLine) {
  return String(htmlByLine ?? "")
    .split(/\r?\n/)
    .map((lineHtml, lineIndex) => {
      if (!lineHtml.trim()) {
        return `<div class="hs-lab-output-line hs-lab-output-line-blank" data-line="${lineIndex}"></div>`;
      }
      return `<div class="hs-lab-output-line" data-line="${lineIndex}">${lineHtml}</div>`;
    })
    .join("");
}

/** Literal default screen-reader column (symbols such as mL stay as printed). */
export function formatBaselineSpeechHtmlByLine(text) {
  return wrapLabSpeechOutputHtml(
    String(text ?? "")
      .split(/\r?\n/)
      .map((line) => (line.trim() ? formatBaselineLineHtml(line) : ""))
      .join("\n"),
  );
}

/**
 * Line-by-line speech with class dictionary: green = saved class rule;
 * blue = default screen reader when no class rule applies.
 */
export function formatDictionarySpeechHtmlByLine(text) {
  if (ruleCount() === 0) return formatBaselineSpeechHtmlByLine(text);
  const normalized = normalizePastedContent(text);
  return wrapLabSpeechOutputHtml(
    normalized
      .split(/\r?\n/)
      .map((line) => (line.trim() ? formatDictionaryLineHtml(line) : ""))
      .join("\n"),
  );
}

// Normalize LaTeX for insert / parse (unicode subscripts, chem symbols, operators).
export function normalizeEquationInsert(input) {
  return preprocessEquationInput(String(input ?? "").trim())
    .replace(/\s+/g, " ")
    .trim();
}

// Normalize pasted curriculum text (unicode subscripts, chem variables, symbols)
// into LaTeX the equation parser understands.
export function preprocessEquationInput(input) {
  let s = normalizeNumberUnitSpacing(input);
  // Legacy cH rules (still useful when subscripts are already unicode).
  s = s.replace(/c(H₂O|H2O)/g, "c_{H_2O}");
  s = s.replace(/c(H₂|H2)(?![A-Za-z0-9])/g, "c_{H_2}");
  s = s.replace(/H₂O/g, "H_2O");
  s = s.replace(/H₂(?![A-Za-z\u2080-\u2089O])/g, "H_2");
  s = s.replace(/T₁/g, "T_1");
  s = s.replace(/T₂/g, "T_2");
  s = s.replace(/[\u2080-\u2089]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x2080 + 0x30),
  );
  s = s.replace(/[\u2070-\u2079]/g, (ch) => {
    const off = ch.charCodeAt(0);
    const digit =
      off >= 0x2070 && off <= 0x2079
        ? String(off === 0x2070 ? 0 : off - 0x2070 + 0x30)
        : ch;
    return String(digit);
  });
  s = s.replace(/×/g, "\\times ");
  s = s.replace(/÷/g, "\\div ");
  s = s.replace(/→/g, "\\to ");
  s = s.replace(/Δ/g, "\\Delta ");
  s = s.replace(/−/g, "-");
  return s;
}

function isProseLike(input) {
  return /\s[A-Za-z]{2,}\s/.test(input);
}

function proseToMathML(text) {
  return (
    `<math xmlns="http://www.w3.org/1998/Math/MathML">` +
    `<mtext>${escapeHtml(text)}</mtext></math>`
  );
}

// Turn parser spoken forms into tokens the course dictionary recognizes.
function spokenForDictionary(spoken) {
  return spoken
    .replace(/c sub H (\d+) O/g, "cH$1O")
    .replace(/c sub H (\d+)(?!\s*O)/g, "cH$1")
    .replace(/([A-Za-z]) sub (\d+)/g, "$1$2");
}

// Equation typer: parse a LaTeX-subset string into MathML (for Canvas) and a
// spoken preview. Prose-like input (full sentences pasted from the module) keeps
// unicode subscripts in the preview and uses dictionary segmentation for speech.
export function analyzeEquation(input) {
  const raw = input || "";
  if (isProseLike(raw)) {
    const dictSpoken = toDictionarySpeech(raw);
    const mathml = proseToMathML(raw);
    const accessibleText = ariaHide(mathml) + hiddenSpokenSpan(dictSpoken);
    return { mathml, spoken: dictSpoken, spokenRaw: raw, accessibleText };
  }
  const normalized = preprocessEquationInput(raw);
  const { mathml, spoken } = parseLatex(normalized);
  const dictSpoken = applyDictionary(spokenForDictionary(spoken))
    .replace(/\s+/g, " ")
    .trim();
  const accessibleText = mathml
    ? ariaHide(mathml) + hiddenSpokenSpan(dictSpoken)
    : `<span style="${SR_ONLY_INLINE}">${escapeHtml(dictSpoken)}</span>`;
  return {
    mathml,
    spoken: dictSpoken,
    spokenRaw: spoken,
    accessibleText,
  };
}

// CSS for the .sr-only class referenced by the "hidden" fix.
export const SR_ONLY_CSS =
  `.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;` +
  `overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}`;

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

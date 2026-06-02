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
} from "./math.js";
import {
  wordSubscriptMathML,
  wordSubscriptSpeech,
  wordSuperscriptMathML,
  wordSuperscriptSpeech,
  gluedToken,
} from "./vars.js";
import { applyDictionary, segmentForComposition } from "./dictionary.js";
import { parseLatex } from "./latex.js";
import { normalizePastedContent } from "./paste-normalize.js";

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
// classes but allows inline style; this keeps the visual hidden while the
// spoken text stays in the accessibility/braille stream.
const SR_ONLY_INLINE =
  "position:absolute;left:-10000px;top:auto;width:1px;height:1px;" +
  "padding:0;margin:-1px;overflow:hidden;" +
  "clip:rect(1px,1px,1px,1px);clip-path:inset(50%);" +
  "border:0;word-wrap:normal;";

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
      support: "NVDA 2026.1+ (MathCAT) and SRE speak & braille this with no user setup.",
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

/** Speak unicode or ASCII minus in math contexts without breaking chemistry prefixes like -OH. */
export function normalizeMathMinusSpeech(text) {
  if (!text) return text;
  let s = String(text).replace(/\u2212/g, " minus ");
  // Spaced hyphen (typical in pasted equations).
  s = s.replace(/(?<=\s)-(?=\s)/g, " minus ");
  // Hyphen between math tokens (e.g. 100-50, T2-T1) — not word hyphens like DI-water.
  s = s.replace(/(?<=[0-9Ttvxn])-(?=[0-9Ttvxn])/gi, " minus ");
  return s;
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

// Build the sighted-student visual line: LaTeX fractions and chemical formulae
// become MathML; everything else stays as normalized plain text.
function buildCanvasVisual(text, findings) {
  const marked = canvasMarkedFindings(findings);
  let html = "";
  let cursor = 0;
  for (const f of marked) {
    html += escapeHtml(text.slice(cursor, f.start));
    html += f.mathml ?? escapeHtml(text.slice(f.start, f.end));
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
    segmentForComposition(chunk)
      .map((s) => compositionSpoken(s))
      .join("");
  for (const f of marked) {
    spoken += stitch(normalized.slice(cursor, f.start));
    spoken += f.primarySpoken ?? stitch(normalized.slice(f.start, f.end));
    cursor = f.end;
  }
  spoken += stitch(normalized.slice(cursor));
  return normalizeMathMinusSpeech(spoken.replace(/\s+/g, " ").trim());
}

// One Canvas block per line: a single continuous spoken stream (composed from
// atomic dictionary terms, with punctuation preserved) plus the full visual line
// marked aria-hidden. Fragmenting inline aria-hidden + sr-only pairs breaks NVDA
// in Canvas — it stops after "(" when the next node is aria-hidden.
function canvasLineBlock(line) {
  const pre = normalizeNumberUnitSpacing(line);
  const { findings, normalizedText } = analyze(pre, findTokens);
  const spoken = canvasSpokenLine(normalizedText, findings);
  const visual = buildCanvasVisual(normalizedText, findings);
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  if (norm(spoken) === norm(normalizedText) && visual === escapeHtml(normalizedText)) {
    return { html: escapeHtml(line), count: 0 };
  }
  return {
    html: hiddenSpokenSpan(spoken) + `<span aria-hidden="true">${visual}</span>`,
    count: 1,
  };
}

function canvasFromDictionary(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { html: "", count: 0 };
  if (lines.length === 1) return canvasLineBlock(lines[0]);
  let html = "";
  let count = 0;
  for (const line of lines) {
    const block = canvasLineBlock(line);
    html += `<p>${block.html}</p>`;
    count += block.count;
  }
  return { html, count };
}

// Build a single Canvas-ready HTML string for the whole passage.
//
// mode "spoken" (default, most robust): Sci-Speak composes atomic dictionary
//   readings into one spoken stream per line (parentheses and operators included).
//   The spoken text lives in a single off-screen span; the visual line is one
//   aria-hidden block. This avoids NVDA stopping mid-sentence in Canvas.
// mode "mathml" (navigable): math stays as live MathML (needs NVDA 2026.1 /
//   MathCAT or MathJax to be announced); units/symbols use hidden spoken text.
//
// NOTE: aria-label on inline <span>s is intentionally NOT used here -- NVDA does
// not reliably expose it as an accessible name, so it gets ignored.
export function toCanvasHtml(text, findings, { mode = "spoken" } = {}) {
  if (mode === "spoken") {
    const body = canvasFromDictionary(text);
    return {
      html: body.html,
      mathCount: 0,
      textCount: body.count,
      spoken: canvasSpokenFromText(text),
    };
  }

  let html = "";
  let cursor = 0;
  let mathCount = 0;
  let textCount = 0;
  for (const f of findings) {
    const gap = emitPlain(text.slice(cursor, f.start));
    html += gap.html;
    textCount += gap.count;
    const raw = text.slice(f.start, f.end);
    const spoken = f.primarySpoken;
    const isMath = MATH_TYPES.has(f.type) && f.mathml;

    if (isMath) {
      html += f.mathml;
      mathCount++;
    } else if (spoken && spoken !== raw) {
      html += `<span aria-hidden="true">${escapeHtml(raw)}</span>` + hiddenSpokenSpan(spoken);
      textCount++;
    } else {
      html += escapeHtml(raw);
    }
    cursor = f.end;
  }
  const tail = emitPlain(text.slice(cursor));
  html += tail.html;
  textCount += tail.count;
  return { html, mathCount, textCount, spoken: toSpokenText(text, findings) };
}

// Spoken stream for Canvas "spoken" mode — one composed line per input line,
// matching canvasFromDictionary() so preview matches pasted HTML.
export function canvasSpokenFromText(text) {
  return canvasSpokenLinesFromText(text).join(" ").replace(/\s+/g, " ").trim();
}

/** One composed spoken string per input line (for line-by-line Hear preview). */
export function canvasSpokenLinesFromText(text) {
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
  if (mode === "spoken") return canvasSpokenLinesFromText(text);
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

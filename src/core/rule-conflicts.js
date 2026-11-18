// Detect pronunciation rules that will fight each other once NVDA runs them.
//
// NVDA applies dictionary rules in order against the RUNNING text, so entries
// interact in ways that are invisible when you look at a row on its own:
// a shorter pattern eats a longer one's text, a replacement gets re-matched by
// a later rule, or a unit collides with an ordinary English word. Authors hit
// these as "why does my dictionary say "H C liters"?" long after saving.
//
// Everything here is advisory: each finding explains the trade-off and lets the
// author decide. Nothing is blocked.

/** Ordinary English words that are also unit abbreviations. */
const ENGLISH_WORD_UNITS = new Set([
  "min", "ton", "cup", "bar", "cal", "in", "at", "is", "as", "pt", "gal",
  "mi", "ft", "yd", "oz", "lb", "no", "and", "or", "a", "am", "pm", "sin",
  "tan", "log", "the", "he", "it", "so", "to", "on", "for", "art", "can",
]);

/** Case-significant SI prefixes/units: same letters, different meaning. */
const SI_CASE_PAIRS = [
  ["mm", "mM"], ["nm", "nM"], ["pm", "pM"], ["um", "uM"], ["μm", "μM"],
  ["mj", "MJ"], ["mw", "MW"], ["mv", "MV"], ["ms", "MS"], ["g", "G"],
  ["m", "M"], ["k", "K"], ["n", "N"], ["s", "S"], ["t", "T"], ["l", "L"],
];

function normalizePattern(value) {
  return String(value ?? "").trim();
}

function isRegexRule(row) {
  return Number(row?.rule_type ?? 0) === 1;
}

function ignoresCase(row) {
  const v = String(row?.ignore_case ?? "Yes").trim().toLowerCase();
  return !(v === "no" || v === "0");
}

/** Literal text a rule matches, or null when it is a regex we cannot flatten. */
function literalOf(row) {
  if (isRegexRule(row)) return null;
  return normalizePattern(row?.text ?? row?.pattern);
}

function spokenOf(row) {
  return String(row?.substitution ?? row?.replacement ?? "").trim();
}

/** Letter names, so a spelled letter cannot be re-matched by a one-letter rule. */
const LETTER_NAMES = { a: "ay", b: "bee", c: "see", d: "dee", e: "ee", f: "ef", g: "jee", h: "aitch", i: "eye", j: "jay", k: "kay", l: "el", m: "em", n: "en", o: "oh", p: "pee", q: "cue", r: "ar", s: "ess", t: "tee", u: "you", v: "vee", w: "double you", x: "ex", y: "why", z: "zee" };

/**
 * A suggested change that keeps both entries reading correctly.
 * @typedef {{ label: string, spoken?: string, ignoreCase?: "Yes"|"No", skip?: boolean }} ConflictFix
 * @typedef {{ severity: "high"|"medium"|"info", kind: string, message: string,
 *             detail?: string, otherPattern?: string, fix?: ConflictFix }} RuleConflict
 */

/**
 * Compare one candidate row against the rules already in a class.
 *
 * @param {{ text: string, substitution: string, ignore_case?: string, rule_type?: number }} candidate
 * @param {Array<{ text?: string, pattern?: string, substitution?: string, replacement?: string, ignore_case?: string, rule_type?: number }>} existingRows
 * @returns {RuleConflict[]} advisory findings, most severe first
 */
export function findRuleConflicts(candidate, existingRows = []) {
  const pattern = normalizePattern(candidate?.text);
  const spoken = spokenOf(candidate);
  if (!pattern || !spoken) return [];

  /** @type {RuleConflict[]} */
  const out = [];
  const isRegex = isRegexRule(candidate);
  const lower = pattern.toLowerCase();

  // 1. Exact duplicate — the later row silently never runs.
  for (const other of existingRows) {
    const otherPattern = normalizePattern(other?.text ?? other?.pattern);
    if (!otherPattern || otherPattern !== pattern) continue;
    const otherSpoken = spokenOf(other);
    if (otherSpoken === spoken) {
      out.push({
        severity: "medium",
        kind: "duplicate",
        otherPattern,
        message: `"${pattern}" is already in this class with the same spoken text.`,
        detail: "Adding it again has no effect. Edit the existing row instead.",
      });
    } else {
      out.push({
        severity: "high",
        kind: "duplicate-different",
        otherPattern,
        message: `"${pattern}" already exists but speaks as "${otherSpoken}".`,
        detail:
          "NVDA applies the first matching rule, so only one of these will ever be heard. Edit the existing row rather than adding a second.",
      });
    }
  }

  // 2. The spoken text contains a token another rule rewrites — the classic
  //    cascade: HCl -> "H C L", then the liters rule turns it into "H C liters".
  for (const other of existingRows) {
    const otherLiteral = literalOf(other);
    if (!otherLiteral || otherLiteral === pattern) continue;
    // Only single tokens can hide inside a replacement this way.
    if (/\s/.test(otherLiteral)) continue;
    const otherIgnoresCase = ignoresCase(other);
    const haystack = otherIgnoresCase ? spoken.toLowerCase() : spoken;
    const needle = otherIgnoresCase ? otherLiteral.toLowerCase() : otherLiteral;
    const boundary = /^[A-Za-z0-9]+$/.test(needle)
      ? new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, otherIgnoresCase ? "i" : "")
      : null;
    const hit = boundary ? boundary.test(spoken) : haystack.includes(needle);
    if (!hit) continue;
    const anyCase = new RegExp(boundary ? `\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b` : needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), otherIgnoresCase ? "gi" : "g");
    const mangled = spoken.replace(anyCase, spokenOf(other));
    // Fix: spell a short letter token by its letter names; otherwise write the
    // other entry's reading out in full, so nothing is left for it to re-match.
    const letters = /^[A-Za-z]{1,3}$/.test(otherLiteral);
    const fixed = letters
      ? spoken.replace(anyCase, token => [...token].map(ch => LETTER_NAMES[ch.toLowerCase()]).join(" "))
      : mangled;
    out.push({
      severity: "high",
      kind: "cascade",
      otherPattern: otherLiteral,
      message: `The saved entry "${otherLiteral}" (read "${spokenOf(other)}") would re-read part of this, so "${pattern}" could sound like "${mangled}".`,
      detail: `NVDA re-reads its own output, so "${pattern}" may end up spoken as "${mangled}". Reword the spoken text to avoid that token.`,
      fix: fixed !== spoken && !/[^\x20-\x7e]/.test(fixed) ? { label: `Read it as "${fixed}"`, spoken: fixed } : undefined,
    });
  }

  // 3. A shorter existing pattern is a substring of this one (or vice versa).
  //    Whichever NVDA reaches first consumes the text.
  if (!isRegex) {
    for (const other of existingRows) {
      const otherLiteral = literalOf(other);
      if (!otherLiteral || otherLiteral === pattern) continue;
      const a = ignoresCase(candidate) || ignoresCase(other) ? lower : pattern;
      const b =
        ignoresCase(candidate) || ignoresCase(other) ? otherLiteral.toLowerCase() : otherLiteral;
      if (a.length > b.length && a.includes(b)) {
        out.push({
          severity: "medium",
          kind: "overlap",
          otherPattern: otherLiteral,
          message: `"${otherLiteral}" is already a rule and appears inside "${pattern}".`,
          detail: `Export lists longer patterns first, so "${pattern}" should win — but if "${otherLiteral}" runs first the text is read as "${spokenOf(
            other,
          )}" instead.`,
        });
      } else if (b.length > a.length && b.includes(a)) {
        // The new term sits inside a longer saved entry: both still read
        // correctly because the longer entry is applied first.
        out.push({
          severity: "info",
          kind: "overlap-inside",
          otherPattern: otherLiteral,
          message: `"${pattern}" also appears inside the saved entry "${otherLiteral}".`,
          detail: `Longer entries are exported first, so "${otherLiteral}" keeps its own reading ("${spokenOf(other)}").`,
        });
      }
    }
  }

  // 4. Case-insensitive unit rules collapse distinct SI units.
  if (!isRegex && ignoresCase(candidate)) {
    for (const [lowUnit, upUnit] of SI_CASE_PAIRS) {
      if (lower !== lowUnit.toLowerCase()) continue;
      const twin = pattern === lowUnit ? upUnit : lowUnit;
      out.push({
        severity: "high",
        kind: "si-case",
        otherPattern: twin,
        message: `"${pattern}" ignores case, so it also matches "${twin}".`,
        detail:
          "SI is case-significant — these are different units. Set Ignore case to No so a concentration is not read as a length.",
        fix: { label: "Match exact case only", ignoreCase: "No" },
      });
      break;
    }
  }

  // 5. The pattern is an ordinary English word.
  if (!isRegex && ENGLISH_WORD_UNITS.has(lower)) {
    out.push({
      severity: "high",
      kind: "english-word",
      message: `"${pattern}" is also an ordinary English word.`,
      detail: `Every "${pattern}" in your course prose will be spoken as "${spoken}". Anchor it to a number with a regex like (?<=\\d\\s?)${pattern}\\b, or leave it out.`,
      fix: { label: "Skip this term", skip: true },
    });
  }

  // 6. Prose punctuation — the student's screen reader already handles this.
  if (!isRegex && /^[,.;:!?]$/.test(pattern)) {
    out.push({
      severity: "high",
      kind: "prose-punctuation",
      message: `"${pattern}" is prose punctuation.`,
      detail:
        "Screen readers already speak punctuation according to the student's own verbosity setting. A dictionary rule overrides that choice in every app and cannot be turned off by the student.",
      fix: { label: "Skip this term", skip: true },
    });
  }

  const rank = { high: 0, medium: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** One-line summary for compact UI. */
export function summarizeConflicts(conflicts) {
  conflicts = conflicts?.filter((c) => c.severity !== "info");
  if (!conflicts?.length) return "";
  const high = conflicts.filter((c) => c.severity === "high").length;
  const n = conflicts.length;
  const noun = n === 1 ? "possible conflict" : "possible conflicts";
  return high ? `${n} ${noun} (${high} likely to change speech)` : `${n} ${noun}`;
}

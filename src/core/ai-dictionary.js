// Validate AI proposals against the source before offering dictionary changes.
import { possibleLostExponents } from "./exponent-formatting.js";
// Local safety bounds, not a promise about the selected model's token window.
export const AI_TEXT_LIMIT = 500000;
export const AI_SUGGESTION_LIMIT = 300;

// English speech-engine replacements are prose/respelling, not IPA or a mix of scripts.
// This restriction applies only to spoken replacements, never source notation.
export function spokenWordingIssue(spoken) {
  return /[^\x20-\x7e]/.test(String(spoken))
    ? "Use plain English letters and punctuation for spoken wording. Replace phonetic symbols or text from other scripts before previewing or adding this term."
    : "";
}

export function canEditAiPronunciation(item) {
  return item.review_kind !== "structure" || requiresExactTextApproval(item);
}

// Allow an instructor-chosen reading for a complete, explicitly written numeric
// power. Do not extend this exception to lost formatting, units or equations.
export function requiresExactTextApproval(item) {
  return item.review_kind === "structure" && /^[+−-]?\d+(?:\.\d+)?\s*(?:[×x]\s*10\s*)?(?:\^\s*(?:[+−-]?\d+|\([+−-]?\d+\)|\{[+−-]?\d+\})|[⁺⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/u.test(item.term);
}

// A reusable literal phrase, not regex or a promise about JAWS matching.
// Including the multiplication and base avoids rewriting ionic charges or footnotes.
export function reusableScientificReading(item) {
  const match = /^[+−-]?\d+(?:\.\d+)?\s*([×x]\s*10\s*(?:\^\s*(?:[+−-]?\d+|\([+−-]?\d+\)|\{[+−-]?\d+\})|[⁺⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+))$/u.exec(item.term);
  if (!match) return null;
  const term = match[1];
  const digits = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+", "−": "-" };
  const exponent = term.replace(/^[×x]\s*10\s*/, "").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺−]/gu, char => digits[char]).replace(/[\s^(){}]/g, "");
  const spoken = `times ten to the power of ${exponent.startsWith("-") ? "negative " : ""}${exponent.replace(/^[+-]/, "")}`;
  return { term, spoken };
}

// A model may reflow a quotation. Restore the original source characters when
// only whitespace differs; never flatten subscripts, symbols, spelling or case.
function sourceExcerpt(evidence, source) {
  if (source.includes(evidence)) return evidence;
  const literal = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = value => {
    if (!value) return null;
    const pattern = value.split(/\s+/u).map(literal).join("\\s+");
    return new RegExp(pattern, "u").exec(source)?.[0] ?? null;
  };
  const reflowed = match(evidence);
  if (reflowed !== null) return reflowed;
  // Models sometimes include typographic quotation marks INSIDE the JSON
  // string. Only remove a matching outer pair and still require source proof.
  const pairs = new Map([["\"", "\""], ["'", "'"], ["“", "”"], ["‘", "’"], ["`", "`"], ["«", "»"]]);
  if (evidence.length >= 3 && pairs.get(evidence[0]) === evidence.at(-1)) {
    return match(evidence.slice(1, -1).trim());
  }
  return null;
}

// Ignore case default when the AI gives none: ordinary words and names read the
// same in any case; anything with digits, symbols or inner capitals is exact.
export function defaultIgnoreCase(term) {
  return /^[\p{Ll}][\p{Ll}\p{M}'’-]*$|^\p{Lu}[\p{Ll}\p{M}'’-]+$/u.test(String(term).trim()) ? "Yes" : "No";
}

export function validateAiSuggestions(payload, source) {
  if (!payload || !Array.isArray(payload.suggestions) || payload.suggestions.length > AI_SUGGESTION_LIMIT) {
    throw new Error("The AI response did not contain a valid suggestion list. Try a shorter passage.");
  }
  const suggestions = [], seen = new Set();
  let discarded = 0;
  let repairedExcerpts = 0;
  const discardedReasons = {};
  const discard = reason => { discarded++; discardedReasons[reason] = (discardedReasons[reason] || 0) + 1; };
  for (const item of payload.suggestions) {
    const validString = (key, max) => typeof item?.[key] === "string" && item[key].length <= max;
    if (!validString("term", 160) || !validString("spoken", 300) ||
        !validString("reason", 1000) || !validString("evidence", 2000) ||
        !["dictionary", "review"].includes(item.action)) { discard("invalid fields"); continue; }
    const term = item.term.trim(), spoken = item.spoken.trim();
    let evidence = item.evidence.trim();
    if (!term || !evidence || /[\t\r\n]/.test(term + spoken) ||
        (item.action === "dictionary" && !spoken)) { discard("missing or invalid wording"); continue; }
    const proposedEvidence = evidence;
    evidence = sourceExcerpt(evidence, source);
    if (evidence === null) { discard("source excerpt did not match"); continue; }
    if (!evidence.includes(term)) { discard("term did not match its excerpt"); continue; }
    // Equals can denote a chemical bond. Keep short bond tokens eligible when
    // the model identifies chemical context; full equations still require review.
    const shortBond = /^(?:[A-Z][a-z]?[0-9]*)[=≡–-](?:[A-Z][a-z]?[0-9]*)$/.test(term) || /^\([=≡–-]\)$/.test(term);
    const scientificValue = /\d(?:\.\d+)?\s*[×x]\s*10\s*(?:\^\s*[({]?[+−-]?\d+|[⁺⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)/u.test(term);
    const numericPower = /^[+−-]?\d+(?:\.\d+)?\s*(?:\^\s*[({]?[+−-]?\d+[)}]?|[⁺⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/u.test(term);
    const lostFormatting = possibleLostExponents(term).length > 0;
    // A term the author added by hand is always theirs to word: units such as
    // kJ/mol or mol/L must stay editable. Lost-exponent warnings still apply.
    const manual = item.origin === "manual";
    const structural = !manual && (lostFormatting || scientificValue || numericPower || /[\\\r\n]/.test(term) || (term.includes("=") && !shortBond));
    const action = structural ? "review" : item.action;
    // A name needing pronunciation confirmation is still an editable term.
    // Migrate old responses/drafts that used the single generic review action.
    const nameLike = /^[\p{L}\p{M}]+(?:['’.-][\p{L}\p{M}]+)*$/u.test(term);
    const complexReview = action === "review" && !shortBond && /[≡+→⇌÷×\[\]\/]/u.test(term);
    const review_kind = !manual && (structural || (!nameLike && (item.review_kind === "structure" || complexReview)))
      ? "structure" : "pronunciation";
    // A vocabulary/glossary entry is not useful when it leaves speech unchanged.
    // Preserve case changes (NO -> no) and review-only structural findings.
    if (action === "dictionary" && term.replace(/\s+/g, " ") === spoken.replace(/\s+/g, " ")) {
      discard("unchanged replacement"); continue;
    }
    if (seen.has(term)) { discard("duplicate term"); continue; }
    seen.add(term);
    if (evidence !== proposedEvidence) repairedExcerpts++;
    const confirmation = "Possible lost exponent formatting: confirm the raised digits in the original source before choosing a reading.";
    const originalReason = item.reason.trim();
    const reason = lostFormatting && !originalReason.includes(confirmation)
      ? originalReason.slice(0, 999 - confirmation.length) + " " + confirmation : originalReason;
    suggestions.push({ term, spoken, evidence, reason, action, review_kind,
      ignore_case: ["Yes", "No"].includes(item.ignore_case) ? item.ignore_case : defaultIgnoreCase(term),
      conflicts: typeof item.conflicts === "string" ? item.conflicts.trim().slice(0, 600) : "",
      pronunciationWarning: spokenWordingIssue(spoken) });
  }
  return { suggestions, discarded, discardedReasons, repairedExcerpts };
}

export function suggestionRow(suggestion, spoken = suggestion.spoken) {
  return { text: suggestion.term, substitution: spoken.trim(), ignore_case: "No", app: "All Apps",
    note: `AI suggestion; instructor review required. ${suggestion.reason}` };
}

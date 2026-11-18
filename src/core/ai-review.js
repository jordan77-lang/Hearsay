import { cleanHistoryRows } from "../dictionary-history.js";
import { canEditAiPronunciation } from "./ai-dictionary.js";

export const sameDictionaryRows = (a, b) => JSON.stringify(cleanHistoryRows(a)) === JSON.stringify(cleanHistoryRows(b));

// Only relevant pronunciation fields are sent to ASU, never author notes or keys.
export function existingPronunciationsForPassage(rows, source) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => typeof row?.text === "string" && typeof row.substitution === "string" &&
    row.text.trim() && row.text.length <= 160 && row.substitution.trim() && row.substitution.length <= 300 &&
    (row.ignore_case === "No" ? source.includes(row.text) : source.toLowerCase().includes(row.text.toLowerCase())))
    .sort((a, b) => b.text.length - a.text.length).slice(0, 80)
    .map(row => ({ text: row.text, substitution: row.substitution, ignore_case: row.ignore_case === "No" ? "No" : "Yes" }));
}

export function prepareAiReviewItem(item, existingRows, suggestAlternatives = false) {
  const saved = existingRows.filter(row => row.text === item.term);
  const useSaved = !suggestAlternatives && saved.length === 1 && canEditAiPronunciation(item);
  return { ...item,
    spoken: useSaved ? saved[0].substitution : item.pronunciationWarning ? "" : item.spoken,
    ignoreCase: saved.length === 1 ? saved[0].ignore_case || "Yes" : item.ignore_case === "Yes" ? "Yes" : "No",
    reason: useSaved ? "Your class already has a pronunciation for this term. The saved reading is kept." : item.reason,
    decision: "pending", replaceExisting: false };
}

export function proposalKind(row, existing) {
  const matches = existing.filter(other => other.text === row.text);
  if (!matches.length) return "new";
  return matches.length === 1 && matches[0].substitution === row.substitution &&
    (matches[0].ignore_case || "Yes") === row.ignore_case ? "covered" : "update";
}

export function mergeApprovedRows(existing, approved) {
  const terms = new Set();
  for (const { row, replaceExisting } of approved) {
    if (terms.has(row.text)) throw new Error("Review duplicate approved terms before saving.");
    terms.add(row.text);
    if (proposalKind(row, existing) === "update" && !replaceExisting) throw new Error(`Confirm replacement of the existing pronunciation for ${row.text}.`);
  }
  return [...approved.map(item => item.row), ...existing.filter(row => !terms.has(row.text))];
}

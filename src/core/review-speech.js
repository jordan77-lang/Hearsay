import { defaultSrVisibleSegments, setDefaultSrProfile } from "./default-sr-speech.js";
import { segmentByDictionary, rulesWithPreview } from "./dictionary.js";

/**
 * reviewSpeech plus a map from spoken offsets back to the source, for
 * highlighting each word in the original text while it is read aloud.
 * `spoken` is identical to reviewSpeech(...).spoken. locate(i) returns the
 * source range { start, end } to highlight for spoken offset i: the exact word
 * inside unchanged text, or the whole symbol/entry when the reading differs.
 */
export function reviewSpeechWithMap(source, options = {}) {
  const { pieces } = reviewSpeech(source, options);
  // Join exactly as reviewSpeech does, remembering where each piece lands.
  let raw = "", wasChanged = false;
  const spans = [];
  for (const piece of pieces) {
    const changed = piece.kind !== "plain";
    if (raw && (changed || wasChanged) && !/\s$/.test(raw) && !/^\s/.test(piece.spoken)) raw += " ";
    spans.push({ rawStart: raw.length, rawEnd: raw.length + piece.spoken.length, piece });
    raw += piece.spoken; wasChanged = changed;
  }
  // Collapse whitespace and trim (as reviewSpeech does), tracking raw -> spoken offsets.
  const map = new Int32Array(raw.length + 1);
  let spoken = "";
  for (let i = 0; i < raw.length; i++) {
    if (/\s/.test(raw[i])) { if (spoken && !spoken.endsWith(" ")) spoken += " "; map[i] = Math.max(0, spoken.length - 1); }
    else { spoken += raw[i]; map[i] = spoken.length - 1; }
  }
  if (spoken.endsWith(" ")) spoken = spoken.slice(0, -1);
  map[raw.length] = spoken.length;
  const from = spans.map(span => span.rawStart < raw.length ? map[span.rawStart] : spoken.length);
  // Where each piece lands in the spoken text, for colour-coding what changed:
  // "symbol" = default screen reader reads it differently, "course" = class entry.
  const segments = spans.map(({ rawStart, rawEnd, piece }, i) => ({ from: from[i], to: rawEnd > rawStart ? Math.min(spoken.length, map[rawEnd - 1] + 1) : from[i], kind: piece.kind }))
    .filter(segment => segment.to > segment.from && segment.kind !== "plain");
  const text = String(source ?? "");
  function locate(index) {
    if (!spans.length) return null;
    let lo = 0, hi = spans.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (from[mid] <= index) lo = mid; else hi = mid - 1; }
    // Skip zero-length pieces that share an offset with the next one.
    while (lo < spans.length - 1 && spans[lo].rawEnd === spans[lo].rawStart) lo++;
    const { rawStart, rawEnd, piece } = spans[lo];
    if (piece.kind !== "plain" || piece.spoken !== piece.raw) {
      let start = piece.start, end = piece.end;
      while (start < end && /\s/.test(text[start])) start++;
      while (end > start && /\s/.test(text[end - 1])) end--;
      return { start, end };
    }
    // Unchanged text: find the raw character for this spoken offset, then its word.
    let a = rawStart, b = rawEnd - 1;
    while (a < b) { const mid = (a + b) >> 1; if (map[mid] < index) a = mid + 1; else b = mid; }
    let start = piece.start + (a - rawStart);
    while (start < piece.end && /\s/.test(text[start])) start++;
    let end = start;
    while (end < piece.end && !/\s/.test(text[end])) end++;
    return end > start ? { start, end } : { start: piece.start, end: piece.end };
  }
  return { spoken, locate, segments, pieces };
}

/** A single speech model supplies both visible preview and audio. No source repair. */
export function reviewSpeech(source, { revised = false, preview = null } = {}) {
  setDefaultSrProfile("jaws");
  const text = String(source ?? "");
  const pieces = [];
  const baseline = (raw, offset) => {
    let at = offset;
    for (const segment of defaultSrVisibleSegments(raw)) {
      pieces.push({ raw: segment.display, spoken: segment.spoken, kind: segment.changed ? "symbol" : "plain", start: at, end: at + segment.display.length });
      at += segment.display.length;
    }
  };
  // Preview uses the same non-cascading span matcher as saved class rules.
  const segments = revised ? segmentByDictionary(text, preview ? rulesWithPreview({ ...preview, substitution: preview.spoken ?? preview.substitution }) : undefined) : [{ text, spoken: null }];
  let offset = 0;
  for (const segment of segments) {
    if (segment.spoken != null) pieces.push({ raw: segment.text, spoken: segment.spoken, kind: "course", start: offset, end: offset + segment.text.length });
    else baseline(segment.text, offset);
    offset += segment.text.length;
  }
  let spoken = "", wasChanged = false;
  for (const piece of pieces) {
    const changed = piece.kind !== "plain";
    if (spoken && (changed || wasChanged) && !/\s$/.test(spoken) && !/^\s/.test(piece.spoken)) spoken += " ";
    spoken += piece.spoken;
    wasChanged = changed;
  }
  return { source: text, spoken: spoken.replace(/\s+/g, " ").trim(), pieces };
}

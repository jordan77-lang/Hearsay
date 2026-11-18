// Browser-local review work. Original text is never normalized or repaired.
export const REVIEW_SESSION_KEY = "hearsay-review-v1";

export function newReviewSession(courseId = "demo") {
  return { version: 1, passage: "", sources: [], courseId, sentence: 0, mode: "focus", drafts: {}, queue: [], scroll: {} };
}

export function loadReviewSession(storage, scope = "local") {
  try {
    const saved = JSON.parse(storage?.getItem(`${REVIEW_SESSION_KEY}:${scope}`) ?? "null");
    if (saved?.version !== 1 || typeof saved.passage !== "string") return newReviewSession();
    return { ...newReviewSession(), ...saved, sources: Array.isArray(saved.sources) ? saved.sources : [],
      drafts: saved.drafts && typeof saved.drafts === "object" ? saved.drafts : {},
      queue: Array.isArray(saved.queue) ? saved.queue : [], scroll: saved.scroll ?? {} };
  } catch { return newReviewSession(); }
}

export function saveReviewSession(storage, state, scope = "local") {
  try { storage.setItem(`${REVIEW_SESSION_KEY}:${scope}`, JSON.stringify(state)); return true; }
  catch { return false; }
}

/** Offsets always refer to the untouched source, including decimals and line breaks. */
export function splitReviewPassages(text) {
  const input = String(text ?? "");
  const out = [];
  const add = (piece, offset) => {
    const leading = piece.length - piece.trimStart().length;
    const value = piece.trim();
    if (value) out.push({ text: value, start: offset + leading, end: offset + leading + value.length });
  };
  let lineStart = 0;
  for (const line of input.split(/\n/)) {
    if (typeof Intl.Segmenter === "function") {
      for (const part of new Intl.Segmenter("en", { granularity: "sentence" }).segment(line)) add(part.segment, lineStart + part.index);
    } else {
      const matcher = /.+?(?:[.!?](?=\s+[A-Z]|$)|$)/g;
      for (const match of line.matchAll(matcher)) add(match[0], lineStart + match.index);
    }
    lineStart += line.length + 1;
  }
  return out;
}

export function capturePassage(state, capture, mode = "replace") {
  const separator = state.passage && mode === "append" ? "\n\n" : "";
  const start = mode === "append" ? state.passage.length + separator.length : 0;
  return { ...state,
    passage: mode === "append" ? state.passage + separator + capture.text : capture.text,
    sentence: mode === "append" ? state.sentence : 0,
    sources: [...(mode === "append" ? state.sources : []), { url: capture.tabUrl ?? "", title: capture.tabTitle ?? "",
      kind: capture.source ?? "paste", truncated: Boolean(capture.truncated), totalLength: capture.totalLength ?? capture.text.length,
      capturedLength: capture.text.length, start, end: start + capture.text.length }],
    queue: mode === "append" ? state.queue : [],
    drafts: mode === "append" ? state.drafts : {},
  };
}

export function markReviewItem(state, { pattern, start = -1, end = -1, status = "needs-attention", spoken = "" }) {
  const existing = state.queue.findIndex(item => item.courseId === state.courseId && item.pattern === pattern && item.start === start);
  const entry = { pattern, start, end, status, spoken, courseId: state.courseId };
  const queue = [...state.queue];
  if (existing < 0) queue.push(entry); else queue[existing] = entry;
  return { ...state, queue };
}

/** Suggestions are opt-in draft pronunciations; they never rewrite source text. */
export function reviewRepairs(text) {
  return [...String(text).matchAll(/(\d+\s+[^\d\n]+?)(?<=[A-Za-z])(\d+\s+[^\d\n]+)/g)]
    .map(m => ({ pattern: m[0], spoken: `${m[1].trim()} divided by ${m[2].trim()}`, start: m.index, end: m.index + m[0].length,
      label: "Possible flattened fraction — review" }));
}

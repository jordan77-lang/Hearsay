import test from "node:test";
import assert from "node:assert/strict";
import { newReviewSession, splitReviewPassages, capturePassage, markReviewItem, reviewRepairs, loadReviewSession, saveReviewSession } from "../src/core/review-session.js";
import { reviewSpeech } from "../src/core/review-speech.js";
import { loadBareClassDictionary, loadEditorPreviewDictionary } from "../src/core/dictionary.js";
import { dictionaryHistory, rememberDictionaryChange, undoDictionaryChange } from "../src/dictionary-history.js";

const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };
test("sentence review keeps exact offsets, notation and decimal numbers", () => {
  const text = "  Heat to 25.5 C. Calculate T2 - T1.\nRead pages 3-5.";
  const passages = splitReviewPassages(text);
  assert.equal(passages.length, 3);
  for (const passage of passages) assert.equal(text.slice(passage.start, passage.end), passage.text);
  assert.equal(passages[0].text, "Heat to 25.5 C.");
  assert.equal(passages[1].text, "Calculate T2 - T1.");
});
test("baseline leaves source notation unchanged and shares display/audio pieces", () => {
  loadBareClassDictionary();
  for (const source of ["T2", "pages 3-5", "box - label", "29 dogs30 rats", "H₂O", "3.5 mL"]) {
    const result = reviewSpeech(source);
    assert.equal(result.source, source);
    assert.equal(result.pieces.map(piece => piece.raw).join(""), source);
  }
  assert.equal(reviewSpeech("T2").spoken, "T2");
  assert.equal(reviewSpeech("pages 3-5").spoken, "pages 3 dash 5");
  assert.equal(reviewSpeech("29 dogs30 rats").spoken, "29 dogs30 rats");
});
test("unsaved ordinary-word pronunciation works in sentence without mutating saved rules", () => {
  loadEditorPreviewDictionary("NaCl\tsodium chloride\t1\t2");
  const source = "Add NaCl with the nozzle.";
  const result = reviewSpeech(source, { revised: true, preview: { pattern: "nozzle", spoken: "noz ull", ignore_case: "Yes" } });
  assert.match(result.spoken, /sodium chloride with the noz ull/);
  assert.doesNotMatch(reviewSpeech(source).spoken, /sodium chloride|noz ull/);
  assert.match(reviewSpeech(source, { revised: true }).spoken, /the nozzle/);
});
test("project-scoped session survives reopen with draft, course, sentence, source and scroll", () => {
  const storage = memory(); const state = { ...newReviewSession("chem113"), passage: "T2. Next sentence.", sentence: 1,
    sources: [{ url: "https://example.edu/course", kind: "selection" }], drafts: { chem113: { pattern: "T2", spoken: "T two" } }, scroll: { page: 321 } };
  assert.ok(saveReviewSession(storage, state, "project-a"));
  assert.deepEqual(loadReviewSession(storage, "project-a"), state);
  assert.equal(loadReviewSession(storage, "project-b").passage, "");
});
test("capture replace clears old review anchors; append preserves position and records truncation", () => {
  const old = { ...newReviewSession("chem113"), passage: "First sentence.", sentence: 0, queue: [{ pattern: "First" }], drafts: { chem113: { pattern: "First" } } };
  const capture = { text: "Second sentence.", source: "selection", tabUrl: "https://example.edu", truncated: true, totalLength: 13000 };
  const appended = capturePassage(old, capture, "append");
  assert.equal(appended.passage, "First sentence.\n\nSecond sentence.");
  assert.deepEqual(appended.drafts, old.drafts); assert.equal(appended.sources[0].truncated, true);
  const replaced = capturePassage(old, capture);
  assert.equal(replaced.passage, capture.text); assert.deepEqual(replaced.queue, []); assert.deepEqual(replaced.drafts, {});
});
test("repairs are suggestions and review status is isolated by course", () => {
  const state = { ...newReviewSession("a"), passage: "29 dogs30 rats" };
  assert.match(reviewRepairs(state.passage)[0].spoken, /divided by/);
  assert.equal(state.passage, "29 dogs30 rats");
  const first = markReviewItem(state, { pattern: "dogs", status: "needs-attention" });
  const second = markReviewItem({ ...first, courseId: "b" }, { pattern: "dogs", status: "reviewed" });
  assert.equal(second.queue.length, 2);
  assert.equal(second.queue[0].status, "needs-attention");
});
test("undo restores saved dictionary, survives reopen, and refuses intervening edits", async () => {
  const storage = memory(); const before = [{ text: "nozzle", substitution: "noz ull" }], after = [{ text: "nozzle", substitution: "nozzle" }];
  rememberDictionaryChange(storage, "project", "chem113", before, after, "nozzle");
  let current = after; const api = { fetchEntryRecords: async () => current, saveEntryRecords: async (_course, rows) => { current = rows; } };
  await undoDictionaryChange(api, storage, "project", "chem113");
  assert.equal(current[0].substitution, "noz ull"); assert.equal(dictionaryHistory(storage, "project", "chem113").length, 0);
  rememberDictionaryChange(storage, "project", "chem113", before, after);
  current = [...after, { text: "new", substitution: "another author's edit" }];
  await assert.rejects(undoDictionaryChange(api, storage, "project", "chem113"), /changed since/);
  assert.equal(current.length, 2);
});
test("storage failures do not throw away the live session", () => {
  const storage = { getItem() { throw Error("blocked"); }, setItem() { throw Error("full"); } };
  const state = newReviewSession(); state.passage = "Still here";
  assert.equal(saveReviewSession(storage, state), false); assert.equal(state.passage, "Still here");
  assert.equal(loadReviewSession(storage).version, 1);
});

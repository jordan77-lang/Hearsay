import test from "node:test";
import assert from "node:assert/strict";
import { findRuleConflicts } from "../src/core/rule-conflicts.js";
import { existingPronunciationsForPassage, prepareAiReviewItem } from "../src/core/ai-review.js";
import { validateAiSuggestions } from "../src/core/ai-dictionary.js";
import { analyzeDictionaryText } from "../tools/createai-api.mjs";

const saved = (text, substitution, ignore_case = "No") => ({ text, substitution, ignore_case });
const kinds = found => found.map(item => item.kind);

test("a case-insensitive entry that would also change a saved entry in another case is caught, with a fix", () => {
  const found = findRuleConflicts({ text: "m", substitution: "meters", ignore_case: "Yes" }, [saved("M", "molar")]);
  const twin = found.find(item => item.kind === "case-twin");
  assert.ok(twin, "case clash against the actual class dictionary");
  assert.match(twin.message, /would also change the saved "M" \(read "molar"\)/);
  assert.deepEqual(twin.fix, { label: "Match exact case only", ignoreCase: "No" });
  // Resolved: both entries match exact case, so each keeps its own reading.
  assert.ok(!kinds(findRuleConflicts({ text: "m", substitution: "meters", ignore_case: "No" }, [saved("M", "molar")])).includes("case-twin"));
  // The same reading in both cases is not a clash.
  assert.ok(!kinds(findRuleConflicts({ text: "ml", substitution: "milliliters", ignore_case: "Yes" }, [saved("mL", "milliliters")])).includes("case-twin"));
});

test("a saved entry that ignores case is pointed out, and single letters are flagged", () => {
  const found = findRuleConflicts({ text: "m", substitution: "meters", ignore_case: "No" }, [saved("M", "molar", "Yes")]);
  assert.match(found.find(item => item.kind === "case-twin-saved").message, /saved "M" \(read "molar"\) ignores case/);
  const letter = findRuleConflicts({ text: "c", substitution: "speed of light", ignore_case: "Yes" }, []);
  assert.ok(kinds(letter).includes("single-letter"));
  assert.deepEqual(letter.find(item => item.kind === "single-letter").fix, { label: "Match exact case only", ignoreCase: "No" });
});

test("the AI is shown saved entries that could clash, even when they are not in the passage", () => {
  const rows = [saved("M", "molar"), saved("L", "liters"), saved("mol/L", "moles per liter"), saved("lysozyme", "lye suh zime", "Yes")];
  const sent = existingPronunciationsForPassage(rows, "Measure 5 m of tubing and add HCl.").map(row => row.text);
  assert.ok(sent.includes("M"), "M is sent because a standalone m appears");
  assert.ok(sent.includes("L"), "short entries are always sent: a reading of H C L would become H C liters");
  assert.ok(!sent.includes("mol/L") && !sent.includes("lysozyme"), "unrelated longer entries are not sent");
  // A longer entry is sent for a different-case match only when it stands alone, not inside another word.
  assert.ok(!existingPronunciationsForPassage([saved("NaOH", "sodium hydroxide")], "Record the naohx reading.").length);
  assert.equal(existingPronunciationsForPassage([saved("NaOH", "sodium hydroxide")], "Add naoh slowly.").length, 1);
});

test("case clashes are resolved up front: a case twin or single letter starts as exact case", () => {
  const twin = prepareAiReviewItem({ term: "m", spoken: "meters", ignore_case: "Yes", action: "dictionary", review_kind: "pronunciation" }, [saved("M", "molar")]);
  assert.equal(twin.ignoreCase, "No");
  const letter = prepareAiReviewItem({ term: "q", spoken: "heat", ignore_case: "Yes", action: "dictionary", review_kind: "pronunciation" }, []);
  assert.equal(letter.ignoreCase, "No");
  const word = prepareAiReviewItem({ term: "lysozyme", spoken: "lye suh zime", ignore_case: "Yes", action: "dictionary", review_kind: "pronunciation" }, []);
  assert.equal(word.ignoreCase, "Yes", "ordinary words keep the AI's proposal");
});

test("the AI reports its own conflict check for every suggestion, and reasons rather than follows a list", async () => {
  const text = "Add 5 m of tubing.";
  const [item] = validateAiSuggestions({ suggestions: [{ term: "m", spoken: "meters", evidence: text, reason: "Unit.", action: "dictionary", review_kind: "pronunciation", ignore_case: "No", conflicts: "M is molar in this class; matching exact case keeps both." }] }, text).suggestions;
  assert.equal(item.conflicts, "M is molar in this class; matching exact case keeps both.");
  let body;
  await analyzeDictionaryText(text, {
    exampleLoader: async () => ({ version: 1, documents: [] }),
    configLoader: async () => ({ token: "t", origin: "https://api-main.aiml.asu.edu", model: "defaults" }),
    fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ suggestions: [] }) } }] }); },
  });
  const schema = body.response_format.json_schema.schema.properties.suggestions.items;
  assert.ok(schema.required.includes("conflicts"));
  const system = body.messages.filter(message => message.role === "system").map(message => message.content).join(" ");
  assert.match(system, /decide, do not look things up/);
  assert.match(system, /not a complete list/);
});

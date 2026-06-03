import { test } from "node:test";
import assert from "node:assert/strict";

import { filterRowIndices, parseSearchTerms, rowMatchesSearch } from "../src/dictionary-search.js";

const rows = [
  { text: "ΔT", substitution: "delta T", note: "temperature change" },
  { text: "mL", substitution: "milliliters", note: "volume" },
  { text: "q_calorimeter", substitution: "q of calorimeter", note: "" },
];

test("parseSearchTerms splits on whitespace", () => {
  assert.deepEqual(parseSearchTerms("  delta   T  "), ["delta", "t"]);
});

test("rowMatchesSearch requires all terms (AND)", () => {
  const terms = parseSearchTerms("delta t");
  assert.equal(rowMatchesSearch(rows[0], terms, "all"), true);
  assert.equal(rowMatchesSearch(rows[1], terms, "all"), false);
});

test("filterRowIndices respects field scope", () => {
  assert.deepEqual(filterRowIndices(rows, "milli", "spoken"), [1]);
  assert.deepEqual(filterRowIndices(rows, "calorimeter", "pattern"), [2]);
  assert.deepEqual(filterRowIndices(rows, "volume", "note"), [1]);
});

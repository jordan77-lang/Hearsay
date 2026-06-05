import { test } from "node:test";
import assert from "node:assert/strict";

import {
  findFractionCandidatesInText,
  detectFlattenedFraction,
  inspectPulledText,
} from "../src/core/fraction-detect.js";

test("findFractionCandidatesInText finds glued fraction after normalize", () => {
  const candidates = findFractionCandidatesInText("29 dogs30 rats");
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].kind, "glued");
  assert.equal(candidates[0].numerator, "29 dogs");
  assert.equal(candidates[0].denominator, "30 rats");
  assert.equal(candidates[0].latex, "\\frac{29 dogs}{30 rats}");
  assert.match(candidates[0].spoken, /divided by/i);
});

test("findFractionCandidatesInText finds repaired divided-by fraction", () => {
  const candidates = findFractionCandidatesInText("29 dogs divided by 30 rats");
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].kind, "repaired");
});

test("findFractionCandidatesInText finds LaTeX fraction", () => {
  const candidates = findFractionCandidatesInText(String.raw`q = \frac{14J}{23g}`);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].kind, "latex");
});

test("detectFlattenedFraction works without Google Docs clipboard on pull", () => {
  assert.deepEqual(detectFlattenedFraction({ preRepair: "29 dogs30 rats" }), { kind: "glued" });
  assert.deepEqual(detectFlattenedFraction({ normalized: "29 dogs divided by 30 rats" }), {
    kind: "repaired",
  });
  assert.equal(detectFlattenedFraction({ normalized: String.raw`\frac{1}{2}` }), null);
});

test("inspectPulledText normalizes and detects fractions from page scrape", () => {
  const result = inspectPulledText("29 dogs30 rats");
  assert.equal(result.normalized, "29 dogs divided by 30 rats");
  assert.ok(result.flattenedEquation);
  assert.equal(result.fractions.length, 1);
});

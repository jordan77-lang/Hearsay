import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatFractionLatex,
  sanitizeFracPart,
  parseSlashFraction,
} from "../src/fraction-builder.js";

test("formatFractionLatex builds LaTeX frac syntax", () => {
  assert.equal(formatFractionLatex("14J", "23g"), "\\frac{14J}{23g}");
  assert.equal(formatFractionLatex(" 286 kJ ", " mol "), "\\frac{286 kJ}{mol}");
});

test("formatFractionLatex rejects empty parts", () => {
  assert.equal(formatFractionLatex("", "23g"), "");
  assert.equal(formatFractionLatex("14J", ""), "");
});

test("sanitizeFracPart strips braces", () => {
  assert.equal(sanitizeFracPart("{14J}"), "14J");
});

test("parseSlashFraction splits pasted slash notation", () => {
  assert.deepEqual(parseSlashFraction("14J/23g"), { numerator: "14J", denominator: "23g" });
  assert.deepEqual(parseSlashFraction("286 kJ / mol"), {
    numerator: "286 kJ",
    denominator: "mol",
  });
  assert.equal(parseSlashFraction("no slash here"), null);
});

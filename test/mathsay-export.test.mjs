import test from "node:test";
import assert from "node:assert/strict";

import {
  isWordHeavyFraction,
  suggestStrategy,
  buildMathsayExport,
  latexToVisual,
  extractFraction,
  analyzeMathsayEquation,
} from "../src/core/mathsay-export.js";
import { loadDictionary } from "../src/core/dictionary.js";

test("isWordHeavyFraction detects prose denominators", () => {
  assert.equal(isWordHeavyFraction("200 g", "mass of H2O2 in solution"), true);
  assert.equal(isWordHeavyFraction("14 J", "23 g"), false);
});

test("suggestStrategy picks dual notation for word fractions in quizzes", () => {
  assert.equal(
    suggestStrategy("quiz", "\\frac{200 g}{mass of H2O2 in solution}"),
    "dual-notation",
  );
  assert.equal(suggestStrategy("quiz", "\\frac{14 J}{23 g}"), "mathml-stacked");
});

test("buildMathsayExport quiz dual notation includes spoken gloss", () => {
  const out = buildMathsayExport("\\frac{200 g}{mass of H2O2 in solution}", {
    destination: "quiz",
    strategy: "dual-notation",
  });
  assert.match(out.html, /200 g \/ mass of H2O2 in solution/);
  assert.match(out.html, /\(/);
  assert.match(out.html, /divided by/i);
  assert.doesNotMatch(out.html, /<mfrac>/);
});

test("buildMathsayExport quiz mathml-stacked emits mfrac", () => {
  const out = buildMathsayExport("\\frac{14 J}{23 g}", {
    destination: "quiz",
    strategy: "mathml-stacked",
  });
  assert.match(out.html, /<mfrac>/);
  assert.match(out.warnings.length > 0 ? out.warnings[0].text : "", /MathCAT|math engine/i);
});

test("buildMathsayExport word fraction warns on stacked MathML", () => {
  const out = buildMathsayExport("\\frac{200 g}{mass of H2O2 in solution}", {
    destination: "quiz",
    strategy: "mathml-stacked",
  });
  assert.ok(out.warnings.some((w) => w.level === "warn" && /over/i.test(w.text)));
});

test("buildMathsayExport accessible text is plain words", () => {
  const out = buildMathsayExport("\\frac{14 J}{23 g}", {
    destination: "quiz",
    strategy: "accessible-text",
  });
  assert.doesNotMatch(out.html, /<math/);
  assert.match(out.spoken, /divided by/i);
});

test("buildMathsayExport page-spoken uses aria-label", () => {
  const out = buildMathsayExport("T_2 = T_1 + \\Delta T", {
    destination: "page",
    strategy: "page-spoken",
  });
  assert.match(out.html, /aria-label=/);
  assert.match(out.html, /aria-hidden="true"/);
});

test("analyzeMathsayEquation parses word fraction as equation not prose", () => {
  const r = analyzeMathsayEquation("q = \\frac{200 g}{mass of H2O2 in solution}");
  assert.match(r.mathml, /<mfrac>/);
});

test("latexToVisual formats fractions with slash", () => {
  assert.equal(latexToVisual("\\frac{14 J}{23 g}"), "14 J / 23 g");
});

test("extractFraction parses frac args", () => {
  const f = extractFraction("\\frac{200 g}{mass of H2O2 in solution}");
  assert.equal(f.numerator, "200 g");
  assert.match(f.denominator, /mass of H2O2/i);
});

test("buildMathsayExport applies dictionary to spoken fraction", () => {
  loadDictionary(
    "14 jools divided by 23 grams\t14 jools divided by 23 grams\t0\t0\n",
    "test-mathsay",
  );
  const out = buildMathsayExport("\\frac{14J}{23g}", {
    destination: "quiz",
    strategy: "accessible-text",
  });
  assert.match(out.spoken, /jools/);
  assert.match(out.spoken, /grams/);
});

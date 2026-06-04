import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizePastedContent,
  detectFlattenedGdocsEquation,
  isGoogleDocsPaste,
} from "../src/core/paste-normalize.js";
import { findTokens } from "../src/core/detect.js";
import { analyze, toDictionarySpeech } from "../src/core/transform.js";
import { loadDictionary } from "../src/core/dictionary.js";
import { DICTIONARY_DIC } from "../src/core/dictionary-data.js";

test("normalizePastedContent converts plain T2 and glued chem variables", () => {
  const input = "ΔT = T2 −T1\nqcalorimeter = Ccalorimeter × ΔT\nqsolution = msolution × csolution × ΔT";
  const out = normalizePastedContent(input);
  assert.match(out, /T₂/);
  assert.match(out, /T₁/);
  assert.match(out, /q_\{calorimeter\}/);
  assert.match(out, /C_\{calorimeter\}/);
  assert.doesNotMatch(out, /T_\{2\}/);
  assert.match(out, /q_\{solution\}/);
  assert.match(out, /m_\{solution\}/);
  assert.match(out, /c_\{solution\}/);
  assert.match(out, / − /);
  assert.match(out, / × /);
});

test("normalizePastedContent converts HTML sub and sup tags", () => {
  const html = "<p>q<sub>solution</sub> = m<sub>solution</sub> × c<sup>2</sup></p>";
  const out = normalizePastedContent(html);
  assert.match(out, /q_\{solution\}/);
  assert.match(out, /m_\{solution\}/);
  assert.match(out, /c\^\{2\}/);
});

test("normalizePastedContent keeps spreadsheet cell refs like B5 plain", () => {
  const html = "<p>Place sample in cell B<sub>5</sub></p>";
  const out = normalizePastedContent(html);
  assert.equal(out, "Place sample in cell B5");
  assert.doesNotMatch(out, /B_\{5\}/);
  assert.doesNotMatch(out, /B₅/);
});

test("normalizePastedContent still marks chem word subscripts from HTML", () => {
  const html = "<p>q<sub>solution</sub> in well B<sub>5</sub></p>";
  const out = normalizePastedContent(html);
  assert.match(out, /q_\{solution\}/);
  assert.match(out, /B5/);
  assert.doesNotMatch(out, /B_\{5\}/);
});

test("normalizePastedContent converts T sub 2 from HTML to unicode subscript", () => {
  const out = normalizePastedContent("ΔT = T<sub>2</sub> − T<sub>1</sub>");
  assert.match(out, /T₂/);
  assert.match(out, /T₁/);
});

test("normalizePastedContent trims leading spaces and invisible chars from HTML", () => {
  assert.equal(
    normalizePastedContent("<p>&nbsp;&nbsp;Record the value</p>"),
    "Record the value",
  );
  assert.equal(
    normalizePastedContent("<p> </p><p>Record the value</p>"),
    "Record the value",
  );
  assert.equal(normalizePastedContent("   Record the value"), "Record the value");
  assert.equal(
    normalizePastedContent("\u200B\u200BRecord the value"),
    "Record the value",
  );
});

test("normalizePastedContent splits glued DIwater", () => {
  assert.equal(normalizePastedContent("Rinse with DIwater."), "Rinse with DI water.");
  assert.equal(normalizePastedContent("DI-water rinse"), "DI water rinse");
});

const GDOCS_FRAC_HTML =
  '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-afff6b2f-7fff-541d-1bd5-7609f89abed7">' +
  '<span style="vertical-align:baseline;white-space:pre-wrap;">29 dogs</span>' +
  '<span style="vertical-align:baseline;white-space:pre-wrap;">30 rats</span></b>';

test("detectFlattenedGdocsEquation flags glued Google Docs fraction paste", () => {
  const normalized = normalizePastedContent(GDOCS_FRAC_HTML, { skipGluedFractionRepair: true });
  assert.equal(normalized, "29 dogs30 rats");
  assert.ok(isGoogleDocsPaste({ html: GDOCS_FRAC_HTML }));
  assert.deepEqual(detectFlattenedGdocsEquation({ html: GDOCS_FRAC_HTML, normalized }), {
    kind: "glued-spans",
  });
});

test("normalizePastedContent repairs glued Google Docs fraction paste", () => {
  assert.equal(normalizePastedContent(GDOCS_FRAC_HTML), "29 dogs divided by 30 rats");
});

test("dictionary speaks repaired glued Google Docs fraction", () => {
  loadDictionary(DICTIONARY_DIC);
  const spoken = toDictionarySpeech("29 dogs30 rats", findTokens);
  assert.match(spoken, /29 dogs divided by 30 rats/i);
});

test("detectFlattenedGdocsEquation ignores Google Docs prose paste", () => {
  const html =
    '<b id="docs-internal-guid-abc"><span>Heat 10 mL of DI water from 25°C to 30°C.</span></b>';
  const normalized = normalizePastedContent(html);
  assert.equal(detectFlattenedGdocsEquation({ html, normalized }), null);
});

test("detectFlattenedGdocsEquation ignores paste that already has LaTeX fraction", () => {
  const html = '<b id="docs-internal-guid-abc"><span>\\frac{29 dogs}{30 rats}</span></b>';
  const normalized = normalizePastedContent(html);
  assert.equal(detectFlattenedGdocsEquation({ html, normalized }), null);
});

test("analyze applies paste normalization and finds described variables", () => {
  loadDictionary(DICTIONARY_DIC);
  const input = "qcalorimeter = Ccalorimeter × ΔT";
  const { findings, normalizedText } = analyze(input, findTokens);
  assert.match(normalizedText, /q_\{calorimeter\}/);
  assert.ok(findings.some((f) => f.type === "described-var" && f.raw.includes("calorimeter")));
});

test("dictionary speech reads normalized pasted calorimetry block", () => {
  loadDictionary(DICTIONARY_DIC);
  const input = [
    "ΔT = T2 −T1",
    "qcalorimeter = Ccalorimeter × ΔT",
    "qsolution = msolution × csolution × ΔT",
  ].join("\n");
  const spoken = toDictionarySpeech(input, findTokens);
  assert.match(spoken, /T of 2/i);
  assert.match(spoken, /calorimeter/i);
  assert.match(spoken, /solution/i);
});

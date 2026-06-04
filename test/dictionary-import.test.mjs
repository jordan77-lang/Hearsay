import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseImportText,
  normalizeImportRows,
  mergeImportRows,
  buildImportTemplateCsv,
  buildImportTemplateTsv,
  parseImportFile,
} from "../src/dictionary-import.js";

test("parseImportText maps Pattern and Spoken headers", () => {
  const csv = "Pattern,Spoken,Note\nΔT,delta T,heat\n";
  const raw = parseImportText(csv, "csv");
  const rows = normalizeImportRows(raw);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, "ΔT");
  assert.equal(rows[0].substitution, "delta T");
  assert.equal(rows[0].note, "heat");
});

test("parseImportText accepts legacy Text and Substitution columns", () => {
  const tsv = "Text\tSubstitution\nmL\tmilliliters\n";
  const raw = parseImportText(tsv, "tsv");
  const rows = normalizeImportRows(raw);
  assert.equal(rows[0].text, "mL");
  assert.equal(rows[0].substitution, "milliliters");
});

test("import template CSV parses with Pattern and Spoken headers", () => {
  const raw = parseImportText(buildImportTemplateCsv(), "csv");
  const rows = normalizeImportRows(raw);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].note, "temperature change");
  assert.equal(rows[0].ignore_case, "Yes");
});

test("parseImportFile rejects non-CSV files", async () => {
  const tsvFile = { name: "terms.tsv" };
  await assert.rejects(parseImportFile(tsvFile), /\.csv files from the ChatGPT Dictionary project/);
});

test("import template TSV still parses when read as TSV text (legacy)", () => {
  const rows = normalizeImportRows(parseImportText(buildImportTemplateTsv(), "tsv"));
  assert.equal(rows.length, 2);
});

test("mergeImportRows keeps existing and overrides by pattern", () => {
  const merged = mergeImportRows(
    [
      { text: "mL", substitution: "old", ignore_case: "Yes" },
      { text: "NO", substitution: "nitric oxide", ignore_case: "No" },
    ],
    [{ text: "mL", substitution: "milliliters", ignore_case: "Yes" }],
  );
  assert.equal(merged.length, 2);
  assert.equal(merged.find((r) => r.text === "mL").substitution, "milliliters");
  assert.equal(merged.find((r) => r.text === "NO").substitution, "nitric oxide");
});

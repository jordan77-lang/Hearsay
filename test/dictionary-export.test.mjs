import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildNvdaDic,
  buildJawsTsv,
  buildAppleCsv,
  buildExportNvdaDic,
  bundledExportRowCount,
  bundledRegexEntries,
  jawsExportPattern,
  resolveExportRegexEntries,
} from "../src/dictionary-export.js";

const sample = [
  { text: "mL", substitution: "milliliters", ignore_case: "Yes", note: "volume" },
  { text: "ΔT", substitution: "delta T", ignore_case: "No", note: "" },
];

test("buildNvdaDic emits tab-separated dictionary lines", () => {
  const out = buildNvdaDic(sample);
  assert.match(out, /# volume/);
  assert.match(out, /^mL\tmilliliters\t0\t2/m);
  assert.match(out, /^ΔT\tdelta T\t1\t0/m);
});

test("buildJawsTsv includes header row", () => {
  const out = buildJawsTsv(sample);
  assert.match(out, /Text\tPronunciation\tNote/);
  assert.match(out, /mL\tmilliliters\tvolume/);
});

test("jawsExportPattern glues word subscripts for JAWS curriculum text", () => {
  assert.equal(jawsExportPattern("m_{calorimeter}"), "mcalorimeter");
  assert.equal(jawsExportPattern("m_{solution}"), "msolution");
  assert.equal(jawsExportPattern("m_solution"), "msolution");
  assert.equal(jawsExportPattern("qcalorimeter"), "qcalorimeter");
});

test("buildJawsTsv converts brace subscripts and documents SBAK import", () => {
  const out = buildJawsTsv([
    { text: "m_{calorimeter}", substitution: "m sub calorimeter", ignore_case: "Yes", note: "mass" },
    { text: "msolution", substitution: "m sub solution", ignore_case: "Yes", note: "dup" },
  ]);
  assert.match(out, /mcalorimeter\tm sub calorimeter\tmass/);
  assert.equal((out.match(/^msolution\t/gm) || []).length, 1);
  assert.match(out, /merge the settings from backup into existing settings/i);
  assert.match(out, /Keep current settings/i);
  assert.match(out, /Restart JAWS after import/i);
  assert.match(out, /mcalorimeter, msolution/);
});

test("buildAppleCsv quotes fields with commas", () => {
  const out = buildAppleCsv([{ text: "a,b", substitution: "spoken", ignore_case: "Yes", note: "" }]);
  assert.match(out, /"a,b"/);
});

test("bundledExportRowCount counts offline demo pronunciation rows", () => {
  assert.ok(bundledExportRowCount() > 100);
});

test("bundledRegexEntries includes chemistry unit regex rules", () => {
  const entries = bundledRegexEntries();
  assert.ok(entries.length > 50);
  assert.ok(entries.some((e) => e.pattern.includes("mL")));
});

test("buildExportNvdaDic merges bundled base for demo dictionary only", () => {
  const out = buildExportNvdaDic([], { classSlug: "demo", mergeBundled: true });
  assert.match(out, /kJ\/mol\tkilluh jools per mol/);
});

test("buildExportNvdaDic exports class rows only without demo base", () => {
  const rows = [{ text: "mL", substitution: "milliliters custom", ignore_case: "Yes", note: "" }];
  const out = buildExportNvdaDic(rows, { classSlug: "chem113", mergeBundled: true });
  assert.match(out, /^mL\tmilliliters custom\t0\t/m);
  assert.doesNotMatch(out, /kJ\/mol\tkilluh jools per mol/);
});

test("resolveExportRegexEntries prefers addon_defaults over bundled", () => {
  const custom = [{ pattern: "X", replacement: "ex", caseSensitive: 0, type: 1, comments: [] }];
  assert.deepEqual(resolveExportRegexEntries("chem113", { nvdaRegexEntries: custom }), custom);
});

test("resolveExportRegexEntries skips bundled fallback for empty chem class", () => {
  assert.deepEqual(
    resolveExportRegexEntries("chem116", {}, { useBundledFallback: false }),
    [],
  );
});

test("buildExportNvdaDic does not merge demo when chem class has no rows", () => {
  const out = buildExportNvdaDic([], { classSlug: "chem116", mergeBundled: true });
  assert.doesNotMatch(out, /kJ\/mol\tkilluh jools per mol/);
});

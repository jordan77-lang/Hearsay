import { test } from "node:test";
import assert from "node:assert/strict";

import { buildNvdaDic, buildJawsTsv, buildAppleCsv, buildExportNvdaDic, bundledRegexEntries, resolveExportRegexEntries } from "../src/dictionary-export.js";

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

test("buildAppleCsv quotes fields with commas", () => {
  const out = buildAppleCsv([{ text: "a,b", substitution: "spoken", ignore_case: "Yes", note: "" }]);
  assert.match(out, /"a,b"/);
});

test("bundledRegexEntries includes chemistry unit regex rules", () => {
  const entries = bundledRegexEntries();
  assert.ok(entries.length > 50);
  assert.ok(entries.some((e) => e.pattern.includes("mL")));
});

test("buildExportNvdaDic merges chem class rows with bundled base", () => {
  const rows = [{ text: "mL", substitution: "milliliters custom", ignore_case: "Yes", note: "" }];
  const out = buildExportNvdaDic(rows, { classSlug: "chem113" });
  assert.match(out, /^mL\tmilliliters custom\t0\t/m);
  assert.match(out, /kJ\/mol\tkilluh jools per mol/);
});

test("resolveExportRegexEntries prefers addon_defaults over bundled", () => {
  const custom = [{ pattern: "X", replacement: "ex", caseSensitive: 0, type: 1, comments: [] }];
  assert.deepEqual(resolveExportRegexEntries("chem113", { nvdaRegexEntries: custom }), custom);
});

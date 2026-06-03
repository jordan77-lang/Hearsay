import { test } from "node:test";
import assert from "node:assert/strict";

import { buildNvdaDic, buildJawsTsv, buildAppleCsv } from "../src/dictionary-export.js";

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

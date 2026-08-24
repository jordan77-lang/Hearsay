import { test } from "node:test";
import assert from "node:assert/strict";

import { findRuleConflicts, summarizeConflicts } from "../src/core/rule-conflicts.js";

const CLASS_ROWS = [
  { text: "L", substitution: "liters", ignore_case: "No" },
  { text: "g", substitution: "grams", ignore_case: "No" },
  { text: "mL", substitution: "milliliters", ignore_case: "No" },
  { text: "mol", substitution: "moles", ignore_case: "No" },
];

function kinds(conflicts) {
  return conflicts.map((c) => c.kind);
}

test("no conflicts for an ordinary new term", () => {
  const found = findRuleConflicts(
    { text: "kPa", substitution: "kilopascals", ignore_case: "No" },
    CLASS_ROWS,
  );
  assert.deepEqual(found, []);
});

test("flags a replacement that another rule rewrites (cascade)", () => {
  const found = findRuleConflicts(
    { text: "HCl", substitution: "H C L", ignore_case: "No" },
    CLASS_ROWS,
  );
  assert.ok(kinds(found).includes("cascade"));
  const cascade = found.find((c) => c.kind === "cascade");
  assert.equal(cascade.severity, "high");
  assert.match(cascade.detail, /H C liters/);
});

test("does not flag a cascade when the token is only part of a word", () => {
  const found = findRuleConflicts(
    { text: "CaCO3", substitution: "calcium carbonate", ignore_case: "No" },
    CLASS_ROWS,
  );
  // "g" appears inside nothing here; "L"/"mol" must not match inside words.
  assert.ok(!kinds(found).includes("cascade"));
});

test("flags an exact duplicate with different spoken text", () => {
  const found = findRuleConflicts(
    { text: "mL", substitution: "mils", ignore_case: "No" },
    CLASS_ROWS,
  );
  const dup = found.find((c) => c.kind === "duplicate-different");
  assert.ok(dup);
  assert.equal(dup.severity, "high");
  assert.match(dup.message, /milliliters/);
});

test("flags an exact duplicate with identical spoken text as lower severity", () => {
  const found = findRuleConflicts(
    { text: "mL", substitution: "milliliters", ignore_case: "No" },
    CLASS_ROWS,
  );
  const dup = found.find((c) => c.kind === "duplicate");
  assert.ok(dup);
  assert.equal(dup.severity, "medium");
});

test("flags case-insensitive SI units that collapse distinct units", () => {
  const found = findRuleConflicts(
    { text: "mm", substitution: "millimeters", ignore_case: "Yes" },
    [],
  );
  const si = found.find((c) => c.kind === "si-case");
  assert.ok(si);
  assert.equal(si.severity, "high");
  assert.equal(si.otherPattern, "mM");
});

test("case-sensitive SI units are not flagged", () => {
  const found = findRuleConflicts(
    { text: "mm", substitution: "millimeters", ignore_case: "No" },
    [],
  );
  assert.ok(!kinds(found).includes("si-case"));
});

test("flags unit patterns that are ordinary English words", () => {
  for (const word of ["min", "ton", "cup", "bar"]) {
    const found = findRuleConflicts(
      { text: word, substitution: "units", ignore_case: "No" },
      [],
    );
    assert.ok(kinds(found).includes("english-word"), `${word} should be flagged`);
  }
});

test("regex-anchored rules are not flagged as English words", () => {
  const found = findRuleConflicts(
    { text: String.raw`(?<=\d\s?)min\b`, substitution: "minutes", ignore_case: "No", rule_type: 1 },
    [],
  );
  assert.ok(!kinds(found).includes("english-word"));
});

test("flags prose punctuation the student already controls", () => {
  for (const mark of [",", ".", ";", ":", "?", "!"]) {
    const found = findRuleConflicts({ text: mark, substitution: "comma" }, []);
    assert.ok(kinds(found).includes("prose-punctuation"), `${mark} should be flagged`);
  }
  const paren = findRuleConflicts({ text: "(", substitution: "open parenthesis" }, []);
  assert.ok(!kinds(paren).includes("prose-punctuation"));
});

test("flags an existing shorter pattern contained in the new one", () => {
  const found = findRuleConflicts(
    { text: "mol/L", substitution: "moles per liter", ignore_case: "No" },
    CLASS_ROWS,
  );
  assert.ok(kinds(found).includes("overlap"));
});

test("high severity findings sort before medium", () => {
  const found = findRuleConflicts(
    { text: "mL", substitution: "H C L", ignore_case: "No" },
    CLASS_ROWS,
  );
  const severities = found.map((c) => c.severity);
  assert.deepEqual([...severities].sort((a, b) => (a === "high" ? -1 : 1)), severities);
});

test("empty or incomplete rows produce no findings", () => {
  assert.deepEqual(findRuleConflicts({ text: "", substitution: "x" }, CLASS_ROWS), []);
  assert.deepEqual(findRuleConflicts({ text: "x", substitution: "" }, CLASS_ROWS), []);
});

test("summarizeConflicts describes counts and severity", () => {
  assert.equal(summarizeConflicts([]), "");
  assert.equal(
    summarizeConflicts([{ severity: "high" }]),
    "1 possible conflict (1 likely to change speech)",
  );
  assert.equal(summarizeConflicts([{ severity: "medium" }, { severity: "medium" }]), "2 possible conflicts");
});

import { test } from "node:test";
import assert from "node:assert/strict";

// Mirror dictionary-editor suggestClassId (not exported — keep in sync)
function suggestClassId(label) {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

test("suggestClassId builds slug from display name", () => {
  assert.equal(suggestClassId("CHEM 114"), "chem-114");
  assert.equal(suggestClassId("  BIOL_220  "), "biol_220");
});

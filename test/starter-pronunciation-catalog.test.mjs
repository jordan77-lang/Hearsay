import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getAllStarterRows,
  getStarterRowIdsForPreset,
  getStarterRowsByIds,
  getStarterGroupRowIds,
  STARTER_PRONUNCIATION_ROWS,
  starterCatalogIndex,
} from "../src/starter-pronunciation-catalog.js";

test("starter catalog has unique row ids", () => {
  const all = getAllStarterRows();
  assert.ok(all.length > 80);
  assert.equal(all.length, starterCatalogIndex.allIds.length);
});

test("metric preset excludes hours (h)", () => {
  const ids = getStarterRowIdsForPreset("metric");
  const rows = getStarterRowsByIds(ids);
  assert.ok(rows.some((r) => r.text === "mL"));
  assert.ok(!rows.some((r) => r.text === "h"));
  assert.ok(!rows.some((r) => r.text === "H"));
});

test("science preset includes chemistry and biology", () => {
  const ids = getStarterRowIdsForPreset("science");
  assert.ok(ids.includes("chem-deltaT"));
  assert.ok(ids.includes("bio-dna"));
});

test("essentials matches legacy export count", () => {
  assert.equal(STARTER_PRONUNCIATION_ROWS.length, 11);
  assert.equal(getStarterRowIdsForPreset("essentials").length, 11);
});

test("science category group includes all subgroups", () => {
  const science = getStarterGroupRowIds("science");
  const chem = getStarterGroupRowIds("science-chem");
  assert.ok(science.length > chem.length);
  for (const id of chem) assert.ok(science.includes(id));
});

test("mergeImportRows combines class copy with catalog without duplicate patterns", async () => {
  const { mergeImportRows } = await import("../src/dictionary-import.js");
  const merged = mergeImportRows(
    [{ text: "mL", substitution: "milliliters", ignore_case: "Yes" }],
    [{ text: "mL", substitution: "em el", ignore_case: "Yes" }, { text: "g", substitution: "grams", ignore_case: "Yes" }],
  );
  assert.equal(merged.length, 2);
  assert.equal(merged.find((r) => r.text === "mL")?.substitution, "em el");
});

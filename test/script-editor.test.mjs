import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toUnicodeSubscript,
  toUnicodeSuperscript,
  buildScriptInsert,
} from "../src/script-editor.js";

test("toUnicodeSubscript converts digits", () => {
  assert.equal(toUnicodeSubscript("2"), "\u2082");
  assert.equal(toUnicodeSubscript("12"), "\u2081\u2082");
});

test("toUnicodeSuperscript converts digits", () => {
  assert.equal(toUnicodeSuperscript("2"), "\u00b2");
  assert.equal(toUnicodeSuperscript("23"), "\u00b2\u00b3");
});

test("buildScriptInsert word and digit subscripts", () => {
  assert.equal(buildScriptInsert("sub", "q", "calorimeter"), "q_{calorimeter}");
  assert.equal(buildScriptInsert("sub", "T", "2"), "T\u2082");
  assert.equal(buildScriptInsert("sub", "c", "H2O"), "c_{H2O}");
  assert.equal(buildScriptInsert("super", "x", "2"), "x\u00b2");
});

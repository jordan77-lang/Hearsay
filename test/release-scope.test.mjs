import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { isReleasePath } from "../tools/release-scope.mjs";
import { SHOW_MATHSAY } from "../src/site-config.js";
import { buildAuthorUserGuideSections } from "../src/author-user-guide.js";

test("paused MathSay stays in source while release entry points are excluded", () => {
  assert.equal(SHOW_MATHSAY, false);
  for (const file of ["mathsay/index.html", "src/mathsay.js", "src/core/mathsay-export.js"]) {
    assert.ok(existsSync(new URL("../" + file, import.meta.url)), file);
    assert.equal(isReleasePath(file), false, file);
  }
  assert.equal(isReleasePath("mathsay"), false);
  assert.equal(isReleasePath("playground/index.html"), false);
  assert.equal(isReleasePath("src\\core\\mathsay-export.js"), false);
});

test("active HearSay tools and shared equation helpers remain in releases", () => {
  for (const file of ["index.html", "lab/index.html", "dictionary/index.html", "src/screen-reader-lab.js", "src/dictionary-editor.js", "src/fraction-builder.js", "src/core/latex.js", "src/sidepanel.js"]) {
    assert.equal(isReleasePath(file), true, file);
  }
});

test("published author guide describes only active tools", () => {
  const guide = buildAuthorUserGuideSections();
  assert.doesNotMatch(JSON.stringify(guide), /MathSay/i);
  assert.ok(guide.sections.some(section => section.id === "lab"));
  assert.ok(guide.sections.some(section => section.id === "dictionary"));
});

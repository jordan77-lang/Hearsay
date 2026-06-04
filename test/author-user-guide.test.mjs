import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthorUserGuideSections, AUTHOR_USER_GUIDE_FILENAME } from "../src/author-user-guide.js";

test("author user guide has core sections", () => {
  const guide = buildAuthorUserGuideSections();
  assert.ok(guide.title.includes("HearSay"));
  assert.ok(guide.intro.length >= 2);
  const ids = guide.sections.map((s) => s.id);
  assert.ok(ids.includes("lab"));
  assert.ok(ids.includes("dictionary"));
  assert.ok(ids.includes("extension"));
  assert.ok(ids.includes("workflow"));
});

test("author user guide filename is stable", () => {
  assert.equal(AUTHOR_USER_GUIDE_FILENAME, "HearSay-Author-User-Guide.pdf");
});

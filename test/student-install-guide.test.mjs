import { test } from "node:test";
import assert from "node:assert/strict";

import {
  installGuidePdfFilename,
  buildInstallGuideSections,
} from "../src/student-install-guide.js";

test("installGuidePdfFilename derives from add-on name", () => {
  assert.equal(
    installGuidePdfFilename("chem113Dictionary-1.0.6.nvda-addon"),
    "chem113Dictionary-1.0.6-install-guide.pdf",
  );
});

test("buildInstallGuideSections is student-facing with click-to-install steps", () => {
  const sections = buildInstallGuideSections(
    {
      addonId: "chem113Dictionary",
      version: "1.0.6",
      summary: "CHEM 113 Pronunciation Dictionary",
      dictionaryDisplayName: "CHEM 113 Pronunciations",
    },
    { addonFilename: "chem113Dictionary-1.0.6.nvda-addon", literalCount: 120, regexCount: 90 },
  );
  assert.match(sections.courseName, /CHEM 113/);
  assert.match(sections.file, /\.nvda-addon$/);
  assert.ok(sections.whatThisDoes.some((t) => /once/i.test(t)));
  assert.ok(sections.stepsPrimary.some((s) => /double-click/i.test(s)));
  assert.ok(sections.stepsPrimary.some((s) => /Install|restart/i.test(s)));
  assert.ok(sections.stepsPrimary.some((s) => /Option B/i.test(s)));
  assert.ok(sections.stepsAlternate.some((s) => /Install from external source/i.test(s)));
  assert.equal(sections.stepsAlternate.length, 4);
  assert.ok(sections.testIntro.includes("Notepad"));
  assert.ok(sections.test.some((t) => t.sample === "kJ/mol"));
  assert.doesNotMatch(sections.whatThisDoes.join(" "), /instructor builds/i);
  assert.doesNotMatch(sections.footer, /HearSay/i);
});

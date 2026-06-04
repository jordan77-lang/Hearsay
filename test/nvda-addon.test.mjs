import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveAddonOptions,
  buildAddonManifest,
  buildAddonBootstrapPlugin,
  buildNvdaDownloadAlertMessage,
  countRegexInDic,
  defaultAddonDefaults,
} from "../src/nvda-addon.js";

test("resolveAddonOptions validates add-on id and version", () => {
  const opts = resolveAddonOptions(
    { addonId: "chem113Dictionary", version: "1.0.6", dictionaryName: "chem113" },
    defaultAddonDefaults("chem113", "CHEM 113"),
  );
  assert.equal(opts.addonId, "chem113Dictionary");
  assert.equal(opts.version, "1.0.6");
  assert.throws(() => resolveAddonOptions({ addonId: "9bad", version: "1.0.0", dictionaryName: "chem113" }, {}));
});

test("buildAddonManifest includes speechDictionaries section", () => {
  const manifest = buildAddonManifest({
    addonId: "chem113Dictionary",
    version: "1.0.6",
    summary: "CHEM 113 Pronunciation Dictionary",
    author: "Accessibility Team",
    dictionaryName: "chem113",
    dictionaryDisplayName: "CHEM 113 Pronunciations",
  });
  assert.match(manifest, /name = "chem113Dictionary"/);
  assert.match(manifest, /minimumNVDAVersion = "2026.1"/);
  assert.match(manifest, /\[speechDictionaries\]/);
  assert.match(manifest, /\[\[chem113\]\]/);
});

test("buildAddonBootstrapPlugin names a valid global plugin module", () => {
  const { moduleName, code } = buildAddonBootstrapPlugin(
    { addonId: "chem113Dictionary", dictionaryName: "chem113" },
    "chem113.dic",
  );
  assert.equal(moduleName, "chem113");
  assert.match(code, /speechDicts/);
  assert.match(code, /chem113\.dic/);
});

test("buildNvdaDownloadAlertMessage stays brief", () => {
  const withPdf = buildNvdaDownloadAlertMessage({
    filename: "chem113Dictionary-1.0.0.nvda-addon",
    pdfFilename: "chem113Dictionary-1.0.0-install-guide.pdf",
    pdfError: null,
  });
  assert.match(withPdf, /Downloaded: chem113Dictionary-1.0.0\.nvda-addon/);
  assert.match(withPdf, /install-guide\.pdf/);
  assert.match(withPdf, /double-click/i);
  assert.match(withPdf, /Install from external source/i);
  assert.ok(withPdf.length < 420);
  assert.doesNotMatch(withPdf, /Quick test in Notepad/);

  const noPdf = buildNvdaDownloadAlertMessage({
    filename: "chem113Dictionary-1.0.0.nvda-addon",
    pdfFilename: null,
    pdfError: new Error("pdf fail"),
  });
  assert.match(noPdf, /Add-on Store/);
  assert.ok(noPdf.length < 320);
});

test("countRegexInDic counts type-1 lines", () => {
  const dic = "mL\tmilliliters\t0\t2\n(?<=\\d)\\s?mL\\b\tmilliliters\t0\t1\n";
  assert.equal(countRegexInDic(dic), 1);
});

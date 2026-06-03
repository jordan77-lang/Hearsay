import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveAddonOptions,
  buildAddonManifest,
  buildAddonBootstrapPlugin,
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

test("countRegexInDic counts type-1 lines", () => {
  const dic = "mL\tmilliliters\t0\t2\n(?<=\\d)\\s?mL\\b\tmilliliters\t0\t1\n";
  assert.equal(countRegexInDic(dic), 1);
});

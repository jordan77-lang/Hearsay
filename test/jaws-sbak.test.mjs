import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { jdfLine, buildJawsDictionary, buildJawsSbak, parseJawsDictionary, uuencodeComments, contentHash, backupDate, JDF_ENTRY, METADATA_ENTRY } from "../src/core/jaws-sbak.js";
import { jawsSbakRows } from "../src/dictionary-export.js";

const sha = bytes => createHash("sha256").update(bytes).digest("hex").toUpperCase();

test("JDF lines use JAWS's layout, separator and case flag", () => {
  assert.equal(jdfLine({ text: "kJ/mol", substitution: "kilojoules per mole", ignore_case: "No" }).line, ".kJ/mol.kilojoules per mole.*.*.*.1.0.");
  assert.equal(jdfLine({ text: "lysozyme", substitution: "lye suh zime", ignore_case: "Yes" }).line, ".lysozyme.lye suh zime.*.*.*.0.0.");
  // A dot in the pattern switches the separator to a comma, as JAWS does.
  assert.equal(jdfLine({ text: "4.18 J/g°C", substitution: "four point one eight", ignore_case: "No" }).line, ",4.18 J/g°C,four point one eight,*,*,*,1,0,");
  // Deliberate leading spaces are kept (match only after a space).
  assert.equal(jdfLine({ text: " g", substitution: "grams", ignore_case: "Yes" }).line, ". g.grams.*.*.*.0.0.");
  assert.match(jdfLine({ text: "a*b", substitution: "x" }).error, /wildcard/);
  assert.match(jdfLine({ text: "a\nb", substitution: "x" }).error, /line break/);
  assert.match(jdfLine({ text: "x", substitution: "" }).error, /missing/);
});

test("the dictionary file has a BOM, CRLF line endings and skips duplicates", () => {
  const { text, included, skipped } = buildJawsDictionary([
    { text: "mL", substitution: "milliliters", ignore_case: "No" },
    { text: "mL", substitution: "again", ignore_case: "No" },
    { text: "a*", substitution: "x" },
  ]);
  assert.ok(text.startsWith("﻿"));
  assert.equal(text, "﻿.mL.milliliters.*.*.*.1.0.\r\n");
  assert.equal(included, 1);
  assert.deepEqual(skipped.map(item => item.reason), ["duplicate pattern", "contains * (JAWS treats it as a wildcard)"]);
});

test("a built .sbak unzips to the dictionary and a manifest whose hashes check out", async () => {
  const rows = [
    { text: "kJ/mol", substitution: "kilojoules per mole", ignore_case: "No" },
    { text: "4.18 J/g°C", substitution: "four point one eight joules per gram degree Celsius", ignore_case: "No" },
    { text: "lysozyme", substitution: "lye suh zime", ignore_case: "Yes" },
  ];
  const backup = await buildJawsSbak(rows, { comment: "CHEM 101 class dictionary from HearSay", date: new Date(2026, 5, 22, 12, 18), machineGuid: "00000000-0000-4000-8000-000000000000" });
  const zip = new JSZip();
  for (const entry of backup.entries) zip.file(entry.name, entry.bytes, { compression: "DEFLATE" });
  const reopened = await JSZip.loadAsync(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
  assert.deepEqual(Object.keys(reopened.files), [JDF_ENTRY, METADATA_ENTRY], "only the dictionary and the manifest; no other JAWS settings");
  assert.equal(JDF_ENTRY, "JAWS\\UserRoot\\settings\\enu\\DEFAULT.JDF");
  const jdf = await reopened.file(JDF_ENTRY).async("uint8array");
  const meta = await reopened.file(METADATA_ENTRY).async("string");
  assert.ok(meta.startsWith("﻿<?xml") && meta.includes("\r\n"), "UTF-8 BOM and CRLF like JAWS");
  assert.equal(meta.match(/<Hash>([^<]+)/)[1], sha(jdf));
  assert.equal(meta.match(/<Size>([^<]+)/)[1], String(jdf.length));
  const expected = sha(Buffer.from(`${JDF_ENTRY}\n${sha(jdf)}\n${jdf.length}\n`, "utf8"));
  assert.equal(meta.match(/<ContentHash>([^<]+)/)[1], expected);
  assert.equal(await contentHash([{ entry: JDF_ENTRY, hash: sha(jdf), size: jdf.length }]), expected);
  assert.match(meta, /<BackupType>Partial<\/BackupType>/);
  assert.match(meta, /<BackupDate>Monday, June 22, 2026 12:18 PM<\/BackupDate>/);
  const parsed = parseJawsDictionary(new TextDecoder().decode(jdf));
  assert.deepEqual(parsed.map(({ text, substitution, ignore_case }) => ({ text, substitution, ignore_case })), rows);
});

test("comments are UTF-16 text, uuencoded with backticks for zero", () => {
  const text = "CHEM 101 class dictionary from HearSay";
  const bytes = Buffer.from(text, "utf16le");
  const encoded = uuencodeComments(bytes);
  assert.ok(!encoded.includes(" "), "zero is written as a backtick, never a space");
  // Decode it back.
  const out = [];
  for (const line of encoded.split("\r\n")) {
    const length = (line.charCodeAt(0) - 32) & 63, chars = line.slice(1), values = [];
    for (let i = 0; i < chars.length; i += 4) {
      const [a, b, c, d] = [0, 1, 2, 3].map(j => (chars.charCodeAt(i + j) - 32) & 63);
      values.push((a << 2) | (b >> 4), ((b & 15) << 4) | (c >> 2), ((c & 3) << 6) | d);
    }
    out.push(...values.slice(0, length));
  }
  assert.equal(Buffer.from(out).toString("utf16le"), text);
  assert.equal(backupDate(new Date(2026, 0, 5, 9, 7)), "Monday, January 5, 2026 9:07 AM");
});

test("class rows are prepared like the JAWS export: glued subscripts, spaces kept, sorted", () => {
  const rows = jawsSbakRows([
    { text: "q_{calorimeter}", substitution: "q of calorimeter", ignore_case: "No" },
    { text: " g", substitution: "grams", ignore_case: "Yes" },
    { text: "Beaker", substitution: "beaker", ignore_case: "Yes" },
    { text: "q_{calorimeter}", substitution: "duplicate", ignore_case: "No" },
    { text: "empty", substitution: "  ", ignore_case: "No" },
  ]);
  assert.deepEqual(rows.map(row => row.text), [" g", "Beaker", "qcalorimeter"]);
  assert.equal(rows[2].ignore_case, "No");
});

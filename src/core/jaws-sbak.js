// JAWS Settings Packager backup (.sbak) for a class dictionary.
//
// Reverse-engineered from a backup made by JAWS 2026 (Settings Packager):
//  - An .sbak is a zip. Paths inside use Windows backslashes.
//  - JAWS\UserRoot\settings\enu\DEFAULT.JDF is the default (all-apps) dictionary:
//    UTF-8 with BOM, CRLF line endings (including the last line). Each line is
//      <d>pattern<d>reading<d>language<d>synth<d>voice<d>matchCase<d>type<d>
//    where <d> is a separator character absent from pattern and reading ("." by
//    default, "," when a field contains "."), "*" means any language / synth /
//    voice, matchCase is 1 (exact case) or 0 (any case), and type is 0 for user
//    entries. A trailing "*" in a pattern is a JAWS wildcard ("starts with").
//  - BackupMetaData.txt is UTF-8 XML (BOM, CRLF). Each file has
//    Hash = uppercase SHA-256 of its bytes, and ContentHash = SHA-256 of
//    "<entry>\n<hash>\n<size>\n" for every file in order. Comments are UTF-16LE
//    text, uuencoded with "`" for zero, lines joined by CRLF.
//
// Only the dictionary is included: a student's other JAWS settings are never
// touched. Restoring with "merge" keeps the student's own dictionary entries.

export const JDF_ENTRY = "JAWS\\UserRoot\\settings\\enu\\DEFAULT.JDF";
export const METADATA_ENTRY = "BackupMetaData.txt";
/** JAWS version recorded in the backup (the version the format was taken from). */
export const JAWS_BACKUP_VERSION = "2026.43";
const SEPARATORS = [".", ",", "|", ";", ":", "/", "#", "~", "^", "!"];
const BOM = "﻿";

/**
 * One DEFAULT.JDF line for a class dictionary row, or a reason it cannot be written.
 * @param {{ text: string, substitution: string, ignore_case?: string }} row
 */
export function jdfLine(row) {
  // Spaces are kept: a leading space (" g") is how authors make an entry match
  // only after a space, so it does not fire inside other words.
  const pattern = String(row?.text ?? ""), reading = String(row?.substitution ?? "");
  if (!pattern.trim() || !reading.trim()) return { error: "missing pattern or reading" };
  if (/[\r\n\t]/.test(pattern + reading)) return { error: "contains a line break or tab" };
  if (pattern.includes("*")) return { error: "contains * (JAWS treats it as a wildcard)" };
  const separator = SEPARATORS.find(char => !pattern.includes(char) && !reading.includes(char));
  if (!separator) return { error: "uses every separator character JAWS can read" };
  const matchCase = String(row?.ignore_case ?? "Yes").trim().toLowerCase() === "no" ? "1" : "0";
  const fields = [pattern, reading, "*", "*", "*", matchCase, "0"];
  return { line: `${separator}${fields.join(separator)}${separator}`, separator };
}

/** The complete DEFAULT.JDF text plus what was skipped and why. */
export function buildJawsDictionary(rows = []) {
  const lines = [], skipped = [], seen = new Set();
  for (const row of rows) {
    const key = String(row?.text ?? "");
    if (seen.has(key)) { skipped.push({ text: key, reason: "duplicate pattern" }); continue; }
    const result = jdfLine(row);
    if (result.error) { skipped.push({ text: key, reason: result.error }); continue; }
    seen.add(key); lines.push(result.line);
  }
  return { text: BOM + lines.map(line => `${line}\r\n`).join(""), included: lines.length, skipped };
}

/** uuencode bytes the way JAWS writes Comments: "`" for zero, CRLF between lines. */
export function uuencodeComments(bytes) {
  const char = value => (value ? String.fromCharCode(32 + value) : "`");
  const lines = [];
  for (let offset = 0; offset < bytes.length; offset += 45) {
    const chunk = bytes.slice(offset, offset + 45);
    let line = char(chunk.length);
    for (let i = 0; i < chunk.length; i += 3) {
      const [a, b = 0, c = 0] = [chunk[i], chunk[i + 1], chunk[i + 2]];
      line += char(a >> 2) + char(((a & 3) << 4) | (b >> 4)) + char(((b & 15) << 2) | (c >> 6)) + char(c & 63);
    }
    lines.push(line);
  }
  return lines.join("\r\n");
}

function utf16le(text) {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) { const code = text.charCodeAt(i); bytes[i * 2] = code & 255; bytes[i * 2 + 1] = code >> 8; }
  return bytes;
}
const xml = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** ContentHash over the listed files (entry, hash and size, each followed by LF). */
export async function contentHash(files) {
  return sha256Hex(new TextEncoder().encode(files.map(file => `${file.entry}\n${file.hash}\n${file.size}\n`).join("")));
}

/** Long US date as JAWS writes it: "Monday, June 22, 2026 12:18 PM". */
export function backupDate(date = new Date()) {
  const day = date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} ${time}`;
}

/**
 * Build the .sbak contents (file entries and their bytes). Zip them with
 * deflate, keeping entry names exactly as given.
 * @returns {Promise<{ entries: Array<{ name: string, bytes: Uint8Array }>, included: number, skipped: Array<{ text: string, reason: string }> }>}
 */
export async function buildJawsSbak(rows, { comment = "", date = new Date(), machineName = "HEARSAY", machineGuid = globalThis.crypto.randomUUID(), applicationVersion = JAWS_BACKUP_VERSION } = {}) {
  const dictionary = buildJawsDictionary(rows);
  const jdf = new TextEncoder().encode(dictionary.text);
  const files = [{ entry: JDF_ENTRY, bytes: jdf, size: jdf.length, hash: await sha256Hex(jdf) }];
  const comments = comment ? `<Comments Encoded="yes">${xml(uuencodeComments(utf16le(comment)))}</Comments>` : `<Comments Encoded="yes"></Comments>`;
  const metadata = [
    `${BOM}<?xml version="1.0" encoding="utf-8"?>`,
    "<BackupInfo>",
    "  <SchemaVersion>3</SchemaVersion>",
    `  <MachineName>${xml(machineName)}</MachineName>`,
    "  <Application>JAWS</Application>",
    `  <ApplicationVersion>${xml(applicationVersion)}</ApplicationVersion>`,
    `  <BackupDate>${xml(backupDate(date))}</BackupDate>`,
    "  <BackupType>Partial</BackupType>",
    `  ${comments}`,
    "  <SupportedLanguages>enu</SupportedLanguages>",
    `  <ContentHash>${await contentHash(files)}</ContentHash>`,
    `  <MachineGuid>${xml(machineGuid)}</MachineGuid>`,
    "  <Name></Name>",
    "  <Files>",
    ...files.flatMap(file => ["    <File>", `      <Entry>${xml(file.entry)}</Entry>`, `      <Hash>${file.hash}</Hash>`, `      <Size>${file.size}</Size>`, "    </File>"]),
    "  </Files>",
    "</BackupInfo>",
  ].join("\r\n");
  return {
    entries: [{ name: JDF_ENTRY, bytes: jdf }, { name: METADATA_ENTRY, bytes: new TextEncoder().encode(metadata) }],
    included: dictionary.included, skipped: dictionary.skipped,
  };
}

/** Parse DEFAULT.JDF text back into rows (used to check a round trip). */
export function parseJawsDictionary(text) {
  return String(text).replace(/^﻿/, "").split(/\r\n/).filter(Boolean).map(line => {
    const separator = line[0], fields = line.slice(1, -1).split(separator);
    return { text: fields[0], substitution: fields[1], language: fields[2], synth: fields[3], voice: fields[4], ignore_case: fields[5] === "1" ? "No" : "Yes", type: fields[6] };
  });
}

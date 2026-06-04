// Export class entries for NVDA, JAWS, and Apple VoiceOver.

import { buildMergedExportDic, mergeBundledWithClassRules } from "./core/dictionary.js";
import { DICTIONARY_DIC } from "./core/dictionary-data.js";
import { parseDicLine } from "./supabase/dictionary-format.js";
import { shouldMergeBundledBase, shouldMergeBundledForClass } from "./supabase/dictionary-api.js";

function sanitize(value) {
  return String(value ?? "").trim();
}

function normalizeIgnoreCase(value) {
  const v = sanitize(value).toLowerCase();
  return v === "no" || v === "0" ? "No" : "Yes";
}

function estimateNvdaType(text) {
  if (/^[A-Za-z]{1,3}$/.test(text)) return 2;
  return 0;
}

function escapeCsvField(value) {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildAppleCsv(rows) {
  const header = ["Text", "Substitution", "App", "Ignore case", "Note"];
  const lines = [header.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.text,
        row.substitution,
        row.app || "All Apps",
        normalizeIgnoreCase(row.ignore_case),
        row.note,
      ]
        .map(escapeCsvField)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

export function buildJawsTsv(rows) {
  const lines = [
    "# DSL chemistry pronunciation source for JAWS Dictionary Manager",
    "# Import in JAWS Dictionary Manager, then export an .SBAK package from JAWS.",
    "Text\tPronunciation\tNote",
  ];
  for (const row of rows) {
    if (!row.text || !row.substitution) continue;
    lines.push(`${row.text}\t${row.substitution}\t${row.note ?? ""}`);
  }
  return lines.join("\r\n");
}

/**
 * @param {Array<{text,substitution,ignore_case,note}>} rows
 * @param {{ regexEntries?: Array<{pattern,replacement,caseSensitive,type,comments?}> }} opts
 */
export function buildNvdaDic(rows, { regexEntries = [] } = {}) {
  const output = [];
  for (const row of rows) {
    const text = sanitize(row.text);
    const replacement = sanitize(row.substitution);
    if (!text || !replacement) continue;
    const note = sanitize(row.note);
    if (note) output.push(`# ${note}`);
    const caseSensitive = normalizeIgnoreCase(row.ignore_case) === "No" ? 1 : 0;
    const type = row.rule_type != null ? Number(row.rule_type) : estimateNvdaType(text);
    output.push(`${text}\t${replacement}\t${caseSensitive}\t${type}`);
  }
  for (const entry of regexEntries) {
    for (const c of entry.comments ?? []) output.push(`# ${c}`);
    output.push(
      `${entry.pattern}\t${entry.replacement}\t${Number(entry.caseSensitive) || 0}\t${Number(entry.type) || 1}`,
    );
  }
  return output.join("\r\n");
}

/** Pronunciation rows in the offline chem demo base (export merge, not regex). */
export function bundledExportRowCount() {
  return mergeBundledWithClassRules([]).length;
}

/** Regex-only entries from bundled chem .dic (type 1). */
export function bundledRegexEntries() {
  const entries = [];
  let comments = [];
  for (const line of DICTIONARY_DIC.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      comments.push(trimmed.slice(1).trim());
      continue;
    }
    const parsed = parseDicLine(line);
    if (!parsed || parsed.rule_type !== 1) {
      comments = [];
      continue;
    }
    entries.push({
      pattern: parsed.pattern,
      replacement: parsed.replacement,
      caseSensitive: parsed.case_sensitive ? 1 : 0,
      type: 1,
      comments: [...comments],
    });
    comments = [];
  }
  return entries;
}

/** NVDA regex rules: addon_defaults first; bundled chem fallback only when merging demo base. */
export function resolveExportRegexEntries(classSlug, addonDefaults, { useBundledFallback = true } = {}) {
  const fromAddon = addonDefaults?.nvdaRegexEntries ?? [];
  if (fromAddon.length) return fromAddon;
  if (useBundledFallback && shouldMergeBundledBase(classSlug)) return bundledRegexEntries();
  return [];
}

/**
 * Full .dic for student install: merges bundled chem base when applicable.
 * @param {Array<{text,substitution,ignore_case,note}>} rows
 */
export function buildExportNvdaDic(rows, { classSlug, regexEntries = [], mergeBundled = false } = {}) {
  const useBundled =
    mergeBundled && shouldMergeBundledForClass(classSlug, (rows ?? []).filter((r) => r.text && r.substitution).length);
  if (useBundled) {
    const classOnly = buildNvdaDic(rows);
    const merged = buildMergedExportDic(classOnly);
    if (!regexEntries.length) return merged;
    const regexBlock = buildNvdaDic([], { regexEntries });
    return `${merged}\r\n${regexBlock}`;
  }
  return buildNvdaDic(rows, { regexEntries });
}

export function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 2000);
}

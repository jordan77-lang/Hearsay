// Export class entries for NVDA, JAWS, and Apple VoiceOver.

import { buildMergedExportDic, mergeBundledWithClassRules } from "./core/dictionary.js";
import { DICTIONARY_DIC } from "./core/dictionary-data.js";
import { normalizeSubscripts } from "./core/lexicon.js";
import { parseDicLine, padSymbolReplacement } from "./supabase/dictionary-format.js";
import { shouldMergeBundledBase, shouldMergeBundledForClass } from "./supabase/dictionary-api.js";

function sanitize(value) {
  return String(value ?? "").trim();
}

function normalizeIgnoreCase(value) {
  const v = sanitize(value).toLowerCase();
  return v === "no" || v === "0" ? "No" : "Yes";
}

// Whole-word (type 2) for any purely alphabetic pattern. The previous 1-3
// character limit let longer patterns (tbsp, etc., Fig.) match INSIDE words.
// Patterns carrying non-word characters (m/s, J/g°C, (aq)) cannot use NVDA's
// word boundaries and stay type 0.
function estimateNvdaType(text) {
  if (/^[A-Za-z]+$/.test(text)) return 2;
  return 0;
}


function escapeCsvField(value) {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * JAWS sees word subscripts as glued letters in curriculum text (mcalorimeter, msolution),
 * not HearSay's m_{calorimeter} markup. Convert patterns for JAWS Dictionary Manager import.
 */
export function jawsExportPattern(text) {
  let s = sanitize(text);
  if (!s) return s;
  s = s.replace(/([A-Za-z\u0394])_\{([^{}]+)\}/g, (_, base, sub) => `${base}${normalizeSubscripts(sub)}`);
  s = s.replace(/\b([A-Za-z])_([A-Za-z][A-Za-z0-9]*)\b/g, (_, base, sub) => `${base}${sub}`);
  return s;
}

/**
 * Rows for a JAWS .sbak: the same pattern conversion as the TSV (glued word
 * subscripts), keeping any deliberate leading/trailing spaces, one entry per
 * pattern, sorted case-insensitively as JAWS saves them.
 */
export function jawsSbakRows(rows) {
  const out = [], seen = new Set();
  for (const row of rows) {
    const raw = String(row?.text ?? ""), core = jawsExportPattern(raw);
    if (!core) continue;
    const text = `${raw.match(/^\s*/)[0]}${core}${raw.match(/\s*$/)[0]}`;
    if (seen.has(text) || !String(row?.substitution ?? "").trim()) continue;
    seen.add(text);
    out.push({ text, substitution: String(row.substitution), ignore_case: normalizeIgnoreCase(row.ignore_case) });
  }
  return out.sort((a, b) => a.text.toLowerCase() < b.text.toLowerCase() ? -1 : a.text.toLowerCase() > b.text.toLowerCase() ? 1 : 0);
}

export const JAWS_SBAK_IMPORT_STEPS = [
  'Choose "No, merge the settings from backup into existing settings."',
  'If JAWS asks about conflicts, choose "Keep current settings."',
  "Restart JAWS after import.",
];

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
    "# Preparation list only: this TSV is not a student-loadable JAWS dictionary.",
    "# Review and enter the entries in JAWS Dictionary Manager; test the native .JDF, then share it or export an .SBAK from JAWS.",
    "# Word subscripts use glued text (mcalorimeter, msolution) — how JAWS reads subscripts in pasted curriculum.",
    "#",
    "# Importing the class dictionary .SBAK in JAWS:",
    ...JAWS_SBAK_IMPORT_STEPS.map((step) => `# ${step}`),
    "Text\tPronunciation\tNote",
  ];
  const seen = new Set();
  for (const row of rows) {
    const text = jawsExportPattern(row.text);
    const substitution = sanitize(row.substitution);
    if (!text || !substitution || seen.has(text)) continue;
    seen.add(text);
    lines.push(`${text}\t${substitution}\t${row.note ?? ""}`);
  }
  return lines.join("\r\n");
}

// NVDA applies dictionary rules in file order against the running text, so a
// general rule listed first eats the text a specific rule was meant to catch:
// "(" -> "open parenthesis" fires before "(g)" -> "gas", leaving state symbols
// dead. Emit longer patterns first so specific entries always win. Ties keep
// the caller's order, which keeps exports stable.
function orderRowsSpecificFirst(rows) {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const byLength = sanitize(b.row.text).length - sanitize(a.row.text).length;
      return byLength !== 0 ? byLength : a.index - b.index;
    })
    .map((entry) => entry.row);
}

/**
 * @param {Array<{text,substitution,ignore_case,note}>} rows
 * @param {{ regexEntries?: Array<{pattern,replacement,caseSensitive,type,comments?}> }} opts
 */
export function buildNvdaDic(rows, { regexEntries = [] } = {}) {
  const output = [];
  for (const row of orderRowsSpecificFirst(rows)) {
    const text = sanitize(row.text);
    const replacement = sanitize(row.substitution);
    if (!text || !replacement) continue;
    const note = sanitize(row.note);
    if (note) output.push(`# ${note}`);
    const caseSensitive = normalizeIgnoreCase(row.ignore_case) === "No" ? 1 : 0;
    const type = row.rule_type != null ? Number(row.rule_type) : estimateNvdaType(text);
    const spoken = type === 1 ? replacement : padSymbolReplacement(text, replacement);
    output.push(`${text}\t${spoken}\t${caseSensitive}\t${type}`);
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

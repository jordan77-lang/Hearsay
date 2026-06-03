// Import CSV/TSV rows for Dictionary Builder (Pattern / Spoken columns).

function sanitize(value) {
  return String(value ?? "").trim();
}

function canonicalHeader(header) {
  return sanitize(header).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function mapHeader(rawHeader) {
  const key = canonicalHeader(rawHeader);
  const lookup = {
    text: "text",
    term: "text",
    word: "text",
    pattern: "text",
    substitution: "substitution",
    pronunciation: "substitution",
    replacement: "substitution",
    spoken: "substitution",
    app: "app",
    application: "app",
    "ignore case": "ignore_case",
    case: "ignore_case",
    ignorecase: "ignore_case",
    "case insensitive": "ignore_case",
    note: "note",
    notes: "note",
    comment: "note",
  };
  return lookup[key] ?? sanitize(rawHeader);
}

function normalizeIgnoreCase(value) {
  const v = sanitize(value).toLowerCase();
  if (v === "no" || v === "0" || v === "false") return "No";
  return "Yes";
}

/** Parse one CSV line respecting quoted fields. */
function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if ((ch === "," || ch === "\t") && !inQuotes) {
      fields.push(cur);
      cur = "";
    } else cur += ch;
  }
  fields.push(cur);
  return fields;
}

/**
 * Parse CSV or TSV text with header row into objects keyed by mapped headers.
 * @param {string} text
 * @param {"csv"|"tsv"} format
 */
export function parseImportText(text, format = "csv") {
  const delim = format === "tsv" ? "\t" : ",";
  const lines = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]).map(mapHeader);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = cells[idx] ?? "";
    });
    rows.push(obj);
  }
  return rows;
}

export function normalizeImportRows(rawRows) {
  return (rawRows ?? [])
    .map((raw) => ({
      text: sanitize(raw.text),
      substitution: sanitize(raw.substitution),
      app: sanitize(raw.app) || "All Apps",
      ignore_case: normalizeIgnoreCase(raw.ignore_case),
      note: sanitize(raw.note),
    }))
    .filter((r) => r.text && r.substitution);
}

function escapeCsvField(value) {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Blank import template with example rows (Pattern / Spoken / Note / Ignore case). */
export function buildImportTemplateCsv() {
  const header = ["Pattern", "Spoken", "Note", "Ignore case"];
  const samples = [
    ["ΔT", "delta T", "temperature change", "Yes"],
    ["mL", "milliliters", "volume unit", "Yes"],
    ["J/g°C", "jools per gram degree Celsius", "", "Yes"],
  ];
  return [
    header.map(escapeCsvField).join(","),
    ...samples.map((row) => row.map(escapeCsvField).join(",")),
  ].join("\r\n");
}

/** Same columns as CSV, tab-separated (for Excel paste or TSV import). */
export function buildImportTemplateTsv() {
  const header = ["Pattern", "Spoken", "Note", "Ignore case"];
  const samples = [
    ["ΔT", "delta T", "temperature change", "Yes"],
    ["mL", "milliliters", "volume unit", "Yes"],
  ];
  return [header.join("\t"), ...samples.map((row) => row.join("\t"))].join("\r\n");
}

export function parseImportFile(file) {
  const name = file.name.toLowerCase();
  const format = name.endsWith(".tsv") ? "tsv" : "csv";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseImportText(String(reader.result ?? ""), format);
        const normalized = normalizeImportRows(parsed);
        if (!normalized.length) {
          reject(new Error("No valid rows. Need Pattern/Text and Spoken/Substitution columns."));
          return;
        }
        resolve(normalized);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsText(file, "utf-8");
  });
}

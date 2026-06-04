// Convert between NVDA .dic lines, Supabase dictionary_rules rows, and
// Dictionary Builder entries rows (text / substitution).

export function rowClassId(row) {
  return row.class_slug ?? row.course_id;
}

/** Literal vs regex vs whole-word — shared by .dic rows and entries import. */
export function inferRuleType(pattern) {
  if (/[\\^$.*+?[\](){}|]/.test(pattern) && pattern.includes("\\")) return 1;
  if (/^[A-Za-z][A-Za-z0-9/-]*$/.test(pattern) && pattern.length <= 24) return 2;
  return 0;
}
export function normalizeRuleRow(row) {
  const classSlug = row.class_slug ?? row.course_id;
  return { ...row, class_slug: classSlug, course_id: classSlug };
}

export function normalizeRuleRows(rows) {
  return (rows ?? []).map(normalizeRuleRow);
}

export function parseDicLine(line) {
  if (!line.trim() || line.startsWith("#")) return null;
  const parts = line.split("\t");
  if (parts.length < 4) return null;
  return {
    pattern: parts[0],
    replacement: parts[1],
    case_sensitive: parts[2] === "1",
    rule_type: Number(parts[3]) || 0,
  };
}

export function dicToRows(raw, classSlug = "chem113") {
  const rows = [];
  let sortOrder = 0;
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDicLine(line);
    if (!parsed) continue;
    rows.push({ ...parsed, class_slug: classSlug, course_id: classSlug, sort_order: sortOrder++ });
  }
  return rows;
}

/** Build rule rows from classes.addon_defaults.nvdaRegexEntries (legacy seed data). */
export function addonEntriesToRows(classSlug, addonDefaults, sortStart = 0) {
  const entries = addonDefaults?.nvdaRegexEntries ?? [];
  return entries.map((entry, index) =>
    normalizeRuleRow({
      class_slug: classSlug,
      sort_order: sortStart + index,
      pattern: entry.pattern,
      replacement: entry.replacement,
      case_sensitive: Boolean(entry.caseSensitive),
      rule_type: Number(entry.type ?? entry.rule_type ?? 1) || 0,
      comment: Array.isArray(entry.comments) ? entry.comments.join("; ") : entry.comment ?? null,
    }),
  );
}

export function rowToDicLine(row) {
  const cs = row.case_sensitive ? "1" : "0";
  const type = String(row.rule_type ?? 0);
  return `${row.pattern}\t${row.replacement}\t${cs}\t${type}`;
}

export function rowsToDic(rows) {
  return (
    [...rows]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(rowToDicLine)
      .join("\n") + "\n"
  );
}

/**
 * Dictionary Builder (screenreader repo) stores rows in public.entries.
 * Map to the same shape as dictionary_rules for HearSay.
 */
/** Editor rows from legacy dictionary_rules (skips regex-only type-1 rules). */
export function ruleRowsToEntryRows(ruleRows) {
  return (ruleRows ?? [])
    .filter((r) => Number(r.rule_type ?? 0) !== 1)
    .map((r) => ({
      text: String(r.pattern ?? "").trim(),
      substitution: String(r.replacement ?? "").trim(),
      app: "All Apps",
      ignore_case: r.case_sensitive ? "No" : "Yes",
      note: String(r.comment ?? "").trim(),
    }))
    .filter((r) => r.text && r.substitution);
}

export function entriesToRuleRows(entries) {
  const out = [];
  for (const [i, e] of (entries ?? []).entries()) {
    const pattern = String(e.text ?? "").trim();
    const replacement = String(e.substitution ?? "").trim();
    if (!pattern || !replacement) continue;
    const ignore = String(e.ignore_case ?? "Yes").trim();
    const case_sensitive = /^no$/i.test(ignore) || ignore === "0";
    out.push(
      normalizeRuleRow({
        class_slug: e.class_slug,
        sort_order: Number(e.position) || i,
        pattern,
        replacement,
        case_sensitive,
        rule_type: e.rule_type != null ? Number(e.rule_type) : inferRuleType(pattern),
        comment: String(e.note ?? "").trim() || null,
      }),
    );
  }
  return out;
}

/** Merge class rows: later list overrides earlier by pattern; append unseen patterns. */
export function mergeRuleRowsByPattern(...lists) {
  const byPattern = new Map();
  for (const list of lists) {
    for (const row of list ?? []) {
      if (!row?.pattern) continue;
      byPattern.set(row.pattern, row);
    }
  }
  return [...byPattern.values()].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}


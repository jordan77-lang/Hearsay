// Convert between NVDA .dic lines and Supabase dictionary_rules rows.

export function rowClassId(row) {
  return row.class_slug ?? row.course_id;
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

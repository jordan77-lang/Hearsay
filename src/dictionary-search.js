// Search helpers for Dictionary editor.

export function parseSearchTerms(q) {
  return String(q ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function rowMatchesSearch(row, terms, field) {
  if (!terms.length) return true;
  const pattern = String(row.text ?? "").toLowerCase();
  const spoken = String(row.substitution ?? "").toLowerCase();
  const note = String(row.note ?? "").toLowerCase();
  const haystack =
    field === "pattern"
      ? pattern
      : field === "spoken"
        ? spoken
        : field === "note"
          ? note
          : `${pattern} ${spoken} ${note}`;
  return terms.every((t) => haystack.includes(t));
}

export function filterRowIndices(rows, query, field = "all") {
  const terms = parseSearchTerms(query);
  if (!terms.length) return rows.map((_, i) => i);
  return rows.map((_, i) => i).filter((i) => rowMatchesSearch(rows[i], terms, field));
}

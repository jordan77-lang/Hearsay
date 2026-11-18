import { sameDictionaryRows, mergeApprovedRows } from "./ai-review.js";

export function dictionaryChanges(before, after) {
  const previous = new Map(before.map(row => [row.text, row]));
  const next = new Map(after.map(row => [row.text, row]));
  return {
    additions: [...next.keys()].filter(term => !previous.has(term)),
    replacements: [...next.keys()].filter(term => previous.has(term) && !sameDictionaryRows([previous.get(term)], [next.get(term)])),
    removals: [...previous.keys()].filter(term => !next.has(term)),
  };
}

export function combineWorkspaceChanges(saved, edited, approved) {
  if (edited.some(row => !String(row.text || "").trim() || !String(row.substitution || "").trim())) {
    throw new Error("Complete the written text and pronunciation for every dictionary row before saving.");
  }
  const changed = dictionaryChanges(saved, edited);
  for (const { row } of approved) {
    if (changed.removals.includes(row.text)) throw new Error(`${row.text} was removed in Class dictionary and approved in Review content. Keep one of those changes before saving.`);
    const existing = edited.find(item => item.text === row.text);
    if ((changed.additions.includes(row.text) || changed.replacements.includes(row.text)) && existing &&
        (existing.substitution !== row.substitution || existing.ignore_case !== row.ignore_case)) {
      throw new Error(`${row.text} has different drafts in Class dictionary and Review content. Make the readings agree or skip the review suggestion.`);
    }
  }
  return mergeApprovedRows(edited, approved);
}

export function rebaseWorkspaceRows(before, edited, remote) {
  const base = new Map(before.map(row => [row.text, row])), local = new Map(edited.map(row => [row.text, row])), shared = new Map(remote.map(row => [row.text, row]));
  const rows = [], conflicts = [];
  const same = (a, b) => (!a && !b) || Boolean(a && b && sameDictionaryRows([a], [b]));
  for (const term of new Set([...shared.keys(), ...local.keys(), ...base.keys()])) {
    const old = base.get(term), mine = local.get(term), theirs = shared.get(term);
    const localChanged = !same(old, mine), remoteChanged = !same(old, theirs);
    if (localChanged && remoteChanged && !same(mine, theirs)) conflicts.push({ term, local: mine, remote: theirs });
    const next = localChanged ? mine : theirs;
    if (next) rows.push({ ...next });
  }
  return { rows, conflicts };
}

// Shared by Lab and Dictionary. Undo refuses to overwrite intervening changes.
const PREFIX = "hearsay-dictionary-history-v1";
export function cleanHistoryRows(rows) {
  return rows.map(r => ({ text: String(r.text ?? "").trim(), substitution: String(r.substitution ?? "").trim(),
    app: String(r.app || "All Apps").trim(), ignore_case: String(r.ignore_case || "Yes").trim(), note: String(r.note ?? "").trim() })).filter(r => r.text && r.substitution);
}
function key(scope, course) { return `${PREFIX}:${scope}:${course}`; }
export function dictionaryHistory(storage, scope, course) {
  try { const data = JSON.parse(storage?.getItem(key(scope, course)) ?? "[]"); return Array.isArray(data) ? data : []; }
  catch { return []; }
}
export function rememberDictionaryChange(storage, scope, course, before, after, label = "dictionary change") {
  const oldRows = cleanHistoryRows(before), newRows = cleanHistoryRows(after);
  if (JSON.stringify(oldRows) === JSON.stringify(newRows)) return true;
  const history = dictionaryHistory(storage, scope, course);
  history.push({ before: oldRows, after: newRows, label });
  try { storage.setItem(key(scope, course), JSON.stringify(history.slice(-10))); return true; }
  catch { return false; }
}
export async function undoDictionaryChange(api, storage, scope, course) {
  const history = dictionaryHistory(storage, scope, course);
  const change = history.at(-1);
  if (!change) throw new Error("No saved dictionary change to undo for this course.");
  const current = cleanHistoryRows(await api.fetchEntryRecords(course));
  if (JSON.stringify(current) !== JSON.stringify(change.after)) throw new Error("The course dictionary changed since this edit. Reload and review it before undoing.");
  await api.saveEntryRecords(course, change.before);
  history.pop();
  try { storage.setItem(key(scope, course), JSON.stringify(history)); }
  catch { /* Remote undo succeeded even if browser storage is unavailable. */ }
  return change;
}

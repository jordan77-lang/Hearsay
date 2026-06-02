// Searchable modal listing the full effective dictionary for a class:
// the bundled base rules plus the class-specific rules stored in Supabase.
// Each row shows its source; class rows (and bundled rows, which become a
// class override when saved) have an Edit action that prefills the add form.

import { normalizeRuleRows, rowClassId } from "./dictionary-format.js";
import { COMBINED_COURSE_ID } from "./dictionary-api.js";
import { getActiveRules } from "../core/dictionary.js";

const TYPE_LABEL = {
  0: "Anywhere",
  1: "Regex",
  2: "Whole word",
};

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {{
 *   api: object,
 *   courseId: string,
 *   courseLabel?: string,
 *   onEdit?: (rule: { pattern: string, replacement: string, rule_type: number, case_sensitive: boolean }) => void,
 * }} opts
 */
export function openDictionaryViewer({ api, courseId, courseLabel, onEdit }) {
  const label = courseLabel ?? courseId;
  const editable = courseId !== COMBINED_COURSE_ID;

  const overlay = document.createElement("div");
  overlay.className = "ss-modal-overlay";
  overlay.innerHTML = `
    <div class="ss-modal ss-dict-viewer-modal" role="dialog" aria-modal="true" aria-labelledby="ss-dv-title">
      <div class="ss-dv-head">
        <h2 id="ss-dv-title" class="ss-title" style="margin:0">Dictionary · ${escapeHtml(label)}</h2>
        <button type="button" class="ss-btn" id="ss-dv-close" aria-label="Close">\u2715</button>
      </div>
      <div class="ss-dv-controls">
        <input id="ss-dv-search" class="ss-input ss-dv-search" type="search" spellcheck="false"
          placeholder="Search pattern or spoken text\u2026" autocomplete="off" aria-label="Search rules" />
        <label class="ss-type">Source:
          <select id="ss-dv-source" class="ss-btn">
            <option value="all">All</option>
            <option value="class">Class only</option>
            <option value="bundled">Bundled only</option>
          </select>
        </label>
        <span class="ss-type ss-dv-count" id="ss-dv-count" aria-live="polite"></span>
      </div>
      <div class="ss-dv-tablewrap" id="ss-dv-tablewrap" tabindex="0">
        <div class="ss-type ss-dv-status" id="ss-dv-status">Loading rules\u2026</div>
        <table class="ss-dv-table hidden" id="ss-dv-table">
          <thead>
            <tr>
              <th scope="col">Pattern</th>
              <th scope="col">Spoken</th>
              <th scope="col">Type</th>
              <th scope="col">Source</th>
              ${editable ? '<th scope="col"><span class="ss-dv-sr">Actions</span></th>' : ""}
            </tr>
          </thead>
          <tbody id="ss-dv-body"></tbody>
        </table>
      </div>
      <div class="ss-modal-actions">
        <button type="button" class="ss-btn primary" id="ss-dv-done">Done</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const searchInput = overlay.querySelector("#ss-dv-search");
  const sourceSelect = overlay.querySelector("#ss-dv-source");
  const countEl = overlay.querySelector("#ss-dv-count");
  const statusEl = overlay.querySelector("#ss-dv-status");
  const tableEl = overlay.querySelector("#ss-dv-table");
  const bodyEl = overlay.querySelector("#ss-dv-body");

  let rules = [];

  function close() {
    document.removeEventListener("keydown", onDocKey);
    overlay.remove();
  }

  function onDocKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onDocKey);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector("#ss-dv-close").addEventListener("click", close);
  overlay.querySelector("#ss-dv-done").addEventListener("click", close);

  const colCount = editable ? 5 : 4;

  function renderRows(list) {
    if (!list.length) {
      bodyEl.innerHTML = `<tr><td class="ss-dv-empty" colspan="${colCount}">No matching rules.</td></tr>`;
      return;
    }
    bodyEl.innerHTML = list
      .map((r, i) => {
        const type = TYPE_LABEL[Number(r.rule_type)] ?? "Anywhere";
        const cs = r.case_sensitive ? ' <span class="ss-dv-flag" title="Case sensitive">Aa</span>' : "";
        const sourceBadge = r.isClass
          ? '<span class="ss-dv-badge ss-dv-badge-class">Class</span>'
          : '<span class="ss-dv-badge ss-dv-badge-bundled">Bundled</span>';
        const editBtn = editable
          ? `<td class="ss-dv-actions"><button type="button" class="ss-btn ss-dv-edit" data-idx="${i}" title="${
              r.isClass ? "Edit this class rule" : "Create a class override for this rule"
            }">Edit</button></td>`
          : "";
        return `<tr>
          <td class="ss-dv-pattern"><code>${escapeHtml(r.pattern)}</code></td>
          <td class="ss-dv-spoken">${escapeHtml(r.replacement)}</td>
          <td class="ss-dv-type">${type}${cs}</td>
          <td class="ss-dv-source-cell">${sourceBadge}</td>
          ${editBtn}
        </tr>`;
      })
      .join("");
  }

  function applyFilter() {
    const q = searchInput.value.trim().toLowerCase();
    const src = sourceSelect.value;
    const filtered = rules.filter((r) => {
      if (src === "class" && !r.isClass) return false;
      if (src === "bundled" && r.isClass) return false;
      if (!q) return true;
      return (
        String(r.pattern).toLowerCase().includes(q) ||
        String(r.replacement).toLowerCase().includes(q)
      );
    });
    const classTotal = rules.filter((r) => r.isClass).length;
    countEl.textContent =
      q || src !== "all"
        ? `${filtered.length} of ${rules.length} rules`
        : `${rules.length} rules · ${classTotal} class-specific`;
    renderRows(filtered);
    return filtered;
  }

  bodyEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".ss-dv-edit");
    if (!btn) return;
    const filtered = applyFilter();
    const rule = filtered[Number(btn.dataset.idx)];
    if (!rule) return;
    close();
    onEdit?.({
      pattern: rule.pattern,
      replacement: rule.replacement,
      rule_type: Number(rule.rule_type) || 0,
      case_sensitive: Boolean(rule.case_sensitive),
    });
  });

  searchInput.addEventListener("input", applyFilter);
  sourceSelect.addEventListener("change", applyFilter);

  (async () => {
    try {
      // Class-specific rows from Supabase tell us which active rules are editable
      // (and which are bundled defaults).
      let classPatterns = new Set();
      try {
        const result = await api.fetchRulesWithMeta(courseId);
        const classRows = normalizeRuleRows(result.rows ?? []).filter(
          (r) => courseId === COMBINED_COURSE_ID || rowClassId(r) === courseId || rowClassId(r) == null,
        );
        classPatterns = new Set(classRows.map((r) => r.pattern));
      } catch {
        // If the remote fetch fails, still show the active dictionary below.
      }

      // The full effective dictionary in memory (bundled base + class merged).
      rules = getActiveRules().map((r) => ({ ...r, isClass: classPatterns.has(r.pattern) }));

      statusEl.classList.add("hidden");
      tableEl.classList.remove("hidden");
      applyFilter();
      searchInput.focus();
    } catch (err) {
      statusEl.textContent = err?.message ?? String(err);
    }
  })();
}

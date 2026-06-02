// Read-only, searchable modal listing every rule in a class dictionary.
// Each row has an Edit action that hands the rule back to the panel's add form
// (which upserts), so editing works without a full inline-edit grid here.

import { normalizeRuleRows, rowClassId } from "./dictionary-format.js";
import { COMBINED_COURSE_ID } from "./dictionary-api.js";

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

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
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

  function renderRows(list) {
    if (!list.length) {
      bodyEl.innerHTML = `<tr><td class="ss-dv-empty" colspan="${editable ? 4 : 3}">No matching rules.</td></tr>`;
      return;
    }
    bodyEl.innerHTML = list
      .map((r, i) => {
        const type = TYPE_LABEL[Number(r.rule_type)] ?? "Anywhere";
        const cs = r.case_sensitive ? ' <span class="ss-dv-flag" title="Case sensitive">Aa</span>' : "";
        const editBtn = editable
          ? `<td class="ss-dv-actions"><button type="button" class="ss-btn ss-dv-edit" data-idx="${i}">Edit</button></td>`
          : "";
        return `<tr>
          <td class="ss-dv-pattern"><code>${escapeHtml(r.pattern)}</code></td>
          <td class="ss-dv-spoken">${escapeHtml(r.replacement)}</td>
          <td class="ss-dv-type">${type}${cs}</td>
          ${editBtn}
        </tr>`;
      })
      .join("");
  }

  function applyFilter() {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = q
      ? rules.filter(
          (r) =>
            String(r.pattern).toLowerCase().includes(q) ||
            String(r.replacement).toLowerCase().includes(q),
        )
      : rules;
    countEl.textContent = q
      ? `${filtered.length} of ${rules.length} rules`
      : `${rules.length} rules`;
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

  (async () => {
    try {
      const result = await api.fetchRulesWithMeta(courseId);
      rules = normalizeRuleRows(result.rows ?? []).sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      // Keep only rules belonging to this class for single-class views.
      if (courseId !== COMBINED_COURSE_ID) {
        rules = rules.filter((r) => rowClassId(r) === courseId || rowClassId(r) == null);
      }
      statusEl.classList.add("hidden");
      tableEl.classList.remove("hidden");
      applyFilter();
      searchInput.focus();
    } catch (err) {
      statusEl.textContent = err?.message ?? String(err);
    }
  })();
}

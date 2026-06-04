// Starter dictionary + copy-from-class picker when creating a new class.

import { mergeImportRows } from "./dictionary-import.js";
import {
  STARTER_CATEGORIES,
  STARTER_PRESETS,
  getAllStarterRows,
  getStarterRowIdsForPreset,
  getStarterRowsByIds,
  getStarterGroupRowIds,
  STARTER_PRONUNCIATION_ROWS,
} from "./starter-pronunciation-catalog.js";

export { STARTER_PRONUNCIATION_ROWS };

const CLASS_COPY_PRESETS = [
  { id: "all", label: "All terms", hint: "Copy every row from the source class" },
  { id: "custom", label: "Pick individually", hint: "Choose specific rows" },
];

const PRIMARY_CATALOG_PRESET_IDS = new Set([
  "essentials",
  "metric",
  "science-chem",
  "all",
  "custom",
]);

/**
 * @typedef {{ slug: string, label: string, rows: Array<{ text: string, substitution: string, ignore_case?: string, note?: string, app?: string }> }} SourceClassOption
 * @param {{
 *   classLabel: string,
 *   sourceClasses?: SourceClassOption[],
 *   onAdd: (rows: Array<{ text: string, substitution: string, ignore_case?: string, note?: string, app?: string }>) => void,
 *   onSkip?: () => void,
 * }} opts
 */
export function openStarterPronunciationsModal({
  classLabel,
  sourceClasses = [],
  onAdd,
  onSkip,
}) {
  const sources = sourceClasses
    .map((c) => ({
      slug: c.slug,
      label: c.label,
      rows: (c.rows ?? [])
        .map(toEntryRow)
        .filter((r) => r.text && r.substitution),
    }))
    .filter((c) => c.rows.length > 0);
  const hasSources = sources.length > 0;
  const catalogTotal = getAllStarterRows().length;
  const firstSourceLabel = sources[0]?.label ?? "another class";

  const overlay = document.createElement("div");
  overlay.className = "ss-modal-overlay";
  overlay.innerHTML = `
    <div class="ss-modal hs-starter-modal" role="dialog" aria-modal="true" aria-labelledby="hs-starter-title">
      <header class="hs-starter-head">
        <h2 id="hs-starter-title" class="ss-title hs-starter-title">Set up ${escapeHtml(classLabel)}</h2>
        <p class="ss-sub hs-starter-intro">Choose a starter bundle, copy an existing class, or combine both. You can fine-tune individual terms only when you need to.</p>
      </header>
      <div class="hs-starter-body">
        <fieldset class="hs-starter-path-fieldset">
          <legend class="hs-starter-path-legend">How would you like to start?</legend>
          <div class="hs-starter-path-grid" role="radiogroup" aria-label="Starting point">
            <label class="hs-starter-path-card">
              <input type="radio" name="hs-starter-path" class="hs-starter-path-radio" value="catalog" checked />
              <span class="hs-starter-path-title">Starter bundle</span>
              <span class="hs-starter-path-desc">Recommended — ${catalogTotal} built-in units &amp; science terms</span>
            </label>
            ${
              hasSources
                ? `<label class="hs-starter-path-card">
              <input type="radio" name="hs-starter-path" class="hs-starter-path-radio" value="class" />
              <span class="hs-starter-path-title">Copy a class</span>
              <span class="hs-starter-path-desc">Reuse terms from ${escapeHtml(firstSourceLabel)} or another saved class</span>
            </label>`
                : ""
            }
          </div>
        </fieldset>

        ${
          hasSources
            ? `<label class="hs-starter-combine hs-starter-combine-catalog hidden" id="hs-starter-combine-class-wrap">
          <input type="checkbox" id="hs-starter-combine-class" />
          <span>Also copy terms from another class</span>
        </label>
        <label class="hs-starter-combine hs-starter-combine-class hidden" id="hs-starter-combine-catalog-wrap">
          <input type="checkbox" id="hs-starter-combine-catalog" />
          <span>Also add a starter bundle</span>
        </label>`
            : ""
        }

        <section class="hs-starter-panel hs-starter-panel-catalog" id="hs-starter-panel-catalog" aria-labelledby="hs-starter-catalog-h">
          <div class="hs-starter-section-head">
            <h3 id="hs-starter-catalog-h" class="hs-starter-section-title">Starter bundle</h3>
            <p class="hs-starter-section-lead ss-type">Pick a preset — customize only if you need specific rows.</p>
          </div>
          <fieldset class="hs-starter-presets">
            <legend class="hs-starter-presets-legend">Presets</legend>
            <div class="hs-starter-preset-grid" id="hs-starter-preset-grid" role="radiogroup" aria-label="Catalog presets"></div>
            <details class="hs-starter-more-presets" id="hs-starter-more-presets">
              <summary class="hs-starter-more-presets-summary">More preset bundles</summary>
              <div class="hs-starter-preset-grid hs-starter-preset-grid-more" id="hs-starter-preset-grid-more" role="radiogroup" aria-label="More catalog presets"></div>
            </details>
          </fieldset>
          <p id="hs-starter-catalog-summary" class="hs-starter-selection-summary ss-type" aria-live="polite"></p>
          <details class="hs-starter-customize" id="hs-starter-catalog-customize">
            <summary class="hs-starter-customize-summary">Browse &amp; customize terms</summary>
            <p class="hs-starter-customize-hint ss-type">Open a category to see terms. Check rows or use group checkboxes to adjust your bundle.</p>
            <div class="hs-starter-toolbar">
              <input type="search" id="hs-starter-catalog-search" class="ss-input hs-starter-search" placeholder="Search catalog…" autocomplete="off" />
              <button type="button" class="ss-btn hs-starter-toolbar-btn" id="hs-starter-tree-expand">Expand all</button>
              <button type="button" class="ss-btn hs-starter-toolbar-btn" id="hs-starter-tree-collapse">Collapse all</button>
              <button type="button" class="ss-btn hs-starter-toolbar-btn" id="hs-starter-all">Select all</button>
              <button type="button" class="ss-btn hs-starter-toolbar-btn" id="hs-starter-none">Clear all</button>
            </div>
            <div class="hs-starter-tree" id="hs-starter-tree"></div>
          </details>
        </section>

        ${
          hasSources
            ? `<section class="hs-starter-panel hs-starter-panel-class hidden" id="hs-starter-panel-class" aria-labelledby="hs-starter-class-h">
          <div class="hs-starter-section-head">
            <h3 id="hs-starter-class-h" class="hs-starter-section-title">Copy from another class</h3>
            <p class="hs-starter-section-lead ss-type">Choose a source class and how much to copy.</p>
          </div>
          <label class="hs-starter-source-field">
            <span class="hs-starter-field-label">Source class</span>
            <select id="hs-starter-source-class" class="ss-btn"></select>
          </label>
          <fieldset class="hs-starter-presets hs-starter-class-presets">
            <legend class="hs-starter-presets-legend">How much to copy</legend>
            <div class="hs-starter-preset-grid hs-starter-class-preset-grid" id="hs-starter-class-preset-grid" role="radiogroup" aria-label="Copy presets"></div>
          </fieldset>
          <p id="hs-starter-class-summary" class="hs-starter-selection-summary ss-type" aria-live="polite"></p>
          <details class="hs-starter-customize hs-starter-class-customize hidden" id="hs-starter-class-customize">
            <summary class="hs-starter-customize-summary">Pick individual terms</summary>
            <div class="hs-starter-toolbar">
              <input type="search" id="hs-starter-class-search" class="ss-input hs-starter-search" placeholder="Search class terms…" autocomplete="off" />
              <button type="button" class="ss-btn hs-starter-toolbar-btn" id="hs-starter-class-all">Select all</button>
              <button type="button" class="ss-btn hs-starter-toolbar-btn" id="hs-starter-class-none">Clear all</button>
            </div>
            <div class="hs-starter-tree hs-starter-class-tree" id="hs-starter-class-list"></div>
            <p id="hs-starter-class-empty" class="ss-sub hs-starter-empty hidden">No terms in this class.</p>
          </details>
        </section>`
            : ""
        }
      </div>
      <footer class="hs-starter-footer">
        <p id="hs-starter-selected-count" class="hs-starter-footer-summary ss-type" aria-live="polite"></p>
        <div class="hs-starter-footer-actions">
          <button type="button" class="ss-btn" id="hs-starter-skip">Start empty</button>
          <button type="button" class="ss-btn primary" id="hs-starter-add">Add selected</button>
        </div>
      </footer>
    </div>`;

  const countEl = overlay.querySelector("#hs-starter-selected-count");
  const addBtn = overlay.querySelector("#hs-starter-add");
  const classListEl = overlay.querySelector("#hs-starter-class-list");
  const classEmptyEl = overlay.querySelector("#hs-starter-class-empty");
  const classSummaryEl = overlay.querySelector("#hs-starter-class-summary");
  const classCustomizeEl = overlay.querySelector("#hs-starter-class-customize");
  const sourceSelect = overlay.querySelector("#hs-starter-source-class");
  const treeEl = overlay.querySelector("#hs-starter-tree");
  const catalogCustomizeEl = overlay.querySelector("#hs-starter-catalog-customize");
  const catalogSummaryEl = overlay.querySelector("#hs-starter-catalog-summary");
  const catalogPanel = overlay.querySelector("#hs-starter-panel-catalog");
  const classPanel = overlay.querySelector("#hs-starter-panel-class");
  const combineClassWrap = overlay.querySelector("#hs-starter-combine-class-wrap");
  const combineCatalogWrap = overlay.querySelector("#hs-starter-combine-catalog-wrap");
  const combineClassCb = overlay.querySelector("#hs-starter-combine-class");
  const combineCatalogCb = overlay.querySelector("#hs-starter-combine-catalog");
  const presetGrid = overlay.querySelector("#hs-starter-preset-grid");
  const presetGridMore = overlay.querySelector("#hs-starter-preset-grid-more");
  const classPresetGrid = overlay.querySelector("#hs-starter-class-preset-grid");
  const classSearch = overlay.querySelector("#hs-starter-class-search");
  const catalogSearch = overlay.querySelector("#hs-starter-catalog-search");

  let applyingCatalogPreset = false;
  let applyingClassPreset = false;
  let activeSourceSlug = sources[0]?.slug ?? "";
  let classListRendered = false;
  let activePath = "catalog";

  if (classPresetGrid) {
    for (const preset of CLASS_COPY_PRESETS) {
      classPresetGrid.appendChild(renderPresetOption(preset, "hs-starter-class-preset"));
    }
  }

  for (const preset of STARTER_PRESETS) {
    const target = PRIMARY_CATALOG_PRESET_IDS.has(preset.id) ? presetGrid : presetGridMore;
    target.appendChild(renderPresetOption(preset, "hs-starter-preset"));
  }

  if (sourceSelect) {
    for (const src of sources) {
      const opt = document.createElement("option");
      opt.value = src.slug;
      opt.textContent = `${src.label} (${src.rows.length})`;
      sourceSelect.appendChild(opt);
    }
  }

  buildCatalogTree(treeEl);

  function getSourceRows() {
    return sources.find((s) => s.slug === activeSourceSlug)?.rows ?? [];
  }

  function getPath() {
    const radio = overlay.querySelector(".hs-starter-path-radio:checked");
    return radio?.value === "class" ? "class" : "catalog";
  }

  function includeClassCopy() {
    if (!hasSources) return false;
    return activePath === "class" || Boolean(combineClassCb?.checked);
  }

  function includeCatalogCopy() {
    return activePath === "catalog" || Boolean(combineCatalogCb?.checked);
  }

  function syncPathUi() {
    activePath = getPath();
    const onClass = activePath === "class";
    combineClassWrap?.classList.toggle("hidden", onClass || !hasSources);
    combineCatalogWrap?.classList.toggle("hidden", !onClass || !hasSources);
    catalogPanel?.classList.toggle("hidden", !includeCatalogCopy());
    classPanel?.classList.toggle("hidden", !includeClassCopy());
    updateCatalogSummary();
    updateClassSummary();
    updateTotalCount();
  }

  function renderClassCopyList() {
    if (!classListEl) return;
    classListEl.innerHTML = "";
    const rows = getSourceRows();
    classEmptyEl?.classList.toggle("hidden", rows.length > 0);
    if (!rows.length) return;
    classListEl.appendChild(
      renderEntryCheckboxList(rows, {
        checkboxClass: "hs-starter-copy-check",
        keyAttr: "data-copy-idx",
        useRowIndex: true,
      }),
    );
    applyClassCopyPreset(getClassPresetId());
    filterClassList(classSearch?.value ?? "");
    classListRendered = true;
  }

  function ensureClassListRendered() {
    if (!classListRendered) renderClassCopyList();
  }

  function getClassPresetId() {
    const radio = overlay.querySelector(".hs-starter-class-preset-radio:checked");
    return radio?.value ?? "all";
  }

  function getCatalogPresetId() {
    const radio = overlay.querySelector(".hs-starter-preset-radio:checked");
    return radio?.value ?? "essentials";
  }

  function setClassPresetRadio(id) {
    const radio = overlay.querySelector(`.hs-starter-class-preset-radio[value="${id}"]`);
    if (radio) radio.checked = true;
  }

  function applyClassCopyPreset(presetId) {
    if (presetId === "custom") {
      classCustomizeEl?.classList.remove("hidden");
      classCustomizeEl.open = true;
      ensureClassListRendered();
    } else {
      classCustomizeEl?.classList.add("hidden");
    }
    if (presetId !== "custom") {
      applyingClassPreset = true;
      for (const cb of overlay.querySelectorAll(".hs-starter-copy-check")) {
        cb.checked = presetId === "all";
      }
      applyingClassPreset = false;
    }
    updateClassSummary();
    updateTotalCount();
  }

  function setAllClassCopy(checked) {
    setClassPresetRadio(checked ? "all" : "custom");
    applyClassCopyPreset(checked ? "all" : "custom");
    if (!checked) ensureClassListRendered();
  }

  function getSelectedCopyRows() {
    if (!includeClassCopy()) return [];
    const preset = getClassPresetId();
    if (preset === "all") {
      return getSourceRows().map(toEntryRow);
    }
    ensureClassListRendered();
    const rows = getSourceRows();
    return [...overlay.querySelectorAll(".hs-starter-copy-check")]
      .filter((cb) => cb.checked && !cb.closest(".hs-starter-item")?.hidden)
      .map((cb) => rows[Number(cb.dataset.copyIdx)])
      .filter(Boolean)
      .map(toEntryRow);
  }

  function updateClassSummary() {
    if (!classSummaryEl || !includeClassCopy()) {
      classSummaryEl && (classSummaryEl.textContent = "");
      return;
    }
    const rows = getSourceRows();
    const preset = getClassPresetId();
    const src = sources.find((s) => s.slug === activeSourceSlug);
    if (!rows.length) {
      classSummaryEl.textContent = "No terms in the selected class.";
      return;
    }
    if (preset === "all") {
      classSummaryEl.textContent = `All ${rows.length} term${rows.length === 1 ? "" : "s"} from ${src?.label ?? activeSourceSlug} will be copied.`;
      return;
    }
    ensureClassListRendered();
    const checks = [...overlay.querySelectorAll(".hs-starter-copy-check")].filter(
      (c) => !c.closest(".hs-starter-item")?.hidden,
    );
    const on = checks.filter((c) => c.checked).length;
    classSummaryEl.textContent = `${on} of ${rows.length} term${rows.length === 1 ? "" : "s"} selected from ${src?.label ?? activeSourceSlug}.`;
  }

  function getSelectedCatalogIds() {
    if (!includeCatalogCopy()) return [];
    return [...overlay.querySelectorAll(".hs-starter-check")]
      .filter((cb) => cb.checked && !cb.closest(".hs-starter-item")?.hidden)
      .map((cb) => cb.dataset.rowId)
      .filter(Boolean);
  }

  function presetLabel(presetId) {
    return STARTER_PRESETS.find((p) => p.id === presetId)?.label ?? presetId;
  }

  function updateCatalogSummary() {
    if (!catalogSummaryEl || !includeCatalogCopy()) {
      catalogSummaryEl && (catalogSummaryEl.textContent = "");
      return;
    }
    const presetId = getCatalogPresetId();
    const n = getSelectedCatalogIds().length;
    if (presetId === "custom") {
      catalogSummaryEl.textContent =
        n === 0
          ? "No catalog terms selected — open categories below or pick a preset."
          : `${n} catalog term${n === 1 ? "" : "s"} selected individually.`;
      return;
    }
    catalogSummaryEl.textContent = `${n} term${n === 1 ? "" : "s"} · ${presetLabel(presetId)} preset`;
  }

  function updateTotalCount() {
    const nClass = getSelectedCopyRows().length;
    const nCatalog = getSelectedCatalogIds().length;
    const n = nClass + nCatalog;
    const parts = [];
    if (nClass) parts.push(`${nClass} from class`);
    if (nCatalog) parts.push(`${nCatalog} from catalog`);
    countEl.textContent = n
      ? `${n} term${n === 1 ? "" : "s"} ready${parts.length ? ` · ${parts.join(" + ")}` : ""}`
      : "No terms selected yet";
    addBtn.textContent = n ? `Add ${n} term${n === 1 ? "" : "s"}` : "Add selected";
    addBtn.disabled = n === 0;
    updateCatalogGroupMeta();
    updateCatalogSummary();
    updateClassSummary();
  }

  function updateCatalogGroupMeta() {
    for (const meta of overlay.querySelectorAll("[data-group-meta]")) {
      const gid = meta.dataset.groupMeta;
      const ids = new Set(getStarterGroupRowIds(gid));
      const checks = [...overlay.querySelectorAll(".hs-starter-check")].filter(
        (cb) => ids.has(cb.dataset.rowId) && !cb.closest(".hs-starter-item")?.hidden,
      );
      const on = checks.filter((c) => c.checked).length;
      meta.textContent = checks.length ? `${on}/${checks.length}` : "";
      const groupCb = overlay.querySelector(
        `.hs-starter-group-check[data-group-id="${gid}"]`,
      );
      if (groupCb && checks.length) {
        groupCb.checked = on === checks.length;
        groupCb.indeterminate = on > 0 && on < checks.length;
      }
    }
  }

  function applyCatalogRowIds(ids) {
    applyingCatalogPreset = true;
    const set = new Set(ids);
    for (const cb of overlay.querySelectorAll(".hs-starter-check")) {
      cb.checked = set.has(cb.dataset.rowId);
    }
    applyingCatalogPreset = false;
    updateTotalCount();
  }

  function applyCatalogPreset(presetId) {
    if (presetId === "custom") {
      catalogCustomizeEl.open = true;
      updateTotalCount();
      return;
    }
    applyCatalogRowIds(getStarterRowIdsForPreset(presetId));
  }

  function setCatalogPresetRadio(presetId) {
    const radio = overlay.querySelector(`.hs-starter-preset-radio[value="${presetId}"]`);
    if (radio) {
      radio.checked = true;
      if (!PRIMARY_CATALOG_PRESET_IDS.has(presetId)) {
        overlay.querySelector("#hs-starter-more-presets")?.setAttribute("open", "");
      }
    }
  }

  function setTreeOpen(root, open) {
    for (const el of root.querySelectorAll(".hs-starter-category, .hs-starter-subcategory")) {
      el.open = open;
    }
  }

  function filterListItems(root, query) {
    const q = String(query ?? "")
      .trim()
      .toLowerCase();
    for (const item of root.querySelectorAll(".hs-starter-item")) {
      const text = item.textContent?.toLowerCase() ?? "";
      item.hidden = Boolean(q) && !text.includes(q);
    }
    for (const block of root.querySelectorAll(".hs-starter-category, .hs-starter-subcategory")) {
      const visibleItems = [...block.querySelectorAll(".hs-starter-item")].some((el) => !el.hidden);
      const visibleLists = [...block.querySelectorAll(".hs-starter-list")].some(
        (list) => list.children.length && [...list.querySelectorAll(".hs-starter-item")].some((el) => !el.hidden),
      );
      block.hidden = Boolean(q) && !visibleItems && !visibleLists;
      if (q && !block.hidden) block.open = true;
    }
  }

  function filterClassList(query) {
    if (!classListEl) return;
    filterListItems(classListEl, query);
    updateClassSummary();
    updateTotalCount();
  }

  function filterCatalogList(query) {
    filterListItems(treeEl, query);
    updateCatalogGroupMeta();
    updateTotalCount();
  }

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKeydown);
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onSkip?.();
      close();
    }
  }

  function collectSelectedRows() {
    const fromClass = getSelectedCopyRows();
    const fromCatalog = getStarterRowsByIds(getSelectedCatalogIds()).map((r) => ({
      ...r,
      app: "All Apps",
    }));
    return mergeImportRows(fromCatalog, fromClass);
  }

  overlay.querySelectorAll(".hs-starter-path-radio").forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      syncPathUi();
    });
  });

  combineClassCb?.addEventListener("change", syncPathUi);
  combineCatalogCb?.addEventListener("change", syncPathUi);

  if (sourceSelect) {
    sourceSelect.addEventListener("change", () => {
      activeSourceSlug = sourceSelect.value;
      classListRendered = false;
      if (getClassPresetId() === "custom") renderClassCopyList();
      updateClassSummary();
      updateTotalCount();
    });
  }

  overlay.querySelectorAll(".hs-starter-class-preset-radio").forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      applyClassCopyPreset(radio.value);
    });
  });

  overlay.querySelectorAll(".hs-starter-preset-radio").forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      applyCatalogPreset(radio.value);
    });
  });

  overlay.querySelector("#hs-starter-class-all")?.addEventListener("click", () => {
    setAllClassCopy(true);
  });
  overlay.querySelector("#hs-starter-class-none")?.addEventListener("click", () => {
    setAllClassCopy(false);
  });
  overlay.querySelector("#hs-starter-all")?.addEventListener("click", () => {
    setCatalogPresetRadio("all");
    applyCatalogPreset("all");
  });
  overlay.querySelector("#hs-starter-none")?.addEventListener("click", () => {
    setCatalogPresetRadio("custom");
    applyCatalogRowIds([]);
  });
  overlay.querySelector("#hs-starter-tree-expand")?.addEventListener("click", () => {
    setTreeOpen(treeEl, true);
  });
  overlay.querySelector("#hs-starter-tree-collapse")?.addEventListener("click", () => {
    setTreeOpen(treeEl, false);
  });

  classSearch?.addEventListener("input", () => filterClassList(classSearch.value));
  catalogSearch?.addEventListener("input", () => filterCatalogList(catalogSearch.value));

  overlay.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.classList.contains("hs-starter-group-check")) {
      e.stopPropagation();
      const gid = t.dataset.groupId;
      const ids = new Set(getStarterGroupRowIds(gid));
      const checks = [...overlay.querySelectorAll(".hs-starter-check")].filter(
        (cb) => ids.has(cb.dataset.rowId) && !cb.closest(".hs-starter-item")?.hidden,
      );
      for (const cb of checks) cb.checked = t.checked;
      if (!applyingCatalogPreset) setCatalogPresetRadio("custom");
      updateTotalCount();
      return;
    }
    if (t.classList.contains("hs-starter-check") && !applyingCatalogPreset) {
      setCatalogPresetRadio("custom");
      updateTotalCount();
    }
    if (t.classList.contains("hs-starter-copy-check") && !applyingClassPreset) {
      setClassPresetRadio("custom");
      updateClassSummary();
      updateTotalCount();
    }
  });

  summaryClickGuard(overlay);

  overlay.querySelector("#hs-starter-skip").addEventListener("click", () => {
    close();
    void Promise.resolve(onSkip?.());
  });
  overlay.querySelector("#hs-starter-add").addEventListener("click", () => {
    if (addBtn.disabled) return;
    const rows = collectSelectedRows();
    close();
    void Promise.resolve(onAdd?.(rows));
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      close();
      void Promise.resolve(onSkip?.());
    }
  });

  setClassPresetRadio("all");
  setCatalogPresetRadio("essentials");
  applyCatalogPreset("essentials");
  syncPathUi();

  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKeydown);
  overlay.querySelector(".hs-starter-path-radio:checked")?.focus();
}

function renderPresetOption(preset, radioName) {
  const label = document.createElement("label");
  label.className = "hs-starter-preset-option";
  label.innerHTML = `
    <input type="radio" name="${radioName}" class="${radioName}-radio" value="${escapeHtml(preset.id)}" />
    <span class="hs-starter-preset-label">${escapeHtml(preset.label)}</span>
    ${preset.hint ? `<span class="hs-starter-preset-hint">${escapeHtml(preset.hint)}</span>` : ""}`;
  return label;
}

function toEntryRow(r) {
  return {
    text: String(r.text ?? "").trim(),
    substitution: String(r.substitution ?? "").trim(),
    ignore_case: r.ignore_case ?? "Yes",
    note: String(r.note ?? "").trim(),
    app: r.app || "All Apps",
  };
}

function renderEntryCheckboxList(rows, { checkboxClass, keyAttr, useRowIndex, getKey }) {
  const ul = document.createElement("ul");
  ul.className = "hs-starter-list";
  rows.forEach((r, i) => {
    const li = document.createElement("li");
    li.className = "hs-starter-item";
    const key = useRowIndex ? String(i) : getKey?.(r) ?? String(i);
    li.innerHTML = `
      <label class="hs-starter-label">
        <input type="checkbox" class="${checkboxClass}" ${keyAttr}="${escapeHtml(key)}" />
        <span class="hs-starter-term">
          <span class="hs-starter-pattern"><code>${escapeHtml(r.text)}</code></span>
          <span class="hs-starter-arrow" aria-hidden="true">→</span>
          <span class="hs-starter-spoken">${escapeHtml(r.substitution)}</span>
        </span>
        ${r.note ? `<span class="hs-starter-note">${escapeHtml(r.note)}</span>` : ""}
      </label>`;
    ul.appendChild(li);
  });
  return ul;
}

function renderCatalogRowList(groupKey, rows) {
  const ul = document.createElement("ul");
  ul.className = "hs-starter-list";
  ul.dataset.listGroup = groupKey;
  for (const r of rows) {
    const li = document.createElement("li");
    li.className = "hs-starter-item";
    li.innerHTML = `
      <label class="hs-starter-label">
        <input type="checkbox" class="hs-starter-check" data-row-id="${escapeHtml(r.id)}" />
        <span class="hs-starter-term">
          <span class="hs-starter-pattern"><code>${escapeHtml(r.text)}</code></span>
          <span class="hs-starter-arrow" aria-hidden="true">→</span>
          <span class="hs-starter-spoken">${escapeHtml(r.substitution)}</span>
        </span>
        ${r.note ? `<span class="hs-starter-note">${escapeHtml(r.note)}</span>` : ""}
      </label>`;
    ul.appendChild(li);
  }
  return ul;
}

function buildCatalogTree(treeEl) {
  for (const cat of STARTER_CATEGORIES) {
    const details = document.createElement("details");
    details.className = "hs-starter-category";
    details.dataset.categoryId = cat.id;
    details.open = false;
    const rowCount = cat.rows?.length
      ?? cat.groups?.reduce((n, g) => n + g.rows.length, 0)
      ?? 0;
    const summary = document.createElement("summary");
    summary.className = "hs-starter-category-summary";
    summary.innerHTML = `
      <span class="hs-starter-tree-chevron" aria-hidden="true"></span>
      <span class="hs-starter-category-label">${escapeHtml(cat.label)}</span>
      <span class="hs-starter-category-count ss-type">${rowCount} terms</span>
      <span class="hs-starter-group-meta" data-group-meta="${escapeHtml(cat.id)}"></span>
      <label class="hs-starter-group-select" title="Select all in ${escapeHtml(cat.label)}">
        <input type="checkbox" class="hs-starter-group-check" data-group-id="${escapeHtml(cat.id)}" aria-label="Select all in ${escapeHtml(cat.label)}" />
        <span class="hs-starter-group-select-text">All</span>
      </label>`;
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "hs-starter-category-body";
    if (cat.groups) {
      const wrap = document.createElement("div");
      wrap.className = "hs-starter-subcategories";
      for (const g of cat.groups) {
        const sub = document.createElement("details");
        sub.className = "hs-starter-subcategory";
        sub.dataset.groupId = g.id;
        sub.open = false;
        const subSum = document.createElement("summary");
        subSum.className = "hs-starter-subcategory-summary";
        subSum.innerHTML = `
          <span class="hs-starter-tree-chevron" aria-hidden="true"></span>
          <span class="hs-starter-subcategory-label">${escapeHtml(g.label)}</span>
          <span class="hs-starter-category-count ss-type">${g.rows.length} terms</span>
          <span class="hs-starter-group-meta" data-group-meta="${escapeHtml(g.id)}"></span>
          <label class="hs-starter-group-select" title="Select all in ${escapeHtml(g.label)}">
            <input type="checkbox" class="hs-starter-group-check" data-group-id="${escapeHtml(g.id)}" aria-label="Select all in ${escapeHtml(g.label)}" />
            <span class="hs-starter-group-select-text">All</span>
          </label>`;
        sub.appendChild(subSum);
        const subBody = document.createElement("div");
        subBody.className = "hs-starter-subcategory-body";
        subBody.appendChild(renderCatalogRowList(g.id, g.rows));
        sub.appendChild(subBody);
        wrap.appendChild(sub);
      }
      body.appendChild(wrap);
    } else {
      body.appendChild(renderCatalogRowList(cat.id, cat.rows ?? []));
    }
    details.appendChild(body);
    treeEl.appendChild(details);
  }
}

function summaryClickGuard(root) {
  root.querySelectorAll(".hs-starter-group-check").forEach((cb) => {
    cb.addEventListener("click", (e) => e.stopPropagation());
  });
  root.querySelectorAll(".hs-starter-group-select").forEach((label) => {
    label.addEventListener("click", (e) => e.stopPropagation());
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

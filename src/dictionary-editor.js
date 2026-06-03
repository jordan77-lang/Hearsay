// Embedded Dictionary Builder (Phase 3): edit Supabase entries, import, Advanced exports.

import { mountSiteNav } from "./site-nav.js";
import { openCloudSettingsModal } from "./supabase/cloud-settings.js";
import {
  createDictionaryApi,
  loadSupabaseConfigFromBrowser,
  getStoredSupabaseConfig,
  setStoredSupabaseConfig,
  clearStoredSupabaseConfig,
  getStoredCourseId,
  setStoredCourseId,
  COMBINED_COURSE_ID,
} from "./supabase/dictionary-api.js";
import { parseImportFile, buildImportTemplateCsv, buildImportTemplateTsv } from "./dictionary-import.js";
import { filterRowIndices, parseSearchTerms } from "./dictionary-search.js";
import { buildAppleCsv, buildJawsTsv, buildExportNvdaDic, buildNvdaDic, resolveExportRegexEntries, downloadTextFile } from "./dictionary-export.js";
import {
  resolveAddonOptions,
  downloadNvdaAddon,
  defaultAddonDefaults,
  countRegexInDic,
} from "./nvda-addon.js";
import { shouldMergeBundledBase } from "./supabase/dictionary-api.js";
import { helpTip, bindHelpTips } from "./help-tip.js";
import { previewTermSpeech } from "./core/dictionary.js";
import { createHearController } from "./hear-ui.js";
import { preloadSpeech } from "./speech.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s);
}

/** Label text plus inline ? help popover. */
function fieldLabel(text, helpBody) {
  return `<span class="hs-dict-editor-label-row"><span class="hs-dict-editor-label">${text}</span>${helpTip(helpBody)}</span>`;
}

/** Slug for Supabase classes.slug (matches createCourse normalization). */
function suggestClassId(label) {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const HELP = {
  pattern: `<p><b>Pattern</b> is the exact text in your course (as students see it in Canvas).</p>
    <p>Examples: <code>ΔT</code>, <code>mL</code>, <code>J/g°C</code>. The screen reader replaces each match with <b>Spoken</b>.</p>`,
  spoken: `<p><b>Spoken</b> is how you want a screen reader to say the pattern.</p>
    <p>Used in the Screen Reader Lab and saved to Supabase for your class dictionary.</p>`,
  note: `<p><b>Note</b> is optional — a reminder for authors only.</p>
    <p>Included in NVDA export files as a comment line; students never hear it.</p>`,
  case: `<p><b>Ignore case</b> is the NVDA dictionary setting for whether capitalization must match.</p>
    <ul>
      <li><b>Yes</b> — <code>ml</code> and <code>mL</code> both match pattern <code>mL</code></li>
      <li><b>No</b> — only the exact capitalization in <b>Pattern</b> matches</li>
    </ul>`,
  class: `<p><b>Class</b> is the course dictionary (e.g. CHEM 113). Rows save to that class in Supabase <code>entries</code>.</p>
    <p><b>Pull</b> reloads from the cloud. <b>Save class</b> writes your table to Supabase. Unsaved edits are lost if you pull without saving.</p>
    <p><b>+ Add class</b> creates a new empty class in Supabase, then switches to it.</p>`,
  addClass: `<p>Create a new class in Supabase so you can add pronunciations for another course.</p>
    <ul>
      <li><b>Display name</b> — shown in the dropdown (e.g. <code>CHEM 114</code>)</li>
      <li><b>Class id</b> — short slug, letters/numbers only (e.g. <code>chem114</code>). Used in URLs and file names.</li>
    </ul>
    <p>The new class starts empty. Add terms, then <b>Save class</b>.</p>`,
  addTerm: `<p>Add one pronunciation row, then <b>Save class</b> to store it in Supabase.</p>
    <p><b>▶ Hear</b> previews speech using your class dictionary plus this row (before you add or save).</p>
    <p><b>Import</b> or download a template to add many rows at once from a spreadsheet.</p>`,
  terms: `<p>All terms for the active class. Edit cells inline, then <b>Save class</b>.</p>
    <ul>
      <li><b>Pattern</b> — text to match in Canvas</li>
      <li><b>Spoken</b> — pronunciation</li>
      <li><b>Note</b> — author comment (optional)</li>
      <li><b>Ignore case</b> — Yes or No</li>
      <li><b>▶</b> hear row · <b>✕</b> delete</li>
    </ul>`,
  search: `<p>Filter the table. Several words = <b>all</b> must appear (anywhere in the chosen fields).</p>
    <p><b>↑ ↓</b> or Enter / Shift+Enter jump between matches. <b>Clear</b> resets the filter.</p>`,
  import: `<p><b>Template CSV/TSV</b> — blank file with the right columns and sample rows.</p>
    <p><b>Import</b> — load a spreadsheet into this table (merged on top). Click <b>Save class</b> to push to Supabase.</p>`,
  advanced: `<p>Optional files for NVDA, JAWS, or Apple VoiceOver dictionary tools.</p>`,
  students: `<p><b>Download for students</b> builds install files from the current class table.</p>
    <p><b>NVDA add-on</b> (recommended): one install for Windows students. Requires NVDA <b>2026.1+</b>.</p>
    <p><b>Regex rules</b> handle chemistry units after numbers (e.g. <code>10 mL</code>, <code>J/g°C</code>). Chemistry classes merge the bundled regex set automatically.</p>
    <p>Bump <b>Version</b> before each redistribution so students can update.</p>`,
  connect: `<p>Your team Supabase <b>URL</b> and <b>anon key</b>. Stored in this browser only (same credentials as the legacy Dictionary Builder).</p>`,
};

/**
 * @param {HTMLElement} root
 * @param {{ base?: string, onDictionarySaved?: () => void }} opts
 */
export async function mountDictionaryEditor(root, { base = "..", onDictionarySaved } = {}) {
  let config = await loadSupabaseConfigFromBrowser();
  let api = config?.url && config?.anonKey ? createDictionaryApi(config) : null;
  let classProfiles = [];
  let entriesByClass = {};
  let activeSlug = getStoredCourseId();
  if (activeSlug === COMBINED_COURSE_ID) activeSlug = "chem113";
  let filter = "";
  let searchField = "all";
  let searchHitIndex = -1;
  let statusMsg = "";
  let saving = false;

  root.innerHTML = `
    <div class="hs-site-nav-mount"></div>
    <main class="ss-wrap hs-dict-editor">
      <header class="hs-dict-editor-head">
        <h1 class="ss-title hs-dict-editor-title">Dictionary ${helpTip("<p>Edit pronunciations for one class. After you <b>Save class</b>, export an NVDA add-on for students or test in the <b>Screen Reader Lab</b>.</p><p>Use <b>Pull</b> to reload from Supabase; <b>▶ Hear</b> to test before saving.</p>")}</h1>
        <p class="ss-sub">Edit class pronunciations · save to Supabase · export NVDA add-ons for students</p>
      </header>

      <section class="hs-dict-editor-card hs-dict-editor-connect" aria-labelledby="hs-dict-ed-connect-h">
        <div class="hs-dict-editor-card-head">
          <h2 id="hs-dict-ed-connect-h" class="hs-dict-editor-card-title">Connection ${helpTip(HELP.connect)}</h2>
          <button type="button" class="ss-btn primary" id="hs-dict-ed-cloud">☁ Connect</button>
        </div>
        <p id="hs-dict-ed-connect-note" class="ss-sub hs-dict-editor-connect-note"></p>
      </section>

      <section class="hs-dict-editor-card" aria-label="Class and save">
        <h2 class="hs-dict-editor-card-title hs-dict-editor-card-title-inline">Class ${helpTip(HELP.class)}</h2>
        <div class="hs-dict-editor-actions">
          <label class="hs-dict-editor-field hs-dict-editor-field-class">
            <span class="hs-dict-editor-label">Course</span>
            <select id="hs-dict-ed-class" class="ss-btn" disabled></select>
          </label>
          <button type="button" class="ss-btn" id="hs-dict-ed-add-class-toggle" disabled>+ Add class</button>
          <div class="hs-dict-editor-action-btns">
            <button type="button" class="ss-btn" id="hs-dict-ed-pull" disabled title="Reload all classes from Supabase">Pull</button>
            <button type="button" class="ss-btn primary" id="hs-dict-ed-save" disabled>Save class</button>
          </div>
          <p id="hs-dict-ed-status" class="hs-dict-editor-status ss-type" aria-live="polite"></p>
        </div>
        <div id="hs-dict-ed-new-class" class="hs-dict-editor-new-class hidden" aria-labelledby="hs-dict-ed-new-class-h">
          <h3 id="hs-dict-ed-new-class-h" class="hs-dict-editor-subtitle">New class ${helpTip(HELP.addClass)}</h3>
          <div class="hs-dict-editor-new-class-row">
            <label class="hs-dict-editor-field">
              <span class="hs-dict-editor-label">Display name</span>
              <input type="text" id="hs-dict-ed-new-class-label" class="ss-input hs-dict-inline-input" placeholder="e.g. CHEM 114" autocomplete="off" />
            </label>
            <label class="hs-dict-editor-field">
              <span class="hs-dict-editor-label">Class id</span>
              <input type="text" id="hs-dict-ed-new-class-id" class="ss-input hs-dict-inline-input" placeholder="e.g. chem114" autocomplete="off" spellcheck="false" />
            </label>
            <div class="hs-dict-editor-add-btns">
              <button type="button" class="ss-btn primary" id="hs-dict-ed-create-class">Create class</button>
              <button type="button" class="ss-btn" id="hs-dict-ed-cancel-class">Cancel</button>
            </div>
          </div>
        </div>
        <p id="hs-dict-ed-error" class="ss-dict-error hidden" role="alert"></p>
      </section>

      <section class="hs-dict-editor-card hs-dict-editor-download" aria-labelledby="hs-dict-ed-download-h">
        <h2 id="hs-dict-ed-download-h" class="hs-dict-editor-card-title hs-dict-editor-card-title-inline">
          Download for students ${helpTip(HELP.students)}
        </h2>
        <p class="ss-sub">Students install once per course. Plain Canvas New Quizzes text reads correctly — no special HTML.</p>
        <p id="hs-dict-ed-regex-status" class="hs-dict-editor-regex-status ss-type" aria-live="polite"></p>
        <div class="hs-dict-editor-export-btns">
          <button type="button" class="ss-btn primary" id="hs-dict-ed-export-addon">NVDA add-on (.nvda-addon)</button>
          <button type="button" class="ss-btn" id="hs-dict-ed-export-nvda">NVDA .dic</button>
          <button type="button" class="ss-btn" id="hs-dict-ed-export-jaws">JAWS source TSV</button>
          <button type="button" class="ss-btn" id="hs-dict-ed-export-apple">Apple VoiceOver CSV</button>
        </div>
        <label class="hs-dict-editor-merge-regex">
          <input type="checkbox" id="hs-dict-ed-merge-regex" checked />
          Include NVDA regex rules (units after numbers, parenthetical J/g°C, etc.)
        </label>
        <details class="hs-dict-editor-addon-meta">
          <summary class="hs-dict-editor-addon-meta-summary">Add-on settings (version, ID)</summary>
          <div class="hs-dict-editor-addon-grid">
            <label class="hs-dict-editor-field">
              <span class="hs-dict-editor-label">Add-on ID</span>
              <input type="text" id="hs-dict-ed-addon-id" class="ss-input hs-dict-inline-input" spellcheck="false" autocomplete="off" />
            </label>
            <label class="hs-dict-editor-field">
              <span class="hs-dict-editor-label">Version</span>
              <input type="text" id="hs-dict-ed-addon-version" class="ss-input hs-dict-inline-input" spellcheck="false" autocomplete="off" />
            </label>
            <label class="hs-dict-editor-field hs-dict-editor-field-wide">
              <span class="hs-dict-editor-label">Summary</span>
              <input type="text" id="hs-dict-ed-addon-summary" class="ss-input hs-dict-inline-input" autocomplete="off" />
            </label>
            <label class="hs-dict-editor-field hs-dict-editor-field-wide">
              <span class="hs-dict-editor-label">Author</span>
              <input type="text" id="hs-dict-ed-addon-author" class="ss-input hs-dict-inline-input" autocomplete="off" />
            </label>
            <label class="hs-dict-editor-field">
              <span class="hs-dict-editor-label">Dictionary name</span>
              <input type="text" id="hs-dict-ed-addon-dict-name" class="ss-input hs-dict-inline-input" spellcheck="false" autocomplete="off" />
            </label>
            <label class="hs-dict-editor-field hs-dict-editor-field-wide">
              <span class="hs-dict-editor-label">Dictionary display name</span>
              <input type="text" id="hs-dict-ed-addon-dict-display" class="ss-input hs-dict-inline-input" autocomplete="off" />
            </label>
          </div>
        </details>
        <p class="ss-sub hs-dict-editor-install-hint">
          Downloads the <strong>.nvda-addon</strong> and a <strong>student install PDF</strong> (post both on Canvas).
          Students open the add-on file to install, then restart NVDA.
          Quick test in Notepad: <code>kJ/mol</code>, <code>10 mL</code>, <code>J/g°C</code>.
        </p>
      </section>

      <section class="hs-dict-editor-card" aria-labelledby="hs-dict-ed-add-h">
        <h2 id="hs-dict-ed-add-h" class="hs-dict-editor-card-title hs-dict-editor-card-title-inline">Add term ${helpTip(HELP.addTerm)}</h2>
        <div class="hs-dict-editor-add-row">
          <label class="hs-dict-editor-field">
            ${fieldLabel("Pattern", HELP.pattern)}
            <input type="text" id="hs-dict-ed-new-pattern" class="ss-input hs-dict-inline-input" placeholder="e.g. ΔT" autocomplete="off" />
          </label>
          <label class="hs-dict-editor-field">
            ${fieldLabel("Spoken", HELP.spoken)}
            <input type="text" id="hs-dict-ed-new-spoken" class="ss-input hs-dict-inline-input" placeholder="e.g. delta T" autocomplete="off" />
          </label>
          <label class="hs-dict-editor-field hs-dict-editor-field-note">
            ${fieldLabel("Note", HELP.note)}
            <input type="text" id="hs-dict-ed-new-note" class="ss-input hs-dict-inline-input" placeholder="optional" autocomplete="off" />
          </label>
          <label class="hs-dict-editor-field hs-dict-editor-field-case">
            ${fieldLabel("Ignore case", HELP.case)}
            <select id="hs-dict-ed-new-case" class="ss-btn hs-dict-case-select" aria-label="Ignore case for new term">
              <option value="Yes" selected>Yes</option>
              <option value="No">No</option>
            </select>
          </label>
          <div class="hs-dict-editor-add-btns">
            <button type="button" class="ss-btn primary" id="hs-dict-ed-add">Add</button>
            <button type="button" class="ss-btn" id="hs-dict-ed-hear" title="Hear before saving">▶ Hear</button>
          </div>
        </div>
        <p id="hs-dict-ed-add-error" class="ss-dict-error hidden" role="alert"></p>
        <div class="hs-dict-editor-import-group" aria-label="Import">
          <span class="hs-dict-editor-import-label">${fieldLabel("Spreadsheet", HELP.import)}</span>
          <button type="button" class="ss-btn" id="hs-dict-ed-template-csv">Template CSV</button>
          <button type="button" class="ss-btn" id="hs-dict-ed-template-tsv">Template TSV</button>
          <button type="button" class="ss-btn" id="hs-dict-ed-import-btn">Import</button>
          <input type="file" id="hs-dict-ed-import" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden />
        </div>
      </section>

      <section class="hs-dict-editor-card hs-dict-editor-terms" aria-labelledby="hs-dict-ed-terms-h">
        <div class="hs-dict-editor-terms-head">
          <h2 id="hs-dict-ed-terms-h" class="hs-dict-editor-card-title hs-dict-editor-card-title-inline">
            Terms <span id="hs-dict-ed-count" class="hs-dict-editor-count">0</span>
            ${helpTip(HELP.terms)}
          </h2>
          <div class="hs-dict-editor-search-bar">
            <div class="hs-dict-editor-search-main">
              <label class="hs-dict-editor-search-field">
                ${fieldLabel("Search", HELP.search)}
                <input type="search" id="hs-dict-ed-search" class="ss-input hs-dict-inline-input" placeholder="Search pattern, spoken, or note…" autocomplete="off" />
              </label>
              <label class="hs-dict-editor-field hs-dict-editor-field-scope">
                <span class="hs-dict-editor-label">In</span>
                <select id="hs-dict-ed-search-field" class="ss-btn" title="Search in">
                  <option value="all">All fields</option>
                  <option value="pattern">Pattern only</option>
                  <option value="spoken">Spoken only</option>
                  <option value="note">Note only</option>
                </select>
              </label>
              <div class="hs-dict-editor-search-nav" role="group" aria-label="Search matches">
                <button type="button" class="ss-btn" id="hs-dict-ed-search-prev" disabled title="Previous match">↑</button>
                <button type="button" class="ss-btn" id="hs-dict-ed-search-next" disabled title="Next match">↓</button>
                <button type="button" class="ss-btn" id="hs-dict-ed-search-clear" disabled title="Clear search">Clear</button>
              </div>
              <span id="hs-dict-ed-search-meta" class="hs-dict-editor-search-meta ss-type"></span>
            </div>
          </div>
        </div>

        <div class="hs-dict-editor-scroll" id="hs-dict-ed-scroll">
          <table class="hs-dict-editor-table" id="hs-dict-ed-table">
            <thead>
              <tr>
                <th scope="col" class="hs-dict-col-num">#</th>
                <th scope="col">Pattern</th>
                <th scope="col">Spoken</th>
                <th scope="col" class="hs-dict-col-note">Note</th>
                <th scope="col" class="hs-dict-col-case">Ignore case</th>
                <th scope="col" class="hs-dict-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody id="hs-dict-ed-tbody"></tbody>
          </table>
          <p id="hs-dict-ed-empty" class="hs-dict-editor-empty ss-sub hidden">No rows yet. Connect, pull from cloud, or add a term.</p>
        </div>
      </section>
    </main>`;

  mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "dictionary", base });
  bindHelpTips(root);

  const connectNote = root.querySelector("#hs-dict-ed-connect-note");
  const classSelect = root.querySelector("#hs-dict-ed-class");
  const pullBtn = root.querySelector("#hs-dict-ed-pull");
  const saveBtn = root.querySelector("#hs-dict-ed-save");
  const statusEl = root.querySelector("#hs-dict-ed-status");
  const errorEl = root.querySelector("#hs-dict-ed-error");
  const addErrorEl = root.querySelector("#hs-dict-ed-add-error");
  const tbody = root.querySelector("#hs-dict-ed-tbody");
  const emptyEl = root.querySelector("#hs-dict-ed-empty");
  const scrollEl = root.querySelector("#hs-dict-ed-scroll");
  const countEl = root.querySelector("#hs-dict-ed-count");
  const searchMetaEl = root.querySelector("#hs-dict-ed-search-meta");
  const searchPrevBtn = root.querySelector("#hs-dict-ed-search-prev");
  const searchNextBtn = root.querySelector("#hs-dict-ed-search-next");
  const searchClearBtn = root.querySelector("#hs-dict-ed-search-clear");
  const mergeRegexCheckbox = root.querySelector("#hs-dict-ed-merge-regex");
  const regexStatusEl = root.querySelector("#hs-dict-ed-regex-status");
  const addonIdInput = root.querySelector("#hs-dict-ed-addon-id");
  const addonVersionInput = root.querySelector("#hs-dict-ed-addon-version");
  const addonSummaryInput = root.querySelector("#hs-dict-ed-addon-summary");
  const addonAuthorInput = root.querySelector("#hs-dict-ed-addon-author");
  const addonDictNameInput = root.querySelector("#hs-dict-ed-addon-dict-name");
  const addonDictDisplayInput = root.querySelector("#hs-dict-ed-addon-dict-display");
  const searchFieldSelect = root.querySelector("#hs-dict-ed-search-field");
  const connectSection = root.querySelector(".hs-dict-editor-connect");
  const addClassToggleBtn = root.querySelector("#hs-dict-ed-add-class-toggle");
  const newClassPanel = root.querySelector("#hs-dict-ed-new-class");
  const newClassLabelInput = root.querySelector("#hs-dict-ed-new-class-label");
  const newClassIdInput = root.querySelector("#hs-dict-ed-new-class-id");
  let newClassIdManual = false;
  const hear = createHearController();
  preloadSpeech();

  function clearNewEntryForm() {
    root.querySelector("#hs-dict-ed-new-pattern").value = "";
    root.querySelector("#hs-dict-ed-new-spoken").value = "";
    root.querySelector("#hs-dict-ed-new-note").value = "";
    root.querySelector("#hs-dict-ed-new-case").value = "Yes";
  }

  function readNewEntryForm() {
    return {
      pattern: root.querySelector("#hs-dict-ed-new-pattern").value.trim(),
      spoken: root.querySelector("#hs-dict-ed-new-spoken").value.trim(),
      note: root.querySelector("#hs-dict-ed-new-note").value.trim(),
      ignore_case: root.querySelector("#hs-dict-ed-new-case").value ?? "Yes",
    };
  }

  function showClassError(msg) {
    if (!msg) {
      errorEl.textContent = "";
      errorEl.classList.add("hidden");
      return;
    }
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
  }

  function showAddError(msg) {
    if (!msg) {
      addErrorEl.textContent = "";
      addErrorEl.classList.add("hidden");
      return;
    }
    addErrorEl.textContent = msg;
    addErrorEl.classList.remove("hidden");
  }

  function tryAddNewTerm() {
    const { pattern, spoken, note, ignore_case } = readNewEntryForm();
    if (!pattern && !spoken) {
      showAddError("Enter Pattern and Spoken to add a term.");
      return false;
    }
    if (!pattern) {
      showAddError("Enter a Pattern to add this term.");
      return false;
    }
    if (!spoken) {
      showAddError("Enter Spoken text to add this term.");
      return false;
    }
    showAddError("");
    const list = [
      { text: pattern, substitution: spoken, app: "All Apps", ignore_case, note },
      ...getActiveRows(),
    ];
    setActiveRows(list);
    clearNewEntryForm();
    renderTable();
    setStatus(`${list.length} rows (unsaved)`);
    return true;
  }

  function setStatus(msg) {
    statusMsg = msg;
    statusEl.textContent = msg;
  }

  function updateConnectNote() {
    const signedIn = Boolean(getStoredSupabaseConfig());
    connectNote.textContent = signedIn
      ? "Connected — Save writes to Supabase for the active class."
      : "Connect with your team Supabase URL and anon key.";
    connectSection?.classList.toggle("is-connected", signedIn);
    classSelect.disabled = !signedIn;
    pullBtn.disabled = !signedIn || saving;
    saveBtn.disabled = !signedIn || saving;
    addClassToggleBtn.disabled = !signedIn || saving;
  }

  function showNewClassPanel(show) {
    newClassPanel.classList.toggle("hidden", !show);
    addClassToggleBtn.setAttribute("aria-expanded", show ? "true" : "false");
    if (!show) {
      newClassLabelInput.value = "";
      newClassIdInput.value = "";
      newClassIdManual = false;
    } else {
      newClassLabelInput.focus();
    }
  }

  async function createNewClass() {
    if (!api || saving) return;
    const label = newClassLabelInput.value.trim();
    const idRaw = newClassIdInput.value.trim() || suggestClassId(label);
    if (!label) {
      showClassError("Enter a display name for the new class.");
      return;
    }
    const id = suggestClassId(idRaw) || idRaw;
    if (!id || id === COMBINED_COURSE_ID) {
      showClassError("Class id must be letters and numbers (e.g. chem114).");
      return;
    }
    if (classProfiles.some((c) => c.slug === id)) {
      showClassError(`Class "${id}" already exists. Pick a different id.`);
      return;
    }

    saving = true;
    updateConnectNote();
    showClassError("");
    setStatus("Creating class…");
    try {
      const created = await api.createCourse({ id, label });
      classProfiles.push({
        slug: created.id,
        label: created.label,
        file_prefix: created.id,
        sort_order: created.sort_order,
      });
      classProfiles.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      entriesByClass[created.id] = [];
      activeSlug = created.id;
      setStoredCourseId(activeSlug);
      renderClassSelect();
      classSelect.value = activeSlug;
      renderTable();
      await api.loadCourseDictionary(activeSlug);
      showNewClassPanel(false);
      setStatus(`Created class ${created.label} (${created.id}) · 0 terms`);
      mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "dictionary", base });
    } catch (err) {
      showClassError(err.message ?? String(err));
      setStatus("");
    } finally {
      saving = false;
      updateConnectNote();
    }
  }

  function getActiveRows() {
    return entriesByClass[activeSlug] ?? [];
  }

  function setActiveRows(rows) {
    entriesByClass[activeSlug] = rows;
  }

  function getActiveProfile() {
    return classProfiles.find((c) => c.slug === activeSlug);
  }

  function getActiveAddonDefaults() {
    const prof = getActiveProfile();
    const base = defaultAddonDefaults(activeSlug, prof?.label || activeSlug);
    const raw = prof?.addon_defaults;
    if (raw && typeof raw === "object") return { ...base, ...raw };
    return base;
  }

  function getExportRegexEntries() {
    if (!mergeRegexCheckbox.checked) return [];
    return resolveExportRegexEntries(activeSlug, getActiveAddonDefaults());
  }

  function syncAddonForm() {
    const d = getActiveAddonDefaults();
    addonIdInput.value = d.addonId ?? "";
    addonVersionInput.value = d.version ?? "1.0.0";
    addonSummaryInput.value = d.summary ?? "";
    addonAuthorInput.value = d.author ?? "";
    addonDictNameInput.value = d.dictionaryName ?? activeSlug;
    addonDictDisplayInput.value = d.dictionaryDisplayName ?? "";
    updateExportMeta();
  }

  function updateExportMeta() {
    const regex = getExportRegexEntries();
    const label = getActiveProfile()?.label || activeSlug;
    if (!regexStatusEl) return;
    if (shouldMergeBundledBase(activeSlug)) {
      regexStatusEl.textContent = `NVDA regex (${label}): ${regex.length} available (bundled chemistry set)`;
    } else {
      regexStatusEl.textContent = `NVDA regex (${label}): ${regex.length} loaded`;
    }
    regexStatusEl.classList.toggle("is-warn", regex.length === 0);
  }

  function readAddonFormFields() {
    return {
      addonId: addonIdInput.value,
      version: addonVersionInput.value,
      summary: addonSummaryInput.value,
      author: addonAuthorInput.value,
      dictionaryName: addonDictNameInput.value,
      dictionaryDisplayName: addonDictDisplayInput.value,
    };
  }

  function buildStudentNvdaDic(rows) {
    if (shouldMergeBundledBase(activeSlug)) {
      return buildExportNvdaDic(rows, { classSlug: activeSlug });
    }
    return buildNvdaDic(rows, { regexEntries: getExportRegexEntries() });
  }

  function getFilePrefix() {
    const prof = classProfiles.find((c) => c.slug === activeSlug);
    return prof?.file_prefix || activeSlug || "dictionary";
  }

  function filteredIndices(rows) {
    return filterRowIndices(rows, filter, searchField);
  }

  function updateRowCount(total, shown) {
    if (!countEl) return;
    countEl.textContent = filter.trim() && shown !== total ? `${shown} / ${total}` : String(total);
  }

  function updateSearchMeta(total, indices) {
    const hasFilter = parseSearchTerms(filter).length > 0;
    searchPrevBtn.disabled = !hasFilter || indices.length === 0;
    searchNextBtn.disabled = !hasFilter || indices.length === 0;
    searchClearBtn.disabled = !hasFilter;

    if (!hasFilter) {
      searchMetaEl.textContent = total ? `${total} term${total === 1 ? "" : "s"}` : "";
      return;
    }
    if (!indices.length) {
      searchMetaEl.textContent = "No matches";
      return;
    }
    const hit = searchHitIndex >= 0 ? (searchHitIndex % indices.length) + 1 : 1;
    searchMetaEl.textContent = `${indices.length} match${indices.length === 1 ? "" : "es"} · ${hit} of ${indices.length}`;
  }

  function stepSearchHit(delta) {
    const rows = getActiveRows();
    const indices = filteredIndices(rows);
    if (!indices.length) return;
    if (searchHitIndex < 0) searchHitIndex = 0;
    else searchHitIndex = (searchHitIndex + delta + indices.length) % indices.length;
    renderTable({ scrollToHit: true });
  }

  function clearSearch() {
    filter = "";
    searchHitIndex = -1;
    root.querySelector("#hs-dict-ed-search").value = "";
    renderTable();
  }

  function renderTable({ scrollToHit = false } = {}) {
    const rows = getActiveRows();
    const indices = filteredIndices(rows);
    const hasFilter = parseSearchTerms(filter).length > 0;
    if (hasFilter && searchHitIndex < 0 && indices.length) searchHitIndex = 0;

    updateRowCount(rows.length, indices.length);
    updateSearchMeta(rows.length, indices);

    if (!rows.length || (!indices.length && hasFilter)) {
      tbody.innerHTML = "";
      emptyEl.classList.remove("hidden");
      emptyEl.textContent = hasFilter
        ? "No terms match your search. Try different words or change the field filter."
        : "No rows yet. Connect, pull from cloud, or add a term.";
      scrollEl?.classList.toggle("is-empty", true);
      return;
    }
    if (!indices.length) {
      tbody.innerHTML = "";
      emptyEl.classList.remove("hidden");
      emptyEl.textContent = "No rows yet. Connect, pull from cloud, or add a term.";
      scrollEl?.classList.toggle("is-empty", true);
      return;
    }

    emptyEl.classList.add("hidden");
    scrollEl?.classList.toggle("is-empty", false);

    const activeHit =
      hasFilter && indices.length && searchHitIndex >= 0
        ? searchHitIndex % indices.length
        : -1;

    tbody.innerHTML = indices
      .map((rowIdx, displayIdx) => {
        const r = rows[rowIdx];
        const isHit = displayIdx === activeHit;
        return `<tr data-idx="${rowIdx}" class="${isHit ? "is-search-active" : ""}">
          <td class="hs-dict-col-num">${displayIdx + 1}</td>
          <td><input class="ss-input hs-dict-cell" data-field="text" value="${escapeAttr(r.text)}" aria-label="Pattern row ${displayIdx + 1}" /></td>
          <td><input class="ss-input hs-dict-cell" data-field="substitution" value="${escapeAttr(r.substitution)}" aria-label="Spoken row ${displayIdx + 1}" /></td>
          <td class="hs-dict-col-note"><input class="ss-input hs-dict-cell" data-field="note" value="${escapeAttr(r.note ?? "")}" aria-label="Note row ${displayIdx + 1}" /></td>
          <td class="hs-dict-col-case">
            <select class="ss-btn hs-dict-cell hs-dict-case-select" data-field="ignore_case" aria-label="Ignore case row ${displayIdx + 1}">
              <option value="Yes"${r.ignore_case !== "No" ? " selected" : ""}>Yes</option>
              <option value="No"${r.ignore_case === "No" ? " selected" : ""}>No</option>
            </select>
          </td>
          <td class="hs-dict-col-actions">
            <button type="button" class="ss-btn hs-dict-icon-btn hs-dict-ed-hear" data-idx="${rowIdx}" title="Hear this term">▶</button>
            <button type="button" class="ss-btn hs-dict-icon-btn hs-dict-ed-del" data-idx="${rowIdx}" title="Delete row">✕</button>
          </td></tr>`;
      })
      .join("");

    tbody.querySelectorAll(".hs-dict-cell").forEach((el) => {
      const field = el.dataset.field;
      const tr = el.closest("tr");
      const idx = Number(tr?.dataset.idx);
      el.addEventListener("change", () => {
        const list = getActiveRows();
        if (!list[idx]) return;
        list[idx] = { ...list[idx], [field]: el.value };
        setActiveRows(list);
      });
      if (field === "text" || field === "substitution") {
        el.addEventListener("input", () => {
          const list = getActiveRows();
          if (!list[idx]) return;
          list[idx] = { ...list[idx], [field]: el.value };
        });
      }
    });

    tbody.querySelectorAll(".hs-dict-ed-del").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        const list = getActiveRows().filter((_, i) => i !== idx);
        setActiveRows(list);
        renderTable();
        setStatus(`${list.length} rows (unsaved)`);
      });
    });

    tbody.querySelectorAll(".hs-dict-ed-hear").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tr = btn.closest("tr");
        if (!tr) return;
        const pattern = tr.querySelector('[data-field="text"]')?.value ?? "";
        const substitution = tr.querySelector('[data-field="substitution"]')?.value ?? "";
        const ignore_case = tr.querySelector('[data-field="ignore_case"]')?.value ?? "Yes";
        if (!pattern.trim()) {
          showAddError("Enter a Pattern before hearing.");
          return;
        }
        if (!substitution.trim()) {
          showAddError("Enter Spoken text before hearing.");
          return;
        }
        showAddError("");
        hear.play(
          btn,
          { hearLabel: "▶", hearTitle: "Hear this term with your proposed pronunciation" },
          previewTermSpeech(pattern.trim(), { pattern, substitution, ignore_case }),
        );
      });
    });

    if (scrollToHit && activeHit >= 0) {
      const hitRowIdx = indices[activeHit];
      const tr = tbody.querySelector(`tr[data-idx="${hitRowIdx}"]`);
      tr?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function renderClassSelect() {
    const options = classProfiles.length
      ? classProfiles
      : [{ slug: activeSlug, label: activeSlug, file_prefix: activeSlug }];
    classSelect.innerHTML = options
      .map(
        (c) =>
          `<option value="${escapeAttr(c.slug)}"${c.slug === activeSlug ? " selected" : ""}>${escapeHtml(c.label || c.slug)}</option>`,
      )
      .join("");
  }

  async function pullWorkspace() {
    if (!api) return;
    showClassError("");
    setStatus("Loading…");
    try {
      const { classes, entriesByClass: byClass } = await api.pullEntriesWorkspace();
      classProfiles = classes;
      entriesByClass = byClass;
      if (!classProfiles.some((c) => c.slug === activeSlug)) {
        activeSlug = classProfiles[0]?.slug ?? activeSlug;
        setStoredCourseId(activeSlug);
      }
      renderClassSelect();
      renderTable();
      syncAddonForm();
      await api.loadCourseDictionary(activeSlug);
      const n = getActiveRows().length;
      setStatus(`Loaded ${classProfiles.length} class(es) · ${n} rows in ${activeSlug}`);
      mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "dictionary", base });
    } catch (err) {
      showClassError(err.message ?? String(err));
      setStatus("");
    }
  }

  async function saveActiveClass() {
    if (!api || saving) return;
    const rows = getActiveRows()
      .map((r) => ({
        text: String(r.text ?? "").trim(),
        substitution: String(r.substitution ?? "").trim(),
        app: r.app || "All Apps",
        ignore_case: r.ignore_case ?? "Yes",
        note: String(r.note ?? "").trim(),
      }))
      .filter((r) => r.text && r.substitution);

    saving = true;
    updateConnectNote();
    showClassError("");
    setStatus("Saving…");
    try {
      const { count } = await api.saveEntryRecords(activeSlug, rows);
      setActiveRows(rows);
      await api.loadCourseDictionary(activeSlug);
      setStatus(`Saved ${count} row(s) to Supabase · ${activeSlug}`);
      mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "dictionary", base });
      onDictionarySaved?.({ classSlug: activeSlug, count });
    } catch (err) {
      showClassError(err.message ?? String(err));
      setStatus("");
    } finally {
      saving = false;
      updateConnectNote();
    }
  }

  function openSettings() {
    openCloudSettingsModal({
      url: config?.url ?? "",
      anonKey: config?.anonKey ?? "",
      onSave: async (saved) => {
        setStoredSupabaseConfig(saved);
        config = { ...config, ...saved };
        api = createDictionaryApi(config);
        updateConnectNote();
        await pullWorkspace();
      },
      onClear: async () => {
        clearStoredSupabaseConfig();
        config = await loadSupabaseConfigFromBrowser();
        api = config?.url && config?.anonKey ? createDictionaryApi(config) : null;
        classProfiles = [];
        entriesByClass = {};
        updateConnectNote();
        renderClassSelect();
        renderTable();
        setStatus("");
        showClassError("");
        mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "dictionary", base });
      },
    });
  }

  root.querySelector("#hs-dict-ed-cloud").addEventListener("click", openSettings);
  pullBtn.addEventListener("click", pullWorkspace);
  saveBtn.addEventListener("click", saveActiveClass);

  addClassToggleBtn.addEventListener("click", () => {
    showNewClassPanel(newClassPanel.classList.contains("hidden"));
  });
  newClassLabelInput.addEventListener("input", () => {
    if (!newClassIdManual) newClassIdInput.value = suggestClassId(newClassLabelInput.value);
  });
  newClassIdInput.addEventListener("input", () => {
    newClassIdManual = newClassIdInput.value.trim().length > 0;
  });
  root.querySelector("#hs-dict-ed-create-class").addEventListener("click", createNewClass);
  root.querySelector("#hs-dict-ed-cancel-class").addEventListener("click", () => showNewClassPanel(false));
  newClassLabelInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createNewClass();
  });
  newClassIdInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createNewClass();
  });

  classSelect.addEventListener("change", async () => {
    activeSlug = classSelect.value;
    setStoredCourseId(activeSlug);
    syncAddonForm();
    renderTable();
    if (api) {
      try {
        await api.loadCourseDictionary(activeSlug);
      } catch {
        /* preview falls back to bundled rules */
      }
    }
    const n = getActiveRows().length;
    setStatus(`${n} row(s) · ${activeSlug}`);
  });

  root.querySelector("#hs-dict-ed-hear").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    const { pattern, spoken, ignore_case } = readNewEntryForm();
    if (!pattern) {
      showAddError("Enter a Pattern before hearing.");
      return;
    }
    if (!spoken) {
      showAddError("Enter Spoken text before hearing.");
      return;
    }
    showAddError("");
    hear.play(
      btn,
      { hearLabel: "▶ Hear", hearTitle: "Hear how this term would read before saving" },
      previewTermSpeech(pattern, { pattern, substitution: spoken, ignore_case }),
    );
  });

  root.querySelector("#hs-dict-ed-add").addEventListener("click", () => {
    tryAddNewTerm();
  });

  for (const sel of ["#hs-dict-ed-new-pattern", "#hs-dict-ed-new-spoken"]) {
    root.querySelector(sel).addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        tryAddNewTerm();
      }
    });
  }

  root.querySelector("#hs-dict-ed-search").addEventListener("input", (e) => {
    filter = e.target.value;
    searchHitIndex = parseSearchTerms(filter).length ? 0 : -1;
    renderTable({ scrollToHit: true });
  });

  searchFieldSelect.addEventListener("change", () => {
    searchField = searchFieldSelect.value;
    searchHitIndex = parseSearchTerms(filter).length ? 0 : -1;
    renderTable({ scrollToHit: true });
  });

  searchPrevBtn.addEventListener("click", () => stepSearchHit(-1));
  searchNextBtn.addEventListener("click", () => stepSearchHit(1));
  searchClearBtn.addEventListener("click", clearSearch);

  root.querySelector("#hs-dict-ed-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      stepSearchHit(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      stepSearchHit(1);
    } else if (e.key === "Escape") {
      clearSearch();
    }
  });

  const importInput = root.querySelector("#hs-dict-ed-import");
  root.querySelector("#hs-dict-ed-template-csv").addEventListener("click", () => {
    downloadTextFile("hearsay-dictionary-template.csv", buildImportTemplateCsv(), "text/csv;charset=utf-8");
  });
  root.querySelector("#hs-dict-ed-template-tsv").addEventListener("click", () => {
    downloadTextFile(
      "hearsay-dictionary-template.tsv",
      buildImportTemplateTsv(),
      "text/tab-separated-values;charset=utf-8",
    );
  });
  root.querySelector("#hs-dict-ed-import-btn").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;
    try {
      const imported = await parseImportFile(file);
      const merged = [...imported, ...getActiveRows()];
      setActiveRows(merged);
      renderTable();
      setStatus(`Imported ${imported.length} row(s) · ${merged.length} total (unsaved)`);
      showAddError("");
    } catch (err) {
      showAddError(err.message ?? String(err));
    }
  });

  mergeRegexCheckbox.addEventListener("change", updateExportMeta);

  function exportRows() {
    return getActiveRows().filter((r) => r.text?.trim() && r.substitution?.trim());
  }

  root.querySelector("#hs-dict-ed-export-apple").addEventListener("click", () => {
    const rows = exportRows();
    if (!rows.length) {
      showClassError("Add or load rows before exporting.");
      return;
    }
    showClassError("");
    const prefix = getFilePrefix();
    downloadTextFile(`dictionary_${prefix}_apple_voiceover.csv`, buildAppleCsv(rows), "text/csv;charset=utf-8");
  });

  root.querySelector("#hs-dict-ed-export-jaws").addEventListener("click", () => {
    const rows = exportRows();
    if (!rows.length) {
      showClassError("Add or load rows before exporting.");
      return;
    }
    showClassError("");
    const prefix = getFilePrefix();
    downloadTextFile(
      `dictionary_${prefix}_jaws_source.tsv`,
      buildJawsTsv(rows),
      "text/tab-separated-values;charset=utf-8",
    );
  });

  root.querySelector("#hs-dict-ed-export-nvda").addEventListener("click", () => {
    const rows = exportRows();
    if (!rows.length) {
      showClassError("Add or load rows before exporting.");
      return;
    }
    showClassError("");
    const prefix = getFilePrefix();
    downloadTextFile(`${prefix}.dic`, buildStudentNvdaDic(rows), "text/plain;charset=utf-8");
  });

  root.querySelector("#hs-dict-ed-export-addon").addEventListener("click", async () => {
    const rows = exportRows();
    if (!rows.length) {
      showClassError("Add or load rows before exporting.");
      return;
    }

    const regexEntries = getExportRegexEntries();
    if (mergeRegexCheckbox.checked && regexEntries.length === 0 && !shouldMergeBundledBase(activeSlug)) {
      const proceed = window.confirm(
        "No NVDA regex rules are loaded for this class. Many chemistry pronunciations only work with regex rules (units after numbers, spacing variants). Export anyway?",
      );
      if (!proceed) return;
    }

    showClassError("");
    setStatus("Building NVDA add-on…");
    try {
      const options = resolveAddonOptions(readAddonFormFields(), getActiveAddonDefaults());
      const dictionaryContent = buildStudentNvdaDic(rows);
      const regexCount = countRegexInDic(dictionaryContent);
      const result = await downloadNvdaAddon({
        options,
        dictionaryContent,
        literalCount: rows.length,
        regexCount,
      });
      setStatus(`Exported ${result.filename}${result.pdfFilename ? ` + ${result.pdfFilename}` : ""}`);
      window.alert(result.message);
    } catch (err) {
      showClassError(err.message ?? String(err));
      setStatus("");
    }
  });

  updateConnectNote();
  renderClassSelect();
  syncAddonForm();
  renderTable();

  if (api) {
    await pullWorkspace();
  } else {
    setStatus("Connect to load class dictionaries from Supabase.");
  }

  return { pullWorkspace, saveActiveClass, getActiveSlug: () => activeSlug };
}

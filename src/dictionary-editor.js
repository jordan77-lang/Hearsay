// Embedded Dictionary Builder (Phase 3): edit Supabase entries, import, Advanced exports.

import { mountSiteNav } from "./site-nav.js";
import { openCloudSettingsModal } from "./supabase/cloud-settings.js";
import {
  isSupabaseConnected,
  requireSupabaseConnection,
  supabaseConnectMessage,
} from "./supabase/connect-guard.js";
import {
  createDictionaryApi,
  loadSupabaseConfigFromBrowser,
  setStoredSupabaseConfig,
  clearStoredSupabaseConfig,
  getStoredCourseId,
  setStoredCourseId,
  COMBINED_COURSE_ID,
  DEMO_DICTIONARY_ID,
  DEMO_DICTIONARY_LABEL,
  isDemoDictionaryId,
  isDeletableClassSlug,
  shouldMergeBundledBase,
} from "./supabase/dictionary-api.js";
import { DICTIONARY_DIC } from "./core/dictionary-data.js";
import { dicToRows, entriesToRuleRows, rowsToDic } from "./supabase/dictionary-format.js";
import { loadBareClassDictionary, loadBundledChemistryDictionary, loadEditorPreviewDictionary } from "./core/dictionary.js";
import {
  parseImportFile,
  mergeImportRows,
  buildImportTemplateCsv,
} from "./dictionary-import.js";
import { openStarterPronunciationsModal } from "./starter-pronunciations.js";
import { filterRowIndices, parseSearchTerms } from "./dictionary-search.js";
import {
  buildAppleCsv,
  buildJawsTsv,
  buildExportNvdaDic,
  buildNvdaDic,
  bundledExportRowCount,
  resolveExportRegexEntries,
  downloadTextFile,
} from "./dictionary-export.js";
import {
  resolveAddonOptions,
  downloadNvdaAddon,
  preloadNvdaAddonDeps,
  defaultAddonDefaults,
  countRegexInDic,
} from "./nvda-addon.js";
import { notifyDictionaryUpdated, onDictionaryUpdated, dictionarySyncMatchesClass, DICTIONARY_SYNC_STORAGE_KEY } from "./dictionary-sync.js";
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
  pattern: `<p><b>Pattern</b> is the exact text in your course (as students see it on screen).</p>
    <p>Examples: <code>ΔT</code>, <code>mL</code>, <code>J/g°C</code>. The screen reader replaces each match with <b>Spoken</b>.</p>`,
  spoken: `<p><b>Spoken</b> is how you want a screen reader to say the pattern.</p>
    <p>Used in the Screen Reader Lab and saved to Supabase for your class dictionary.</p>`,
  note: `<p><b>Note</b> is optional — a reminder for authors only.</p>
    <p>Included as a comment line in exported dictionary files; students never hear it.</p>`,
  case: `<p><b>Ignore case</b> is the NVDA dictionary setting for whether capitalization must match.</p>
    <p>Chemistry classes still include bundled rules like uppercase <b>NO</b> (nitric oxide). English <b>no</b> / <b>No</b> are not changed. To override a bundled token, add a row with the same <b>Pattern</b> (for example <code>NO</code> → <code>no</code>).</p>
    <ul>
      <li><b>Yes</b> — <code>ml</code> and <code>mL</code> both match pattern <code>mL</code></li>
      <li><b>No</b> — only the exact capitalization in <b>Pattern</b> matches</li>
    </ul>`,
  class: `<p><b>Demo dictionary</b> is a read-only offline sample. Pick your class after you connect.</p>
    <p><b>Class</b> stores rows in Supabase <code>entries</code> (e.g. CHEM 113 / chem113).</p>
    <p><b>Pull</b> reloads from the cloud. Table edits save automatically to Supabase and refresh <b>Screen Reader Lab</b>.</p>
    <p><b>Save class</b> saves all rows again and refreshes the lab. <b>Edit class</b> updates the display name and file prefix.</p>
    <p><b>+ Add class</b> / <b>Delete class</b> manage classes in Supabase.</p>`,
  editClass: `<p>Update how this class appears in the dropdown and in exported file names.</p>
    <ul>
      <li><b>Display name</b> — shown in the course list (e.g. <code>CHEM 114</code>)</li>
      <li><b>File prefix</b> — used in NVDA export file names (e.g. <code>chem114</code>)</li>
      <li><b>Class id</b> — permanent slug in Supabase; cannot be changed here</li>
    </ul>`,
  addClass: `<p>Create a new class in Supabase so you can add pronunciations for another course.</p>
    <ul>
      <li><b>Display name</b> — shown in the dropdown (e.g. <code>CHEM 114</code>)</li>
      <li><b>Class id</b> — short slug, letters/numbers only (e.g. <code>chem114</code>). Used in URLs and file names.</li>
    </ul>
    <p>After create, pick starter terms or <b>Start empty</b> — you will be asked to confirm saving the new class to Supabase.</p>`,
  terms: `<p>All terms for the active class. Each edit saves automatically to Supabase and updates <b>Screen Reader Lab</b>.</p>
    <ul>
      <li><b>Pattern</b> — text to match in course materials</li>
      <li><b>Spoken</b> — pronunciation</li>
      <li><b>Note</b> — author comment (optional)</li>
      <li><b>Ignore case</b> — Yes or No</li>
      <li><b>▶</b> hear row · <b>✕</b> delete (confirms, then saves)</li>
    </ul>`,
  search: `<p>Filter the table. Several words = <b>all</b> must appear (anywhere in the chosen fields).</p>
    <p><b>↑ ↓</b> or Enter / Shift+Enter jump between matches. <b>Clear</b> resets the filter.</p>`,
  import: `<p><b>Template CSV</b> — same columns as the ChatGPT Dictionary project: Pattern, Spoken, Note, Ignore case.</p>
    <p><b>Import</b> — load a <code>.csv</code> from ChatGPT (not TSV or Excel), then confirm saving to Supabase.</p>`,
  advanced: `<p>Optional files for NVDA, JAWS, or Apple VoiceOver dictionary tools.</p>`,
  students: `<p><b>Export screen reader dictionaries</b> from the same class terms: NVDA add-on (Windows), NVDA .dic, JAWS TSV, or Apple VoiceOver CSV. Pick the format your students use.</p>
    <p>For NVDA on Windows, the <b>.nvda-addon</b> plus install PDF is the simplest path (NVDA <b>2026.1+</b>). The PDF also covers Add-on Store → <b>Install from external source</b> if double-click fails.</p>
    <p><b>JAWS:</b> import the TSV in Dictionary Manager, export an <b>.SBAK</b>, then on student machines choose <b>No, merge the settings from backup into existing settings</b>; if JAWS asks about conflicts, <b>Keep current settings</b>; restart JAWS. Word subscripts export as glued text (<code>mcalorimeter</code>, <code>msolution</code>).</p>
    <p>Preview your class in <b>Screen Reader Lab</b> before you share files. Bump <b>Version</b> when you redistribute an NVDA add-on update.</p>`,
  connect: `<p>Your team Supabase <b>URL</b> and <b>anon key</b>. Stored in this browser only (same credentials as the legacy Dictionary Builder).</p>`,
};

/**
 * @param {HTMLElement} root
 * @param {{ base?: string, context?: 'web'|'extension', onDictionarySaved?: () => void, onNavigate?: (view: 'lab'|'dictionary') => void }} opts
 */
export async function mountDictionaryEditor(root, {
  base = "..",
  context = "web",
  onDictionarySaved,
  onNavigate,
} = {}) {
  const isExtension = context === "extension";
  let config = await loadSupabaseConfigFromBrowser();
  let api = config?.url && config?.anonKey ? createDictionaryApi(config) : null;
  let classProfiles = [];
  let entriesByClass = {};
  let legacyEntrySlugs = new Set();
  let activeSlug = getStoredCourseId();
  if (activeSlug === COMBINED_COURSE_ID) activeSlug = DEMO_DICTIONARY_ID;
  let filter = "";
  let searchField = "all";
  let searchHitIndex = -1;
  let statusMsg = "";
  let saving = false;
  let savedRowsSnapshot = "[]";
  let lastDictReloadAt = 0;

  function cloneRows(rows) {
    return rows.map((r) => ({ ...r }));
  }

  function rememberSavedSnapshot(rows = getActiveRows()) {
    savedRowsSnapshot = JSON.stringify(cloneRows(rows));
  }

  function notifyEditorSync(detail = {}) {
    notifyDictionaryUpdated({ ...detail, source: "editor" });
  }

  function confirmSaveClass(actionDescription) {
    const prof = getActiveProfile();
    const label = prof?.label || activeSlug;
    const rowCount = getActiveRows().filter(
      (r) => String(r.text ?? "").trim() && String(r.substitution ?? "").trim(),
    ).length;
    const detail =
      actionDescription ??
      `This saves ${rowCount} pronunciation row${rowCount === 1 ? "" : "s"} for this class.`;
    return window.confirm(
      `Save "${label}" to Supabase?\n\n${detail}\n\n` +
        "This updates the shared class dictionary for all authors and students using this class.",
    );
  }

  root.innerHTML = `
    ${isExtension ? "" : '<div class="hs-site-nav-mount"></div>'}
    <main class="ss-wrap hs-dict-editor">
      <header class="hs-dict-editor-head ss-page-header">
        <h1 class="ss-title hs-dict-editor-title">Dictionary ${helpTip("<p>Start with the <b>demo dictionary</b> offline, or connect and pick your class.</p><p><b>Save class</b> updates Supabase and refreshes <b>Screen Reader Lab</b> for that class. <b>▶ Hear</b> tests a row before save.</p>")}</h1>
        <p class="ss-sub">Connect → edit your class → save → export screen reader dictionaries for students.${
          isExtension
            ? ` Test speech in <button type="button" class="hs-inline-link hs-ext-nav-link" data-hs-ext-nav="lab">Screen Reader Lab</button>.`
            : ""
        }</p>
      </header>

      <section class="hs-dict-editor-card hs-dict-editor-connect" aria-labelledby="hs-dict-ed-connect-h">
        <div class="hs-dict-editor-card-head">
          <h2 id="hs-dict-ed-connect-h" class="hs-dict-editor-card-title">Connection ${helpTip(HELP.connect)}</h2>
          <button type="button" class="ss-btn primary" id="hs-dict-ed-cloud">☁ Connect</button>
        </div>
        <p id="hs-dict-ed-connect-note" class="ss-sub hs-dict-editor-connect-note"></p>
      </section>

      <section class="hs-dict-editor-card" aria-label="Class, add terms, and import">
        <h2 class="hs-dict-editor-card-title hs-dict-editor-card-title-inline">Class ${helpTip(HELP.class)}</h2>
        <div class="hs-dict-editor-actions">
          <label class="hs-dict-editor-field hs-dict-editor-field-class">
            <span class="hs-dict-editor-label">Course</span>
            <select id="hs-dict-ed-class" class="ss-btn" disabled></select>
          </label>
          <button type="button" class="ss-btn" id="hs-dict-ed-edit-class" disabled title="Edit display name and file prefix">Edit class</button>
          <button type="button" class="ss-btn" id="hs-dict-ed-add-class-toggle" disabled>+ Add class</button>
          <button type="button" class="ss-btn ss-btn-danger" id="hs-dict-ed-delete-class" disabled title="Permanently delete this class from Supabase">Delete class</button>
          <div class="hs-dict-editor-action-btns">
            <button type="button" class="ss-btn" id="hs-dict-ed-pull" disabled title="Reload all classes from Supabase">Pull</button>
            <button type="button" class="ss-btn primary" id="hs-dict-ed-save" disabled>Save class</button>
          </div>
          <p id="hs-dict-ed-status" class="hs-dict-editor-status ss-type" aria-live="polite"></p>
        </div>
        <div id="hs-dict-ed-edit-class-panel" class="hs-dict-editor-new-class hidden" aria-labelledby="hs-dict-ed-edit-class-h">
          <h3 id="hs-dict-ed-edit-class-h" class="hs-dict-editor-subtitle">Edit class ${helpTip(HELP.editClass)}</h3>
          <div class="hs-dict-editor-new-class-row">
            <label class="hs-dict-editor-field">
              <span class="hs-dict-editor-label">Display name</span>
              <input type="text" id="hs-dict-ed-edit-class-label" class="ss-input hs-dict-inline-input" placeholder="e.g. CHEM 114" autocomplete="off" />
            </label>
            <label class="hs-dict-editor-field">
              <span class="hs-dict-editor-label">File prefix</span>
              <input type="text" id="hs-dict-ed-edit-class-prefix" class="ss-input hs-dict-inline-input" placeholder="e.g. chem114" autocomplete="off" spellcheck="false" />
            </label>
            <p class="hs-dict-editor-class-id-note ss-type">Class id: <code id="hs-dict-ed-edit-class-slug"></code> (cannot change)</p>
            <div class="hs-dict-editor-add-btns">
              <button type="button" class="ss-btn primary" id="hs-dict-ed-save-class-meta">Save class info</button>
              <button type="button" class="ss-btn" id="hs-dict-ed-cancel-edit-class">Cancel</button>
            </div>
          </div>
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
        <div class="hs-dict-editor-class-workspace">
          <h3 class="hs-dict-editor-subtitle">Add pronunciation</h3>
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
            <span class="hs-dict-editor-import-label">${fieldLabel("Import CSV", HELP.import)}</span>
            <button type="button" class="ss-btn" id="hs-dict-ed-template-csv">Template CSV</button>
            <button type="button" class="ss-btn" id="hs-dict-ed-import-btn">Import CSV</button>
            <input type="file" id="hs-dict-ed-import" accept=".csv,text/csv" hidden />
          </div>
        </div>
        <p id="hs-dict-ed-error" class="ss-dict-error hidden" role="alert"></p>
      </section>

      <section class="hs-dict-editor-card hs-dict-editor-download" aria-labelledby="hs-dict-ed-download-h">
        <h2 id="hs-dict-ed-download-h" class="hs-dict-editor-card-title hs-dict-editor-card-title-inline">
          Download for students ${helpTip(HELP.students)}
        </h2>
        <p class="ss-sub">Export NVDA, JAWS, or VoiceOver dictionary files from the same class terms. The NVDA add-on includes a student install PDF; other formats download as a single file.</p>
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

  if (!isExtension) mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "dictionary", base });
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
  const editClassBtn = root.querySelector("#hs-dict-ed-edit-class");
  const deleteClassBtn = root.querySelector("#hs-dict-ed-delete-class");
  const newClassPanel = root.querySelector("#hs-dict-ed-new-class");
  const editClassPanel = root.querySelector("#hs-dict-ed-edit-class-panel");
  const editClassLabelInput = root.querySelector("#hs-dict-ed-edit-class-label");
  const editClassPrefixInput = root.querySelector("#hs-dict-ed-edit-class-prefix");
  const editClassSlugEl = root.querySelector("#hs-dict-ed-edit-class-slug");
  const newClassLabelInput = root.querySelector("#hs-dict-ed-new-class-label");
  const newClassIdInput = root.querySelector("#hs-dict-ed-new-class-id");
  let newClassIdManual = false;
  let addonSaveTimer = null;
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

  function guardSupabase(feature, { alert = false } = {}) {
    const ok = requireSupabaseConnection({
      feature,
      api,
      alert,
      onConnect: openSettings,
    });
    if (!ok) showClassError(supabaseConnectMessage(feature));
    return ok;
  }

  function guardEditableClass(feature) {
    if (isDemoDictionaryId(activeSlug)) {
      showClassError("Demo dictionary is read-only. Connect Supabase and select your class to edit.");
      return false;
    }
    return guardSupabase(feature);
  }

  async function tryAddNewTerm() {
    if (!guardEditableClass("Adding terms")) return false;
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
    if (
      !confirmSaveClass(`Add "${pattern}" → "${spoken}" and save this class.`)
    ) {
      return false;
    }
    showAddError("");
    const before = getActiveRows();
    const list = [
      { text: pattern, substitution: spoken, app: "All Apps", ignore_case, note },
      ...before,
    ];
    setActiveRows(list);
    clearNewEntryForm();
    renderTable();
    const saved = await saveActiveClass({
      skipConfirm: true,
      actionDescription: `Added "${pattern}".`,
    });
    if (!saved) {
      setActiveRows(before);
      root.querySelector("#hs-dict-ed-new-pattern").value = pattern;
      root.querySelector("#hs-dict-ed-new-spoken").value = spoken;
      root.querySelector("#hs-dict-ed-new-note").value = note;
      root.querySelector("#hs-dict-ed-new-case").value = ignore_case;
      renderTable();
    }
    return saved;
  }

  function setStatus(msg) {
    statusMsg = msg;
    statusEl.textContent = msg;
  }

  function getDemoEntryRows() {
    return dicToRows(DICTIONARY_DIC, DEMO_DICTIONARY_ID)
      .filter((r) => (r.rule_type ?? 0) !== 1)
      .map((r) => ({
        text: r.pattern,
        substitution: r.replacement,
        ignore_case: r.case_sensitive ? "No" : "Yes",
        note: "",
        app: "All Apps",
      }));
  }

  function applyDemoWorkspace() {
    entriesByClass[DEMO_DICTIONARY_ID] = getDemoEntryRows();
    loadBundledChemistryDictionary("demo");
  }

  function updateConnectNote() {
    const signedIn = isSupabaseConnected();
    const demo = isDemoDictionaryId(activeSlug);
    connectNote.textContent = signedIn
      ? demo
        ? "Connected — demo dictionary is read-only. Select your class to edit and save terms."
        : "Connected — edits save automatically to Supabase for the active class."
      : demo
        ? "Not connected — browsing the offline demo. Use ☁ Connect to edit and save your classes."
        : "Not connected — use ☁ Connect before saving or editing class terms.";
    connectSection?.classList.toggle("is-connected", signedIn);
    connectSection?.classList.toggle("needs-connect", !signedIn);
    classSelect.disabled = false;
    pullBtn.disabled = saving || demo;
    saveBtn.disabled = saving || demo;
    saveBtn.title = signedIn ? "Save all rows to Supabase" : supabaseConnectMessage("Saving this class");
    pullBtn.title = signedIn ? "Reload all classes from Supabase" : supabaseConnectMessage("Pulling from Supabase");
    addClassToggleBtn.disabled = saving;
    addClassToggleBtn.title = signedIn ? "Create a new class" : supabaseConnectMessage("Creating a class");
    editClassBtn.disabled = saving || demo;
    editClassBtn.title = signedIn ? "Edit display name and file prefix" : supabaseConnectMessage("Editing class info");
    deleteClassBtn.disabled = saving || demo || !isDeletableClassSlug(activeSlug);
    root.querySelector("#hs-dict-ed-add")?.toggleAttribute("disabled", demo);
    root.querySelector("#hs-dict-ed-hear")?.toggleAttribute("disabled", demo);
    for (const sel of ["#hs-dict-ed-new-pattern", "#hs-dict-ed-new-spoken", "#hs-dict-ed-new-note", "#hs-dict-ed-new-case"]) {
      root.querySelector(sel)?.toggleAttribute("disabled", demo);
    }
    root.querySelector("#hs-dict-ed-import-btn")?.toggleAttribute("disabled", demo);
  }

  function showNewClassPanel(show) {
    if (show) showEditClassPanel(false);
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

  function populateEditClassForm() {
    const prof = getActiveProfile();
    editClassLabelInput.value = prof?.label || activeSlug;
    editClassPrefixInput.value = prof?.file_prefix || activeSlug;
    editClassSlugEl.textContent = activeSlug;
  }

  function showEditClassPanel(show) {
    if (show) showNewClassPanel(false);
    editClassPanel.classList.toggle("hidden", !show);
    editClassBtn.setAttribute("aria-expanded", show ? "true" : "false");
    if (show) {
      populateEditClassForm();
      editClassLabelInput.focus();
    }
  }

  function previewActiveDictionary() {
    if (isDemoDictionaryId(activeSlug)) return;
    const rows = getActiveRows().filter(
      (r) => String(r.text ?? "").trim() && String(r.substitution ?? "").trim(),
    );
    applyLocalDictionaryPreview(activeSlug, rows);
  }

  async function saveClassMeta() {
    if (saving || !guardEditableClass("Editing class info")) return false;
    const label = editClassLabelInput.value.trim();
    const file_prefix = editClassPrefixInput.value.trim();
    if (!label) {
      showClassError("Enter a display name.");
      return false;
    }
    if (!file_prefix) {
      showClassError("Enter a file prefix.");
      return false;
    }

    saving = true;
    updateConnectNote();
    showClassError("");
    setStatus("Saving class info…");
    try {
      await api.updateClassMeta(activeSlug, { label, file_prefix });
      const prof = getActiveProfile();
      if (prof) {
        prof.label = label;
        prof.file_prefix = file_prefix;
      }
      renderClassSelect();
      classSelect.value = activeSlug;
      syncAddonForm();
      updateExportMeta();
      showEditClassPanel(false);
      setStatus(`Updated class info · ${label} (${activeSlug})`);
      notifyEditorSync({ classSlug: activeSlug });
      if (!isExtension) mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "dictionary", base });
      return true;
    } catch (err) {
      showClassError(err.message ?? String(err));
      setStatus("");
      return false;
    } finally {
      saving = false;
      updateConnectNote();
    }
  }

  async function saveAddonDefaults() {
    if (saving || !guardEditableClass("Saving add-on settings")) return false;
    const prof = getActiveProfile();
    const existing = prof?.addon_defaults && typeof prof.addon_defaults === "object"
      ? prof.addon_defaults
      : {};
    const addon_defaults = {
      ...existing,
      ...readAddonFormFields(),
      nvdaRegexEntries: existing.nvdaRegexEntries ?? [],
    };
    try {
      await api.updateClassMeta(activeSlug, { addon_defaults });
      if (prof) prof.addon_defaults = addon_defaults;
      updateExportMeta();
      notifyEditorSync({ classSlug: activeSlug });
      return true;
    } catch (err) {
      showClassError(err.message ?? String(err));
      return false;
    }
  }

  function scheduleAddonSave() {
    if (addonSaveTimer) clearTimeout(addonSaveTimer);
    addonSaveTimer = setTimeout(() => {
      addonSaveTimer = null;
      void saveAddonDefaults();
    }, 500);
  }

  function applyLocalDictionaryPreview(slug, rows) {
    if (!rows.length) {
      loadBareClassDictionary(`local-empty:${slug}`);
    } else {
      const ruleRows = entriesToRuleRows(
        rows.map((r, i) => ({ ...r, class_slug: slug, position: i + 1 })),
      );
      loadEditorPreviewDictionary(rowsToDic(ruleRows), `local:${slug}`);
    }
  }

  async function deleteActiveClass() {
    if (saving || !isDeletableClassSlug(activeSlug)) return;
    if (!guardSupabase("Deleting a class")) return;
    const prof = getActiveProfile();
    const label = prof?.label || activeSlug;
    const rowCount = getActiveRows().length;
    const ok = window.confirm(
      `Delete class "${label}" (${activeSlug}) from Supabase?\n\n` +
        `This permanently removes the class and ${rowCount} pronunciation row(s) ` +
        `(and any legacy dictionary_rules). This cannot be undone.\n\n` +
        `Are you sure?`,
    );
    if (!ok) return;

    saving = true;
    updateConnectNote();
    showClassError("");
    setStatus("Deleting class…");
    try {
      await api.deleteCourse(activeSlug);
      const deletedSlug = activeSlug;
      classProfiles = classProfiles.filter((c) => c.slug !== deletedSlug);
      delete entriesByClass[deletedSlug];
      legacyEntrySlugs?.delete?.(deletedSlug);
      activeSlug =
        classProfiles.find((c) => isDeletableClassSlug(c.slug))?.slug ?? DEMO_DICTIONARY_ID;
      setStoredCourseId(activeSlug);
      renderClassSelect();
      classSelect.value = activeSlug;
      showNewClassPanel(false);
      showEditClassPanel(false);
      if (isDemoDictionaryId(activeSlug)) {
        applyDemoWorkspace();
      } else {
        await api.loadCourseDictionary(activeSlug);
      }
      renderTable();
      syncAddonForm();
      setStatus(`Deleted ${label} (${deletedSlug})`);
      notifyEditorSync({ classSlug: activeSlug, deleted: deletedSlug });
      if (!isExtension) mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "dictionary", base });
    } catch (err) {
      showClassError(err.message ?? String(err));
      setStatus("");
    } finally {
      saving = false;
      updateConnectNote();
    }
  }

  async function createNewClass() {
    if (saving || !guardSupabase("Creating a class")) return;
    const label = newClassLabelInput.value.trim();
    const idRaw = newClassIdInput.value.trim() || suggestClassId(label);
    if (!label) {
      showClassError("Enter a display name for the new class.");
      return;
    }
    const id = suggestClassId(idRaw) || idRaw;
    if (!id || id === COMBINED_COURSE_ID || isDemoDictionaryId(id)) {
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
      showNewClassPanel(false);
      openStarterPronunciationsModal({
        classLabel: created.label,
        sourceClasses: classProfiles
          .filter((c) => c.slug !== created.id)
          .map((c) => ({
            slug: c.slug,
            label: c.label,
            rows: entriesByClass[c.slug] ?? [],
          })),
        onAdd: async (rows) => {
          setActiveRows(rows);
          renderTable();
          updateExportMeta();
          applyLocalDictionaryPreview(created.id, rows);
          const detail = rows.length
            ? `Save ${rows.length} starter term${rows.length === 1 ? "" : "s"} to the new class.`
            : "Save an empty dictionary for the new class.";
          if (!confirmSaveClass(detail)) {
            setStatus(
              `Created ${created.label} (${created.id}) · ${rows.length} term(s) not saved yet — use Save class`,
            );
            return;
          }
          await saveActiveClass({ skipConfirm: true, actionDescription: detail });
        },
        onSkip: async () => {
          setActiveRows([]);
          renderTable();
          applyLocalDictionaryPreview(created.id, []);
          const detail = "Save an empty dictionary for the new class.";
          if (!confirmSaveClass(detail)) {
            setStatus(`Created ${created.label} (${created.id}) · empty dictionary not saved yet`);
            return;
          }
          await saveActiveClass({ skipConfirm: true, actionDescription: detail });
        },
      });
      if (!isExtension) mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "dictionary", base });
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
    const classRows = getActiveRows().length;
    const useBundledFallback = isDemoDictionaryId(activeSlug);
    return resolveExportRegexEntries(activeSlug, getActiveAddonDefaults(), { useBundledFallback });
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
    const label = isDemoDictionaryId(activeSlug)
      ? DEMO_DICTIONARY_LABEL
      : getActiveProfile()?.label || activeSlug;
    if (!regexStatusEl) return;
    const classRows = getActiveRows().length;
    const regexPart = `${regex.length} regex rule(s)`;
    let rowPart;
    if (isDemoDictionaryId(activeSlug)) {
      rowPart = "demo sample (offline)";
    } else {
      rowPart = classRows === 0 ? "no class rows yet" : `${classRows} class row(s) in export`;
    }
    regexStatusEl.textContent = `Export (${label}): ${rowPart}; ${regexPart}`;
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
    const regexEntries = mergeRegexCheckbox.checked ? getExportRegexEntries() : [];
    const slug = isDemoDictionaryId(activeSlug) ? "chem113" : activeSlug;
    if (isDemoDictionaryId(activeSlug)) {
      return buildExportNvdaDic(rows, {
        classSlug: slug,
        regexEntries,
        mergeBundled: true,
      });
    }
    return buildNvdaDic(rows, { regexEntries });
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
    const readOnly = isDemoDictionaryId(activeSlug);
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
        : readOnly
          ? "Demo dictionary has no literal rows to show."
          : "No rows yet. Connect, pull from cloud, or add a term.";
      scrollEl?.classList.toggle("is-empty", true);
      return;
    }
    if (!indices.length) {
      tbody.innerHTML = "";
      emptyEl.classList.remove("hidden");
      emptyEl.textContent = readOnly
        ? "Demo dictionary has no literal rows to show."
        : "No rows yet. Connect, pull from cloud, or add a term.";
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
        const ro = readOnly ? " disabled readonly" : "";
        return `<tr data-idx="${rowIdx}" class="${isHit ? "is-search-active" : ""}">
          <td class="hs-dict-col-num">${displayIdx + 1}</td>
          <td><input class="ss-input hs-dict-cell" data-field="text" value="${escapeAttr(r.text)}" aria-label="Pattern row ${displayIdx + 1}"${ro} /></td>
          <td><input class="ss-input hs-dict-cell" data-field="substitution" value="${escapeAttr(r.substitution)}" aria-label="Spoken row ${displayIdx + 1}"${ro} /></td>
          <td class="hs-dict-col-note"><input class="ss-input hs-dict-cell" data-field="note" value="${escapeAttr(r.note ?? "")}" aria-label="Note row ${displayIdx + 1}"${ro} /></td>
          <td class="hs-dict-col-case">
            <select class="ss-btn hs-dict-cell hs-dict-case-select" data-field="ignore_case" aria-label="Ignore case row ${displayIdx + 1}"${readOnly ? " disabled" : ""}>
              <option value="Yes"${r.ignore_case !== "No" ? " selected" : ""}>Yes</option>
              <option value="No"${r.ignore_case === "No" ? " selected" : ""}>No</option>
            </select>
          </td>
          <td class="hs-dict-col-actions">
            <button type="button" class="ss-btn hs-dict-icon-btn hs-dict-ed-hear" data-idx="${rowIdx}" title="Hear this term">▶</button>
            ${readOnly ? "" : `<button type="button" class="ss-btn hs-dict-icon-btn hs-dict-ed-del" data-idx="${rowIdx}" title="Delete row">✕</button>`}
          </td></tr>`;
      })
      .join("");

    if (readOnly) return;

    tbody.querySelectorAll(".hs-dict-cell").forEach((el) => {
      const field = el.dataset.field;
      const tr = el.closest("tr");
      const idx = Number(tr?.dataset.idx);
      el.addEventListener("change", async () => {
        const list = getActiveRows();
        if (!list[idx]) return;
        const before = cloneRows(list);
        list[idx] = { ...list[idx], [field]: el.value };
        setActiveRows(list);
        previewActiveDictionary();
        const label = field === "text" ? "Pattern" : field === "substitution" ? "Spoken" : field;
        const saved = await saveActiveClass({
          skipConfirm: true,
          actionDescription: `Updated ${label} on row ${idx + 1}.`,
        });
        if (!saved) {
          setActiveRows(before);
          renderTable();
          setStatus(`${before.length} row(s) · save failed — reverted change`);
        }
      });
      el.addEventListener("input", () => {
        const list = getActiveRows();
        if (!list[idx]) return;
        list[idx] = { ...list[idx], [field]: el.value };
        previewActiveDictionary();
      });
    });

    tbody.querySelectorAll(".hs-dict-ed-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.dataset.idx);
        const list = getActiveRows();
        const removed = list[idx];
        if (!removed) return;
        if (
          !confirmSaveClass(
            `Delete "${removed.text}" and save this class (${list.length - 1} row${list.length - 1 === 1 ? "" : "s"} remaining).`,
          )
        ) {
          return;
        }
        const next = list.filter((_, i) => i !== idx);
        setActiveRows(next);
        renderTable();
        const saved = await saveActiveClass({
          skipConfirm: true,
          actionDescription: `Deleted "${removed.text}".`,
        });
        if (!saved) {
          setActiveRows(list);
          renderTable();
        }
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
    const demoOpt = `<option value="${DEMO_DICTIONARY_ID}"${activeSlug === DEMO_DICTIONARY_ID ? " selected" : ""}>${escapeHtml(DEMO_DICTIONARY_LABEL)}</option>`;
    const classOpts = classProfiles
      .filter((c) => c.slug !== COMBINED_COURSE_ID && !isDemoDictionaryId(c.slug))
      .map(
        (c) =>
          `<option value="${escapeAttr(c.slug)}"${c.slug === activeSlug ? " selected" : ""}>${escapeHtml(c.label || c.slug)}</option>`,
      )
      .join("");
    classSelect.innerHTML = demoOpt + classOpts;
  }

  async function refreshActiveClassFromRemote() {
    if (isDemoDictionaryId(activeSlug) || !api) return;
    const records = await api.fetchEntryRecords(activeSlug);
    setActiveRows(records);
    await api.loadCourseDictionary(activeSlug);
    rememberSavedSnapshot();
    lastDictReloadAt = Date.now();
    renderTable();
  }

  async function reloadIfDictionaryStale() {
    if (!api || isDemoDictionaryId(activeSlug)) return;
    try {
      const raw = localStorage.getItem(DICTIONARY_SYNC_STORAGE_KEY);
      if (!raw) return;
      const { classSlug, at } = JSON.parse(raw);
      if (!at || at <= lastDictReloadAt) return;
      if (classSlug && !isDemoDictionaryId(classSlug)) {
        entriesByClass[classSlug] = await api.fetchEntryRecords(classSlug);
      }
      if (dictionarySyncMatchesClass(classSlug, activeSlug)) {
        setActiveRows(entriesByClass[activeSlug] ?? []);
        await api.loadCourseDictionary(activeSlug);
        renderTable();
      }
      lastDictReloadAt = Date.now();
    } catch (_) {}
  }

  async function pullWorkspace() {
    if (!guardSupabase("Pulling from Supabase")) return;
    showClassError("");
    setStatus("Loading…");
    try {
      const { classes, entriesByClass: byClass, legacyClassSlugs = [] } =
        await api.pullEntriesWorkspace();
      classProfiles = classes;
      entriesByClass = byClass;
      legacyEntrySlugs = new Set(legacyClassSlugs);
      if (
        !isDemoDictionaryId(activeSlug) &&
        !classProfiles.some((c) => c.slug === activeSlug)
      ) {
        activeSlug = DEMO_DICTIONARY_ID;
        setStoredCourseId(activeSlug);
      }
      renderClassSelect();
      if (isDemoDictionaryId(activeSlug)) {
        applyDemoWorkspace();
      } else {
        await api.loadCourseDictionary(activeSlug);
      }
      renderTable();
      syncAddonForm();
      const n = getActiveRows().length;
      const legacyNote = legacyEntrySlugs.has(activeSlug)
        ? " · from legacy dictionary_rules — Save class to copy into entries"
        : "";
      setStatus(`Loaded ${classProfiles.length} class(es) · ${n} row(s) in ${activeSlug}${legacyNote}`);
      rememberSavedSnapshot();
      lastDictReloadAt = Date.now();
      notifyEditorSync({ classSlug: activeSlug });
      if (!isExtension) mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "dictionary", base });
    } catch (err) {
      showClassError(err.message ?? String(err));
      setStatus("");
    }
  }

  async function saveActiveClass({ skipConfirm = false, actionDescription } = {}) {
    if (saving || !guardEditableClass("Saving terms")) return false;
    const rows = getActiveRows()
      .map((r) => ({
        text: String(r.text ?? "").trim(),
        substitution: String(r.substitution ?? "").trim(),
        app: r.app || "All Apps",
        ignore_case: r.ignore_case ?? "Yes",
        note: String(r.note ?? "").trim(),
      }))
      .filter((r) => r.text && r.substitution);

    if (!skipConfirm && !confirmSaveClass(actionDescription)) return false;

    saving = true;
    updateConnectNote();
    showClassError("");
    setStatus("Saving…");
    try {
      applyLocalDictionaryPreview(activeSlug, rows);
      const { count } = await api.saveEntryRecords(activeSlug, rows);
      setActiveRows(rows);
      rememberSavedSnapshot(rows);
      legacyEntrySlugs.delete(activeSlug);
      await api.loadCourseDictionary(activeSlug);
      lastDictReloadAt = Date.now();
      setStatus(`Saved ${count} row(s) to Supabase · ${activeSlug}`);
      if (!isExtension) mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "dictionary", base });
      notifyEditorSync({ classSlug: activeSlug });
      onDictionarySaved?.({ classSlug: activeSlug, count });
      return true;
    } catch (err) {
      try {
        const rows = JSON.parse(savedRowsSnapshot);
        if (Array.isArray(rows)) {
          setActiveRows(rows);
          renderTable();
        }
      } catch (_) {}
      showClassError(err.message ?? String(err));
      setStatus("");
      return false;
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
        activeSlug = DEMO_DICTIONARY_ID;
        setStoredCourseId(activeSlug);
        applyDemoWorkspace();
        updateConnectNote();
        renderClassSelect();
        renderTable();
        setStatus(`${getDemoEntryRows().length} demo terms (read-only)`);
        showClassError("");
        if (!isExtension) mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "dictionary", base });
      },
    });
  }

  root.querySelector("#hs-dict-ed-cloud").addEventListener("click", openSettings);
  pullBtn.addEventListener("click", pullWorkspace);
  saveBtn.addEventListener("click", () => {
    void saveActiveClass();
  });

  addClassToggleBtn.addEventListener("click", () => {
    if (!guardSupabase("Creating a class")) return;
    showNewClassPanel(newClassPanel.classList.contains("hidden"));
  });
  editClassBtn.addEventListener("click", () => {
    if (!guardEditableClass("Editing class info")) return;
    showEditClassPanel(editClassPanel.classList.contains("hidden"));
  });
  root.querySelector("#hs-dict-ed-save-class-meta").addEventListener("click", () => {
    void saveClassMeta();
  });
  root.querySelector("#hs-dict-ed-cancel-edit-class").addEventListener("click", () => {
    showEditClassPanel(false);
  });
  editClassLabelInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void saveClassMeta();
  });
  editClassPrefixInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void saveClassMeta();
  });
  newClassLabelInput.addEventListener("input", () => {
    if (!newClassIdManual) newClassIdInput.value = suggestClassId(newClassLabelInput.value);
  });
  newClassIdInput.addEventListener("input", () => {
    newClassIdManual = newClassIdInput.value.trim().length > 0;
  });
  deleteClassBtn.addEventListener("click", deleteActiveClass);
  root.querySelector("#hs-dict-ed-create-class").addEventListener("click", createNewClass);
  root.querySelector("#hs-dict-ed-cancel-class").addEventListener("click", () => showNewClassPanel(false));
  newClassLabelInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createNewClass();
  });
  newClassIdInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createNewClass();
  });

  classSelect.addEventListener("change", async () => {
    showEditClassPanel(false);
    const nextSlug = classSelect.value;
    if (!isDemoDictionaryId(nextSlug) && !guardSupabase("Loading your class")) {
      classSelect.value = activeSlug;
      return;
    }
    activeSlug = nextSlug;
    setStoredCourseId(activeSlug);
    updateConnectNote();
    syncAddonForm();
    updateExportMeta();
    if (isDemoDictionaryId(activeSlug)) {
      applyDemoWorkspace();
      renderTable();
      setStatus(`${getActiveRows().length} demo terms (read-only)`);
      return;
    }
    renderTable();
    if (api) {
      try {
        if (!isDemoDictionaryId(activeSlug)) {
          await refreshActiveClassFromRemote();
        }
        notifyEditorSync({ classSlug: activeSlug });
      } catch {
        /* keep prior in-memory rules */
      }
    }
    const n = getActiveRows().length;
    rememberSavedSnapshot();
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
    void tryAddNewTerm();
  });

  for (const sel of ["#hs-dict-ed-new-pattern", "#hs-dict-ed-new-spoken"]) {
    root.querySelector(sel).addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void tryAddNewTerm();
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
  root.querySelector("#hs-dict-ed-import-btn").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;
    if (!guardEditableClass("Importing terms")) return;
    try {
      const imported = await parseImportFile(file);
      if (!imported.length) {
        showAddError("No rows found in that file. Check Pattern and Spoken columns.");
        return;
      }
      const existing = getActiveRows();
      const addToExisting = window.confirm(
        `Import ${imported.length} row(s) from "${file.name}".\n\n` +
          `OK = Add to dictionary (${existing.length} existing row(s) kept; matching Pattern updates)\n` +
          `Cancel = Replace all rows instead`,
      );
      let nextRows;
      let modeLabel;
      if (addToExisting) {
        nextRows = mergeImportRows(existing, imported);
        modeLabel = "merged";
      } else {
        const replace = window.confirm(
          `Replace all ${existing.length} row(s) in this class with ${imported.length} imported row(s)?\n\n` +
            `OK = Replace entire table\nCancel = Cancel import`,
        );
        if (!replace) {
          setStatus("Import cancelled.");
          return;
        }
        nextRows = imported;
        modeLabel = "replaced";
      }
      setActiveRows(nextRows);
      renderTable();
      showAddError("");
      const saved = await saveActiveClass({
        skipConfirm: true,
        actionDescription: `Imported ${imported.length} row(s) (${modeLabel}) · ${nextRows.length} total.`,
      });
      if (!saved) {
        setStatus(`Imported ${imported.length} row(s) (${modeLabel}) · not saved — use Save class or Pull to revert`);
      }
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

  preloadNvdaAddonDeps();

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
    const addonBtn = root.querySelector("#hs-dict-ed-export-addon");
    addonBtn.disabled = true;
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
      setStatus(`Downloaded ${result.filename}${result.pdfFilename ? ` + ${result.pdfFilename}` : ""}`);
      window.alert(result.message);
    } catch (err) {
      const msg = err?.message ?? String(err);
      showClassError(msg || "Add-on download failed. Check the browser console and allow downloads for this site.");
      setStatus("");
      console.error("NVDA add-on export failed:", err);
    } finally {
      addonBtn.disabled = false;
    }
  });

  updateConnectNote();
  renderClassSelect();
  syncAddonForm();
  updateExportMeta();

  for (const el of [
    addonIdInput,
    addonVersionInput,
    addonSummaryInput,
    addonAuthorInput,
    addonDictNameInput,
    addonDictDisplayInput,
  ]) {
    el?.addEventListener("change", scheduleAddonSave);
  }

  if (isDemoDictionaryId(activeSlug)) {
    applyDemoWorkspace();
    renderTable();
    setStatus(`${getActiveRows().length} demo terms (read-only)`);
  } else {
    renderTable();
  }

  if (api) {
    await pullWorkspace();
  } else if (!isDemoDictionaryId(activeSlug)) {
    activeSlug = DEMO_DICTIONARY_ID;
    setStoredCourseId(activeSlug);
    applyDemoWorkspace();
    renderClassSelect();
    renderTable();
    updateConnectNote();
    setStatus(`${getActiveRows().length} demo terms (read-only)`);
  }

  const unsubDictionarySync = onDictionaryUpdated(({ classSlug, source, viaStorage }) => {
    if (source === "editor" && !viaStorage) return;
    if (isDemoDictionaryId(activeSlug) || !api) return;
    if (!dictionarySyncMatchesClass(classSlug, activeSlug) && classSlug) {
      void api.fetchEntryRecords(classSlug).then((records) => {
        entriesByClass[classSlug] = records;
      });
      return;
    }
    void pullWorkspace();
  });

  const onEditorVisible = () => {
    if (document.visibilityState === "visible") void reloadIfDictionaryStale();
  };
  const onEditorFocus = () => void reloadIfDictionaryStale();
  const onEditorPageShow = (e) => {
    if (e.persisted) void reloadIfDictionaryStale();
  };
  document.addEventListener("visibilitychange", onEditorVisible);
  window.addEventListener("focus", onEditorFocus);
  window.addEventListener("pageshow", onEditorPageShow);

  return {
    pullWorkspace,
    saveActiveClass,
    getActiveSlug: () => activeSlug,
    destroy: () => {
      unsubDictionarySync();
      document.removeEventListener("visibilitychange", onEditorVisible);
      window.removeEventListener("focus", onEditorFocus);
      window.removeEventListener("pageshow", onEditorPageShow);
    },
  };
}

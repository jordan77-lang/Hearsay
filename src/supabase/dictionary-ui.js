// Dictionary panel: pick a class, reload rules, add pronunciations, rebuild combined.

import {
  createDictionaryApi,
  getStoredCourseId,
  DEMO_DICTIONARY_ID,
  setStoredCourseId,
  setStoredSupabaseConfig,
  clearStoredSupabaseConfig,
  getStoredSupabaseConfig,
  loadSupabaseConfigFromBrowser,
  COMBINED_COURSE_ID,
  guessRuleType,
} from "./dictionary-api.js";
import { openCloudSettingsModal } from "./cloud-settings.js";
import { openDictionaryViewer } from "./dictionary-viewer.js";
import { ruleCount, dictionarySource } from "../core/dictionary.js";
import { normalizePastedContent, pasteDataFromEvent } from "../core/paste-normalize.js";
import { insertAtCursor } from "../fraction-builder.js";
import { helpTip } from "../help-tip.js";

function hasCloudConfig(config) {
  return Boolean(config?.url && config?.anonKey);
}

/** User clicked Save & connect in the cloud modal (credentials in localStorage). */
function isSignedIn() {
  return Boolean(getStoredSupabaseConfig());
}

/**
 * @param {HTMLElement} root
 * @param {{ config: object, onDictionaryChange: () => void, initialCourseId?: string }} opts
 */
export function mountDictionaryPanel(root, { config: initialConfig, onDictionaryChange, initialCourseId }) {
  let activeConfig = initialConfig ?? null;
  let innerApi = null;

  const facade = {
    reload: (...args) => innerApi?.reload?.(...args),
    getCourseId: () => innerApi?.getCourseId?.() ?? null,
    isConnected: () => isSignedIn() && hasCloudConfig(activeConfig),
    canSaveRules: () => innerApi?.canSaveRules?.() ?? false,
    prefillRule: (...args) => innerApi?.prefillRule?.(...args),
    saveFindingToDictionary: (...args) => innerApi?.saveFindingToDictionary?.(...args),
  };

  function openSettings() {
    openCloudSettingsModal({
      url: activeConfig?.url ?? "",
      anonKey: activeConfig?.anonKey ?? "",
      onSave: async (saved) => {
        setStoredSupabaseConfig(saved);
        activeConfig = { ...activeConfig, ...saved };
        remount();
        onDictionaryChange?.();
      },
      onClear: async () => {
        clearStoredSupabaseConfig();
        activeConfig = await loadSupabaseConfigFromBrowser();
        remount();
        onDictionaryChange?.();
      },
    });
  }

  function remount() {
    innerApi = null;
    root.innerHTML = "";
    if (isSignedIn() && hasCloudConfig(activeConfig)) {
      innerApi = mountConnectedPanel(root, {
        config: activeConfig,
        onDictionaryChange,
        initialCourseId,
        onOpenSettings: openSettings,
      });
    } else {
      mountDisconnectedPanel(root, { onOpenSettings: openSettings });
    }
  }

  remount();
  return facade;
}

function mountDisconnectedPanel(root, { onOpenSettings }) {
  const src = dictionarySource();
  const statusNote = src.includes("supabase")
    ? `${ruleCount()} rules loaded · sign in to manage classes`
    : `${ruleCount()} bundled rules · sign in for class dictionaries`;
  root.innerHTML = `
    <section class="ss-dict-panel ss-dict-unsigned" aria-labelledby="ss-dict-h">
      <div class="ss-dict-head">
        <h2 id="ss-dict-h" class="ss-title" style="font-size:14px;margin:0">Course dictionary ${helpTip(`<p>HearSay uses pronunciation rules like a screen reader dictionary. Without signing in you get the bundled default dictionary.</p>
          <p>Click <b>☁ Connect</b> and enter your Supabase project URL and anon key to load and edit class-specific rules.</p>`)}</h2>
        <div class="ss-dict-head-actions">
          <span class="ss-type ss-dict-signin-note">${escapeHtml(statusNote)}</span>
          <button type="button" class="ss-btn primary ss-dict-cloud-btn" id="ss-dict-cloud" title="Supabase URL and anon key">☁ Connect</button>
        </div>
      </div>
      <p class="ss-sub ss-dict-hint"><b>Sign in</b> to pick a class, reload rules, and save pronunciations. Class controls below stay locked until you connect.</p>
      <div class="ss-dict-locked" inert>
        <div class="ss-controls ss-dict-controls">
          <label class="ss-type">Class:
            <select class="ss-btn" disabled aria-disabled="true">
              <option>Sign in to choose a class</option>
            </select>
          </label>
          <button type="button" class="ss-btn" disabled>Reload</button>
          <button type="button" class="ss-btn" disabled>Rebuild combined</button>
          <button type="button" class="ss-btn" disabled>+ New class</button>
        </div>
        <details class="ss-dict-add ss-dict-readonly">
          <summary class="ss-dict-add-summary">Add pronunciation rule</summary>
          <div class="ss-dict-add-body">
            <label class="ss-frac-label">Pattern (what appears in text)</label>
            <input class="ss-input ss-frac-input" type="text" disabled placeholder="e.g. J/g°C, mL, NO" />
            <label class="ss-frac-label">Spoken replacement</label>
            <input class="ss-input ss-frac-input" type="text" disabled placeholder="e.g. jools per gram degree Celsius" />
            <button type="button" class="ss-btn primary" disabled>Save to class dictionary</button>
          </div>
        </details>
      </div>
    </section>`;
  root.querySelector("#ss-dict-cloud").addEventListener("click", onOpenSettings);
}

function mountConnectedPanel(root, { config, onDictionaryChange, initialCourseId, onOpenSettings }) {
  const api = createDictionaryApi(config);
  let courseId = initialCourseId ?? getStoredCourseId(config.courseId ?? DEMO_DICTIONARY_ID);
  let courses = [];

  root.innerHTML = `
    <section class="ss-dict-panel ss-dict-signed-in" aria-labelledby="ss-dict-h">
      <div class="ss-dict-head">
        <h2 id="ss-dict-h" class="ss-title" style="font-size:14px;margin:0">Course dictionary ${helpTip(`<p><b>Class</b> — load one class’s rules for preview and editing.</p>
          <p><b>All classes (combined)</b> — preview merged rules from every class (read-only). Add rules to a specific class, then use <b>Rebuild combined</b> or <code>npm run sync:dict</code>.</p>
          <p>Changing the class reloads rules and refreshes Hear / Canvas output below.</p>`)}</h2>
        <div class="ss-dict-head-actions">
          <span id="ss-dict-meta" class="ss-type"></span>
          <button type="button" class="ss-btn ss-dict-cloud-btn" id="ss-dict-cloud" title="Supabase URL and anon key">☁ Cloud</button>
        </div>
      </div>
      <p class="ss-sub ss-dict-hint">Pick a class to preview and edit its pronunciation rules. The <b>All classes</b> dictionary is rebuilt from every class.</p>
      <p class="ss-dict-shared-warn" role="note">\u26a0 <b>Shared dictionary.</b> Adding, editing, or rebuilding rules changes the class dictionary in Supabase for <b>everyone</b> who uses it — other authors included — not just on your screen.</p>
      <div class="ss-controls ss-dict-controls">
        <label class="ss-type">Class:
          <select id="ss-course-select" class="ss-btn"></select>
        </label>
        <button type="button" class="ss-btn" id="ss-dict-view" title="View all rules in this class">View rules</button>
        <button type="button" class="ss-btn" id="ss-dict-reload" title="Reload rules from Supabase">Reload</button>
        <span class="ss-dict-rebuild-wrap" style="display:inline-flex;align-items:center;gap:2px">
          <button type="button" class="ss-btn" id="ss-dict-rebuild" title="Merge every class into All classes">Rebuild combined</button>
          ${helpTip(`<p>Merges every class dictionary into <b>All classes</b>. Run this after adding rules to a class.</p>
            <p>If rebuild fails in the browser, run <code>npm run sync:dict</code> with your service role key instead.</p>`)}
        </span>
        <button type="button" class="ss-btn" id="ss-dict-new-class" title="Create a new class dictionary">+ New class</button>
      </div>
      <details class="ss-dict-add" id="ss-dict-add">
        <summary class="ss-dict-add-summary">Add pronunciation rule ${helpTip(`<p><b>Pattern</b> — the text as it appears in curriculum (e.g. <code>J/g°C</code>, <code>qsolution</code>).</p>
          <p><b>Spoken replacement</b> — what a screen reader should say (e.g. <code>jools per gram degree Celsius</code>).</p>
          <p>Rules save to the selected class. You can also use <b>Save to class dictionary</b> on a finding below.</p>`)}</summary>
        <div class="ss-dict-add-body">
          <label class="ss-frac-label" for="ss-rule-pattern">Pattern (what appears in text) ${helpTip(`<p>The exact text as it shows up in your curriculum — the thing a screen reader currently misreads.</p>
            <p>Examples: <code>J/g°C</code>, <code>mL</code>, <code>qsolution</code>, <code>CuSO4</code>.</p>
            <p>Pasting here keeps subscript/superscript formatting so the pattern matches the source text.</p>`)}</label>
          <input id="ss-rule-pattern" class="ss-input ss-frac-input" type="text" spellcheck="false" placeholder="e.g. J/g°C, mL, NO" />
          <label class="ss-frac-label" for="ss-rule-spoken">Spoken replacement ${helpTip(`<p>What the screen reader should say <b>out loud</b> instead of the pattern.</p>
            <p>Write it phonetically in plain words: <code>jools per gram degree Celsius</code>, <code>milliliters</code>, <code>q of solution</code>.</p>`)}</label>
          <input id="ss-rule-spoken" class="ss-input ss-frac-input" type="text" spellcheck="false" placeholder="e.g. jools per gram degree Celsius" />
          <div class="ss-dict-add-row">
            <label class="ss-type">Match type ${helpTip(`<p><b>Whole word</b> — matches only as a standalone word (e.g. <code>mL</code>, not inside <code>HTML</code>). Best for most terms.</p>
              <p><b>Anywhere</b> — matches the text anywhere, even glued to numbers/letters. Good for symbols and units like <code>°C</code>.</p>
              <p><b>Regular expression</b> — advanced pattern matching for power users.</p>`)}:
              <select id="ss-rule-type" class="ss-btn">
                <option value="2">Whole word</option>
                <option value="0">Anywhere (symbol/unit)</option>
                <option value="1">Regular expression</option>
              </select>
            </label>
            <label class="ss-type ss-dict-check">
              <input type="checkbox" id="ss-rule-case" /> Case sensitive
            </label>
          </div>
          <button type="button" class="ss-btn primary" id="ss-rule-save">Save to class dictionary</button>
          <p class="ss-frac-error hidden" id="ss-rule-error" role="alert"></p>
          <p class="ss-type ss-dict-save-note hidden" id="ss-rule-success"></p>
        </div>
      </details>
      <p class="ss-frac-error hidden" id="ss-dict-error" role="alert"></p>
    </section>`;

  root.querySelector("#ss-dict-cloud").addEventListener("click", onOpenSettings);

  const courseSelect = root.querySelector("#ss-course-select");
  const metaEl = root.querySelector("#ss-dict-meta");
  const errorEl = root.querySelector("#ss-dict-error");
  const patternInput = root.querySelector("#ss-rule-pattern");
  const spokenInput = root.querySelector("#ss-rule-spoken");
  const typeSelect = root.querySelector("#ss-rule-type");
  const caseCheck = root.querySelector("#ss-rule-case");
  const ruleError = root.querySelector("#ss-rule-error");
  const ruleSuccess = root.querySelector("#ss-rule-success");
  const saveBtn = root.querySelector("#ss-rule-save");
  const SAVE_LABEL = "Save to class dictionary";

  // After a save, grey the button until an input changes so the same rule
  // isn't submitted twice and the click clearly registered.
  function markRuleSaved(updated) {
    saveBtn.disabled = true;
    saveBtn.textContent = updated ? "\u2713 Updated" : "\u2713 Added";
    saveBtn.classList.add("ss-dict-saved");
  }

  function resetSaveButton() {
    saveBtn.textContent = SAVE_LABEL;
    saveBtn.classList.remove("ss-dict-saved");
    saveBtn.disabled = courseId === COMBINED_COURSE_ID;
  }

  function showDictError(msg) {
    errorEl.textContent = msg ?? "";
    errorEl.classList.toggle("hidden", !msg);
  }

  // Writes hit the shared Supabase dictionary, so warn that changes are global.
  // Adds confirm once per browser session; destructive actions confirm every time.
  const SHARED_ACK_KEY = "hearsay-shared-write-ack";
  function confirmSharedWrite() {
    try {
      if (sessionStorage.getItem(SHARED_ACK_KEY)) return true;
    } catch {
      // sessionStorage unavailable — fall through to confirm each time.
    }
    const ok = window.confirm(
      "Heads up: this saves to the SHARED class dictionary in Supabase.\n\n" +
        "The change is global — everyone who uses this class (other authors included) " +
        "will get it, not just you. Continue?",
    );
    if (ok) {
      try {
        sessionStorage.setItem(SHARED_ACK_KEY, "1");
      } catch {
        // ignore
      }
    }
    return ok;
  }

  function showRuleError(msg) {
    ruleError.textContent = msg ?? "";
    ruleError.classList.toggle("hidden", !msg);
    if (msg) ruleSuccess.classList.add("hidden");
  }

  function showRuleSuccess(msg) {
    ruleSuccess.textContent = msg;
    ruleSuccess.classList.remove("hidden");
    ruleError.classList.add("hidden");
  }

  let lastLoadSource = null;
  let lastClassRuleCount = null;
  let lastFromEntries = false;
  let lastMergedBundled = false;
  let rulesTableMissing = false;

  function updateMeta() {
    const course = courses.find((c) => c.id === courseId);
    const label = course?.label ?? courseId;
    const src = dictionarySource();
    const total = ruleCount();
    let note = "";
    if (lastFromEntries && lastClassRuleCount != null && lastClassRuleCount > 0) {
      if (lastLoadSource === "supabase-entries+rules") {
        note = ` (${lastClassRuleCount} from Supabase entries + rules on bundled base)`;
      } else if (lastMergedBundled && lastClassRuleCount < total) {
        note = ` (${lastClassRuleCount} from Supabase entries on bundled base)`;
      } else {
        note = ` (${lastClassRuleCount} from Supabase entries)`;
      }
    } else if (
      courseId !== COMBINED_COURSE_ID &&
      lastClassRuleCount != null &&
      lastClassRuleCount > 0 &&
      lastClassRuleCount < total
    ) {
      note = ` (${lastClassRuleCount} class-specific on bundled base)`;
    } else if (lastLoadSource === "addon_defaults") note = " (from class addon_defaults)";
    else if (!src.includes("supabase")) note = " (bundled fallback)";
    metaEl.textContent = `${total} rules · ${label}${note}`;
  }

  function renderCourseOptions() {
    courseSelect.innerHTML = courses
      .map(
        (c) =>
          `<option value="${escapeAttr(c.id)}"${c.id === courseId ? " selected" : ""}>${escapeHtml(c.label)}</option>`,
      )
      .join("");
    const isCombined = courseId === COMBINED_COURSE_ID;
    root.querySelector("#ss-rule-save").disabled = isCombined;
    root.querySelector("#ss-dict-add").classList.toggle("ss-dict-readonly", isCombined);
  }

  async function refreshCourses() {
    courses = await api.listCourses();
    if (!courses.some((c) => c.id === courseId)) {
      courseId =
        courses.find((c) => c.id !== COMBINED_COURSE_ID)?.id ?? courses[0]?.id ?? DEMO_DICTIONARY_ID;
    }
    renderCourseOptions();
  }

  async function reloadDictionary(notify = true) {
    showDictError("");
    try {
      const result = await api.loadCourseDictionary(courseId);
      lastLoadSource = result.source ?? null;
      lastClassRuleCount = result.classRuleCount ?? null;
      lastFromEntries = Boolean(result.fromEntries);
      lastMergedBundled = Boolean(result.mergedBundled);
      rulesTableMissing = Boolean(result.rulesTableMissing);
      if (result.skipped) {
        const setupHint = rulesTableMissing
          ? " Run supabase/setup-dictionary-rules.sql in Supabase, then add rows on the Dictionary page or npm run push:dict."
          : "";
        showDictError(
          `No pronunciation rows for "${courseId}" yet. Add terms on the Dictionary page (entries table) or push a .dic.${setupHint}`,
        );
      } else if (rulesTableMissing && lastLoadSource === "addon_defaults") {
        showDictError(
          "Loaded seed rules from classes.addon_defaults. Run supabase/setup-dictionary-rules.sql and npm run push:dict for the full dictionary and editing.",
        );
      } else {
        showDictError("");
      }
      setStoredCourseId(courseId);
      updateMeta();
      if (notify) onDictionaryChange?.();
      return result;
    } catch (err) {
      showDictError(err.message ?? String(err));
      throw err;
    }
  }

  function prefillRule(pattern, spoken, ruleType, caseSensitive) {
    patternInput.value = pattern ?? "";
    spokenInput.value = spoken ?? "";
    typeSelect.value = String(ruleType ?? guessRuleType(pattern ?? ""));
    caseCheck.checked = Boolean(caseSensitive);
    resetSaveButton();
    ruleSuccess.classList.add("hidden");
    root.querySelector("#ss-dict-add").open = true;
    patternInput.focus();
  }

  async function saveRule() {
    if (courseId === COMBINED_COURSE_ID) {
      showRuleError('Switch to a class dictionary to add rules. Rebuild "All classes" after.');
      return;
    }
    if (!confirmSharedWrite()) return;
    showRuleError("");
    try {
      const pattern = patternInput.value.trim();
      const replacement = spokenInput.value.trim();
      const result = await api.upsertRule(courseId, {
        pattern,
        replacement,
        rule_type: Number(typeSelect.value),
        case_sensitive: caseCheck.checked,
      });
      await reloadDictionary(false);
      let combinedNote = "";
      try {
        await api.rebuildCombinedDictionary();
      } catch {
        combinedNote =
          ' All classes not updated — use Rebuild combined or run "npm run sync:dict" with a service role key.';
      }
      onDictionaryChange?.();
      markRuleSaved(result.updated);
      showRuleSuccess(
        (result.updated
          ? `Updated "${pattern}" in ${courseSelect.selectedOptions[0]?.textContent ?? courseId}.`
          : `Added "${pattern}" to ${courseSelect.selectedOptions[0]?.textContent ?? courseId}.`) +
          combinedNote,
      );
    } catch (err) {
      showRuleError(err.message ?? String(err));
    }
  }

  courseSelect.addEventListener("change", async () => {
    courseId = courseSelect.value;
    setStoredCourseId(courseId);
    renderCourseOptions();
    resetSaveButton();
    ruleSuccess.classList.add("hidden");
    await reloadDictionary();
  });

  root.querySelector("#ss-dict-view").addEventListener("click", () => {
    openDictionaryViewer({
      api,
      courseId,
      courseLabel: courses.find((c) => c.id === courseId)?.label ?? courseId,
      onEdit: (rule) => {
        if (courseId === COMBINED_COURSE_ID) {
          showRuleError("Select a class dictionary to edit rules (not All classes).");
          return;
        }
        prefillRule(rule.pattern, rule.replacement, rule.rule_type, rule.case_sensitive);
      },
    });
  });

  root.querySelector("#ss-dict-reload").addEventListener("click", () => reloadDictionary());
  root.querySelector("#ss-dict-rebuild").addEventListener("click", async () => {
    if (
      !window.confirm(
        'Rebuild combined will DELETE and rebuild the shared "All classes" dictionary in Supabase.\n\n' +
          "This is a global change affecting everyone who uses it (other authors included). Continue?",
      )
    ) {
      return;
    }
    showDictError("");
    try {
      const { count } = await api.rebuildCombinedDictionary();
      showDictError("");
      alert(`Rebuilt combined dictionary: ${count} rules.`);
      if (courseId === COMBINED_COURSE_ID) await reloadDictionary();
    } catch (err) {
      showDictError(err.message ?? String(err));
    }
  });

  root.querySelector("#ss-dict-new-class").addEventListener("click", async () => {
    const label = prompt("New class name (e.g. CHEM 114):");
    if (!label?.trim()) return;
    const id = prompt("Short id (e.g. chem114):", label.trim().toLowerCase().replace(/\s+/g, ""));
    if (!id?.trim()) return;
    showDictError("");
    try {
      const created = await api.createCourse({ id: id.trim(), label: label.trim() });
      await refreshCourses();
      courseId = created.id;
      courseSelect.value = courseId;
      setStoredCourseId(courseId);
      renderCourseOptions();
      await reloadDictionary();
    } catch (err) {
      showDictError(err.message ?? String(err));
    }
  });

  // Any edit to the rule re-enables Save (so a changed rule can be submitted)
  // and clears the prior success note.
  function onRuleFieldEdit() {
    if (saveBtn.classList.contains("ss-dict-saved")) {
      resetSaveButton();
      ruleSuccess.classList.add("hidden");
    }
  }

  patternInput.addEventListener("input", () => {
    if (typeSelect.value !== "1") typeSelect.value = String(guessRuleType(patternInput.value));
    onRuleFieldEdit();
  });
  spokenInput.addEventListener("input", onRuleFieldEdit);
  typeSelect.addEventListener("change", onRuleFieldEdit);
  caseCheck.addEventListener("change", onRuleFieldEdit);

  // Match the main editor: normalize pasted formatting (Word/HTML subscripts,
  // superscripts, glued chem variables) so the pattern matches the curriculum text.
  patternInput.addEventListener("paste", (e) => {
    e.preventDefault();
    const normalized = normalizePastedContent(pasteDataFromEvent(e));
    insertAtCursor(patternInput, normalized);
    if (typeSelect.value !== "1") typeSelect.value = String(guessRuleType(patternInput.value));
    onRuleFieldEdit();
  });

  root.querySelector("#ss-rule-save").addEventListener("click", saveRule);
  spokenInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveRule();
    }
  });

  (async () => {
    await refreshCourses();
    renderCourseOptions();
    await reloadDictionary(false);
  })();

  return {
    reload: reloadDictionary,
    getCourseId: () => courseId,
    canSaveRules: () => courseId !== COMBINED_COURSE_ID,
    prefillRule,
    async saveFindingToDictionary(finding) {
      if (!finding?.raw || !finding?.primarySpoken) return;
      if (courseId === COMBINED_COURSE_ID) {
        showRuleError("Select a class dictionary first (not All classes).");
        root.querySelector("#ss-dict-add").open = true;
        return;
      }
      patternInput.value = finding.raw;
      spokenInput.value = finding.primarySpoken;
      typeSelect.value = String(guessRuleType(finding.raw));
      await saveRule();
    },
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

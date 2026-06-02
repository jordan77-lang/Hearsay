// Dictionary panel: pick a class, reload rules, add pronunciations, rebuild combined.

import {
  createDictionaryApi,
  getStoredCourseId,
  setStoredCourseId,
  setStoredSupabaseConfig,
  clearStoredSupabaseConfig,
  getStoredSupabaseConfig,
  loadSupabaseConfigFromBrowser,
  COMBINED_COURSE_ID,
  guessRuleType,
} from "./dictionary-api.js";
import { openCloudSettingsModal } from "./cloud-settings.js";
import { ruleCount, dictionarySource } from "../core/dictionary.js";
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
  let courseId = initialCourseId ?? getStoredCourseId(config.courseId ?? "chem113");
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
      <div class="ss-controls ss-dict-controls">
        <label class="ss-type">Class:
          <select id="ss-course-select" class="ss-btn"></select>
        </label>
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
          <label class="ss-frac-label" for="ss-rule-pattern">Pattern (what appears in text)</label>
          <input id="ss-rule-pattern" class="ss-input ss-frac-input" type="text" spellcheck="false" placeholder="e.g. J/g°C, mL, NO" />
          <label class="ss-frac-label" for="ss-rule-spoken">Spoken replacement</label>
          <input id="ss-rule-spoken" class="ss-input ss-frac-input" type="text" spellcheck="false" placeholder="e.g. jools per gram degree Celsius" />
          <div class="ss-dict-add-row">
            <label class="ss-type">Match type:
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

  function showDictError(msg) {
    errorEl.textContent = msg ?? "";
    errorEl.classList.toggle("hidden", !msg);
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
  let rulesTableMissing = false;

  function updateMeta() {
    const course = courses.find((c) => c.id === courseId);
    const label = course?.label ?? courseId;
    const src = dictionarySource();
    const total = ruleCount();
    let note = "";
    if (
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
      courseId = courses.find((c) => c.id !== COMBINED_COURSE_ID)?.id ?? courses[0]?.id ?? "chem113";
    }
    renderCourseOptions();
  }

  async function reloadDictionary(notify = true) {
    showDictError("");
    try {
      const result = await api.loadCourseDictionary(courseId);
      lastLoadSource = result.source ?? null;
      lastClassRuleCount = result.classRuleCount ?? null;
      rulesTableMissing = Boolean(result.rulesTableMissing);
      if (result.skipped) {
        const setupHint = rulesTableMissing
          ? " Run supabase/setup-dictionary-rules.sql in Supabase, then npm run push:dict."
          : "";
        showDictError(`No rules for "${courseId}" yet. Push a dictionary or add rules below.${setupHint}`);
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

  async function saveRule() {
    if (courseId === COMBINED_COURSE_ID) {
      showRuleError('Switch to a class dictionary to add rules. Rebuild "All classes" after.');
      return;
    }
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
    await reloadDictionary();
  });

  root.querySelector("#ss-dict-reload").addEventListener("click", () => reloadDictionary());
  root.querySelector("#ss-dict-rebuild").addEventListener("click", async () => {
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

  patternInput.addEventListener("input", () => {
    if (typeSelect.value !== "1") typeSelect.value = String(guessRuleType(patternInput.value));
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
    prefillRule(pattern, spoken, ruleType) {
      patternInput.value = pattern ?? "";
      spokenInput.value = spoken ?? "";
      typeSelect.value = String(ruleType ?? guessRuleType(pattern ?? ""));
      root.querySelector("#ss-dict-add").open = true;
      patternInput.focus();
    },
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

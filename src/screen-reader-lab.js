// Screen Reader Lab: paste plain quiz text, compare raw vs dictionary speech.

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
} from "./supabase/dictionary-api.js";
import { loadBareClassDictionary, loadBundledChemistryDictionary, ruleCount } from "./core/dictionary.js";
import {
  toLabDictionarySpeechByLine,
  toDefaultScreenReaderSpeechByLine,
  formatBaselineSpeechHtmlByLine,
  formatDictionarySpeechHtmlByLine,
  labFlaggedSpeechTokens,
  createLabTokenLinkResolver,
  setLabTokenLinkResolver,
} from "./core/transform.js";
import {
  inspectPasteFromEvent,
  inspectPulledText,
  findFractionCandidatesInText,
  FLATTENED_FRACTION_NOTICE,
} from "./core/fraction-detect.js";
import { insertTextWithUndo, replaceTextareaValueWithUndo, openFractionBuilder } from "./fraction-builder.js";
import { createHearController } from "./hear-ui.js";
import { helpTip, bindHelpTips } from "./help-tip.js";
import { preloadSpeech, cancelSpeech, subscribeSpeechState } from "./speech.js";
import { pullTextFromActiveTab, pullSourceLabel } from "./extension/pull-from-tab.js";
import {
  onDictionaryUpdated,
  notifyDictionaryUpdated,
  DICTIONARY_SYNC_STORAGE_KEY,
  dictionarySyncMatchesClass,
} from "./dictionary-sync.js";
import { previewTermSpeech } from "./core/dictionary.js";
import { SR_PROFILES, setDefaultSrProfile } from "./core/default-sr-speech.js";

const SR_PROFILE_STORAGE_KEY = "hearsay-sr-profile";

function loadStoredSrProfile() {
  try {
    return setDefaultSrProfile(localStorage.getItem(SR_PROFILE_STORAGE_KEY) ?? "nvda");
  } catch {
    return setDefaultSrProfile("nvda");
  }
}

function storeSrProfile(id) {
  try {
    localStorage.setItem(SR_PROFILE_STORAGE_KEY, id);
  } catch {
    /* private mode */
  }
}

const SAMPLE = `Heat 10 mL of DI water from 25°C to 30°C. The specific heat capacity is (J/g°C).

Calculate q = mcΔT. Report energy in kJ/mol.`;

const HELP = {
  paste: `<p>Paste from Google Docs, Word, an LMS page, or elsewhere — HearSay normalizes subscripts and glued variables (<code>qcalorimeter</code>, <code>T2</code>).</p>
    <p><b>Google Docs equations</b> lose their fraction bar on copy (e.g. <code>29 dogs30 rats</code>). HearSay inserts “divided by” and the course dictionary speaks it the same way.</p>
    <p>For a visible numerator and denominator with a horizontal line, use your LMS or document equation editor when students will read it there (Google Docs drafts only — add a spoken cue for students).</p>
    <p>The <b>default + dictionary</b> column uses HearSay’s full speech engine (built-in reading plus your class terms), not raw NVDA substitution alone.</p>`,
  without: `<p>What the selected screen reader reads <b>with no speech dictionary</b>, at true factory settings. <b>NVDA</b> (punctuation “some”) speaks math symbols, bullets, and subscript digits but passes parentheses, quotes, and dashes to the voice as pauses. <b>JAWS</b> (punctuation “Most”) also names parentheses, quotes, colons, and dashes. Normal text matches what students see. <span class="hs-lab-speech-baseline">Blue</span> = spelled-out symbol names (e.g. <code>J/g°C</code> → J slash g degrees C). Unit expansions like “joules per gram…” require a dictionary — green in the right column.</p>`,
  with: `<p>Same text with your <b>saved class dictionary</b> loaded. Class rules always win over default screen reader symbol speech. Normal text is unchanged. <span class="hs-lab-speech-dict">Green</span> = your class dictionary. <span class="hs-lab-speech-baseline">Blue</span> = default screen reader (selected reader at factory settings) where your class has no rule.</p>`,
  tokens: `<p>Tokens in passage order where pronunciation changes. <span class="hs-lab-speech-baseline">Blue</span> = default screen reader — use <b>Add</b> to save a class pronunciation. <span class="hs-lab-speech-dict">Green</span> = your saved class dictionary. Click highlighted speech above to jump here. <b>Edit</b> → change spoken text → <b>▶ Hear</b> → <b>Save</b>.</p>`,
  addTerm: `<p>Type the <b>word or symbol</b> exactly as it appears in student materials, then how the screen reader should say it. Saves to your class dictionary and updates every open HearSay tab immediately.</p>`,
  fractions: `<p>HearSay found one or more fractions. <b>Use \\frac</b> replaces glued text with LaTeX HearSay reads correctly. <b>Save to dictionary</b> stores the spoken form for your class. <b>Build fraction</b> opens the step-by-step fraction wizard.</p>`,
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * @param {HTMLElement} root
 * @param {{ base?: string, context?: 'web'|'extension', onNavigate?: (view: 'lab'|'dictionary') => void }} opts
 */
export async function mountScreenReaderLab(
  root,
  { base = "..", context = "web", onNavigate, registerDictionaryReload } = {},
) {
  const isExtension = context === "extension";
  const dictLink = isExtension
    ? `<button type="button" class="hs-inline-link hs-ext-nav-link" data-hs-ext-nav="dictionary">Dictionary</button>`
    : `<a href="${base.replace(/\/$/, "")}/dictionary/">Dictionary</a>`;
  const dictFootLink = isExtension
    ? `<button type="button" class="hs-inline-link hs-ext-nav-link" data-hs-ext-nav="dictionary">Dictionary tab</button>`
    : `<a href="${base.replace(/\/$/, "")}/dictionary/">Export NVDA add-on on Dictionary →</a>`;
  let config = await loadSupabaseConfigFromBrowser();
  let api = config?.url && config?.anonKey ? createDictionaryApi(config) : null;
  let courses = [];
  let activeCourse = getStoredCourseId();
  if (activeCourse === COMBINED_COURSE_ID) activeCourse = DEMO_DICTIONARY_ID;

  root.innerHTML = `
    ${isExtension ? "" : '<div class="hs-site-nav-mount"></div>'}
    <main class="ss-wrap hs-lab">
      <header class="hs-lab-head ss-page-header">
        <h1 class="ss-title">Screen Reader Lab ${helpTip("<p>Test how quiz or assignment text reads <b>with</b> your course NVDA dictionary — the same path students hear in the browser.</p>")}</h1>
        <p class="ss-sub">Left = plain visible text as a typical screen reader reads it (no class dictionary). Right = same text plus your <b>class dictionary</b> when saved (green). Pick a class (☁ Connect) or <b>Demo dictionary</b>. Export on ${dictLink}.</p>
      </header>

      <section class="hs-lab-card" aria-label="Connection">
        <div class="hs-lab-card-head">
          <p id="hs-lab-connect-note" class="ss-sub hs-lab-connect-note"></p>
          <button type="button" class="ss-btn" id="hs-lab-cloud">☁ Connect</button>
        </div>
        <label class="hs-lab-field">
          <span class="hs-lab-label">Class dictionary</span>
          <select id="hs-lab-class" class="ss-btn">
            <option value="demo">Demo dictionary (sample chemistry)</option>
          </select>
        </label>
        <p id="hs-lab-dict-meta" class="ss-type hs-lab-dict-meta" aria-live="polite"></p>
      </section>

      <section class="hs-lab-card" aria-labelledby="hs-lab-add-term-h">
        <h2 id="hs-lab-add-term-h" class="hs-lab-card-title">Add word &amp; pronunciation ${helpTip(HELP.addTerm)}</h2>
        <p id="hs-lab-add-hint" class="ss-sub hs-lab-add-hint"></p>
        <div class="hs-lab-add-pronunciation">
          <label class="hs-lab-field">
            <span class="hs-lab-label">Word (in text)</span>
            <input type="text" id="hs-lab-add-pattern" class="ss-input hs-dict-inline-input" placeholder="e.g. ✕, ΔT, nozzle, J/g°C" autocomplete="off" />
          </label>
          <label class="hs-lab-field">
            <span class="hs-lab-label">Pronunciation</span>
            <input type="text" id="hs-lab-add-spoken" class="ss-input hs-dict-inline-input" placeholder="e.g. times, delta T, how students should hear it" autocomplete="off" />
          </label>
          <div class="hs-lab-add-pronunciation-btns">
            <button type="button" class="ss-btn primary" id="hs-lab-add-save">Add &amp; save</button>
            <button type="button" class="ss-btn" id="hs-lab-add-hear" title="Hear pronunciation before saving">▶ Hear</button>
          </div>
        </div>
        <p id="hs-lab-add-error" class="ss-type hs-lab-add-error hidden" role="alert"></p>
      </section>

      <section class="hs-lab-card" aria-labelledby="hs-lab-paste-h">
        <h2 id="hs-lab-paste-h" class="hs-lab-card-title">Text to preview ${helpTip(HELP.paste)}</h2>
        <textarea id="hs-lab-input" class="ss-input hs-lab-textarea" rows="8" placeholder="Paste or type plain text from a handout, quiz, lab, or LMS page…"></textarea>
        <p id="hs-lab-paste-notice" class="hs-lab-paste-notice hidden" role="status" aria-live="polite"></p>
        <p id="hs-lab-pull-status" class="hs-ext-scan-status ss-type hidden" role="status" aria-live="polite"></p>
        <div class="hs-lab-paste-actions">
          ${
            isExtension
              ? `<button type="button" class="ss-btn primary" id="hs-lab-pull" title="Read selection or the focused editor from the active browser tab">Pull from page</button>`
              : ""
          }
          <button type="button" class="ss-btn" id="hs-lab-sample">Load sample</button>
          <button type="button" class="ss-btn" id="hs-lab-insert-frac" title="Build \\frac{numerator}{denominator} at cursor">Insert fraction</button>
          <button type="button" class="ss-btn" id="hs-lab-clear">Clear</button>
        </div>
      </section>

      <section id="hs-lab-fractions-card" class="hs-lab-card hidden" aria-labelledby="hs-lab-fractions-h">
        <h2 id="hs-lab-fractions-h" class="hs-lab-card-title">Fractions detected ${helpTip(HELP.fractions)}</h2>
        <ul id="hs-lab-fraction-list" class="hs-lab-fraction-list" role="list"></ul>
        <p id="hs-lab-fraction-status" class="ss-type hs-lab-fraction-status hidden" role="status" aria-live="polite"></p>
      </section>

      <p class="hs-lab-legend ss-type" role="note">
        <span class="hs-lab-legend-item">Normal = on-screen text</span>
        <span class="hs-lab-legend-item"><span class="hs-lab-legend-swatch is-baseline" aria-hidden="true"></span> Blue = default screen reader</span>
        <span class="hs-lab-legend-item"><span class="hs-lab-legend-swatch is-dict" aria-hidden="true"></span> Green = class dictionary</span>
      </p>
      <section class="hs-lab-compare" aria-label="Speech comparison">
        <div class="hs-lab-panel">
          <div class="hs-lab-panel-head">
            <h3 class="hs-lab-panel-title">Default screen reader ${helpTip(HELP.without)}</h3>
            <label class="hs-lab-sr-profile ss-type">Reader
              <select id="hs-lab-sr-profile" aria-label="Default screen reader profile">
                ${Object.values(SR_PROFILES)
                  .map((p) => `<option value="${p.id}">${escapeHtml(p.label)}</option>`)
                  .join("")}
              </select>
            </label>
            <div class="hs-lab-panel-hear-btns">
              <button type="button" class="ss-btn" id="hs-lab-hear-raw" title="Hear visible text">▶ Hear</button>
              <button type="button" class="ss-btn hs-lab-hear-pause" id="hs-lab-pause-raw" disabled title="Pause playback">⏸ Pause</button>
            </div>
          </div>
          <div class="hs-lab-output-scroll" id="hs-lab-raw-scroll">
            <div id="hs-lab-raw-out" class="hs-lab-output">Paste text above to preview.</div>
          </div>
        </div>
        <div class="hs-lab-panel hs-lab-panel-dict">
          <div class="hs-lab-panel-head">
            <div class="hs-lab-panel-head-text">
              <h3 class="hs-lab-panel-title" id="hs-lab-dict-panel-title">Default screen reader and dictionary ${helpTip(HELP.with)}</h3>
              <p id="hs-lab-dict-panel-meta" class="hs-lab-panel-meta ss-type" aria-live="polite"></p>
            </div>
            <div class="hs-lab-panel-hear-btns">
              <button type="button" class="ss-btn primary" id="hs-lab-hear-dict" title="Hear dictionary speech">▶ Hear</button>
              <button type="button" class="ss-btn hs-lab-hear-pause" id="hs-lab-pause-dict" disabled title="Pause playback">⏸ Pause</button>
            </div>
          </div>
          <div class="hs-lab-output-scroll" id="hs-lab-dict-scroll">
            <div id="hs-lab-dict-out" class="hs-lab-output">Paste text above to preview.</div>
          </div>
          <p id="hs-lab-changed" class="hs-lab-changed hidden" aria-live="polite"></p>
        </div>
      </section>

      <section class="hs-lab-card" aria-labelledby="hs-lab-tokens-h">
        <h2 id="hs-lab-tokens-h" class="hs-lab-card-title">Flagged tokens ${helpTip(HELP.tokens)}</h2>
        <p id="hs-lab-token-empty" class="ss-sub">No risky tokens detected yet.</p>
        <div id="hs-lab-token-scroll" class="hs-lab-token-scroll hidden">
          <p class="hs-lab-legend hs-lab-token-legend ss-type" role="note">
            <span class="hs-lab-legend-item"><span class="hs-lab-legend-swatch is-baseline" aria-hidden="true"></span> Blue = default screen reader</span>
            <span class="hs-lab-legend-item"><span class="hs-lab-legend-swatch is-dict" aria-hidden="true"></span> Green = class dictionary</span>
          </p>
          <ul id="hs-lab-token-list" class="hs-lab-token-list" role="list"></ul>
        </div>
        <p id="hs-lab-token-save-status" class="ss-type hs-lab-token-save-status hidden" role="status" aria-live="polite"></p>
      </section>

      <p class="ss-sub hs-lab-foot">
        Ready for students? ${dictFootLink}
      </p>
    </main>`;

  if (!isExtension) {
    mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "lab", base });
  }
  bindHelpTips(root);
  preloadSpeech();

  const hear = createHearController();
  const connectNote = root.querySelector("#hs-lab-connect-note");
  const classSelect = root.querySelector("#hs-lab-class");
  const dictMeta = root.querySelector("#hs-lab-dict-meta");
  const input = root.querySelector("#hs-lab-input");
  const rawOut = root.querySelector("#hs-lab-raw-out");
  const dictOut = root.querySelector("#hs-lab-dict-out");
  const rawScroll = root.querySelector("#hs-lab-raw-scroll");
  const dictScroll = root.querySelector("#hs-lab-dict-scroll");
  const changedEl = root.querySelector("#hs-lab-changed");
  const tokenEmpty = root.querySelector("#hs-lab-token-empty");
  const tokenScroll = root.querySelector("#hs-lab-token-scroll");
  const tokenList = root.querySelector("#hs-lab-token-list");
  const tokenSaveStatus = root.querySelector("#hs-lab-token-save-status");
  const addPatternInput = root.querySelector("#hs-lab-add-pattern");
  const addSpokenInput = root.querySelector("#hs-lab-add-spoken");
  const addErrorEl = root.querySelector("#hs-lab-add-error");
  const addHintEl = root.querySelector("#hs-lab-add-hint");
  const addSaveBtn = root.querySelector("#hs-lab-add-save");
  const addHearBtn = root.querySelector("#hs-lab-add-hear");
  const fractionsCard = root.querySelector("#hs-lab-fractions-card");
  const fractionList = root.querySelector("#hs-lab-fraction-list");
  const fractionStatus = root.querySelector("#hs-lab-fraction-status");
  const pasteNotice = root.querySelector("#hs-lab-paste-notice");
  const dictPanelTitle = root.querySelector("#hs-lab-dict-panel-title");
  const dictPanelMeta = root.querySelector("#hs-lab-dict-panel-meta");
  const pauseRawBtn = root.querySelector("#hs-lab-pause-raw");
  const pauseDictBtn = root.querySelector("#hs-lab-pause-dict");
  let lastDictLoad = { classRuleCount: 0, mergeBundled: false, skipped: true };
  let dictLoadSeq = 0;
  let lastDictReloadAt = 0;

  function showPasteNotice(message) {
    if (!message) {
      pasteNotice.classList.add("hidden");
      pasteNotice.textContent = "";
      return;
    }
    pasteNotice.textContent = message;
    pasteNotice.classList.remove("hidden");
  }

  function updateConnectNote() {
    const card = root.querySelector(".hs-lab-card");
    const signedIn = isSupabaseConnected();
    if (signedIn && config?.url) {
      connectNote.textContent = `Connected to Supabase · ${config.url.replace(/^https:\/\//, "")}`;
      card?.classList.add("is-connected");
      card?.classList.remove("needs-connect");
    } else {
      connectNote.textContent =
        "Not connected — use ☁ Connect to load your classes. Demo dictionary works offline for preview.";
      card?.classList.remove("is-connected");
      card?.classList.add("needs-connect");
    }
    updateAddPronunciationControls();
  }

  function guardSupabase(feature) {
    const ok = requireSupabaseConnection({
      feature,
      api,
      onConnect: () => root.querySelector("#hs-lab-cloud")?.click(),
    });
    if (!ok) showLabConnectError(supabaseConnectMessage(feature));
    return ok;
  }

  function showLabConnectError(msg) {
    connectNote.textContent = msg;
  }

  function getActiveClassLabel() {
    if (isDemoDictionaryId(activeCourse)) return DEMO_DICTIONARY_LABEL;
    const course = courses.find((c) => c.id === activeCourse);
    return course?.label || activeCourse || "Class dictionary";
  }

  function updateDictPanelCaption() {
    const label = getActiveClassLabel();
    if (dictPanelTitle) {
      dictPanelTitle.textContent = `Default screen reader and dictionary — ${label}`;
    }
    if (!dictPanelMeta) return;
    const n = ruleCount();
    const { classRuleCount, mergeBundled, skipped } = lastDictLoad;
    if (isDemoDictionaryId(activeCourse)) {
      dictPanelMeta.textContent = `${n} rules · offline demo sample`;
      return;
    }
    if (!api) {
      dictPanelMeta.textContent = "Connect Supabase to preview your classes";
      return;
    }
    if (skipped) {
      dictPanelMeta.textContent = `${label}: no saved terms yet`;
      return;
    }
    dictPanelMeta.textContent = `${n} rules · ${classRuleCount} class row(s)`;
  }

  function updateDictMeta() {
    updateDictPanelCaption();
    const n = ruleCount();
    const { classRuleCount, mergeBundled, skipped } = lastDictLoad;
    if (isDemoDictionaryId(activeCourse)) {
      dictMeta.textContent = `${n} rules · ${DEMO_DICTIONARY_LABEL} (offline sample)`;
      return;
    }
    if (!api) {
      dictMeta.textContent = "Connect Supabase to load your class dictionaries.";
      return;
    }
    if (skipped) {
      dictMeta.textContent = `${activeCourse}: no saved terms yet — add rows in Dictionary.`;
      return;
    }
    dictMeta.textContent = `${n} rules · ${activeCourse} (${classRuleCount} class row(s))`;
  }

  function renderClassSelect() {
    const demoOpt = `<option value="${DEMO_DICTIONARY_ID}"${activeCourse === DEMO_DICTIONARY_ID ? " selected" : ""}>${escapeHtml(DEMO_DICTIONARY_LABEL)}</option>`;
    const list = courses.filter((c) => c.id !== COMBINED_COURSE_ID && !isDemoDictionaryId(c.id));
    classSelect.disabled = false;
    classSelect.innerHTML =
      demoOpt +
      (list.length
        ? list
            .map(
              (c) =>
                `<option value="${escapeHtml(c.id)}"${c.id === activeCourse ? " selected" : ""}>${escapeHtml(c.label || c.id)}</option>`,
            )
            .join("")
        : "");
  }

  async function loadDictionaryForCourse(courseId) {
    const loadId = ++dictLoadSeq;
    activeCourse = courseId;
    setStoredCourseId(courseId);
    updateDictPanelCaption();

    if (isDemoDictionaryId(courseId)) {
      loadBundledChemistryDictionary("demo");
      lastDictLoad = {
        classRuleCount: 0,
        mergeBundled: true,
        skipped: false,
        source: "demo",
      };
      if (loadId !== dictLoadSeq) return;
      updateDictMeta();
      refreshPreview();
      if (!isExtension) mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "lab", base });
      lastDictReloadAt = Date.now();
      updateAddPronunciationControls();
      return;
    }

    if (!api) {
      loadBareClassDictionary("offline-not-connected");
      lastDictLoad = { classRuleCount: 0, mergeBundled: false, skipped: true };
      if (loadId !== dictLoadSeq) return;
      updateDictMeta();
      refreshPreview();
      updateAddPronunciationControls();
      return;
    }
    try {
      lastDictLoad = await api.loadCourseDictionary(courseId);
      if (loadId !== dictLoadSeq) return;
      updateDictMeta();
      if (!isExtension) mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "lab", base });
    } catch {
      if (loadId !== dictLoadSeq) return;
      lastDictLoad = { classRuleCount: 0, mergeBundled: false, skipped: true };
      updateDictMeta();
    }
    if (loadId === dictLoadSeq) lastDictReloadAt = Date.now();
    refreshPreview();
    updateAddPronunciationControls();
  }

  async function pullCourses() {
    if (!api) return;
    try {
      courses = await api.listCourses();
      if (
        !isDemoDictionaryId(activeCourse) &&
        !courses.some((c) => c.id === activeCourse)
      ) {
        activeCourse = DEMO_DICTIONARY_ID;
        setStoredCourseId(activeCourse);
      }
      renderClassSelect();
      if (activeCourse) await loadDictionaryForCourse(activeCourse);
    } catch {
      courses = [];
      renderClassSelect();
      if (isDemoDictionaryId(activeCourse)) await loadDictionaryForCourse(activeCourse);
    }
  }

  function hasActiveClassDictionary() {
    if (isDemoDictionaryId(activeCourse)) return true;
    const { skipped, mergeBundled, classRuleCount } = lastDictLoad;
    return !skipped && !mergeBundled && (classRuleCount ?? 0) > 0;
  }

  let lastFlaggedTokens = [];
  let savingToken = false;
  let lastFractionCandidates = [];

  function canEditDictTokens() {
    return Boolean(api) && !isDemoDictionaryId(activeCourse);
  }

  function canUseAddPronunciation() {
    return canEditDictTokens();
  }

  function showAddTermError(msg) {
    if (!addErrorEl) return;
    if (!msg) {
      addErrorEl.textContent = "";
      addErrorEl.classList.add("hidden");
      return;
    }
    addErrorEl.textContent = msg;
    addErrorEl.classList.remove("hidden");
  }

  function updateAddPronunciationControls() {
    const on = canUseAddPronunciation();
    addPatternInput?.toggleAttribute("disabled", !on);
    addSpokenInput?.toggleAttribute("disabled", !on);
    addSaveBtn?.toggleAttribute("disabled", !on || savingToken);
    addHearBtn?.toggleAttribute("disabled", !on);
    if (addHintEl) {
      if (on) {
        addHintEl.textContent = `Saving to ${getActiveClassLabel()}. Use ▶ Hear to test before Add & save.`;
      } else if (isDemoDictionaryId(activeCourse)) {
        addHintEl.textContent =
          "Demo dictionary is read-only. Connect with ☁ Connect and select your class to add words.";
      } else if (!api) {
        addHintEl.textContent = "Connect with ☁ Connect above, then pick your class to add words.";
      } else {
        addHintEl.textContent = "Select your class above to add words.";
      }
    }
    if (!on) showAddTermError("");
  }

  function exitTokenEditRow(row) {
    if (!row) return;
    row.classList.remove("is-editing");
    const input = row.querySelector(".hs-lab-token-edit");
    const spokenEl = row.querySelector(".hs-lab-token-spoken");
    if (input && spokenEl) input.value = spokenEl.textContent ?? "";
    row.querySelector(".hs-lab-token-view")?.classList.remove("hidden");
    row.querySelector(".hs-lab-token-edit-panel")?.classList.add("hidden");
    row.querySelector(".hs-lab-token-actions-view")?.classList.remove("hidden");
    row.querySelector(".hs-lab-token-actions-edit")?.classList.add("hidden");
    if (row.querySelector(".hs-lab-token-hear")?.classList.contains("ss-hear-playing")) {
      cancelSpeech();
    }
  }

  function enterTokenEdit(row) {
    if (!row || savingToken) return;
    tokenList.querySelectorAll(".hs-lab-token.is-editing").forEach(exitTokenEditRow);
    row.classList.add("is-editing");
    row.querySelector(".hs-lab-token-view")?.classList.add("hidden");
    row.querySelector(".hs-lab-token-edit-panel")?.classList.remove("hidden");
    row.querySelector(".hs-lab-token-actions-view")?.classList.add("hidden");
    row.querySelector(".hs-lab-token-actions-edit")?.classList.remove("hidden");
    const input = row.querySelector(".hs-lab-token-edit");
    input?.focus();
    input?.select();
  }

  function closeAllTokenEdits() {
    tokenList.querySelectorAll(".hs-lab-token.is-editing").forEach(exitTokenEditRow);
  }

  function scrollToFlaggedToken(id) {
    const el = tokenList.querySelector(`[data-token-id="${id}"]`);
    if (!el) return;
    tokenScroll?.classList.remove("hidden");
    tokenEmpty.classList.add("hidden");
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    tokenList.querySelectorAll(".hs-lab-token.is-active").forEach((n) => n.classList.remove("is-active"));
    el.classList.add("is-active");
    const focusTarget = el.querySelector(".hs-lab-token-edit-btn, .hs-lab-token-spoken");
    focusTarget?.focus?.({ preventScroll: true });
  }

  function bindSpeechColumnLinks(container) {
    if (!container) return;
    container.addEventListener("click", (e) => {
      const link = e.target.closest?.(".hs-lab-speech-link");
      if (!link) return;
      e.preventDefault();
      const id = link.getAttribute("data-lab-token");
      if (id != null) scrollToFlaggedToken(id);
    });
    container.addEventListener("keydown", (e) => {
      const link = e.target.closest?.(".hs-lab-speech-link");
      if (!link || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      const id = link.getAttribute("data-lab-token");
      if (id != null) scrollToFlaggedToken(id);
    });
  }

  bindSpeechColumnLinks(rawOut);
  bindSpeechColumnLinks(dictOut);

  let syncScrollLock = false;
  let hearScrollLock = false;
  function bindSyncedLabScroll(a, b) {
    if (!a || !b) return;
    a.addEventListener("scroll", () => {
      if (syncScrollLock || hearScrollLock) return;
      syncScrollLock = true;
      b.scrollTop = a.scrollTop;
      syncScrollLock = false;
    });
  }
  bindSyncedLabScroll(rawScroll, dictScroll);
  bindSyncedLabScroll(dictScroll, rawScroll);

  let hearHighlightRoot = null;

  function clearLabHearHighlight() {
    for (const root of [rawOut, dictOut]) {
      root?.querySelectorAll(".hs-lab-output-line.is-hearing").forEach((el) => {
        el.classList.remove("is-hearing");
      });
    }
    hearHighlightRoot = null;
  }

  /** Pin a line to the top of its scroll panel (relative to visible viewport). */
  function scrollLabLineToTop(scrollHost, line) {
    if (!scrollHost || !line) return;
    const hostRect = scrollHost.getBoundingClientRect();
    const lineRect = line.getBoundingClientRect();
    scrollHost.scrollTop += lineRect.top - hostRect.top;
  }

  /** Highlight the same input line in both columns and keep it pinned to the top while Hear plays. */
  function highlightLabHearLine(lineIndex) {
    if (lineIndex == null) return;
    clearLabHearHighlight();
    hearScrollLock = true;
    try {
      for (const container of [rawOut, dictOut]) {
        const line = container?.querySelector(`.hs-lab-output-line[data-line="${lineIndex}"]`);
        if (!line) continue;
        line.classList.add("is-hearing");
        scrollLabLineToTop(container.closest(".hs-lab-output-scroll"), line);
      }
    } finally {
      hearScrollLock = false;
    }
    hearHighlightRoot = rawOut;
  }

  /** @param {string} raw @param {(line: string, lineIndex: number) => string} speakLine */
  function buildLabHearChunks(raw, speakLine) {
    return String(raw ?? "")
      .split(/\r?\n/)
      .map((line, lineIndex) => ({
        lineIndex,
        text: line.trim() ? String(speakLine(line, lineIndex) ?? "").trim() : "",
      }))
      .filter((chunk) => chunk.text);
  }

  function playLabHear(btn, meta, chunks) {
    hear.play(btn, meta, chunks, {
      onChunkStart: (chunk) => highlightLabHearLine(chunk.lineIndex),
      onStop: () => clearLabHearHighlight(),
    });
    updateLabPauseButtons(true);
  }

  function updateLabPauseButtons(forcePlaying) {
    const playing = forcePlaying === true || hear.isPlaying();
    const paused = hear.isPaused();
    for (const btn of [pauseRawBtn, pauseDictBtn]) {
      if (!btn) continue;
      btn.disabled = !playing;
      btn.textContent = paused ? hear.RESUME_LABEL : hear.PAUSE_LABEL;
      btn.title = paused ? "Resume playback" : "Pause playback";
      btn.setAttribute("aria-label", btn.title);
      btn.classList.toggle("is-paused", paused && playing);
    }
  }

  hear.subscribePauseState?.(() => updateLabPauseButtons());
  subscribeSpeechState(() => {
    if (!hear.isPlaying()) updateLabPauseButtons(false);
  });

  function bindLabPauseButton(btn) {
    btn?.addEventListener("click", () => {
      if (!hear.isPlaying()) return;
      hear.togglePause();
      updateLabPauseButtons(true);
    });
  }
  bindLabPauseButton(pauseRawBtn);
  bindLabPauseButton(pauseDictBtn);

  function showTokenSaveStatus(message, isError = false) {
    if (!message) {
      tokenSaveStatus.classList.add("hidden");
      tokenSaveStatus.textContent = "";
      tokenSaveStatus.classList.remove("is-error");
      return;
    }
    tokenSaveStatus.textContent = message;
    tokenSaveStatus.classList.remove("hidden");
    tokenSaveStatus.classList.toggle("is-error", isError);
  }

  function confirmSaveDictToken({ pattern, spoken, tokenRaw }) {
    const label = getActiveClassLabel();
    const visible = tokenRaw || pattern;
    return window.confirm(
      `Save pronunciation to "${label}"?\n\n` +
        `${visible} → ${spoken}\n\n` +
        "This updates the shared class dictionary for all authors and students using this class.",
    );
  }

  function playTokenEditHear(btn, row) {
    const input = row?.querySelector(".hs-lab-token-edit");
    const spoken = String(input?.value ?? "").trim();
    if (!spoken) {
      showTokenSaveStatus("Enter spoken text before hearing.", true);
      input?.focus();
      return;
    }
    showTokenSaveStatus(null);
    hear.play(btn, { hearLabel: "▶ Hear", hearTitle: "Hear edited pronunciation" }, spoken);
  }

  async function saveDictTokenFromLab({ pattern, spoken }) {
    if (savingToken || !guardSupabase("Saving to your class dictionary")) return false;
    if (isDemoDictionaryId(activeCourse)) {
      showTokenSaveStatus("Demo dictionary is read-only. Connect and select your class to save terms.", true);
      return false;
    }
    const trimmedPattern = String(pattern ?? "").trim();
    const trimmedSpoken = String(spoken ?? "").trim();
    if (!trimmedPattern || !trimmedSpoken) return false;
    const label = getActiveClassLabel();
    savingToken = true;
    showTokenSaveStatus("Saving…");
    try {
      const entriesTable = await api.probeEntriesTable();
      if (entriesTable.exists) {
        let records = await api.fetchEntryRecords(activeCourse);
        const idx = records.findIndex((r) => r.text === trimmedPattern);
        if (idx >= 0) {
          records[idx] = { ...records[idx], substitution: trimmedSpoken };
        } else {
          records.push({
            text: trimmedPattern,
            substitution: trimmedSpoken,
            app: "All Apps",
            ignore_case: "Yes",
            note: "Edited in Screen Reader Lab",
          });
        }
        await api.saveEntryRecords(activeCourse, records);
      } else {
        await api.upsertRule(activeCourse, {
          pattern: trimmedPattern,
          replacement: trimmedSpoken,
        });
      }
      await loadDictionaryForCourse(activeCourse);
      notifyDictionaryUpdated({ classSlug: activeCourse, source: "lab" });
      showTokenSaveStatus(`Saved "${trimmedPattern}" to ${label}.`);
      refreshPreview();
      return true;
    } catch (err) {
      showTokenSaveStatus(err.message ?? String(err), true);
      return false;
    } finally {
      savingToken = false;
      updateAddPronunciationControls();
    }
  }

  async function tryAddPronunciationFromForm() {
    if (!canUseAddPronunciation()) {
      showAddTermError("Connect and select your class to add pronunciations.");
      return;
    }
    const pattern = addPatternInput?.value?.trim() ?? "";
    const spoken = addSpokenInput?.value?.trim() ?? "";
    if (!pattern) {
      showAddTermError("Enter the word or symbol as it appears in student text.");
      addPatternInput?.focus();
      return;
    }
    if (!spoken) {
      showAddTermError("Enter the pronunciation (how students should hear it).");
      addSpokenInput?.focus();
      return;
    }
    if (!confirmSaveDictToken({ pattern, spoken, tokenRaw: pattern })) return;
    showAddTermError("");
    const saved = await saveDictTokenFromLab({ pattern, spoken });
    if (saved) {
      addPatternInput.value = "";
      addSpokenInput.value = "";
    }
  }

  function showFractionStatus(message, isError = false) {
    if (!fractionStatus) return;
    if (!message) {
      fractionStatus.textContent = "";
      fractionStatus.classList.add("hidden");
      fractionStatus.classList.remove("is-error");
      return;
    }
    fractionStatus.textContent = message;
    fractionStatus.classList.remove("hidden");
    fractionStatus.classList.toggle("is-error", isError);
  }

  function fractionKindLabel(kind) {
    if (kind === "latex") return "LaTeX fraction";
    if (kind === "glued") return "Flattened (glued text)";
    if (kind === "repaired") return "Flattened (divided by inserted)";
    return "Fraction";
  }

  function convertFractionToLatex(candidate) {
    const text = input.value;
    const { sourceText, latex, start, end } = candidate;
    let next;
    if (start >= 0 && end > start && text.slice(start, end) === sourceText) {
      next = text.slice(0, start) + latex + text.slice(end);
    } else if (sourceText && text.includes(sourceText)) {
      next = text.replace(sourceText, latex);
    } else {
      next = text;
    }
    replaceTextareaValueWithUndo(input, next);
    showFractionStatus(`Replaced with ${latex}`);
    refreshPreview();
  }

  function renderFractionsPanel(candidates) {
    lastFractionCandidates = candidates ?? [];
    if (!fractionsCard || !fractionList) return;
    if (!lastFractionCandidates.length) {
      fractionsCard.classList.add("hidden");
      fractionList.innerHTML = "";
      showFractionStatus("");
      return;
    }
    fractionsCard.classList.remove("hidden");
    const editable = canEditDictTokens();
    fractionList.innerHTML = lastFractionCandidates
      .map((c, id) => {
        const needsConvert = c.kind === "glued" || c.kind === "repaired";
        const convertBtn = needsConvert
          ? `<button type="button" class="ss-btn hs-lab-frac-convert" data-frac-id="${id}">Use \\frac</button>`
          : "";
        const saveBtn = editable
          ? `<button type="button" class="ss-btn primary hs-lab-frac-save" data-frac-id="${id}">Save to dictionary</button>`
          : "";
        const buildBtn = `<button type="button" class="ss-btn hs-lab-frac-build" data-frac-id="${id}">Build fraction</button>`;
        return `<li class="hs-lab-fraction" data-frac-id="${id}" role="listitem">
          <div class="hs-lab-fraction-body">
            <span class="hs-lab-fraction-kind ss-type">${escapeHtml(fractionKindLabel(c.kind))}</span>
            <code class="hs-lab-fraction-source">${escapeHtml(c.sourceText)}</code>
            <span class="hs-lab-token-arrow" aria-hidden="true">→</span>
            <span class="hs-lab-fraction-spoken">${escapeHtml(c.spoken)}</span>
            <span class="hs-lab-fraction-latex ss-type">Dictionary pattern: <code>${escapeHtml(c.latex)}</code></span>
          </div>
          <div class="hs-lab-fraction-actions">
            <button type="button" class="ss-btn hs-lab-frac-hear" data-frac-id="${id}">▶ Hear</button>
            ${convertBtn}
            ${saveBtn}
            ${buildBtn}
          </div>
        </li>`;
      })
      .join("");
  }

  fractionList?.addEventListener("click", (e) => {
    const id = Number(e.target.closest?.("[data-frac-id]")?.getAttribute("data-frac-id"));
    const candidate = lastFractionCandidates[id];
    if (!candidate) return;
    if (e.target.closest?.(".hs-lab-frac-hear")) {
      hear.play(e.target, { hearLabel: "▶ Hear", hearTitle: "Hear fraction pronunciation" }, candidate.spoken);
      return;
    }
    if (e.target.closest?.(".hs-lab-frac-convert")) {
      convertFractionToLatex(candidate);
      return;
    }
    if (e.target.closest?.(".hs-lab-frac-save")) {
      if (!confirmSaveDictToken({ pattern: candidate.latex, spoken: candidate.spoken, tokenRaw: candidate.sourceText })) {
        return;
      }
      void saveDictTokenFromLab({ pattern: candidate.latex, spoken: candidate.spoken }).then((ok) => {
        if (ok) showFractionStatus(`Saved ${candidate.latex} to ${getActiveClassLabel()}.`);
      });
      return;
    }
    if (e.target.closest?.(".hs-lab-frac-build")) {
      const pos = input.value.indexOf(candidate.sourceText);
      if (pos >= 0) input.setSelectionRange(pos, pos + candidate.sourceText.length);
      openFractionBuilder({
        textarea: input,
        numerator: candidate.numerator,
        denominator: candidate.denominator,
        onInsert: () => {
          showFractionStatus("Fraction inserted.");
          refreshPreview();
        },
      });
    }
  });

  function renderFlaggedTokens(raw, { classDictActive, needsConnect, flagged: precomputed }) {
    if (!raw.trim()) {
      tokenEmpty.textContent = "No risky tokens detected yet.";
      tokenEmpty.classList.remove("hidden");
      tokenScroll?.classList.add("hidden");
      tokenList.innerHTML = "";
      lastFlaggedTokens = [];
      showTokenSaveStatus("");
      return;
    }

    const flagged =
      precomputed ??
      labFlaggedSpeechTokens(raw, {
        classDictActive: classDictActive && !needsConnect,
      });
    lastFlaggedTokens = flagged;

    if (!flagged.length) {
      tokenEmpty.textContent = needsConnect
        ? "No default screen reader changes in this text. Connect to preview class dictionary (green) tokens."
        : classDictActive
          ? "No default or dictionary pronunciation changes detected in this text."
          : "No default screen reader pronunciation changes detected. Add class terms in Dictionary to see green tokens.";
      tokenEmpty.classList.remove("hidden");
      tokenScroll?.classList.add("hidden");
      tokenList.innerHTML = "";
      return;
    }

    const editableDict = canEditDictTokens();
    tokenEmpty.classList.add("hidden");
    tokenScroll?.classList.remove("hidden");
    closeAllTokenEdits();
    tokenList.innerHTML = flagged
      .map(({ id, raw: tokenRaw, spoken, kind, pattern, hasRule }) => {
        const spokenClass =
          kind === "dict" ? "hs-lab-speech-dict" : "hs-lab-speech-baseline";
        const savePattern = pattern ?? tokenRaw;
        const canSaveRow = editableDict && (kind === "dict" || kind === "baseline");
        const viewBtnLabel = kind === "baseline" ? "Add" : "Edit";
        const hint =
          kind === "dict" && !editableDict && isDemoDictionaryId(activeCourse)
            ? `<span class="hs-lab-token-hint">Demo only</span>`
            : kind === "dict" && !editableDict && !api
              ? `<span class="hs-lab-token-hint">Connect to edit</span>`
              : kind === "baseline" && !editableDict && !api
                ? `<span class="hs-lab-token-hint">Connect to add</span>`
              : kind === "dict" && !hasRule && editableDict
                ? `<span class="hs-lab-token-hint">New term</span>`
                : kind === "baseline" && editableDict
                  ? `<span class="hs-lab-token-hint">Save to dictionary</span>`
                : "";
        const spokenBlock = canSaveRow
            ? `<div class="hs-lab-token-view">
                <span class="hs-lab-token-spoken ${spokenClass}">${escapeHtml(spoken)}</span>
              </div>
              <div class="hs-lab-token-edit-panel hidden">
                <input type="text" class="hs-lab-token-edit" data-pattern="${escapeAttr(savePattern)}" value="${escapeAttr(spoken)}" aria-label="Spoken for ${escapeAttr(tokenRaw)}" />
              </div>`
            : `<span class="hs-lab-token-spoken ${spokenClass}">${escapeHtml(spoken)}</span>`;
        const actionsBlock = canSaveRow
            ? `<div class="hs-lab-token-actions">
                <div class="hs-lab-token-actions-view">
                  <button type="button" class="ss-btn hs-lab-token-edit-btn">${viewBtnLabel}</button>
                </div>
                <div class="hs-lab-token-actions-edit hidden">
                  <button type="button" class="ss-btn hs-lab-token-hear" title="Hear edited pronunciation">▶ Hear</button>
                  <button type="button" class="ss-btn primary hs-lab-token-save" data-pattern="${escapeAttr(savePattern)}">Save</button>
                  <button type="button" class="ss-btn hs-lab-token-cancel">Cancel</button>
                </div>
              </div>`
            : "";
        return `<li class="hs-lab-token hs-lab-token-${kind}" data-token-id="${id}" data-pattern="${escapeHtml(savePattern)}" id="hs-lab-token-${id}" role="listitem">
          <div class="hs-lab-token-body">
            <code class="hs-lab-token-raw">${escapeHtml(tokenRaw)}</code>
            <span class="hs-lab-token-arrow" aria-hidden="true">→</span>
            ${spokenBlock}
            ${hint}
          </div>
          ${actionsBlock}
        </li>`;
      })
      .join("");
  }

  tokenList.addEventListener("click", (e) => {
    const editBtn = e.target.closest?.(".hs-lab-token-edit-btn");
    if (editBtn) {
      enterTokenEdit(editBtn.closest(".hs-lab-token"));
      return;
    }
    const hearBtn = e.target.closest?.(".hs-lab-token-hear");
    if (hearBtn) {
      playTokenEditHear(hearBtn, hearBtn.closest(".hs-lab-token"));
      return;
    }
    const cancelBtn = e.target.closest?.(".hs-lab-token-cancel");
    if (cancelBtn) {
      exitTokenEditRow(cancelBtn.closest(".hs-lab-token"));
      return;
    }
    const saveBtn = e.target.closest?.(".hs-lab-token-save");
    if (!saveBtn || savingToken) return;
    const row = saveBtn.closest(".hs-lab-token");
    const input = row?.querySelector(".hs-lab-token-edit");
    if (!input) return;
    const pattern = saveBtn.getAttribute("data-pattern") || row?.getAttribute("data-pattern");
    const spoken = input.value.trim();
    if (!spoken) {
      showTokenSaveStatus("Enter spoken text before saving.", true);
      input.focus();
      return;
    }
    const tokenRaw = row?.querySelector(".hs-lab-token-raw")?.textContent?.trim();
    if (!confirmSaveDictToken({ pattern, spoken, tokenRaw })) return;
    void saveDictTokenFromLab({ pattern, spoken });
  });

  tokenList.addEventListener("keydown", (e) => {
    if (!e.target.classList.contains("hs-lab-token-edit")) return;
    const row = e.target.closest(".hs-lab-token");
    if (e.key === "Enter") {
      e.preventDefault();
      row?.querySelector(".hs-lab-token-save")?.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      exitTokenEditRow(row);
    }
  });

  function refreshPreview() {
    const raw = input.value;
    if (!raw.trim()) {
      rawOut.innerHTML = "Paste text above to preview.";
      dictOut.innerHTML = "Paste text above to preview.";
      changedEl.classList.add("hidden");
      tokenEmpty.classList.remove("hidden");
      tokenScroll?.classList.add("hidden");
      tokenList.innerHTML = "";
      lastFlaggedTokens = [];
      setLabTokenLinkResolver(null);
      renderFractionsPanel([]);
      return;
    }

    renderFractionsPanel(findFractionCandidatesInText(raw));

    const needsConnect = !api && !isDemoDictionaryId(activeCourse);
    const withoutSpeech = toDefaultScreenReaderSpeechByLine(raw);
    const classDictActive = hasActiveClassDictionary();
    const withDict = needsConnect
      ? ""
      : classDictActive
        ? toLabDictionarySpeechByLine(raw)
        : withoutSpeech;
    let linkFlagged;
    if (needsConnect) {
      rawOut.innerHTML = escapeHtml(withoutSpeech).replace(/\n/g, "<br>");
      dictOut.innerHTML = escapeHtml(
        `Connect with ☁ Connect to load the ${getActiveClassLabel()} dictionary, then preview and Hear how students will read this text.`,
      );
      changedEl.classList.add("hidden");
    } else {
      linkFlagged = labFlaggedSpeechTokens(raw, {
        classDictActive: classDictActive && !needsConnect,
      });
      const linkResolver = createLabTokenLinkResolver(linkFlagged);
      setLabTokenLinkResolver(linkResolver);
      rawOut.innerHTML = formatBaselineSpeechHtmlByLine(raw);
      dictOut.innerHTML = classDictActive
        ? formatDictionarySpeechHtmlByLine(raw)
        : formatBaselineSpeechHtmlByLine(raw);
      setLabTokenLinkResolver(null);
      const same =
        withoutSpeech.replace(/\s+/g, " ").trim() === withDict.replace(/\s+/g, " ").trim();
      const classLabel = getActiveClassLabel();
      if (!classDictActive) {
        changedEl.textContent = `${classLabel} has no saved terms yet — both columns show default screen reader reading. Add terms in Dictionary, save, then reload here to preview green highlights.`;
        changedEl.classList.remove("hidden");
      } else if (same) {
        changedEl.classList.add("hidden");
      } else {
        changedEl.textContent = `${classLabel} dictionary changed some pronunciations (green above) — good sign for student install.`;
        changedEl.classList.remove("hidden");
      }
    }

    renderFlaggedTokens(raw, { classDictActive, needsConnect, flagged: linkFlagged });
  }

  const refreshDebounced = debounce(refreshPreview, 120);

  const srProfileSelect = root.querySelector("#hs-lab-sr-profile");
  if (srProfileSelect) {
    srProfileSelect.value = loadStoredSrProfile();
    srProfileSelect.addEventListener("change", () => {
      const id = setDefaultSrProfile(srProfileSelect.value);
      srProfileSelect.value = id;
      storeSrProfile(id);
      refreshPreview();
    });
  }

  root.querySelector("#hs-lab-cloud").addEventListener("click", () => {
    openCloudSettingsModal({
      url: config?.url ?? "",
      anonKey: config?.anonKey ?? "",
      onSave: async (saved) => {
        setStoredSupabaseConfig(saved);
        config = { ...config, ...saved };
        api = createDictionaryApi(config);
        updateConnectNote();
        await pullCourses();
        if (!isExtension) mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "lab", base });
      },
      onClear: async () => {
        clearStoredSupabaseConfig();
        config = await loadSupabaseConfigFromBrowser();
        api = config?.url && config?.anonKey ? createDictionaryApi(config) : null;
        courses = [];
        updateConnectNote();
        renderClassSelect();
        updateDictMeta();
        refreshPreview();
        if (!isExtension) mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "lab", base });
      },
    });
  });

  classSelect.addEventListener("change", () => {
    const next = classSelect.value;
    if (!isDemoDictionaryId(next) && !guardSupabase("Loading your class dictionary")) {
      classSelect.value = activeCourse;
      return;
    }
    if (classSelect.value) void loadDictionaryForCourse(classSelect.value);
  });

  const reloadActiveDictionary = (classSlug) => {
    const stored = getStoredCourseId();
    const target = classSlug || stored;
    if (!target || isDemoDictionaryId(target)) return;
    if (!dictionarySyncMatchesClass(classSlug, activeCourse) && classSlug !== stored) return;
    if (classSlug && classSlug !== activeCourse && classSlug === stored) {
      if (classSelect.value !== classSlug) classSelect.value = classSlug;
      void loadDictionaryForCourse(classSlug);
      return;
    }
    if (isDemoDictionaryId(activeCourse)) return;
    if (!dictionarySyncMatchesClass(classSlug, activeCourse)) return;
    void loadDictionaryForCourse(activeCourse);
  };

  const unsubDictionarySync = onDictionaryUpdated(({ classSlug, source, viaStorage }) => {
    if (source === "lab" && !viaStorage) return;
    reloadActiveDictionary(classSlug);
  });

  function reloadIfDictionaryStale() {
    try {
      const raw = localStorage.getItem(DICTIONARY_SYNC_STORAGE_KEY);
      if (!raw) return;
      const { classSlug, at } = JSON.parse(raw);
      if (!at || at <= lastDictReloadAt) return;
      reloadActiveDictionary(classSlug);
    } catch (_) {}
  }

  const unregisterReload = registerDictionaryReload?.(reloadActiveDictionary);
  const onLabVisible = () => {
    if (document.visibilityState === "visible") reloadIfDictionaryStale();
  };
  const onLabPageShow = (e) => {
    if (e.persisted) reloadIfDictionaryStale();
  };
  document.addEventListener("visibilitychange", onLabVisible);
  window.addEventListener("focus", reloadIfDictionaryStale);
  window.addEventListener("pageshow", onLabPageShow);

  addSaveBtn?.addEventListener("click", () => {
    void tryAddPronunciationFromForm();
  });
  addHearBtn?.addEventListener("click", (e) => {
    const pattern = addPatternInput?.value?.trim() ?? "";
    const spoken = addSpokenInput?.value?.trim() ?? "";
    if (!pattern) {
      showAddTermError("Enter the word before hearing.");
      addPatternInput?.focus();
      return;
    }
    if (!spoken) {
      showAddTermError("Enter the pronunciation before hearing.");
      addSpokenInput?.focus();
      return;
    }
    showAddTermError("");
    hear.play(
      e.currentTarget,
      { hearLabel: "▶ Hear", hearTitle: "Hear proposed pronunciation before saving" },
      previewTermSpeech(pattern, { pattern, substitution: spoken, ignore_case: "Yes" }),
    );
  });
  for (const sel of [addPatternInput, addSpokenInput]) {
    sel?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void tryAddPronunciationFromForm();
      }
    });
  }

  input.addEventListener("input", () => {
    showPasteNotice(null);
    refreshDebounced();
  });
  input.addEventListener("change", () => {
    showPasteNotice(null);
    refreshPreview();
  });
  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const { normalized, flattenedEquation } = inspectPasteFromEvent(e);
    insertTextWithUndo(input, normalized, {
      start: input.selectionStart,
      end: input.selectionEnd,
    });
    showPasteNotice(flattenedEquation ? FLATTENED_FRACTION_NOTICE : null);
    refreshPreview();
  });
  root.querySelector("#hs-lab-sample").addEventListener("click", () => {
    replaceTextareaValueWithUndo(input, SAMPLE);
    showPasteNotice(null);
    refreshPreview();
  });
  root.querySelector("#hs-lab-clear").addEventListener("click", () => {
    replaceTextareaValueWithUndo(input, "");
    showPasteNotice(null);
    refreshPreview();
  });
  root.querySelector("#hs-lab-insert-frac")?.addEventListener("click", () => {
    openFractionBuilder({
      textarea: input,
      onInsert: () => refreshPreview(),
    });
  });

  const pullBtn = root.querySelector("#hs-lab-pull");
  const pullStatus = root.querySelector("#hs-lab-pull-status");
  if (pullBtn && pullStatus) {
    pullStatus.classList.remove("hidden");
    pullBtn.addEventListener("click", async () => {
      pullBtn.disabled = true;
      pullStatus.textContent = "Reading the active page…";
      pullStatus.classList.remove("is-error", "is-ok");
      try {
        const result = await pullTextFromActiveTab();
        if (!result.ok) {
          pullStatus.textContent = result.error;
          pullStatus.classList.add("is-error");
          return;
        }
        const inspected = inspectPulledText(result.text);
        replaceTextareaValueWithUndo(input, inspected.normalized);
        showPasteNotice(inspected.flattenedEquation ? FLATTENED_FRACTION_NOTICE : null);
        refreshPreview();
        const fracNote = inspected.fractions?.length
          ? ` · ${inspected.fractions.length} fraction(s) detected`
          : "";
        pullStatus.textContent = `Pulled ${pullSourceLabel(result.source)} (${inspected.normalized.length.toLocaleString()} characters${fracNote}). Click the course page tab before pulling again.`;
        pullStatus.classList.add("is-ok");
        input.focus();
      } catch (err) {
        console.error("HearSay: pull failed", err);
        pullStatus.textContent = "Pull failed. Reload the page and try again.";
        pullStatus.classList.add("is-error");
      } finally {
        pullBtn.disabled = false;
      }
    });
  }

  root.querySelector("#hs-lab-hear-raw").addEventListener("click", (e) => {
    const raw = input.value.trim();
    if (!raw) return;
    const spokenByLine = toDefaultScreenReaderSpeechByLine(raw).split(/\r?\n/);
    const chunks = buildLabHearChunks(raw, (line, lineIndex) => spokenByLine[lineIndex] ?? "");
    if (!chunks.length) return;
    playLabHear(
      e.currentTarget,
      { hearLabel: "▶ Hear", hearTitle: "Hear default screen reader (no dictionary)" },
      chunks,
    );
  });

  root.querySelector("#hs-lab-hear-dict").addEventListener("click", (e) => {
    const raw = input.value.trim();
    if (!raw) return;
    if (!isDemoDictionaryId(activeCourse) && !api && !guardSupabase("Hearing with your class dictionary")) {
      return;
    }
    const spokenByLine = hasActiveClassDictionary()
      ? toLabDictionarySpeechByLine(raw).split(/\r?\n/)
      : toDefaultScreenReaderSpeechByLine(raw).split(/\r?\n/);
    const chunks = buildLabHearChunks(raw, (line, lineIndex) => spokenByLine[lineIndex] ?? "");
    if (!chunks.length) return;
    playLabHear(
      e.currentTarget,
      { hearLabel: "▶ Hear", hearTitle: `Hear with ${getActiveClassLabel()}` },
      chunks,
    );
  });

  updateConnectNote();
  renderClassSelect();
  await loadDictionaryForCourse(activeCourse);
  if (api) await pullCourses();
  updateAddPronunciationControls();

  return {
    destroy: () => {
      unsubDictionarySync();
      unregisterReload?.();
      document.removeEventListener("visibilitychange", onLabVisible);
      window.removeEventListener("focus", reloadIfDictionaryStale);
      window.removeEventListener("pageshow", onLabPageShow);
    },
  };
}

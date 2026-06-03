// Screen Reader Lab: paste plain quiz text, compare raw vs dictionary speech.

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
import { ruleCount, dictionarySource } from "./core/dictionary.js";
import { findTokens } from "./core/detect.js";
import { analyze, toDictionarySpeechByLine, canvasSpokenLinesFromText, formatDictionarySpeechHtmlByLine } from "./core/transform.js";
import { normalizePastedContent, pasteDataFromEvent } from "./core/paste-normalize.js";
import { insertAtCursor } from "./fraction-builder.js";
import { createHearController } from "./hear-ui.js";
import { helpTip, bindHelpTips } from "./help-tip.js";
import { preloadSpeech } from "./speech.js";

const SAMPLE = `Heat 10 mL of DI water from 25°C to 30°C. The specific heat capacity is (J/g°C).

Calculate q = mcΔT. Report energy in kJ/mol.`;

const HELP = {
  paste: `<p>Paste from Google Docs, Word, or Canvas — HearSay normalizes subscripts and glued variables (<code>qcalorimeter</code>, <code>T2</code>).</p>
    <p><b>With dictionary</b> uses HearSay’s full speech engine (dictionary + term detection), not raw NVDA rule substitution alone.</p>`,
  without: `<p>What students see on screen. NVDA without a course dictionary reads symbols literally (e.g. “J slash g degree C”).</p>`,
  with: `<p>Simulated NVDA speech after your course dictionary rules run — same engine HearSay uses for previews.</p>`,
  tokens: `<p>Terms HearSay flagged as risky. After dictionary rules, they should match the <b>With dictionary</b> column.</p>`,
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
 * @param {{ base?: string }} opts
 */
export async function mountScreenReaderLab(root, { base = ".." } = {}) {
  let config = await loadSupabaseConfigFromBrowser();
  let api = config?.url && config?.anonKey ? createDictionaryApi(config) : null;
  let courses = [];
  let activeCourse = getStoredCourseId();
  if (activeCourse === COMBINED_COURSE_ID) activeCourse = "chem113";

  root.innerHTML = `
    <div class="hs-site-nav-mount"></div>
    <main class="ss-wrap hs-lab">
      <header class="hs-lab-head">
        <h1 class="ss-title">Screen Reader Lab ${helpTip("<p>Test how quiz text reads <b>with</b> your course NVDA dictionary — the same path students use in New Quizzes.</p>")}</h1>
        <p class="ss-sub">Paste plain Canvas quiz text · hear raw vs dictionary speech · export add-ons on the <a href="${base.replace(/\/$/, "")}/dictionary/">Dictionary</a> page</p>
      </header>

      <section class="hs-lab-card" aria-label="Connection">
        <div class="hs-lab-card-head">
          <p id="hs-lab-connect-note" class="ss-sub hs-lab-connect-note"></p>
          <button type="button" class="ss-btn" id="hs-lab-cloud">☁ Connect</button>
        </div>
        <label class="hs-lab-field">
          <span class="hs-lab-label">Class dictionary</span>
          <select id="hs-lab-class" class="ss-btn" disabled>
            <option value="">— connect to load —</option>
          </select>
        </label>
        <p id="hs-lab-dict-meta" class="ss-type hs-lab-dict-meta" aria-live="polite"></p>
      </section>

      <section class="hs-lab-card" aria-labelledby="hs-lab-paste-h">
        <h2 id="hs-lab-paste-h" class="hs-lab-card-title">Paste quiz text ${helpTip(HELP.paste)}</h2>
        <textarea id="hs-lab-input" class="ss-input hs-lab-textarea" rows="8" placeholder="Paste plain text from a New Quiz stem or answer…"></textarea>
        <div class="hs-lab-paste-actions">
          <button type="button" class="ss-btn" id="hs-lab-sample">Load sample</button>
          <button type="button" class="ss-btn" id="hs-lab-clear">Clear</button>
        </div>
      </section>

      <section class="hs-lab-compare" aria-label="Speech comparison">
        <div class="hs-lab-panel">
          <div class="hs-lab-panel-head">
            <h3 class="hs-lab-panel-title">Without dictionary ${helpTip(HELP.without)}</h3>
            <button type="button" class="ss-btn" id="hs-lab-hear-raw" title="Hear visible text">▶ Hear</button>
          </div>
          <p id="hs-lab-raw-out" class="hs-lab-output">Paste text above to preview.</p>
        </div>
        <div class="hs-lab-panel hs-lab-panel-dict">
          <div class="hs-lab-panel-head">
            <h3 class="hs-lab-panel-title">With dictionary ${helpTip(HELP.with)}</h3>
            <button type="button" class="ss-btn primary" id="hs-lab-hear-dict" title="Hear dictionary speech">▶ Hear</button>
          </div>
          <p id="hs-lab-dict-out" class="hs-lab-output">Paste text above to preview.</p>
          <p id="hs-lab-changed" class="hs-lab-changed hidden" aria-live="polite"></p>
        </div>
      </section>

      <section class="hs-lab-card" aria-labelledby="hs-lab-tokens-h">
        <h2 id="hs-lab-tokens-h" class="hs-lab-card-title">Flagged tokens ${helpTip(HELP.tokens)}</h2>
        <p id="hs-lab-token-empty" class="ss-sub">No risky tokens detected yet.</p>
        <ul id="hs-lab-token-list" class="hs-lab-token-list hidden" role="list"></ul>
      </section>

      <p class="ss-sub hs-lab-foot">
        Ready for students?
        <a href="${base.replace(/\/$/, "")}/dictionary/">Export NVDA add-on on Dictionary →</a>
      </p>
    </main>`;

  mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "lab", base });
  bindHelpTips(root);
  preloadSpeech();

  const hear = createHearController();
  const connectNote = root.querySelector("#hs-lab-connect-note");
  const classSelect = root.querySelector("#hs-lab-class");
  const dictMeta = root.querySelector("#hs-lab-dict-meta");
  const input = root.querySelector("#hs-lab-input");
  const rawOut = root.querySelector("#hs-lab-raw-out");
  const dictOut = root.querySelector("#hs-lab-dict-out");
  const changedEl = root.querySelector("#hs-lab-changed");
  const tokenEmpty = root.querySelector("#hs-lab-token-empty");
  const tokenList = root.querySelector("#hs-lab-token-list");

  function updateConnectNote() {
    const card = root.querySelector(".hs-lab-card");
    if (config?.url && config?.anonKey) {
      connectNote.textContent = `Connected to Supabase · ${config.url.replace(/^https:\/\//, "")}`;
      card?.classList.add("is-connected");
    } else {
      connectNote.textContent = "Connect Supabase to load your class dictionary (same credentials as Dictionary Builder).";
      card?.classList.remove("is-connected");
    }
  }

  function updateDictMeta() {
    const n = ruleCount();
    const src = dictionarySource();
    dictMeta.textContent = n ? `${n} active rules · source: ${src}` : "Using bundled chemistry dictionary only.";
  }

  function renderClassSelect() {
    const list = courses.filter((c) => c.id !== COMBINED_COURSE_ID);
    if (!list.length) {
      classSelect.innerHTML = `<option value="">— connect to load —</option>`;
      classSelect.disabled = true;
      return;
    }
    classSelect.disabled = false;
    classSelect.innerHTML = list
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}"${c.id === activeCourse ? " selected" : ""}>${escapeHtml(c.label || c.id)}</option>`,
      )
      .join("");
  }

  async function loadDictionaryForCourse(courseId) {
    if (!api) return;
    activeCourse = courseId;
    setStoredCourseId(courseId);
    try {
      await api.loadCourseDictionary(courseId);
      updateDictMeta();
      mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "lab", base });
    } catch {
      updateDictMeta();
    }
    refreshPreview();
  }

  async function pullCourses() {
    if (!api) return;
    try {
      courses = await api.listCourses();
      if (!courses.some((c) => c.id === activeCourse)) {
        activeCourse = courses.find((c) => c.id !== COMBINED_COURSE_ID)?.id ?? activeCourse;
      }
      renderClassSelect();
      if (activeCourse) await loadDictionaryForCourse(activeCourse);
    } catch {
      courses = [];
      renderClassSelect();
    }
  }

  function refreshPreview() {
    const raw = input.value;
    if (!raw.trim()) {
      rawOut.textContent = "Paste text above to preview.";
      dictOut.textContent = "Paste text above to preview.";
      changedEl.classList.add("hidden");
      tokenEmpty.classList.remove("hidden");
      tokenList.classList.add("hidden");
      tokenList.innerHTML = "";
      return;
    }

    const normalized = normalizePastedContent(raw);
    const withDict = toDictionarySpeechByLine(raw);
    rawOut.textContent = normalized;
    dictOut.innerHTML = formatDictionarySpeechHtmlByLine(raw);

    const same = normalized.replace(/\s+/g, " ").trim() === withDict.replace(/\s+/g, " ").trim();
    if (same) {
      changedEl.classList.add("hidden");
    } else {
      changedEl.textContent = "Dictionary changed the speech — good sign for student install.";
      changedEl.classList.remove("hidden");
    }

    const { findings } = analyze(raw, findTokens);
    if (!findings.length) {
      tokenEmpty.textContent = "No risky tokens detected.";
      tokenEmpty.classList.remove("hidden");
      tokenList.classList.add("hidden");
      tokenList.innerHTML = "";
      return;
    }

    tokenEmpty.classList.add("hidden");
    tokenList.classList.remove("hidden");
    tokenList.innerHTML = findings
      .slice(0, 24)
      .map((f) => {
        const spoken = (f.primarySpoken ?? f.raw).replace(/\s+/g, " ").trim();
        const ok = spoken !== f.raw.replace(/\s+/g, " ").trim();
        return `<li class="hs-lab-token${ok ? " is-covered" : ""}" role="listitem">
          <code class="hs-lab-token-raw">${escapeHtml(f.raw)}</code>
          <span class="hs-lab-token-arrow">→</span>
          <span class="hs-lab-token-spoken">${escapeHtml(spoken)}</span>
          ${ok ? "" : `<span class="hs-lab-token-warn">check dictionary</span>`}
        </li>`;
      })
      .join("");
    if (findings.length > 24) {
      tokenList.innerHTML += `<li class="hs-lab-token-more ss-type" role="listitem">+ ${findings.length - 24} more</li>`;
    }
  }

  const refreshDebounced = debounce(refreshPreview, 120);

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
        mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "lab", base });
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
        mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "lab", base });
      },
    });
  });

  classSelect.addEventListener("change", () => {
    if (classSelect.value) loadDictionaryForCourse(classSelect.value);
  });

  input.addEventListener("input", refreshDebounced);
  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const pasted = pasteDataFromEvent(e);
    insertAtCursor(input, normalizePastedContent(pasted));
    refreshPreview();
  });
  root.querySelector("#hs-lab-sample").addEventListener("click", () => {
    input.value = SAMPLE;
    refreshPreview();
  });
  root.querySelector("#hs-lab-clear").addEventListener("click", () => {
    input.value = "";
    refreshPreview();
  });

  root.querySelector("#hs-lab-hear-raw").addEventListener("click", (e) => {
    const text = rawOut.textContent?.trim();
    if (!text || text.startsWith("Paste")) return;
    hear.play(e.currentTarget, { hearLabel: "▶ Hear", hearTitle: "Hear without dictionary" }, text);
  });

  root.querySelector("#hs-lab-hear-dict").addEventListener("click", (e) => {
    const raw = input.value.trim();
    if (!raw) return;
    const lines = canvasSpokenLinesFromText(raw);
    if (!lines.length) return;
    hear.play(e.currentTarget, { hearLabel: "▶ Hear", hearTitle: "Hear with dictionary" }, lines);
  });

  updateConnectNote();
  updateDictMeta();
  renderClassSelect();
  if (api) await pullCourses();
}

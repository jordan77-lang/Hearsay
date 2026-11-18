import { mountSiteNav } from "./site-nav.js";
import { openCloudSettingsModal } from "./supabase/cloud-settings.js";
import { createDictionaryApi, loadSupabaseConfigFromBrowser, getStoredCourseId, setStoredCourseId,
  setStoredSupabaseConfig, clearStoredSupabaseConfig, DEMO_DICTIONARY_ID, DEMO_DICTIONARY_LABEL,
  COMBINED_COURSE_ID, isDemoDictionaryId } from "./supabase/dictionary-api.js";
import { loadBareClassDictionary, loadBundledChemistryDictionary, loadEditorPreviewDictionary } from "./core/dictionary.js";
import { rowsToDic, entriesToRuleRows } from "./supabase/dictionary-format.js";
import { reviewSpeech } from "./core/review-speech.js";
import { loadReviewSession, saveReviewSession, splitReviewPassages, capturePassage, markReviewItem, reviewRepairs } from "./core/review-session.js";
import { dictionaryHistory, rememberDictionaryChange, undoDictionaryChange } from "./dictionary-history.js";
import { onDictionaryUpdated, notifyDictionaryUpdated } from "./dictionary-sync.js";
import { pullTextFromActiveTab, pullSourceLabel } from "./extension/pull-from-tab.js";
import { speak, cancelSpeech, toggleSpeechPause, subscribeSpeechState, preloadSpeech } from "./speech.js";
import { bindExponentPaste } from "./exponent-paste.js";
import { plainTextFromClipboardHtml } from "./core/exponent-formatting.js";

const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STATUS = { "needs-attention": "Needs attention", "added": "Pronunciation added", "reviewed": "Reviewed — no change needed" };
function browserStorage() { try { return localStorage; } catch { return null; } }

export async function mountScreenReaderLab(root, { base = "..", context = "web", registerDictionaryReload } = {}) {
  const extension = context === "extension";
  const storage = browserStorage();
  let config = null;
  try { config = await loadSupabaseConfigFromBrowser(); } catch { /* Preview remains available without browser storage. */ }
  let api = config?.url && config?.anonKey ? createDictionaryApi(config) : null;
  let scope = config?.url || "local";
  let state = loadReviewSession(storage, scope);
  try { state.courseId = getStoredCourseId() || state.courseId || DEMO_DICTIONARY_ID; } catch { /* Use restored local state. */ }
  if (state.courseId === COMBINED_COURSE_ID) state.courseId = DEMO_DICTIONARY_ID;
  let courses = [], passages = [], current = { text: "", start: 0, end: 0 };
  let destroyed = false, busy = false, loadSeq = 0, selected = null, lastPlayback = null;
  let courseReady = false, storageWarned = false, classRows = [];
  const listeners = [];
  const on = (target, name, callback, options) => { target.addEventListener(name, callback, options); listeners.push(() => target.removeEventListener(name, callback, options)); };

  root.innerHTML = `
    ${extension ? "" : '<div class="hs-site-nav-mount"></div>'}
    <main class="ss-wrap hs-review">
      <header class="ss-page-header"><h1 class="ss-title">Pronunciation review</h1>
        <p class="ss-sub">Listen, select a phrase, and adjust its course pronunciation. No JAWS installation needed.</p></header>
      <section class="hs-review-course" aria-label="Course">
        <label for="review-course">Course <select id="review-course" class="ss-btn"></select></label>
        <button id="review-connect" class="ss-btn" type="button">☁ Connect</button>
        <span id="review-connection" class="ss-type"></span>
      </section>
      <details class="hs-review-source" open><summary>Source passage</summary>
        <label for="review-input" class="ss-type">Paste or type a passage.</label>
        <textarea id="review-input" class="ss-input" rows="5" spellcheck="false" placeholder="Paste a passage from your course…"></textarea>
        <p class="ss-sub">Paste preserves numeric superscripts and subscripts as characters when matching clipboard formatting is available. This text field does not retain fonts, tables or equation structure. The source document stays unchanged; speech is an approximation.</p>
        <div class="hs-review-actions">${extension ? `
          <label for="review-capture-mode" class="ss-type">Capture action</label>
          <select id="review-capture-mode" class="ss-btn"><option value="replace">Replace passage</option><option value="append">Append selection</option></select>
          <button id="review-pull" class="ss-btn" type="button">Pull from page</button>` : ""}
          <button id="review-sample" class="ss-btn" type="button">Load sample</button>
          <button id="review-clear" class="ss-btn" type="button">Clear passage</button>
        </div>
        <div id="review-sources" class="ss-type"></div>
      </details>
      <section class="hs-review-focus" aria-labelledby="review-heading">
        <div class="hs-review-actions"><h2 id="review-heading">Review passage</h2>
          <label for="review-mode" class="ss-type">View</label><select id="review-mode" class="ss-btn"><option value="focus">One sentence</option><option value="passage">Whole passage</option></select>
          <span id="review-position" class="ss-type"></span></div>
        <div class="hs-review-playback" role="group" aria-label="Review playback">
          <button id="review-hear-original" class="ss-btn" type="button">Hear original</button>
          <button id="review-hear-revised" class="ss-btn primary" type="button">Hear revised</button>
          <button id="review-repeat" class="ss-btn" type="button">Repeat</button>
          <button id="review-previous" class="ss-btn" type="button">Previous</button>
          <button id="review-next" class="ss-btn" type="button">Next</button>
          <button id="review-pause" class="ss-btn" type="button" disabled>Pause / resume</button>
          <button id="review-stop" class="ss-btn" type="button" disabled>Stop</button>
        </div>
        <div class="hs-review-layout">
          <div>
            <p class="ss-type">Select any word or phrase below, or in the source field, then adjust its pronunciation.</p>
            <div id="review-text" class="hs-review-text" role="region" aria-label="Unchanged source passage" tabindex="0"></div>
            <button id="review-adjust" class="ss-btn" type="button">Adjust pronunciation</button>
            <div class="hs-review-comparison">
              <section><h3>Original</h3><p class="ss-type">Approximate JAWS reading</p><p id="review-original"></p></section>
              <section><h3>With course pronunciations</h3><p class="ss-type" id="review-revised-label">Saved course terms</p><p id="review-revised"></p></section>
            </div>
            <details><summary>Symbol and course changes</summary><p class="ss-type">These describe substitutions, not errors. Any word can need attention.</p><div id="review-changes"></div></details>
            <div id="review-repairs"></div>
          </div>
          <aside class="hs-review-editor" aria-labelledby="review-editor-heading">
            <h3 id="review-editor-heading">Adjust pronunciation</h3>
            <label for="review-pattern">Written word or phrase</label><input id="review-pattern" class="ss-input" spellcheck="false" />
            <label for="review-spoken">Intended pronunciation</label><input id="review-spoken" class="ss-input" spellcheck="false" />
            <label><input id="review-case" type="checkbox" /> Match capitalization exactly</label>
            <div class="hs-review-actions"><button id="review-hear-word" class="ss-btn" type="button">Hear word</button><button id="review-hear-sentence" class="ss-btn" type="button">Hear in sentence</button></div>
            <button id="review-save" class="ss-btn primary" type="button">Save course pronunciation</button>
            <div class="hs-review-actions"><button id="review-attention" class="ss-btn" type="button">Needs attention</button><button id="review-no-change" class="ss-btn" type="button">Reviewed — no change needed</button></div>
            <button id="review-discard" class="ss-btn" type="button">Discard draft</button>
            <p id="review-draft-note" class="ss-type"></p>
          </aside>
        </div>
      </section>
      <section class="hs-review-queue" aria-labelledby="review-queue-heading"><div class="hs-review-actions"><h2 id="review-queue-heading">Review queue</h2><span id="review-queue-count" class="ss-type"></span></div><ul id="review-queue"></ul></section>
      <div class="hs-review-actions"><button id="review-undo" class="ss-btn" type="button">Undo last dictionary change</button>
        ${extension ? '<button type="button" class="ss-btn" data-hs-ext-nav="dictionary">Open course dictionary</button>' : `<a class="ss-btn" href="${escape(base)}/dictionary/">Open course dictionary</a>`}</div>
      <p id="review-status" class="ss-type" role="status" aria-live="polite"></p>
    </main>`;
  const $ = id => root.querySelector(`#${id}`);
  const input = $("review-input"), course = $("review-course"), pattern = $("review-pattern"), spoken = $("review-spoken"), matchCase = $("review-case");
  if (!extension) mountSiteNav(root.querySelector(".hs-site-nav-mount"), { active: "lab", base });
  preloadSpeech();
  const status = message => { if (!destroyed) $("review-status").textContent = message; };
  const exponentPaste = bindExponentPaste(input, { onStatus: status, automatic: true, includeSubscripts: true });
  const draft = () => state.drafts[state.courseId] ?? { pattern: "", spoken: "", ignore_case: "Yes", start: -1, end: -1 };
  function persist() {
    if (destroyed) return;
    state.passage = input.value;
    state.scroll = { page: window.scrollY, source: input.scrollTop, text: $("review-text").scrollTop };
    if (!saveReviewSession(storage, state, scope) && !storageWarned) {
      storageWarned = true;
      status("Browser storage is unavailable or full. Keep this view open; drafts cannot be restored after closing.");
    }
  }
  function editorFromState() {
    const value = draft(); pattern.value = value.pattern; spoken.value = value.spoken; matchCase.checked = value.ignore_case === "No";
    $("review-draft-note").textContent = value.pattern ? "Draft kept in this browser until saved or discarded." : "Select a phrase, or enter one above.";
  }
  function readEditor() {
    state.drafts[state.courseId] = { ...draft(), pattern: pattern.value, spoken: spoken.value, ignore_case: matchCase.checked ? "No" : "Yes" };
    persist(); renderSpeech();
  }
  function setDraft(value, focus = false) {
    const old = draft();
    if (old.pattern && old.pattern !== value.pattern) {
      state = markReviewItem(state, { ...old, status: "needs-attention" });
    }
    const saved = reviewSpeech(value.pattern, { revised: true });
    const savedPronunciation = saved.pieces.some(piece => piece.kind === "course") ? saved.spoken : "";
    state.drafts[state.courseId] = { pattern: "", spoken: value.pattern === old.pattern ? old.spoken : savedPronunciation,
      start: -1, end: -1, ignore_case: "Yes", ...value };
    editorFromState(); persist(); renderSpeech(); renderQueue();
    if (focus) spoken.focus();
  }
  function selectedRange() {
    if (input.selectionEnd > input.selectionStart && document.activeElement === input) {
      return { start: input.selectionStart, end: input.selectionEnd, pattern: input.value.slice(input.selectionStart, input.selectionEnd) };
    }
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0), host = $("review-text");
    if (!host.contains(range.startContainer) || !host.contains(range.endContainer)) return null;
    const before = range.cloneRange(); before.selectNodeContents(host); before.setEnd(range.startContainer, range.startOffset);
    const start = current.start + before.toString().length;
    return { start, end: start + range.toString().length, pattern: range.toString() };
  }
  function captureSelection() {
    const value = selectedRange();
    if (value?.pattern.trim()) {
      selected = value;
      if (state.mode === "focus") navigateToOffset(value.start);
      setDraft(value); render();
    }
  }
  function navigateToOffset(offset) {
    const index = passages.findIndex(item => offset >= item.start && offset < item.end);
    if (index >= 0) { state.sentence = index; state.mode = "focus"; $("review-mode").value = "focus"; }
  }
  function renderSpeech() {
    const value = draft();
    const preview = value.pattern.trim() && value.spoken.trim() ? value : null;
    const original = reviewSpeech(current.text), revised = reviewSpeech(current.text, { revised: true, preview });
    $("review-original").textContent = original.spoken;
    $("review-revised").textContent = revised.spoken;
    $("review-revised-label").textContent = preview ? "Course terms + unsaved pronunciation draft" : "Saved course terms";
    const changes = revised.pieces.filter(piece => piece.kind !== "plain");
    $("review-changes").innerHTML = changes.length ? changes.map((piece, index) => `<button type="button" class="hs-review-change is-${piece.kind}" data-change="${index}">${escape(piece.raw)} → ${escape(piece.spoken)}</button>`).join("") : '<p class="ss-type">No symbol substitutions or course matches. You can still select any word.</p>';
    $("review-changes").querySelectorAll("[data-change]").forEach(button => { button.onclick = () => {
      const piece = changes[Number(button.dataset.change)];
      setDraft({ pattern: piece.raw, spoken: piece.kind === "course" ? piece.spoken.trim() : "", start: current.start + piece.start, end: current.start + piece.end }, true);
    }; });
  }
  function renderQueue() {
    const items = state.queue.filter(item => item.courseId === state.courseId);
    $("review-queue-count").textContent = `${items.filter(item => item.status === "needs-attention").length} need attention · ${items.length} reviewed or queued`;
    $("review-queue").innerHTML = items.length ? items.map((item, index) => `<li><button type="button" class="hs-review-queue-item" data-queue="${index}"><span>${escape(item.pattern)}</span><span class="ss-type">${STATUS[item.status] ?? STATUS["needs-attention"]}</span></button></li>`).join("") : '<li class="ss-type">Select a phrase to add it to your review queue.</li>';
    $("review-queue").querySelectorAll("[data-queue]").forEach(button => { button.onclick = () => {
      const item = items[Number(button.dataset.queue)]; navigateToOffset(item.start); setDraft(item); render(); spoken.focus();
    }; });
  }
  function renderSources() {
    $("review-sources").innerHTML = state.sources.map(source => {
      let url = ""; try { const parsed = new URL(source.url); if (/^https?:$/.test(parsed.protocol)) url = parsed.href; } catch { /* pasted source */ }
      return `<p>${url ? `<a target="_blank" rel="noopener noreferrer" href="${escape(url)}">${escape(source.title || source.url)}</a>` : escape(source.title || "Pasted / typed passage")} · ${escape(pullSourceLabel(source.kind))} · ${Number(source.capturedLength || 0).toLocaleString()} characters${source.truncated ? ` · Truncated from ${Number(source.totalLength).toLocaleString()} characters — select a smaller section to review the rest.` : ""}</p>`;
    }).join("");
  }
  function render() {
    if (destroyed) return;
    passages = splitReviewPassages(state.passage);
    state.sentence = Math.max(0, Math.min(Number(state.sentence) || 0, Math.max(0, passages.length - 1)));
    current = state.mode === "passage" ? { text: state.passage, start: 0, end: state.passage.length } : passages[state.sentence] ?? { text: "", start: 0, end: 0 };
    $("review-text").textContent = current.text || "Paste or pull a passage to start reviewing.";
    $("review-position").textContent = passages.length ? state.mode === "passage" ? `${passages.length} sentences` : `Sentence ${state.sentence + 1} of ${passages.length}` : "No passage yet";
    $("review-previous").disabled = state.mode === "passage" || state.sentence === 0;
    $("review-next").disabled = state.mode === "passage" || state.sentence >= passages.length - 1;
    for (const id of ["review-hear-original", "review-hear-revised", "review-repeat"]) $(id).disabled = !current.text;
    $("review-save").disabled = busy || !api || !courseReady || isDemoDictionaryId(state.courseId);
    $("review-undo").disabled = busy || !api || !dictionaryHistory(storage, scope, state.courseId).length || isDemoDictionaryId(state.courseId);
    course.disabled = busy;
    $("review-connect").disabled = busy;
    $("review-connect").textContent = api ? "Connection settings" : "☁ Connect";
    for (const id of ["review-pattern", "review-spoken", "review-case"]) $(id).disabled = busy;
    $("review-connection").textContent = api ? "Connected" : "Preview offline · connect to save course terms";
    renderSources(); renderSpeech(); renderQueue(); exponentPaste.refresh();
    const repairs = reviewRepairs(state.passage);
    $("review-repairs").innerHTML = repairs.map((repair, index) => `<button type="button" class="ss-btn" data-repair="${index}">${escape(repair.label)}</button>`).join("");
    $("review-repairs").querySelectorAll("[data-repair]").forEach(button => { button.onclick = () => {
      const repair = repairs[Number(button.dataset.repair)]; navigateToOffset(repair.start); setDraft(repair); render(); spoken.focus();
      status("Suggestion opened as a draft. The original passage has not changed.");
    }; });
  }
  function courseOptions() {
    const list = [{ id: DEMO_DICTIONARY_ID, label: DEMO_DICTIONARY_LABEL }, ...courses.filter(item => item.id !== COMBINED_COURSE_ID && !isDemoDictionaryId(item.id))];
    if (!list.some(item => item.id === state.courseId)) list.push({ id: state.courseId, label: state.courseId });
    course.innerHTML = list.map(item => `<option value="${escape(item.id)}">${escape(item.label || item.id)}</option>`).join("");
    course.value = state.courseId;
  }
  async function loadCourse() {
    const seq = ++loadSeq, courseId = state.courseId;
    courseReady = false; busy = true; classRows = []; cancelSpeech(); loadBareClassDictionary(); render();
    try {
      if (isDemoDictionaryId(courseId)) { loadBundledChemistryDictionary("demo"); courseReady = true; }
      else if (api) {
        const entries = await api.fetchEntryRecords(courseId);
        const result = entries.length ? { rows: entriesToRuleRows(entries) } : await api.fetchRulesWithMeta(courseId);
        if (destroyed || seq !== loadSeq) return;
        loadEditorPreviewDictionary(rowsToDic(result.rows), `course:${courseId}`);
        classRows = result.rows;
        state.queue = state.queue.map(item => {
          if (item.courseId !== courseId || item.status !== "added") return item;
          const rule = classRows.find(row => row.pattern === item.pattern.trim());
          return rule && rule.replacement.trim() === item.spoken.trim() ? item : { ...item, status: "needs-attention" };
        });
        saveReviewSession(storage, state, scope);
        courseReady = true;
      }
    } catch (error) { if (!destroyed && seq === loadSeq) status(`Could not load the course: ${error.message}. Original preview remains available.`); }
    finally { if (!destroyed && seq === loadSeq) { busy = false; render(); } }
  }
  async function connect(saved) {
    persist(); config = saved; api = saved?.url && saved?.anonKey ? createDictionaryApi(saved) : null;
    scope = saved?.url || "local";
    // Keep the passage across connection changes; isolate drafts, history and queue by project.
    const passage = state.passage, sources = state.sources;
    state = loadReviewSession(storage, scope);
    if (!state.passage) { state.passage = passage; state.sources = sources; }
    try { state.courseId = getStoredCourseId() || DEMO_DICTIONARY_ID; } catch { state.courseId = DEMO_DICTIONARY_ID; }
    input.value = state.passage; courses = [];
    if (api) { try { courses = await api.listCourses(); } catch (error) { status(`Could not load courses: ${error.message}`); } }
    if (destroyed) return;
    courseOptions(); editorFromState(); persist(); await loadCourse();
  }
  function play(text, kind = "original") {
    if (!text.trim()) { status("Enter a phrase or passage to hear."); return; }
    lastPlayback = { text, kind }; speak(text); status(`Playing ${kind}.`);
  }
  function move(direction) { cancelSpeech(); lastPlayback = null; state.sentence += direction; selected = null; render(); persist(); }
  function replaceSource(value, source = null, mode = "replace") {
    cancelSpeech(); selected = null; lastPlayback = null;
    state = capturePassage(state, { text: value, source: "paste", ...source }, mode);
    input.value = state.passage; editorFromState(); render(); persist();
  }
  async function savePronunciation() {
    readEditor(); const value = { ...draft() }, courseId = state.courseId, project = scope, targetApi = api;
    if (busy || !targetApi || !courseReady || isDemoDictionaryId(courseId)) return status("Connect and select your course to save. Your draft stays in this browser.");
    if (!value.pattern.trim() || !value.spoken.trim()) return status("Enter both the written phrase and intended pronunciation.");
    busy = true; render(); status("Saving course pronunciation…");
    try {
      const before = await targetApi.fetchEntryRecords(courseId);
      const legacy = classRows.filter(row => row.rule_type !== 1).map(row => ({ text: row.pattern, substitution: row.replacement,
        ignore_case: row.case_sensitive ? "No" : "Yes", app: "All Apps", note: row.comment || "" }));
      const after = (before.length ? before : legacy).map(row => ({ ...row }));
      const index = after.findIndex(row => row.text === value.pattern.trim());
      const row = { ...(index >= 0 ? after[index] : {}), text: value.pattern.trim(), substitution: value.spoken.trim(),
        app: "All Apps", ignore_case: value.ignore_case, note: index >= 0 ? after[index].note : "Added in pronunciation review" };
      if (index >= 0) after[index] = row; else after.push(row);
      await targetApi.saveEntryRecords(courseId, after);
      const historySaved = rememberDictionaryChange(storage, project, courseId, before, after, value.pattern);
      if (destroyed) {
        // A newer mount may already have a different passage/draft. Never overwrite it.
        const latest = loadReviewSession(storage, project);
        if (latest.passage === state.passage && latest.courseId === courseId) {
          const pending = latest.drafts[courseId];
          if (pending?.pattern === value.pattern && pending?.spoken === value.spoken) delete latest.drafts[courseId];
          saveReviewSession(storage, markReviewItem(latest, { ...value, status: "added" }), project);
        }
        notifyDictionaryUpdated({ classSlug: courseId, source: "review-completed" });
        return;
      }
      state = markReviewItem(state, { ...value, status: "added" }); delete state.drafts[courseId];
      // Persist even if the view was unmounted while the network request was pending.
      saveReviewSession(storage, state, project);
      notifyDictionaryUpdated({ classSlug: courseId, source: "review" });
      if (!destroyed) { busy = false; editorFromState(); await loadCourse(); persist(); status(`Saved “${row.text}”.${historySaved ? " Undo is available." : " Browser storage is unavailable; Undo could not be saved."}`); }
    } catch (error) { if (!destroyed) status(`Save failed: ${error.message}. Your draft is still available.`); }
    finally { if (!destroyed) { busy = false; render(); } }
  }
  async function undo() {
    if (busy || !api || isDemoDictionaryId(state.courseId)) return;
    const courseId = state.courseId; busy = true; render();
    try {
      const change = await undoDictionaryChange(api, storage, scope, courseId);
      state.queue = state.queue.map(item => item.courseId === courseId && item.pattern === change.label ? { ...item, status: "needs-attention" } : item);
      notifyDictionaryUpdated({ classSlug: courseId, source: "review" });
      if (!destroyed) { busy = false; await loadCourse(); persist(); status(`Undid ${change.label}.`); }
    } catch (error) { status(error.message); }
    finally { if (!destroyed) { busy = false; render(); } }
  }
  input.value = state.passage; $("review-mode").value = state.mode; editorFromState(); courseOptions(); render();
  on(input, "input", () => { cancelSpeech(); state.passage = input.value; state.sentence = 0; selected = null; render(); persist(); });
  // Use plain clipboard text verbatim. HTML-only fallback extracts text, without interpreting notation.
  on(input, "paste", event => {
    if (event.defaultPrevented) return;
    const plain = event.clipboardData?.getData("text/plain");
    if (plain) return; // Native textarea paste preserves text and its undo stack.
    const html = event.clipboardData?.getData("text/html"); if (!html) return;
    event.preventDefault();
    input.setRangeText(plainTextFromClipboardHtml(html), input.selectionStart, input.selectionEnd, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  for (const host of [input, $("review-text")]) { on(host, "mouseup", captureSelection); on(host, "keyup", event => { if (event.shiftKey) captureSelection(); }); }
  on($("review-adjust"), "click", () => { const value = selectedRange() || selected; if (value?.pattern.trim()) setDraft(value, true); else { pattern.focus(); status("Select a word or phrase, or type it in the pronunciation editor."); } });
  for (const host of [pattern, spoken, matchCase]) on(host, "input", readEditor);
  on($("review-mode"), "change", () => { cancelSpeech(); state.mode = $("review-mode").value; render(); persist(); });
  on($("review-previous"), "click", () => move(-1)); on($("review-next"), "click", () => move(1));
  on($("review-hear-original"), "click", () => play($("review-original").textContent, "original"));
  on($("review-hear-revised"), "click", () => play($("review-revised").textContent, "revised"));
  on($("review-repeat"), "click", () => lastPlayback ? play(lastPlayback.text, lastPlayback.kind) : play($("review-original").textContent));
  on($("review-pause"), "click", toggleSpeechPause); on($("review-stop"), "click", cancelSpeech);
  on($("review-hear-word"), "click", () => { readEditor(); play(spoken.value.trim() || reviewSpeech(pattern.value).spoken, "word"); });
  on($("review-hear-sentence"), "click", () => { readEditor(); const value = draft();
    const sentence = passages.find(item => value.start >= item.start && value.start < item.end)?.text || current.text;
    play(reviewSpeech(sentence, { revised: true, preview: value }).spoken, "sentence with draft"); });
  on($("review-save"), "click", () => void savePronunciation());
  on($("review-undo"), "click", () => void undo());
  on($("review-discard"), "click", () => { delete state.drafts[state.courseId]; editorFromState(); renderSpeech(); persist(); status("Draft discarded."); });
  for (const [id, value] of [["review-attention", "needs-attention"], ["review-no-change", "reviewed"]]) on($(id), "click", () => {
    readEditor(); const item = draft().pattern.trim() ? draft() : { pattern: current.text, start: current.start, end: current.end };
    if (!item.pattern) return;
    state = markReviewItem(state, { ...item, status: value }); renderQueue(); persist(); status(STATUS[value]);
  });
  on($("review-sample"), "click", () => { if (input.value && !window.confirm("Replace the current passage with the sample?")) return;
    replaceSource("Heat 10 mL of DI water from 25°C to 30°C. Calculate T2 - T1.\nReport energy in kJ/mol."); });
  on($("review-clear"), "click", () => { if (!input.value || window.confirm("Clear this passage, its local review queue, and unsaved pronunciation drafts? Saved course pronunciations are kept.")) replaceSource(""); });
  on(course, "change", () => { persist(); cancelSpeech(); state.courseId = course.value; try { setStoredCourseId(state.courseId); } catch { /* Session persistence reports storage errors. */ } selected = null; lastPlayback = null;
    editorFromState(); persist(); void loadCourse(); });
  on($("review-connect"), "click", () => openCloudSettingsModal({ url: config?.url ?? "", anonKey: config?.anonKey ?? "",
    onSave: saved => { setStoredSupabaseConfig(saved); void connect(saved); }, onClear: () => { clearStoredSupabaseConfig(); void connect(null); } }));
  if (extension) on($("review-pull"), "click", async () => {
    if (busy) return; const button = $("review-pull"); button.disabled = true; status("Reading the source page…");
    try {
      const captured = await pullTextFromActiveTab(); if (destroyed) return;
      if (!captured.ok) return status(captured.error);
      const mode = $("review-capture-mode").value;
      if (mode === "append" && captured.source !== "selection") return status("Select text on the source page before using Append selection. Use Replace passage to capture page or editor text.");
      if (mode === "replace" && input.value && !window.confirm("Replace the current passage, its review queue, and unsaved pronunciation drafts? Saved course pronunciations are kept.")) return;
      replaceSource(captured.text, captured, mode);
      status(`${mode === "append" ? "Appended" : "Captured"} ${pullSourceLabel(captured.source)}.${captured.truncated ? " Capture truncated; see source details above." : ""}`);
    } catch (error) { status(`Capture failed: ${error.message}`); }
    finally { if (!destroyed) button.disabled = false; }
  });
  const speechUnsubscribe = subscribeSpeechState(playing => { if (destroyed) return; $("review-pause").disabled = !playing; $("review-stop").disabled = !playing; });
  const dictionaryUnsubscribe = onDictionaryUpdated(({ classSlug, source }) => {
    if (source === "review" || busy || destroyed || (classSlug && classSlug !== state.courseId)) return;
    void loadCourse();
  });
  const unregister = registerDictionaryReload?.(classSlug => { if (!destroyed && !busy && (!classSlug || classSlug === state.courseId)) void loadCourse(); });
  on(window, "pagehide", persist); on(window, "scroll", persist, { passive: true }); on(input, "scroll", persist, { passive: true });
  on($("review-text"), "scroll", persist, { passive: true });
  const savedScroll = { ...state.scroll };
  if (api) { try { courses = await api.listCourses(); if (!destroyed) courseOptions(); } catch (error) { status(`Could not load course list: ${error.message}`); } }
  if (!destroyed) {
    await loadCourse();
    if (!destroyed) requestAnimationFrame(() => { if (destroyed) return; input.scrollTop = savedScroll.source || 0; $("review-text").scrollTop = savedScroll.text || 0; window.scrollTo(0, savedScroll.page || 0); });
  }
  return { destroy() { persist(); destroyed = true; loadSeq++; cancelSpeech(); exponentPaste.destroy(); speechUnsubscribe(); dictionaryUnsubscribe(); unregister?.(); listeners.forEach(remove => remove()); } };
}

import { AI_TEXT_LIMIT, AI_SUGGESTION_LIMIT, suggestionRow, validateAiSuggestions, spokenWordingIssue, canEditAiPronunciation, requiresExactTextApproval, reusableScientificReading } from "./core/ai-dictionary.js";
import { proposalKind, existingPronunciationsForPassage, prepareAiReviewItem } from "./core/ai-review.js";
import { cleanHistoryRows } from "./dictionary-history.js";
import { findRuleConflicts } from "./core/rule-conflicts.js";
import { reviewSpeech } from "./core/review-speech.js";
import { speak, cancelSpeech } from "./speech.js";
import { helperUrl } from "./local-helper.js";
import { bindExponentPaste } from "./exponent-paste.js";
import { mountDocumentImport } from "./document-import.js";
import { mountContentReviewTools } from "./content-review-tools.js";
import { loadReviewSession, splitReviewPassages } from "./core/review-session.js";
import { plainTextFromClipboardHtml } from "./core/exponent-formatting.js";

const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const decisions = { pending: "Not reviewed", approved: "Approved — not saved", skipped: "Skipped", later: "Review later", saved: "Saved" };
const REVIEW_ITEM_LIMIT = AI_SUGGESTION_LIMIT * 2;
const textLimitLabel = AI_TEXT_LIMIT.toLocaleString("en-US");
const blank = () => ({ source: "", analyzedSource: "", suggestions: [], base: [], cursor: 0, view: "focus", diagnostics: "", suggestAlternatives: false, sentence: 0, mode: "focus", manualWritten: "", sourceDetails: "" });

export function mountAiDictionaryAssistant(container, { context = "web", getCourse, getCourseLabel = getCourse, getRows, getSavedRows = getRows, onSave, onRefresh, onOpenLab, onUseLabPassage, canSave = () => true, unified = false, helperContainer = null, onReviewChanged = () => {}, getLegacyScope = () => "local", getCourseId = getCourse }) {
  if (!container) return { destroy() {}, scopeChanged() {} };
  let destroyed = false, analyzing = false, saving = false, controller, generation = 0;
  let scope = getCourse(), state = blank();
  let lastRows = "";
  let contentTools = null;
  const conflictFixes = new Map(); // suggestion index -> suggested fixes for its listed conflicts
  const extension = context === "extension";
  let helperAvailable = !extension && !unified;
  const listeners = [];
  const on = (el, event, fn) => { el.addEventListener(event, fn); listeners.push(() => el.removeEventListener(event, fn)); };
  const storage = () => { try { return localStorage; } catch { return null; } };
  const key = () => `hearsay-ai-review-v1:${scope}`;
  function persist() {
    if (destroyed) return;
    try { const store = storage(); if (!store) throw new Error(); store.setItem(key(), JSON.stringify({ ...state, analyzedSource: state.analyzedSource === state.source ? null : state.analyzedSource })); }
    catch { status("Browser storage is unavailable. Keep this view open to retain your review."); }
  }
  function restore() {
    state = blank();
    try {
      const draft = JSON.parse(storage()?.getItem(key()) || "null");
      if (!draft || typeof draft.source !== "string" || draft.source.length > AI_TEXT_LIMIT) return;
      // Validate source evidence while preserving editable empty/invalid fields for repair.
      const analyzedSource = typeof draft.analyzedSource === "string" ? draft.analyzedSource : draft.source;
      if (analyzedSource.length > AI_TEXT_LIMIT) return;
      const checked = { suggestions: (draft.suggestions || []).slice(0, REVIEW_ITEM_LIMIT).flatMap(item => validateAiSuggestions({ suggestions: [{ ...item, spoken: !item.spoken || item.spoken === item.term ? "Review pronunciation" : item.spoken }] }, item.origin === "manual" ? item.evidence : analyzedSource).suggestions) };
      const saved = new Map((draft.suggestions || []).map(item => [item.term, item]));
      state = { ...blank(), source: draft.source, analyzedSource, base: Array.isArray(draft.base) ? cleanHistoryRows(draft.base) : [],
        suggestAlternatives: draft.suggestAlternatives === true,
        cursor: Number.isInteger(draft.cursor) ? draft.cursor : 0, view: draft.view === "list" ? "list" : "focus",
        diagnostics: typeof draft.diagnostics === "string" ? draft.diagnostics : "",
        sentence: Number.isInteger(draft.sentence) ? draft.sentence : 0, mode: draft.mode === "passage" ? "passage" : "focus",
        manualWritten: typeof draft.manualWritten === "string" ? draft.manualWritten.slice(0, 160) : "",
        sourceDetails: typeof draft.sourceDetails === "string" ? draft.sourceDetails : "",
        suggestions: checked.suggestions.map(item => {
          const previous = saved.get(item.term);
          return { ...item, origin: previous.origin === "manual" ? "manual" : "ai", note: previous.note || "", pronunciationWarning: previous.pronunciationWarning || item.pronunciationWarning, spoken: previous.spoken, ignoreCase: previous.ignoreCase === "Yes" ? "Yes" : "No",
            exactTextConfirmed: previous.exactTextConfirmed === true,
            decision: previous.decision === "approved" && (!canEditAiPronunciation(item) || (requiresExactTextApproval(item) && !previous.exactTextConfirmed)) ? "pending" : Object.hasOwn(decisions, previous.decision) ? previous.decision : "pending", replaceExisting: Boolean(previous.replaceExisting) };
        }) };
    } catch { /* Corrupt browser drafts must not prevent dictionary access. */ }
  }
  container.innerHTML = `
    <h2 class="hs-dict-editor-card-title" id="hs-ai-heading">${unified ? "Review content" : "AI Dictionary Assistant"}</h2>
    <p id="hs-ai-course" class="ss-sub"></p>
    ${extension || unified ? `<details id="hs-ai-helper-setup"><summary>AI connection</summary><p id="hs-ai-helper-status">Checking the local helper…</p><p>Run npm run serve on this computer.${extension ? " Add this extension ID to allowedExtensionIds in createai/config.local.json:" : " Open the local website to use the configured helper."}</p>${extension ? `<code>${esc(globalThis.chrome?.runtime?.id || "Find the ID at chrome://extensions")}</code>` : ""}<p>Manual review and speech preview work without AI. The service token stays on the helper.</p><button type="button" id="hs-ai-reconnect" class="ss-btn">Check helper connection</button></details>` : ""}
    <details id="hs-ai-source-panel" open><summary id="hs-ai-source-summary">${unified ? "Import or paste text" : "1. Course content"}</summary>
      <div id="hs-ai-document-import"></div>
      <label for="hs-ai-source">${unified ? "Or paste text from Google Docs, Canvas or a web page" : `Paste text or review imported content (up to ${textLimitLabel} characters)`}</label>
      <textarea id="hs-ai-source" class="ss-input" rows="6" maxlength="${AI_TEXT_LIMIT}" aria-describedby="hs-ai-disclosure"></textarea>
      <div class="hs-ai-actions">
        <button type="button" id="hs-ai-analyze" class="ss-btn primary">${unified ? "Get AI suggestions" : "Analyze text with ASU"}</button>
        <button type="button" id="hs-ai-cancel" class="ss-btn" disabled>Cancel analysis</button>
        <button type="button" id="hs-ai-revert-source" class="ss-btn" hidden>Restore analyzed passage</button>
        <button type="button" id="hs-ai-use-lab" class="ss-btn">Use passage from Lab</button>
      </div>
      ${unified ? '<p id="hs-ai-availability" class="ss-sub">Checking the AI connection. Manual review remains available.</p>' : ""}
      <p id="hs-ai-disclosure" class="ss-sub">Sends this text to ASU CreateAI. Nothing changes in your dictionary until you approve and save.</p>
      <details class="hs-ai-options"><summary>${unified ? "What is sent to the AI" : "AI options and privacy"}</summary>
        <label ${unified ? "hidden" : ""}><input type="checkbox" id="hs-ai-alternatives" /> Suggest alternatives for terms already saved in this class</label>
        <p class="ss-sub">The request includes all text in the field, matching saved class readings, and a few short course examples that help the AI spot terms. ${unified ? "Terms already in your class dictionary are not suggested again." : "Saved readings are kept unless you tick the option above."} Images are never sent. Oversized text is reported, never silently shortened. Your review draft is kept in this browser for this class.</p>
      </details>
    </details>
    ${unified ? '<div id="hs-content-tools"></div>' : ""}
    <div class="hs-dict-editor-actions">
      <button type="button" id="hs-ai-clear" class="ss-btn">Clear review</button>
      <button type="button" id="hs-ai-stop" class="ss-btn">Stop speech</button>
    </div>
    <p id="hs-ai-status" role="status" aria-live="polite"></p>
    <section id="hs-ai-review" aria-label="${unified ? "Suggestions" : "2. Review suggestions"}" hidden>
      ${unified ? `<div class="hs-ai-review-head">
        <h3>Suggestions</h3>
        <p id="hs-ai-progress" class="ss-sub" role="status" aria-live="polite" tabindex="-1"></p>
        <div class="hs-ai-pager">
          <button type="button" id="hs-ai-previous" class="ss-btn hs-step" aria-label="Previous suggestion">‹</button>
          <span id="hs-ai-position" class="ss-sub"></span>
          <button type="button" id="hs-ai-next" class="ss-btn hs-step" aria-label="Next suggestion">›</button>
          <button type="button" id="hs-ai-view-toggle" class="ss-btn">Show all</button>
        </div>
      </div>
      <div class="hs-ai-queue-nav" hidden><select id="hs-ai-view" aria-hidden="true" tabindex="-1"><option value="focus">One at a time</option><option value="list">All</option></select><span class="hs-ai-jump-label"><select id="hs-ai-jump" aria-hidden="true" tabindex="-1"></select></span></div>
      <div id="hs-ai-results"></div>` : `<h3>2. Review suggestions</h3>
      <p id="hs-ai-progress" class="ss-sub" role="status" aria-live="polite" tabindex="-1"></p>
      <div class="hs-ai-queue-nav">
        <label>Show <select id="hs-ai-view" class="ss-btn"><option value="focus">One at a time</option><option value="list">All</option></select></label>
        <label class="hs-ai-jump-label">Go to <select id="hs-ai-jump" class="ss-btn"></select></label>
      </div>
      <div id="hs-ai-results"></div>
      <div class="hs-dict-editor-actions hs-ai-step"><button type="button" id="hs-ai-previous" class="ss-btn">Previous</button><button type="button" id="hs-ai-next" class="ss-btn">Next</button></div>`}
    </section>
    <section id="hs-ai-save-panel" aria-label="3. Save approved terms" hidden>
      <h3>3. Save approved terms</h3><p id="hs-ai-save-summary"></p><ul id="hs-ai-save-changes"></ul>
      <button type="button" id="hs-ai-save" class="ss-btn primary" disabled>Save approved terms</button>
      <button type="button" id="hs-ai-refresh" class="ss-btn">Refresh class checks</button>
      <button type="button" id="hs-ai-lab" class="ss-btn">Review this passage in Lab</button>
    </section>
    <details id="hs-ai-details-panel"><summary>Analysis details</summary><p id="hs-ai-details"></p></details>`;
  if (unified && helperContainer) helperContainer.append(container.querySelector("#hs-ai-helper-setup"));
  const $ = selector => container.querySelector(selector) || helperContainer?.querySelector(selector);
  if (unified) {
    $("#hs-ai-heading").classList.add("hs-visually-hidden"); $("#hs-ai-course").hidden = true;
    // One column: a single Course content card, suggestions below it.
    // Two ways in: upload a document, or paste text. The pasted text box is
    // the passage; one action row holds Get AI suggestions and listening.
    const grid = document.createElement("div"); grid.className = "hs-content-grid";
    const card = document.createElement("section"); card.className = "hs-content-card"; card.setAttribute("aria-labelledby", "hs-content-card-h");
    card.innerHTML = '<h3 id="hs-content-card-h">Course content</h3>';
    const capture = document.createElement("div"); capture.id = "hs-content-capture";
    const actionRow = $(".hs-ai-actions"); actionRow.classList.add("hs-content-actions");
    const listen = document.createElement("div"); listen.id = "hs-content-listen"; actionRow.append(listen);
    const cells = document.createElement("div"); cells.id = "hs-content-cells"; // Default | Dictionary pronunciations
    const notes = document.createElement("div"); notes.className = "hs-content-notes";
    const options = $(".hs-ai-options");
    options.hidden = true; // Not needed in the workspace; terms already saved are never re-suggested.
    $("#hs-ai-disclosure").hidden = true; // Not shown in the workspace (still referenced by the text box for screen readers).
    notes.append($("#hs-ai-availability"), $("#hs-ai-disclosure"), options);
    const reviewColumn = document.createElement("div"); reviewColumn.className = "hs-content-review-column";
    const empty = document.createElement("p"); empty.id = "hs-content-empty"; empty.className = "ss-sub"; empty.textContent = "Suggestions appear here. Choose Get AI suggestions, or highlight a word in the text and add it.";
    $("#hs-ai-stop").hidden = true; $("#hs-ai-clear").textContent = "Clear content and review";
    const actions = $("#hs-ai-clear").parentElement;
    actions.hidden = true;
    // Clear sits right of Get AI suggestions: it empties the text box and its suggestions.
    const clear = $("#hs-ai-clear"); clear.textContent = "Clear"; clear.classList.add("hs-clear"); $("#hs-ai-analyze").after(clear); // right of Get AI suggestions
    const panel = $("#hs-ai-source-panel"), pasteLabel = panel.querySelector('label[for="hs-ai-source"]');
    // One compact top row: title, where the text came from, and file import.
    // The paste instruction lives in the text box placeholder.
    // Import sits top left; the paste instruction is the text box label under it.
    pasteLabel.textContent = "Or copy and paste directly from the document or website.";
    pasteLabel.classList.add("hs-content-paste-label");
    $("#hs-ai-source").placeholder = "Paste here…";
    card.querySelector("h3").classList.add("hs-visually-hidden");
    const top = document.createElement("div"); top.className = "hs-content-top";
    top.append(card.querySelector("h3"), capture, $("#hs-ai-document-import"));
    card.append(top, pasteLabel, $("#hs-ai-source"), actionRow, $("#hs-ai-status"), cells, reviewColumn, notes, $("#hs-content-tools"), actions);
    panel.remove();
    reviewColumn.append(empty, $("#hs-ai-review"), $("#hs-ai-save-panel"), $("#hs-ai-details").closest("details"));
    grid.append(card); container.append(grid); // Suggestions sit inside the card, under the pronunciation cells.
  }
  const status = message => { if (!destroyed && $("#hs-ai-status").textContent !== message) $("#hs-ai-status").textContent = message; };
  if (unified) { container.hidden = false; $("#hs-ai-use-lab").hidden = true; $("#hs-ai-lab").hidden = true; }
  const exponentPaste = bindExponentPaste($("#hs-ai-source"), { onStatus: status, automatic: unified, includeSubscripts: unified });
  const documentImport = mountDocumentImport($("#hs-ai-document-import"), {
    direct: unified, // workspace: imported text goes straight into the text box
    isBusy: () => analyzing || saving,
    canAnalyze: () => helperAvailable,
    onAnalyze: (text, metadata) => { void analyzeSource(text, metadata); },
    onUseText(text, metadata) {
      if (state.source && state.source !== text && !window.confirm(unified ? "Replace the text in the box with this document? Suggestions you have already reviewed are kept." : "Replace the content with this document's extracted text? Existing review decisions are retained until you analyze again.")) return false;
      state.source = text; state.sentence = 0; state.sourceDetails = `From ${metadata.kind} file`; render(); persist();
      if (!unified) status(`${metadata.kind} text loaded. Nothing sent to ASU.`);
      $("#hs-ai-source").focus();
    },
  });
  const candidate = item => ({ ...suggestionRow(item), ...(item.origin === "manual" ? { note: item.note || "Added during content review" } : {}), ignore_case: item.ignoreCase || "No" });
  const approvedItems = () => state.suggestions.filter(item => canEditAiPronunciation(item) && item.decision === "approved" && (!requiresExactTextApproval(item) || item.exactTextConfirmed));
  const approved = () => approvedItems().map(item => ({ row: candidate(item), replaceExisting: item.replaceExisting }));
  const sourceChanged = () => state.suggestions.some(item => item.origin !== "manual") && state.source !== state.analyzedSource;
  function label(item) {
    if (item.decision === "saved") return decisions.saved;
    if (canEditAiPronunciation(item) && proposalKind(candidate(item), getSavedRows()) === "covered") return "Already covered";
    if (unified && canEditAiPronunciation(item) && proposalKind(candidate(item), getRows()) === "covered") return "Staged in Class dictionary";
    return decisions[item.decision] || "Not reviewed";
  }
  const alreadyIncluded = item => ["Already covered", "Staged in Class dictionary"].includes(label(item));
  function progress() {
    const count = decision => state.suggestions.filter(item => item.decision === decision && !alreadyIncluded(item)).length;
    const covered = state.suggestions.filter(item => label(item) === "Already covered").length;
    const staged = state.suggestions.filter(item => label(item) === "Staged in Class dictionary").length;
    // Always show what is left and what is approved; other tallies only once they occur.
    const optional = [[count("skipped"), "skipped"], [count("later"), "for later"], [covered, "already covered"], [count("saved"), "saved"], [staged, "staged in Class dictionary"]]
      .filter(([value]) => value).map(([value, text]) => `${value} ${text}`);
    const progressText = [`${count("pending")} to review`, `${count("approved")} approved`, ...optional].join(" · ");
    if ($("#hs-ai-progress").textContent !== progressText) $("#hs-ai-progress").textContent = progressText;
    const rows = approved(), updates = rows.filter(({ row }) => proposalKind(row, getRows()) === "update").length;
    $("#hs-ai-save-summary").textContent = `${rows.length - updates} additions and ${updates} replacements staged for ${getCourseLabel()}. Nothing is saved until you choose Save.`;
    $("#hs-ai-save-changes").innerHTML = rows.map(({ row }) => `<li>${esc(proposalKind(row, getRows()) === "update" ? "Replace" : "Add")} ${esc(row.text)} → ${esc(row.substitution)}</li>`).join("");
    $("#hs-ai-save").textContent = saving ? "Saving…" : `Save ${rows.length} approved terms to ${getCourseLabel()}`;
    $("#hs-ai-save").disabled = saving || analyzing || sourceChanged() || !rows.length || !canSave();
    $("#hs-ai-refresh").disabled = saving || analyzing || !canSave();
    $("#hs-ai-lab").disabled = saving || analyzing || sourceChanged() || !state.source.trim() || rows.length > 0;
    $("#hs-ai-revert-source").hidden = !sourceChanged();
    $("#hs-ai-revert-source").disabled = saving || analyzing;
    $("#hs-ai-jump").innerHTML = state.suggestions.map((item, at) => `<option value="${at}" ${at === state.cursor ? "selected" : ""}>${esc(`${at + 1}. ${item.term} — ${label(item)}`)}</option>`).join("");
    if (unified) { $("#hs-ai-save-panel").hidden = true; contentTools?.refresh(); onReviewChanged(); }
    if (unified) $("#hs-content-empty").hidden = Boolean(state.suggestions.length);
  }
  function warnings(index) {
    const item = state.suggestions[index];
    if (!canEditAiPronunciation(item)) return;
    const row = candidate(item);
    const otherRows = approved().filter(other => other.row.text !== row.text).map(other => other.row);
    const findings = findRuleConflicts(row, [...getRows(), ...otherRows]);
    const host = $(`[data-warnings="${index}"]`);
    // Duplicates are already shown as "Currently saved" / Replace on the card.
    const shown = findings.filter(finding => !["duplicate", "duplicate-different", "overlap", "overlap-inside"].includes(finding.kind));
    const shared = [...new Set(findings.filter(finding => ["overlap", "overlap-inside"].includes(finding.kind)).map(finding => finding.otherPattern))];
    conflictFixes.set(index, shown.map(finding => finding.fix));
    const wording = spokenWordingIssue(row.substitution);
    host.innerHTML = [
      wording ? `<li class="hs-conflict-high">${esc(wording)}</li>` : "",
      ...shown.map((finding, at) => `<li class="hs-conflict-${esc(finding.severity)}"><span>${esc(finding.message)}</span>${finding.fix ? ` <button type="button" class="ss-btn" data-action="fix" data-index="${index}" data-fix="${at}">${esc(finding.fix.label)}</button>` : ""}</li>`),
      shared.length ? `<li class="hs-conflict-info">Shares text with saved ${shared.map(term => `"${esc(term)}"`).join(", ")}. Longer entries are applied first, so each keeps its own reading.</li>` : "",
    ].join("");
    host.hidden = !host.innerHTML;
    $(`[data-decision="${index}"]`).textContent = label(item);
  }
  // Workspace suggestion card. Row 1: the term and where it appears. Row 2:
  // how default JAWS reads it beside the suggested reading (editable), each
  // with a play button. Row 3: Add / Skip / Next. Extra notes only when relevant.
  function compactCard(item, index, kind, existing, staged) {
    const disabled = saving ? "disabled" : "";
    const hidden = state.view === "focus" && index !== state.cursor ? "hidden" : "";
    const why = item.origin === "manual" && /^(Manual pronunciation review\.|Added during content review)$/.test(item.reason) ? "" : item.reason;
    const reusable = reusableScientificReading(item);
    let defaultReading = item.term;
    try { defaultReading = reviewSpeech(item.term).spoken || item.term; } catch { /* keep the written form */ }
    const conflictCheck = item.conflicts && !/^none( found)?\.?$/i.test(item.conflicts) ? `AI conflict check: ${item.conflicts}` : "";
    const notes = [
      conflictCheck,
      item.pronunciationWarning ? "The AI returned an unusable pronunciation. Enter a correction before adding." : "",
      existing.length ? `Currently saved: ${existing.map(other => other.substitution).join("; ")}` : "",
      staged.length ? `Staged dictionary reading (not saved): ${staged.map(other => other.substitution).join("; ")}` : "",
    ].filter(Boolean);
    const next = `<button type="button" class="ss-btn" data-action="skip" data-index="${index}" ${disabled}>Skip</button><button type="button" class="ss-btn" data-action="later" data-index="${index}" ${disabled} title="Keep this suggestion and go to the next one">Next</button>`;
    const head = `<div class="hs-ai-card-head">
        <div class="hs-ai-field hs-ai-field-term"><span class="hs-ai-reading-label">Term</span><h4 id="hs-ai-term-${index}" tabindex="-1" ${why ? `title="${esc(why)}"` : ""}>${esc(item.term)}</h4></div>
        ${item.evidence !== item.term ? `<div class="hs-ai-field hs-ai-field-context"><span class="hs-ai-reading-label">Context</span><span class="hs-ai-context" title="${esc(item.evidence)}">“${esc(item.evidence)}”</span></div>` : ""}
        <span data-decision="${index}" class="hs-ai-decision">${esc(label(item))}</span>
      </div>
      ${notes.map(note => `<p class="ss-sub hs-ai-note">${esc(note)}</p>`).join("")}
      ${reusable ? `<p class="ss-sub hs-ai-note">One reusable entry can cover every coefficient with this exponent. <button type="button" class="ss-btn" data-action="reuse-power" data-index="${index}" ${disabled}>Use ${esc(reusable.term)}</button></p>` : ""}`;
    const defaultBox = `<div class="hs-ai-reading"><span class="hs-ai-reading-label" id="hs-ai-default-${index}">Default JAWS</span>
        <div class="hs-ai-reading-row"><output class="hs-ai-default" aria-labelledby="hs-ai-default-${index}">${esc(defaultReading)}</output>
        <button type="button" class="ss-btn hs-ai-hear" data-action="default" data-index="${index}" aria-label="Hear how default JAWS reads ${esc(item.term)}" title="Hear default JAWS">▶</button></div></div>`;
    if (!canEditAiPronunciation(item)) {
      const proposed = item.spoken && !spokenWordingIssue(item.spoken);
      return `<article class="hs-ai-suggestion hs-ai-card" ${hidden} aria-labelledby="hs-ai-term-${index}">${head}
        <p class="ss-sub hs-ai-note">Needs structural review: check the equation or notation in its source layout before creating an entry.</p>
        <div class="hs-ai-readings">${defaultBox}
          ${proposed ? `<div class="hs-ai-reading"><span class="hs-ai-reading-label">Suggested</span><div class="hs-ai-reading-row"><output class="hs-ai-default">${esc(item.spoken)}</output><button type="button" class="ss-btn hs-ai-hear" data-action="structural-reading" data-index="${index}" aria-label="Hear suggested reading" title="Hear suggested reading">▶</button></div></div>` : ""}</div>
        <div class="hs-ai-decision-row">${next}</div>
      </article>`;
    }
    return `<article class="hs-ai-suggestion hs-ai-card" ${hidden} aria-labelledby="hs-ai-term-${index}">${head}
      <div class="hs-ai-readings">${defaultBox}
        <div class="hs-ai-reading"><label class="hs-ai-reading-label" for="hs-ai-spoken-${index}">Suggested</label>
          <div class="hs-ai-reading-row"><input id="hs-ai-spoken-${index}" class="ss-input" data-spoken="${index}" maxlength="300" value="${esc(item.spoken)}" ${disabled} />
          <button type="button" class="ss-btn hs-ai-hear" data-action="term" data-index="${index}" aria-label="Hear suggested reading" title="Hear suggested reading">▶</button></div></div>
      </div>
      ${requiresExactTextApproval(item) ? `<label class="hs-ai-check"><input type="checkbox" data-exact-text="${index}" ${item.exactTextConfirmed ? "checked" : ""} ${disabled} /> Add this exact expression (${esc(item.term)}) to the class dictionary. It is not a general exponent rule.</label>` : ""}
      <div data-existing="${index}" ${kind !== "update" ? "hidden" : ""}><label class="hs-ai-check"><input type="checkbox" data-replace="${index}" ${item.replaceExisting ? "checked" : ""} ${disabled} /> Replace the existing pronunciation for ${esc(item.term)}</label></div>
      <ul data-warnings="${index}" class="hs-conflicts" aria-label="Conflicts with ${esc(item.term)}" hidden></ul>
      <div class="hs-ai-decision-row">
        <button type="button" class="ss-btn primary" data-action="approve" data-index="${index}" ${saving || kind === "covered" ? "disabled" : ""}>Add</button>${next}
        <label class="hs-ai-case" title="No: match this exact capitalization. Yes: match any capitalization.">Ignore case <select class="ss-btn" data-case="${index}" ${disabled}><option value="No" ${item.ignoreCase !== "Yes" ? "selected" : ""}>No</option><option value="Yes" ${item.ignoreCase === "Yes" ? "selected" : ""}>Yes</option></select></label>
        ${item.origin === "manual" ? `<details class="hs-ai-more"><summary>Options</summary><label>Written form <input class="ss-input" data-written="${index}" maxlength="160" value="${esc(item.term)}" ${disabled} /></label></details>` : ""}
      </div>
    </article>`;
  }
  function render() {
    lastRows = JSON.stringify(cleanHistoryRows(getRows()));
    state.cursor = Math.max(0, Math.min(state.cursor, state.suggestions.length - 1));
    $("#hs-ai-course").textContent = unified ? "Import or paste content, listen, and approve changes in one review queue. You can also add terms manually." : `Reviewing for ${getCourseLabel()}`;
    if ($("#hs-ai-source").value !== state.source) $("#hs-ai-source").value = state.source;
    exponentPaste.refresh();
    documentImport.refresh();
    $("#hs-ai-view").value = state.view;
    $("#hs-ai-alternatives").checked = state.suggestAlternatives;
    $("#hs-ai-alternatives").disabled = analyzing || saving;
    $("#hs-ai-review").hidden = !state.suggestions.length; $("#hs-ai-save-panel").hidden = !state.suggestions.length;
    $("#hs-ai-details").textContent = state.diagnostics;
    $("#hs-ai-details-panel").hidden = !state.diagnostics;
    $("#hs-ai-analyze").disabled = analyzing || saving || !helperAvailable; $("#hs-ai-source").disabled = analyzing || saving;
    if (unified) { $("#hs-ai-availability").hidden = helperAvailable; $("#hs-ai-availability").textContent = "AI suggestions are unavailable (see Settings → AI connection). You can still add terms yourself."; }
    $("#hs-ai-cancel").hidden = unified || !analyzing; // Not offered in the workspace.
    container.querySelector(".hs-ai-queue-nav").hidden = unified || state.suggestions.length < 2;
    container.querySelector(".hs-ai-jump-label").hidden = state.view === "list";
    const step = container.querySelector(".hs-ai-step"); if (step) step.hidden = state.suggestions.length < 2 || state.view === "list";
    if (unified) {
      const pager = container.querySelector(".hs-ai-pager"), list = state.view === "list";
      pager.hidden = state.suggestions.length < 2;
      $("#hs-ai-position").textContent = list ? `${state.suggestions.length} suggestions` : `${state.cursor + 1} of ${state.suggestions.length}`;
      $("#hs-ai-previous").hidden = $("#hs-ai-next").hidden = list;
      $("#hs-ai-view-toggle").textContent = list ? "Show one at a time" : "Show all";
      $("#hs-ai-details-panel").hidden = true; // diagnostics are not shown in the workspace
    }
    $("#hs-ai-use-lab").disabled = analyzing || saving;
    $("#hs-ai-cancel").disabled = !analyzing; $("#hs-ai-clear").disabled = analyzing || saving;
    $("#hs-ai-previous").disabled = state.cursor === 0 || saving; $("#hs-ai-next").disabled = state.cursor >= state.suggestions.length - 1 || saving;
    $("#hs-ai-results").setAttribute("aria-busy", String(analyzing || saving));
    $("#hs-ai-results").innerHTML = state.suggestions.map((item, index) => {
      const kind = proposalKind(candidate(item), getRows()), existing = getSavedRows().filter(other => other.text === item.term);
      const staged = unified ? getRows().filter(other => other.text === item.term && !existing.some(saved => saved.substitution === other.substitution && saved.ignore_case === other.ignore_case)) : [];
      if (unified) return compactCard(item, index, kind, existing, staged);
      return `<article class="hs-ai-suggestion" ${state.view === "focus" && index !== state.cursor ? "hidden" : ""} aria-labelledby="hs-ai-term-${index}">
        <h4 id="hs-ai-term-${index}" tabindex="-1">${esc(item.term)} — ${index + 1} of ${state.suggestions.length}</h4>
        <p data-decision="${index}" class="hs-ai-decision">${esc(label(item))}</p>${item.evidence !== item.term ? `<blockquote>${esc(item.evidence)}</blockquote>` : ""}${item.origin === "manual" && /^(Manual pronunciation review\.|Added during content review)$/.test(item.reason) ? "" : `<p class="ss-sub">${esc(item.reason)}</p>`}
        ${unified && item.origin === "manual" ? `<label>Written word or phrase <input class="ss-input" data-written="${index}" maxlength="160" value="${esc(item.term)}" ${saving ? "disabled" : ""} /></label>` : ""}
        ${reusableScientificReading(item) ? `<p>You can reuse the scientific-notation part across different coefficients. This covers this exponent and spelling, not every exponent or source format. Test matching in JAWS on the original document.</p><button type="button" class="ss-btn" data-action="reuse-power" data-index="${index}" ${saving ? "disabled" : ""}>Use reusable entry: ${esc(reusableScientificReading(item).term)}</button>` : ""}
        ${canEditAiPronunciation(item) ? `
          ${requiresExactTextApproval(item) ? "<p>Optional reading for this exact numeric expression. Its formatting alone does not establish a screen-reader problem. Edit and listen, then choose whether to add an exact-text dictionary entry.</p>" : item.action === "review" && item.origin !== "manual" ? "<p>Pronunciation needs confirmation. Enter or edit the reading below, listen, then approve when ready.</p>" : ""}
          ${item.pronunciationWarning ? `<p>The AI returned an unusable pronunciation. Enter a correction before approval.</p>` : ""}
          ${existing.length ? `<p>Currently saved: ${existing.map(other => esc(other.substitution)).join("; ")}</p>` : ""}
          ${staged.length ? `<p>Staged dictionary reading (not saved): ${staged.map(other => esc(other.substitution)).join("; ")}</p>` : ""}
          <label class="hs-dict-editor-field">Read ${esc(item.term)} as <input class="ss-input hs-dict-inline-input" data-spoken="${index}" maxlength="300" value="${esc(item.spoken)}" ${saving ? "disabled" : ""} /></label>
          ${requiresExactTextApproval(item) ? `<label><input type="checkbox" data-exact-text="${index}" ${item.exactTextConfirmed ? "checked" : ""} ${saving ? "disabled" : ""} /> Add a class dictionary entry for this exact expression: ${esc(item.term)}</label><p class="ss-sub">This entry applies wherever this exact text matches in the class dictionary. It does not create a general exponent rule or change the source document. Units remain separate entries. Verify the entry in JAWS on the original document; HearSay does not confirm how JAWS matches its formatting.</p>` : ""}
          <details><summary>Options</summary><label>Ignore case for ${esc(item.term)} <select class="ss-btn" data-case="${index}" ${saving ? "disabled" : ""}><option value="No" ${item.ignoreCase !== "Yes" ? "selected" : ""}>No</option><option value="Yes" ${item.ignoreCase === "Yes" ? "selected" : ""}>Yes</option></select></label></details>
          <div data-existing="${index}" ${kind !== "update" ? "hidden" : ""}><label><input type="checkbox" data-replace="${index}" ${item.replaceExisting ? "checked" : ""} ${saving ? "disabled" : ""} /> Replace the existing pronunciation for ${esc(item.term)}</label></div>
          <ul data-warnings="${index}" class="hs-conflicts" aria-label="Conflicts with ${esc(item.term)}" hidden></ul>
          <div class="hs-dict-editor-actions hs-ai-decision-row">
            <button type="button" class="ss-btn" data-action="term" data-index="${index}">${unified ? "Hear proposed reading" : "Hear proposed term"}</button>
            <button type="button" class="ss-btn" data-action="original" data-index="${index}" ${unified ? "hidden" : ""}>Hear original excerpt</button>
            <button type="button" class="ss-btn" data-action="revised" data-index="${index}" ${unified ? "hidden" : ""}>Hear revised excerpt</button>
            <button type="button" class="ss-btn primary" data-action="approve" data-index="${index}" ${saving || kind === "covered" ? "disabled" : ""}>Approve and next</button>` : `<p>Needs structural review. Check the equation or notation in its source layout before creating a rule.</p>
            ${item.spoken && !spokenWordingIssue(item.spoken) ? `<p>Proposed reading for review: ${esc(item.spoken)}</p>` : ""}
          <div class="hs-dict-editor-actions hs-ai-decision-row">
            ${item.spoken && !spokenWordingIssue(item.spoken) ? `<button type="button" class="ss-btn" data-action="structural-reading" data-index="${index}">Hear proposed reading</button>` : ""}
            <button type="button" class="ss-btn" data-action="original" data-index="${index}">Hear original excerpt</button>`}
            <button type="button" class="ss-btn" data-action="skip" data-index="${index}" ${saving ? "disabled" : ""}>Skip</button>
            <button type="button" class="ss-btn" data-action="later" data-index="${index}" ${saving ? "disabled" : ""}>Review later</button>
          </div>
      </article>`;
    }).join("");
    state.suggestions.forEach((_, index) => warnings(index)); progress();
  }
  function focusCurrent() {
    if (unified) {
      const item = state.suggestions[state.cursor], parts = splitReviewPassages(state.source);
      let index = parts.findIndex(part => part.text === item?.evidence);
      if (index < 0) index = parts.findIndex(part => part.text.includes(item?.term));
      if (index >= 0) state.sentence = index;
      contentTools?.refresh(); persist();
    }
    $(`#hs-ai-term-${state.cursor}`)?.focus();
  }
  function move(delta) { state.cursor = Math.max(0, Math.min(state.suggestions.length - 1, state.cursor + delta)); render(); persist(); focusCurrent(); }
  function nextPending(index) {
    const eligible = item => item.decision === "pending" && !alreadyIncluded(item);
    const next = state.suggestions.findIndex((item, at) => at > index && eligible(item, at));
    const first = state.suggestions.findIndex(eligible);
    state.cursor = next >= 0 ? next : first >= 0 ? first : index;
    render(); persist();
    if (next >= 0 || first >= 0) focusCurrent();
    else if (unified) (container.closest("main")?.querySelector("#hs-dict-ed-save:not([disabled])") || $("#hs-ai-progress")).focus();
    else ($("#hs-ai-save").disabled ? $("#hs-ai-progress") : $("#hs-ai-save")).focus();
  }
  function wordingValid(item) {
    const spoken = item.spoken.trim();
    const issue = !spoken ? "Enter spoken wording before approving this term." : spokenWordingIssue(spoken);
    if (issue) { status(issue); return false; }
    if (spoken === item.term) { status("The spoken wording is unchanged. Skip this suggestion or enter a pronunciation correction."); return false; }
    return true;
  }
  function update(event) {
    const el = event.target, index = el.dataset.spoken ?? el.dataset.case ?? el.dataset.replace ?? el.dataset.exactText ?? el.dataset.written;
    if (index === undefined || saving) return;
    const item = state.suggestions[Number(index)];
    if (!item || !canEditAiPronunciation(item)) return;
    if (unified) {
      state.cursor = Number(index);
      const sentence = splitReviewPassages(state.source).findIndex(part => part.text === item.evidence);
      if (sentence >= 0) state.sentence = sentence;
    }
    if (el.dataset.written !== undefined && item.origin === "manual") {
      const term = el.value.trim();
      if (!term) return status("Enter a written word or phrase.");
      if (state.suggestions.some((other, at) => at !== Number(index) && other.term === term)) return status("That term is already in this review.");
      item.term = term; item.evidence = term;
      $(`#hs-ai-term-${index}`).textContent = `${term} — ${Number(index) + 1} of ${state.suggestions.length}`;
    }
    if (el.dataset.spoken !== undefined) item.spoken = el.value;
    if (el.dataset.case !== undefined) item.ignoreCase = el.value;
    if (el.dataset.replace !== undefined) item.replaceExisting = el.checked;
    if (el.dataset.exactText !== undefined) item.exactTextConfirmed = el.checked;
    item.decision = "pending";
    const kind = proposalKind(candidate(item), getRows());
    $(`[data-existing="${index}"]`).hidden = kind !== "update";
    $(`[data-action="approve"][data-index="${index}"]`).disabled = kind === "covered";
    state.suggestions.forEach((_, at) => warnings(at)); progress(); persist();
  }
  on($("#hs-ai-results"), "input", update); on($("#hs-ai-results"), "change", update);
  on($("#hs-ai-results"), "click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button || saving || analyzing) return;
    const index = Number(button.dataset.index), item = state.suggestions[index], action = button.dataset.action;
    if (action === "skip" || action === "later") { item.decision = action === "skip" ? "skipped" : "later"; status(`${item.term}: ${decisions[item.decision]}.`); nextPending(index); return; }
    if (action === "original") { speak(reviewSpeech(item.evidence).spoken); return; }
    if (action === "reuse-power") {
      if (sourceChanged()) return status("Restore the analyzed passage or analyze the new text before changing this suggestion.");
      const reusable = reusableScientificReading(item); if (!reusable) return;
      const duplicate = state.suggestions.findIndex((other, at) => at !== index && other.term === reusable.term);
      if (duplicate >= 0) { state.cursor = duplicate; render(); persist(); focusCurrent(); return status("That reusable entry is already in this review. Review it once for the class."); }
      state.suggestions[index] = prepareAiReviewItem({ ...item, ...reusable, action: "dictionary", review_kind: "pronunciation", pronunciationWarning: "", reason: "Reusable scientific-notation phrase. Covers different coefficients with this exponent and exact spelling; verify matching in JAWS on the original document." }, getRows(), state.suggestAlternatives);
      state.cursor = index; render(); persist(); $(`[data-spoken="${index}"]`)?.focus();
      status("Switched to a reusable scientific-notation entry. Edit, listen, approve and save once for the class. Other exponent values and formatting are not covered.");
      return;
    }
    if (action === "default") { speak(reviewSpeech(item.term).spoken || item.term); return; }
    if (action === "structural-reading") { if (item.spoken && !spokenWordingIssue(item.spoken)) speak(item.spoken); return; }
    if (action === "fix") {
      const fix = conflictFixes.get(index)?.[Number(button.dataset.fix)];
      if (!fix) return;
      if (fix.skip) { item.decision = "skipped"; status(`${item.term}: skipped.`); nextPending(index); return; }
      if (fix.spoken) { item.spoken = fix.spoken; const input = $(`[data-spoken="${index}"]`); if (input) input.value = fix.spoken; }
      if (fix.ignoreCase) { item.ignoreCase = fix.ignoreCase; const select = $(`[data-case="${index}"]`); if (select) select.value = fix.ignoreCase; }
      item.decision = "pending";
      state.suggestions.forEach((_, at) => warnings(at)); progress(); persist();
      status(`${item.term} updated. Listen, then approve.`);
      $(`[data-spoken="${index}"]`)?.focus();
      return;
    }
    if (!canEditAiPronunciation(item)) return;
    if (!wordingValid(item)) return;
    if (action === "approve") {
      if (sourceChanged()) return status("Passage changed. Restore the analyzed passage or analyze the new text before approving.");
      if (requiresExactTextApproval(item) && !item.exactTextConfirmed) return status("Choose Add a class dictionary entry for this exact expression before approving. This saves only the expression shown, not a general exponent rule.");
      if (proposalKind(candidate(item), getRows()) === "covered") return;
      if (proposalKind(candidate(item), getRows()) === "update" && !item.replaceExisting) { status("Choose Replace the existing pronunciation before approving this update."); return; }
      item.decision = "approved"; status(`${item.term} approved, not saved yet.`); nextPending(index); return;
    }
    if (action === "term") speak(item.spoken);
    if (action === "revised") speak(reviewSpeech(item.evidence, { revised: true, preview: { pattern: item.term, substitution: item.spoken, ignore_case: item.ignoreCase } }).spoken);
  });
  on($("#hs-ai-source"), "input", () => {
    if (state.source !== $("#hs-ai-source").value) state.sentence = 0;
    state.source = $("#hs-ai-source").value;
    if (state.suggestions.length) status(sourceChanged() ? "Passage changed. Your review is preserved; restore the analyzed passage or analyze the new text before saving." : "Analyzed passage restored.");
    progress();
    persist();
  });
  if (unified) on($("#hs-ai-source"), "paste", event => {
    if (event.defaultPrevented || event.clipboardData?.getData("text/plain")) return;
    const html = event.clipboardData?.getData("text/html"); if (!html) return;
    event.preventDefault(); const input = $("#hs-ai-source"), text = plainTextFromClipboardHtml(html);
    if (input.value.length - (input.selectionEnd - input.selectionStart) + text.length > AI_TEXT_LIMIT) return status(`This paste exceeds ${textLimitLabel} characters. The current content is kept.`);
    if (typeof input.setRangeText === "function") input.setRangeText(text, input.selectionStart, input.selectionEnd, "end");
    else input.value += text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  on($("#hs-ai-revert-source"), "click", () => { state.source = state.analyzedSource; render(); persist(); status("Analyzed passage restored. Your review decisions are preserved."); });
  on($("#hs-ai-use-lab"), "click", () => {
    if (saving || analyzing) return;
    const text = onUseLabPassage?.() || "";
    if (!text.trim()) return status("There is no passage in Lab yet. Pull text from a page or paste a passage in Lab first.");
    if (text.length > AI_TEXT_LIMIT) return status(`The Lab passage exceeds ${textLimitLabel} characters. The current content is kept.`);
    if (state.source && state.source !== text && !window.confirm("Replace this AI review with the passage from Lab? Saved dictionary terms are kept.")) return;
    if (state.source !== text) state = { ...blank(), source: text };
    render(); persist(); status("Passage copied from Lab. Select Analyze text with ASU to continue.");
  });
  on($("#hs-ai-view"), "change", () => { state.view = $("#hs-ai-view").value; render(); persist(); });
  if (unified) on($("#hs-ai-view-toggle"), "click", () => { state.view = state.view === "list" ? "focus" : "list"; render(); persist(); });
  on($("#hs-ai-jump"), "change", () => { state.cursor = Number($("#hs-ai-jump").value); render(); persist(); focusCurrent(); });
  on($("#hs-ai-previous"), "click", () => move(-1)); on($("#hs-ai-next"), "click", () => move(1));
  on($("#hs-ai-stop"), "click", cancelSpeech);
  on($("#hs-ai-clear"), "click", () => {
    if (!window.confirm(unified ? "Clear the text and its suggestions? Entries already saved to the class dictionary are kept." : "Clear this class's passage, suggestions and review decisions from this browser? Saved dictionary terms are kept.")) return;
    cancelSpeech(); documentImport.clear(); state = blank(); persist(); render(); status("Review cleared."); $("#hs-ai-source").focus();
  });
  on($("#hs-ai-cancel"), "click", () => controller?.abort());
  on($("#hs-ai-alternatives"), "change", () => { state.suggestAlternatives = $("#hs-ai-alternatives").checked; persist(); status("This choice applies to the next analysis. Saved readings are preserved by default."); });
  // selection: highlighted text inside source. Only it is sent; its suggestions
  // are added to the current queue instead of replacing it.
  async function analyzeSource(source = $("#hs-ai-source").value, metadata = null, selection = null) {
    if (analyzing || saving || !helperAvailable) return;
    if (!source.trim() || source.length > AI_TEXT_LIMIT) return status(`Enter text of 1–${textLimitLabel} characters.`);
    const sent = selection?.trim() ? selection : source;
    if (!selection && state.suggestions.some(item => !unified || item.origin !== "manual") && !window.confirm(unified ? "Replace the AI suggestions and their decisions? Manual review terms and saved dictionary entries are kept." : "Replace this analysis and its review decisions? Saved dictionary terms are kept.")) return;
    const requestGeneration = ++generation;
    let focusResults = false;
    controller = new AbortController(); analyzing = true;
    const base = cleanHistoryRows(getSavedRows()), manual = unified ? state.suggestions.filter(item => selection || item.origin === "manual").map(item => ({ ...item, decision: JSON.stringify(base) === JSON.stringify(state.base) ? item.decision : "pending" })) : [];
    state.source = source;
    if (metadata) { state.sentence = 0; state.sourceDetails = `From ${metadata.kind} file`; }
    render(); persist(); status(selection ? `Getting AI suggestions for the highlighted text (${sent.length.toLocaleString()} characters)…` : `Analyzing all ${source.length.toLocaleString()} characters with ASU in one request…`);
    try {
      const response = await fetch(helperUrl("/api/createai/analyze", extension), { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sent, existingRows: existingPronunciationsForPassage(base, sent), suggestAlternatives: unified ? false : state.suggestAlternatives }) });
      const result = await response.json();
      if (destroyed || requestGeneration !== generation) return;
      if (!response.ok) throw new Error(result.error || "Analysis failed. Your review is preserved.");
      // Evidence is checked against the full text: a quote may run past the highlight's edge.
      const checked = validateAiSuggestions(result, source);
      // In the workspace, a term already in the class dictionary was approved
      // before: it is not offered again (open it manually to change it).
      const saved = unified ? new Set(base.map(row => row.text)) : new Set();
      const alreadySaved = checked.suggestions.filter(item => saved.has(item.term)).length;
      const proposals = checked.suggestions.filter(item => !saved.has(item.term) && !manual.some(other => other.term === item.term)).map(item => prepareAiReviewItem(item, base, unified ? false : state.suggestAlternatives));
      if (manual.length + proposals.length > REVIEW_ITEM_LIMIT) throw new Error(`This result would exceed the ${REVIEW_ITEM_LIMIT}-item review queue. Your previous review is kept. Save and clear manual terms before retrying.`);
      state.analyzedSource = source;
      state.base = base;
      state.suggestions = [...manual, ...proposals];
      const first = selection ? (proposals.length ? manual.length : state.cursor) : state.suggestions.findIndex(item => label(item) !== "Already covered");
      state.cursor = first >= 0 ? first : 0;
      const discarded = Number(result.discarded || 0) + checked.discarded, reasons = { ...result.discardedReasons };
      for (const [reason, count] of Object.entries(checked.discardedReasons)) reasons[reason] = (reasons[reason] || 0) + count;
      const labels = ["invalid fields", "missing or invalid wording", "source excerpt did not match", "term did not match its excerpt", "unchanged replacement", "duplicate term"];
      const repaired = Number(result.repairedExcerpts || 0) + checked.repairedExcerpts;
      state.diagnostics = `${discarded} rejected. ` + labels.filter(label => Number(reasons[label]) > 0).map(label => `${label}: ${Number(reasons[label])}`).join("; ") +
        (repaired ? ` ${repaired} source excerpts matched after removing quotation wrappers or restoring source whitespace.` : "");
      const suggestionLimitReached = result.suggestionLimitReached === true || result.suggestions.length === AI_SUGGESTION_LIMIT;
      if (suggestionLimitReached) state.diagnostics += ` ASU reached the ${AI_SUGGESTION_LIMIT}-suggestion response limit. The full text was submitted, but additional candidates may be missing.`;
      state.diagnostics += selection ? ` ${sent.length.toLocaleString()} highlighted characters submitted.` : ` ${source.length.toLocaleString()} source characters submitted in one request; no text sections omitted.`;
      if (alreadySaved) state.diagnostics += ` ${alreadySaved} already in the class dictionary and not shown again.`;
      if (Number.isInteger(result.referenceExamplesUsed)) {
        const documents = Array.isArray(result.referenceDocuments) ? result.referenceDocuments.filter(name => typeof name === "string").slice(0, 4) : [];
        state.diagnostics += ` ${result.referenceExamplesUsed} scanning examples consulted${documents.length ? ` from ${documents.join("; ")}` : ""}. These demonstrate review patterns, not dictionary entries to inherit.`;
      }
      render(); persist();
      const existingCount = existingPronunciationsForPassage(base, source).length;
      status(!proposals.length && !alreadySaved && discarded ? `ASU returned ${discarded} suggestions, but none passed validation. This is an inconclusive analysis. See Analysis details and try again or use a shorter section.`
        : unified ? (proposals.length
          ? `${proposals.length} new suggestion${proposals.length === 1 ? "" : "s"}${selection ? " from the highlighted text" : ""}.${alreadySaved ? ` ${alreadySaved} already in your class dictionary (skipped).` : ""}${suggestionLimitReached ? " The AI reached its suggestion limit; some terms may be missing." : ""}`
          : alreadySaved
            ? `No new suggestions for ${selection ? "the highlighted text" : "this text"}: ${alreadySaved === 1 ? "the term it found is" : `all ${alreadySaved} terms it found are`} already in your class dictionary.`
            : `No suggestions for ${selection ? "the highlighted text" : "this text"}. Nothing in it looks like it needs a class dictionary entry.`)
        : `${state.suggestions.length} suggestions ready.${existingCount && !state.suggestAlternatives ? ` ${existingCount} matching class readings kept.` : ""} Review, approve, then save together. Analysis can miss terms.${suggestionLimitReached ? " ASU reached the suggestion limit; see Analysis details." : ""}`);
      if (!unified) $("#hs-ai-source-panel").open = !state.suggestions.length;
      focusResults = proposals.length > 0 || (!selection && state.suggestions.length > 0);
    } catch (error) {
      if (!destroyed && requestGeneration === generation) status(error.name === "AbortError" ? "Stopped waiting. ASU may still finish the submitted request. Your previous review is preserved." : error.message);
    } finally { if (!destroyed && requestGeneration === generation) { analyzing = false; render(); persist(); if (focusResults) focusCurrent(); } }
  }
  on($("#hs-ai-analyze"), "click", () => { void analyzeSource(undefined, null, unified ? contentTools?.selection()?.text ?? null : null); });
  on($("#hs-ai-save"), "click", async () => {
    if (saving || analyzing || sourceChanged() || !canSave()) return;
    const selected = approvedItems();
    if (!selected.length || selected.some(item => !wordingValid(item))) return;
    const requestScope = scope; saving = true; render(); status("Saving approved terms…");
    try {
      const success = await onSave(approved(), state.base);
      if (destroyed || scope !== requestScope) return;
      if (!success) { status("Not saved. Your approvals and edits are preserved. Check the dictionary message above and retry."); return; }
      selected.forEach(item => item.decision = "saved"); state.base = cleanHistoryRows(getRows());
      status(`Saved ${selected.length} pronunciations to ${getCourseLabel()}. Undo last dictionary change is available above.`); persist();
    } catch (error) { status(`Not saved: ${error.message}. Your review is preserved.`); }
    finally { if (!destroyed && scope === requestScope) { saving = false; render(); (approved().length ? $("#hs-ai-save") : $("#hs-ai-lab")).focus(); } }
  });
  on($("#hs-ai-lab"), "click", () => {
    if (sourceChanged()) return status("Restore the analyzed passage or analyze the new text before opening Lab.");
    if (approved().length) return status("Save approved terms before opening Lab, or change their decisions to Review later.");
    onOpenLab(state.source);
  });
  on($("#hs-ai-refresh"), "click", async () => {
    if (saving || analyzing || !canSave()) return;
    const requestScope = scope;
    saving = true; render();
    try {
      const latest = await onRefresh();
      if (destroyed || scope !== requestScope) return;
      state.base = cleanHistoryRows(latest);
      state.suggestions.forEach(item => { if (item.decision === "approved" || item.decision === "saved") { item.decision = "pending"; item.replaceExisting = false; } });
      persist(); status("Class checks refreshed. Your wording is preserved; review and approve proposed changes against the latest dictionary.");
    } catch (error) { status(error.message); }
    finally { if (!destroyed && scope === requestScope) { saving = false; render(); } }
  });
  function scopeChanged() {
    if (destroyed) return;
    const next = getCourse();
    if (next === scope) {
      if (!saving && !analyzing && JSON.stringify(cleanHistoryRows(getRows())) !== lastRows) {
        state.suggestions.forEach(item => { if (item.decision === "saved" && proposalKind(candidate(item), getRows()) !== "covered") item.decision = "pending"; });
        render(); persist();
      } else progress();
      return;
    }
    persist(); controller?.abort(); generation++; analyzing = false; saving = false;
    cancelSpeech(); documentImport.clear(); scope = next; restore(); migrateLegacySource(); render(); contentTools?.refreshRecovery(); status("Opened this class's local review draft.");
  }
  function addManualTerm(term, spoken = "", note = "", ignoreCase) {
    if (saving || analyzing) return false;
    term = String(term).trim();
    if (!term || term.length > 160) { status("Enter a word or phrase of up to 160 characters."); return false; }
    const existing = state.suggestions.findIndex(item => item.term === term);
    if (existing >= 0) { state.cursor = existing; render(); focusCurrent(); return true; }
    if (state.suggestions.length >= REVIEW_ITEM_LIMIT) { status(`Finish or clear this ${REVIEW_ITEM_LIMIT}-item review before adding another term.`); return false; }
    const parts = splitReviewPassages(state.source), current = parts[state.sentence];
    const evidence = current?.text.includes(term) && current.text.length <= 2000 ? current.text : parts.find(part => part.text.includes(term) && part.text.length <= 2000)?.text || term;
    const checked = validateAiSuggestions({ suggestions: [{ term, spoken: spoken || "Review pronunciation", evidence, reason: note || "Manual pronunciation review.", action: "review", review_kind: "pronunciation", origin: "manual" }] }, evidence).suggestions[0];
    if (!checked) { status("This written phrase could not be added. Use a single term without tabs or line breaks."); return false; }
    if (!state.suggestions.length) { state.base = cleanHistoryRows(getSavedRows()); state.analyzedSource = state.source; }
    const item = prepareAiReviewItem({ ...checked, origin: "manual", note }, unified ? getSavedRows() : getRows(), false);
    if (spoken) item.spoken = spoken; // An instructor's recovered draft takes precedence over a saved default.
    if (["Yes", "No"].includes(ignoreCase)) item.ignoreCase = ignoreCase;
    // Never show the validation placeholder as if it were a proposed reading.
    if (!spoken && (item.spoken === "Review pronunciation" || !getRows().some(row => row.text === term))) item.spoken = "";
    state.suggestions.push(item); state.cursor = state.suggestions.length - 1;
    render(); persist(); $(`[data-spoken="${state.cursor}"]`)?.focus(); status(`Added ${term}. Type how it should be read, listen, then approve.`); return true;
  }
  function migrateLegacySource() {
    if (!unified || state.source || state.suggestions.length) return;
    const legacy = loadReviewSession(storage(), getLegacyScope());
    if (legacy.courseId === getCourseId() && legacy.passage && legacy.passage.length <= AI_TEXT_LIMIT) {
      state.source = legacy.passage; state.sentence = legacy.sentence || 0; state.mode = legacy.mode || "focus";
      state.sourceDetails = "Recovered from previous Lab work. Previous drafts and review queue are available below.";
    }
  }
  restore(); migrateLegacySource();
  if (unified) contentTools = mountContentReviewTools($("#hs-content-tools"), {
    listenHost: $("#hs-content-listen"), cellsHost: $("#hs-content-cells"), captureHost: $("#hs-content-capture"),
    // The AI button says whether it will send the highlight or all the text.
    onSelectionChange: text => { $("#hs-ai-analyze").textContent = text.trim() ? "Get AI suggestions for highlighted text" : "Get AI suggestions"; },
    extension, sourceInput: $("#hs-ai-source"), getState: () => state, changed() { persist(); onReviewChanged(); }, addTerm: addManualTerm,
    getPreview: () => { const item = state.suggestions[state.cursor]; return item?.spoken && canEditAiPronunciation(item) && !spokenWordingIssue(item.spoken) ? { pattern: item.term, substitution: item.spoken, ignore_case: item.ignoreCase } : null; },
    status, isBusy: () => saving || analyzing, getLegacyScope, getCourseId,
  });
  render(); contentTools?.refreshRecovery();
  async function checkHelper() {
    try {
      const response = await fetch(helperUrl("/api/createai/status", extension), { method: "POST", signal: AbortSignal.timeout(2500) });
      const result = response.ok ? await response.json() : null;
      if (destroyed) return;
      helperAvailable = Boolean(result?.available);
      if (helperAvailable) container.hidden = false;
      if (extension || unified) $("#hs-ai-helper-status").textContent = helperAvailable ? "Local AI helper connected." : extension && response.status === 403 ? "Extension not authorized. Check allowedExtensionIds in the local helper configuration. Manual review and speech preview remain available." : "AI helper unavailable. Manual review and speech preview remain available. Start the local helper and check the connection.";
    } catch {
      if (!destroyed) { helperAvailable = false; if (extension || unified) $("#hs-ai-helper-status").textContent = "AI helper unavailable. You can still review manually, listen, and maintain your dictionary."; }
    }
    if (!destroyed) {
      if (extension || unified) {
        $("#hs-ai-helper-setup").open = !helperAvailable;
        $("#hs-ai-helper-setup summary").textContent = helperAvailable ? "Local AI helper connected" : "Local AI helper setup";
      }
      render();
    }
  }
  if (extension || unified) { container.hidden = false; on($("#hs-ai-reconnect"), "click", () => void checkHelper()); }
  if (extension || unified || ["localhost", "127.0.0.1"].includes(globalThis.location?.hostname)) void checkHelper();
  on(window, "pagehide", persist);
  return { scopeChanged, addManualTerm, focusManual: () => contentTools?.focusManual(),
    getPlan: () => ({ approved: approved(), baseline: state.base, sourceChanged: sourceChanged(), pending: state.suggestions.filter(item => item.decision === "pending" && !alreadyIncluded(item)).length, busy: analyzing || saving }),
    setSaving(value) { if (destroyed) return; saving = value; render(); },
    markSaved() { if (destroyed) return; approvedItems().forEach(item => item.decision = "saved"); state.base = cleanHistoryRows(getSavedRows()); render(); persist(); },
    rebase(rows) { if (destroyed) return; state.base = cleanHistoryRows(rows); state.suggestions.forEach(item => { if (["approved", "saved"].includes(item.decision)) { item.decision = "pending"; item.replaceExisting = false; } }); render(); persist(); },
    discardApprovals() { if (destroyed) return; state.suggestions.forEach(item => { if (item.decision === "approved") item.decision = "pending"; }); render(); persist(); },
    destroy() { persist(); destroyed = true; generation++; controller?.abort(); contentTools?.destroy(); exponentPaste.destroy(); documentImport.destroy(); listeners.forEach(remove => remove()); } };
}

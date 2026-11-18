import { mountThemeToggle, initTheme } from "./theme.js";

// One live editor instance serves both views. Switching views never remounts
// the passage, document importer, pending decisions or dictionary draft.
//
// Layout: a compact header (class + Settings), view tabs with the student
// export beside them, and a save bar that appears only when changes are staged
// or were just saved. Settings open as a panel over the page, not inline.
export function arrangeWorkspace(root, { extension = false, initialView = "review", onAddTerm, onDiscard } = {}) {
  const main = root.querySelector("main"); main.classList.add("hs-workspace");
  const oldHeader = main.querySelector("header");
  const classCard = main.querySelector('[aria-label="Class, add terms, and import"]');
  const connection = main.querySelector(".hs-dict-editor-connect");
  const assistant = main.querySelector("#hs-ai-assistant");
  const table = main.querySelector(".hs-dict-editor-terms");
  const downloads = main.querySelector(".hs-dict-editor-download");
  const course = root.querySelector("#hs-dict-ed-class").closest("label");
  course.querySelector(".hs-dict-editor-label").textContent = "Class";
  const save = root.querySelector("#hs-dict-ed-save"), undo = root.querySelector("#hs-dict-ed-undo");
  const note = root.querySelector("#hs-dict-ed-connect-note"), status = root.querySelector("#hs-dict-ed-status"), error = root.querySelector("#hs-dict-ed-error");
  oldHeader.innerHTML = `${extension
      ? '<div class="hs-workspace-title"><h1 class="ss-title">HearSay</h1><span class="hs-workspace-theme"></span></div>'
      : '<h1 class="hs-visually-hidden">HearSay</h1>'}
    <div class="hs-workspace-toolbar"><div data-slot="course"></div><button type="button" class="ss-btn hs-icon-btn" id="hs-workspace-settings-toggle" aria-expanded="false" aria-controls="hs-workspace-settings" aria-label="Settings" title="Settings"><span aria-hidden="true">⚙</span></button></div>
    <div data-slot="connection"></div>
    <div data-slot="status"></div>`;
  oldHeader.querySelector('[data-slot="course"]').append(course);
  oldHeader.querySelector('[data-slot="connection"]').append(note);
  oldHeader.querySelector('[data-slot="status"]').append(status, error);

  // Save bar: hidden until there is something to save, an error, or a fresh save to undo.
  const bar = document.createElement("div"); bar.id = "hs-workspace-savebar"; bar.className = "hs-workspace-savebar"; bar.hidden = true;
  bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Unsaved dictionary changes");
  bar.innerHTML = `<div class="hs-workspace-savebar-inner">
      <div class="hs-workspace-savebar-text"><p id="hs-workspace-summary" class="ss-type" role="status" aria-live="polite"></p>
        <details id="hs-workspace-change-list"><summary>See changes</summary><ul></ul></details></div>
      <div class="hs-workspace-savebar-actions" data-slot="save"></div>
    </div>`;
  const discard = document.createElement("button"); discard.id = "hs-workspace-discard"; discard.type = "button"; discard.className = "ss-btn"; discard.textContent = "Discard";
  const undoSaved = document.createElement("button"); undoSaved.id = "hs-workspace-undo-saved"; undoSaved.type = "button"; undoSaved.className = "ss-btn"; undoSaved.textContent = "Undo";
  const dismiss = document.createElement("button"); dismiss.id = "hs-workspace-savebar-close"; dismiss.type = "button"; dismiss.className = "ss-btn"; dismiss.textContent = "Close"; dismiss.setAttribute("aria-label", "Close save message");
  bar.querySelector('[data-slot="save"]').append(discard, undoSaved, dismiss);
  save.classList.add("primary");
  save.textContent = "Save changes to class dictionary";

  const settings = document.createElement("section"); settings.id = "hs-workspace-settings"; settings.hidden = true;
  settings.setAttribute("aria-labelledby", "hs-workspace-settings-h"); settings.className = "hs-workspace-settings";
  settings.innerHTML = `<div class="hs-workspace-settings-head"><h2 id="hs-workspace-settings-h" class="hs-dict-editor-card-title">Settings</h2><button type="button" class="ss-btn" id="hs-workspace-settings-close">Close</button></div>`;
  settings.append(connection, classCard);
  classCard.querySelector("#hs-dict-ed-pull").textContent = "Refresh class checks, keep drafts";
  classCard.querySelector("h2").textContent = "Manage classes";
  // The single review editor handles new terms; keep legacy form nodes mounted
  // only to recover older browser drafts through their existing storage path.
  const legacyForm = classCard.querySelector(".hs-dict-editor-class-workspace");
  const csv = legacyForm.querySelector(".hs-dict-editor-import-group");
  legacyForm.hidden = true;

  const tabRow = document.createElement("div"); tabRow.className = "hs-workspace-tabrow";
  const tabs = document.createElement("div"); tabs.className = "hs-workspace-tabs"; tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Class workspace");
  tabs.innerHTML = `<button id="hs-workspace-review-tab" class="ss-btn" type="button" role="tab" aria-controls="hs-workspace-review">Review content</button><button id="hs-workspace-dictionary-tab" class="ss-btn" type="button" role="tab" aria-controls="hs-workspace-dictionary">Class dictionary</button>`;
  // "Export dictionary" opens a side panel with the JAWS download for students.
  const prepareButton = document.createElement("button"); prepareButton.type = "button"; prepareButton.className = "ss-btn"; prepareButton.id = "hs-workspace-prepare"; prepareButton.textContent = "Export dictionary";
  prepareButton.setAttribute("aria-expanded", "false"); prepareButton.setAttribute("aria-controls", "hs-workspace-preparation");
  tabRow.append(tabs);
  // One row: tabs on the left, class picker and Settings on the right. The
  // connection note and status share one small line under it.
  const toolbar = oldHeader.querySelector(".hs-workspace-toolbar"); tabRow.append(toolbar);
  // Save is always visible in the top row, before Settings.
  toolbar.querySelector("#hs-workspace-settings-toggle").before(save, prepareButton);
  // The connection note sits beside the class picker, before Settings.
  toolbar.querySelector('[data-slot="course"]').after(oldHeader.querySelector('[data-slot="connection"]'));
  const notes = document.createElement("div"); notes.className = "hs-workspace-notes";
  notes.append(oldHeader.querySelector('[data-slot="status"]'));
  const review = document.createElement("section"); review.id = "hs-workspace-review"; review.setAttribute("role", "tabpanel"); review.setAttribute("aria-labelledby", "hs-workspace-review-tab"); review.append(assistant); assistant.hidden = false;
  const dictionary = document.createElement("section"); dictionary.id = "hs-workspace-dictionary"; dictionary.setAttribute("role", "tabpanel"); dictionary.setAttribute("aria-labelledby", "hs-workspace-dictionary-tab");
  const add = document.createElement("button"); add.type = "button"; add.className = "ss-btn primary"; add.id = "hs-workspace-add-term"; add.textContent = "Add a term";
  const dictionaryTools = document.createElement("div"); dictionaryTools.className = "hs-workspace-dictionary-tools";
  dictionaryTools.append(add, undo); // CSV import is not offered in the workspace
  dictionary.append(dictionaryTools, table);
  const preparation = document.createElement("section"); preparation.id = "hs-workspace-preparation"; preparation.className = "hs-workspace-settings hs-workspace-export"; preparation.hidden = true;
  preparation.setAttribute("aria-labelledby", "hs-workspace-export-h");
  preparation.innerHTML = `<div class="hs-workspace-settings-head"><h2 id="hs-workspace-export-h" class="hs-dict-editor-card-title">Export dictionary</h2><button type="button" class="ss-btn" id="hs-workspace-export-close">Close</button></div><p class="ss-sub" id="hs-workspace-export-state"></p>`;
  downloads.querySelector("h2")?.setAttribute("hidden", ""); // the panel already has the title
  preparation.append(downloads);
  main.append(settings, preparation, tabRow, notes, review, dictionary, bar);

  const settingsButton = root.querySelector("#hs-workspace-settings-toggle");
  const settingsClose = settings.querySelector("#hs-workspace-settings-close");
  function setSettings(open) {
    settings.hidden = !open; settingsButton.setAttribute("aria-expanded", String(open));
    if (open) { const heading = settings.querySelector("h2"); heading.setAttribute("tabindex", "-1"); heading.focus?.(); }
    else settingsButton.focus?.();
  }
  const toggleSettings = () => setSettings(settings.hidden);
  const closeSettings = () => setSettings(false);
  const onSettingsKey = event => { if (event.key === "Escape" && !settings.hidden) { event.preventDefault(); setSettings(false); } };
  settingsButton.addEventListener("click", toggleSettings);
  settingsClose.addEventListener("click", closeSettings);
  settings.addEventListener("keydown", onSettingsKey);

  let current = initialView === "dictionary" ? "dictionary" : "review";
  const positions = { review: 0, dictionary: 0 };
  const key = "hearsay-workspace-view";
  function showView(view, { focus = false } = {}) {
    if (!["review", "dictionary"].includes(view)) return;
    positions[current] = window.scrollY || 0; current = view;
    review.hidden = view !== "review"; dictionary.hidden = view !== "dictionary";
    for (const name of ["review", "dictionary"]) {
      const button = root.querySelector(`#hs-workspace-${name}-tab`);
      button.setAttribute("aria-selected", String(name === view)); button.tabIndex = name === view ? 0 : -1;
    }
    try { localStorage.setItem(key, view); } catch {}
    if (!extension && window.history?.replaceState && window.location?.href) {
      const url = new URL(window.location.href); url.hash = view; window.history.replaceState(null, "", url);
    }
    window.scrollTo(0, positions[view]);
    if (focus) root.querySelector(`#hs-workspace-${view}-tab`).focus();
  }
  const onTabs = event => { const button = event.target.closest("[role=tab]"); if (button) showView(button.id.includes("dictionary") ? "dictionary" : "review"); };
  const onKeys = event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); showView(event.key === "Home" ? "review" : event.key === "End" ? "dictionary" : current === "review" ? "dictionary" : "review", { focus: true }); };
  tabs.addEventListener("click", onTabs); tabs.addEventListener("keydown", onKeys);
  const onHash = () => { const view = window.location?.hash?.slice(1); if (["review", "dictionary"].includes(view) && view !== current) showView(view); };
  if (!extension) window.addEventListener("hashchange", onHash);
  // One side panel at a time: opening Export closes Settings and vice versa.
  function setExport(open) {
    preparation.hidden = !open; prepareButton.setAttribute("aria-expanded", String(open));
    if (open) { if (!settings.hidden) setSettings(false); const heading = preparation.querySelector("h2"); heading.setAttribute("tabindex", "-1"); heading.focus?.(); }
    else prepareButton.focus?.();
  }
  const prepare = () => setExport(preparation.hidden);
  const closeExport = () => setExport(false);
  const onExportKey = event => { if (event.key === "Escape" && !preparation.hidden) { event.preventDefault(); setExport(false); } };
  prepareButton.addEventListener("click", prepare);
  preparation.querySelector("#hs-workspace-export-close").addEventListener("click", closeExport);
  preparation.addEventListener("keydown", onExportKey);
  settingsButton.addEventListener("click", () => { if (!preparation.hidden) { preparation.hidden = true; prepareButton.setAttribute("aria-expanded", "false"); } });
  const addTerm = () => { showView("review"); onAddTerm?.(); };
  add.addEventListener("click", addTerm);

  // "Just saved" lasts until the next change, a discard, or Close.
  let previousTotal = 0, justSaved = false, discarding = false;
  const onDiscardClick = () => { discarding = true; onDiscard?.(); };
  const onUndoSaved = () => { if (!undo.disabled) undo.click(); };
  const onDismiss = () => { justSaved = false; bar.hidden = true; main.classList.remove("has-savebar"); };
  const onUndo = () => { justSaved = false; };
  discard.addEventListener("click", onDiscardClick); undoSaved.addEventListener("click", onUndoSaved); dismiss.addEventListener("click", onDismiss);
  undo.addEventListener("click", onUndo, true);
  if (extension) { initTheme(); mountThemeToggle(oldHeader.querySelector(".hs-workspace-theme")); }
  showView(current);
  return { showView, getView: () => current,
    summary({ additions = [], replacements = [], removals = [], busy = false, editable = false, error: issue = "", classLabel = "", count = 0, plannedRows = [] }) {
      const total = additions.length + replacements.length + removals.length;
      if (total) { justSaved = false; discarding = false; }
      else if (previousTotal && !issue) { justSaved = false; discarding = false; } // no "Changes saved" bar after saving
      previousTotal = total;
      const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
      const parts = [[additions.length, "addition"], [replacements.length, "replacement"], [removals.length, "removal"]].filter(([n]) => n).map(([n, word]) => plural(n, word));
      const summary = issue || (total ? `Not saved yet: ${parts.join(", ")}` : justSaved ? `Changes saved to ${classLabel}.` : "");
      if (root.querySelector("#hs-workspace-summary").textContent !== summary) root.querySelector("#hs-workspace-summary").textContent = summary;
      const list = root.querySelector("#hs-workspace-change-list"); list.hidden = !total;
      list.querySelector("ul").replaceChildren(...[["Add", additions], ["Replace", replacements], ["Remove", removals]].flatMap(([verb, terms]) => terms.map(term => { const item = document.createElement("li"), row = plannedRows.find(entry => entry.text === term); item.textContent = `${verb} ${term}${verb !== "Remove" && row ? ` → ${row.substitution}` : ""}`; return item; })));
      save.disabled = busy || !editable || !total;
      save.textContent = busy ? "Saving…" : total ? `Save (${total})` : "Saved";
      save.title = !editable ? "Choose your class (not the demo) to save" : total ? `Save ${total} change${total === 1 ? "" : "s"} to the ${classLabel} class dictionary` : "Everything is saved";
      save.setAttribute("aria-label", total ? `Save ${total} change${total === 1 ? "" : "s"} to the class dictionary` : "Class dictionary saved");
      discard.disabled = busy || !total; discard.hidden = !total;
      undoSaved.hidden = !justSaved || total > 0; undoSaved.disabled = busy || undo.disabled;
      dismiss.hidden = total > 0 || Boolean(issue);
      const show = Boolean(total || issue || justSaved);
      bar.hidden = !show; main.classList.toggle("has-savebar", show);
      settingsButton.disabled = busy;
      prepareButton.disabled = busy;
      root.querySelector("#hs-dict-ed-class").disabled = busy;
      root.querySelector("#hs-workspace-export-state").textContent = `${classLabel} · ${count} saved entries.${total ? " Save or discard your changes before exporting." : ""}`;
      const exportButton = root.querySelector("#hs-dict-ed-export-jaws"); exportButton.disabled = busy || Boolean(total);
      const sbakButton = root.querySelector("#hs-dict-ed-export-sbak"); if (sbakButton) sbakButton.disabled = busy || Boolean(total);
    },
    destroy() { tabs.removeEventListener("click", onTabs); tabs.removeEventListener("keydown", onKeys); settingsButton.removeEventListener("click", toggleSettings); settingsClose.removeEventListener("click", closeSettings); settings.removeEventListener("keydown", onSettingsKey); prepareButton.removeEventListener("click", prepare); add.removeEventListener("click", addTerm); discard.removeEventListener("click", onDiscardClick); undoSaved.removeEventListener("click", onUndoSaved); dismiss.removeEventListener("click", onDismiss); undo.removeEventListener("click", onUndo, true); window.removeEventListener("hashchange", onHash); },
  };
}

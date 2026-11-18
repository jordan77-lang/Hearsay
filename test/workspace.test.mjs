import test from "node:test";
import assert from "node:assert/strict";
import { setupDom, flush } from "./helpers/review-dom.mjs";
import { mountHearSayWorkspace } from "../src/workspace.js";
import { wordAtOffset } from "../src/content-review-tools.js";
import { cancelSpeech } from "../src/speech.js";
import { reviewSpeech, reviewSpeechWithMap } from "../src/core/review-speech.js";
import { dictionaryHistory } from "../src/dictionary-history.js";
import { combineWorkspaceChanges, rebaseWorkspaceRows } from "../src/core/workspace-changes.js";

const source = "Measure mL of HCl. Test lysozyme.";
const items = [{ term: "mL", spoken: "milliliters", evidence: "Measure mL of HCl.", reason: "Unit.", action: "dictionary" }];
const row = (text, substitution) => ({ text, substitution, ignore_case: "No", app: "All Apps", note: "" });
async function setup({ suggestions = items, rows = [], beforeMount, extension = false } = {}) {
  const env = setupDom({ connected: true }); env.rows.set("chem113", rows.map(item => ({ ...item, class_slug: "chem113" })));
  globalThis.location.hostname = "localhost"; globalThis.location.protocol = extension ? "chrome-extension:" : "http:";
  const backend = globalThis.fetch; env.scans = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/api/createai/status")) return Response.json({ available: true });
    if (String(url).endsWith("/api/createai/analyze")) { env.scans++; return Response.json({ suggestions, discarded: 0 }); }
    return backend(url, options);
  };
  beforeMount?.(env);
  env.mounted = await mountHearSayWorkspace(env.root, { context: extension ? "extension" : "web", initialView: "review" }); await flush();
  env.$ = selector => env.root.querySelector(selector);
  env.edit = (selector, value) => { const field = env.$(selector); field.value = value; field.dispatchEvent(new Event("input", { bubbles: true })); };
  env.manual = (term, reading) => { env.edit("#hs-content-manual", term); env.$("#hs-content-add").click(); const field = [...env.root.querySelectorAll("[data-spoken]")].at(-1); field.value = reading; field.dispatchEvent(new Event("input", { bubbles: true })); };
  return env;
}

test("workspace has one source, class context and save; views preserve DOM, position and keyboard behavior", async () => {
  const env = await setup(); const { $, edit } = env;
  assert.equal(env.root.querySelectorAll("#hs-ai-source").length, 1);
  assert.equal(env.root.querySelectorAll("#hs-dict-ed-class").length, 1);
  assert.equal($("#review-input"), null);
  assert.equal($("#hs-ai-use-lab").hidden, true); assert.equal($("#hs-ai-lab").hidden, true);
  assert.equal($("#hs-site-nav-connect"), null);
  edit("#hs-ai-source", source); $("#hs-content-next").click();
  const input = $("#hs-ai-source"); assert.match($("#hs-content-position").textContent, /Sentence 2/);
  $("#hs-workspace-dictionary-tab").click(); $("#hs-workspace-review-tab").click();
  assert.equal($("#hs-ai-source"), input); assert.equal(input.value, source);
  assert.match($("#hs-content-position").textContent, /Sentence 2/);
  const event = new Event("keydown", { bubbles: true, cancelable: true }); event.key = "ArrowRight";
  $("#hs-workspace-review-tab").dispatchEvent(event);
  assert.equal($("#hs-workspace-dictionary-tab").getAttribute("aria-selected"), "true");
  assert.equal(document.activeElement, $("#hs-workspace-dictionary-tab"));
  env.mounted.destroy();
});

test("manual and AI proposals share editing, one batch save and one Undo", async () => {
  const env = await setup(); const { $, edit } = env;
  edit("#hs-ai-source", source); $("#hs-ai-analyze").click(); await flush();
  $("[data-action=approve][data-index='0']").click();
  env.manual("lysozyme", "lye suh zime"); $("[data-action=approve][data-index='1']").click();
  assert.equal(env.rows.get("chem113").length, 0);
  assert.match($("#hs-workspace-summary").textContent, /2 additions/);
  $("#hs-workspace-prepare").click();
  assert.equal($("#hs-workspace-preparation").open, true);
  assert.equal($("#hs-dict-ed-export-jaws").disabled, true);
  $("#hs-dict-ed-save").click(); await flush();
  assert.equal(env.rows.get("chem113").length, 2);
  assert.equal($("#hs-dict-ed-export-jaws").disabled, false);
  assert.equal(dictionaryHistory(env.storage, "https://test.supabase.co", "chem113").length, 1);
  assert.match($("#hs-ai-progress").textContent, /2 saved/);
  $("#hs-dict-ed-undo").click(); await flush();
  assert.equal(env.rows.get("chem113").length, 0);
  assert.equal($("#hs-ai-source").value, source);
  env.mounted.destroy();
});

test("dictionary edits are staged with review approvals, retained on save failure and saved together", async () => {
  const env = await setup({ rows: [row("HCl", "H C L")] }); const { $, edit } = env;
  $("#hs-workspace-dictionary-tab").click();
  edit("#hs-dict-ed-tbody [data-field=substitution]", "hydrogen chloride");
  $("#hs-dict-ed-tbody [data-field=substitution]").dispatchEvent(new Event("change")); await flush();
  assert.equal(env.rows.get("chem113")[0].substitution, "H C L");
  $("#hs-workspace-review-tab").click();
  env.manual("lysozyme", "lye suh zime"); $("[data-action=approve][data-index='0']").click();
  assert.match($("#hs-workspace-summary").textContent, /1 addition, 1 replacement/);
  env.failWrites(true); $("#hs-dict-ed-save").click(); await flush();
  assert.equal(env.rows.get("chem113").length, 1); assert.match($("#hs-ai-progress").textContent, /1 approved/);
  assert.equal($("#hs-dict-ed-tbody [data-field=substitution]").value, "hydrogen chloride");
  env.failWrites(false); $("#hs-dict-ed-save").click(); await flush();
  assert.equal(env.rows.get("chem113").length, 2);
  assert.equal(env.rows.get("chem113").find(item => item.text === "HCl").substitution, "hydrogen chloride");
  env.mounted.destroy();
});

test("source, decisions and dictionary edits survive reload and stay isolated by class", async () => {
  const env = await setup({ rows: [row("HCl", "H C L")] }); const { $, edit } = env;
  edit("#hs-ai-source", source); env.manual("lysozyme", "lye suh zime"); $("[data-action=approve][data-index='0']").click();
  edit("#hs-dict-ed-tbody [data-field=substitution]", "hydrogen chloride");
  env.mounted.destroy(); env.mounted = await mountHearSayWorkspace(env.root, { initialView: "review" }); await flush();
  assert.equal($("#hs-ai-source").value, source); assert.match($("#hs-ai-progress").textContent, /1 approved/);
  assert.equal($("#hs-dict-ed-tbody [data-field=substitution]").value, "hydrogen chloride");
  $("#hs-dict-ed-class").value = "bio181"; $("#hs-dict-ed-class").dispatchEvent(new Event("change")); await flush();
  assert.equal($("#hs-ai-source").value, "");
  $("#hs-dict-ed-class").value = "chem113"; $("#hs-dict-ed-class").dispatchEvent(new Event("change")); await flush();
  assert.equal($("#hs-ai-source").value, source); assert.match($("#hs-ai-progress").textContent, /1 approved/);
  env.mounted.destroy();
});

test("previous Lab passage and term drafts remain recoverable alongside an existing AI draft", async () => {
  const legacy = { version: 1, courseId: "chem113", passage: "Use lysozyme.", drafts: { chem113: { pattern: "lysozyme", spoken: "lye suh zime" } }, queue: [] };
  const env = await setup({ beforeMount(env) {
    env.storage.setItem("hearsay-review-v1:https://test.supabase.co", JSON.stringify(legacy));
    env.storage.setItem("hearsay-ai-review-v1:https://test.supabase.co:chem113", JSON.stringify({ source, analyzedSource: source, suggestions: [{ ...items[0], decision: "later" }], base: [] }));
  } });
  assert.equal(env.$("#hs-ai-source").value, source);
  assert.equal(env.$("#hs-content-recovery-preview").value, legacy.passage);
  env.$("#hs-content-recovery-terms button").click();
  assert.equal(env.$("[data-spoken='1']").value, "lye suh zime");
  assert.deepEqual(JSON.parse(env.storage.getItem("hearsay-review-v1:https://test.supabase.co")), legacy);
  assert.equal(env.scans, 0);
  env.mounted.destroy();
});

test("older dictionary entry forms migrate into the shared editor with notes and case preference", async () => {
  const env = await setup({ rows: [row("lysozyme", "old saved reading")], beforeMount(env) {
    env.storage.setItem("hearsay-editor-draft:https://test.supabase.co:chem113", JSON.stringify({ rows: null, base: "[]", form: { "new-pattern": "lysozyme", "new-spoken": "lye suh zime", "new-note": "Instructor reading", "new-case": "Yes" } }));
  } });
  assert.equal(env.$("[data-spoken='0']").value, "lye suh zime");
  assert.equal(env.$("[data-case='0']").value, "Yes");
  env.$("[data-replace='0']").checked = true; env.$("[data-replace='0']").dispatchEvent(new Event("change", { bubbles: true }));
  env.$("[data-action=approve][data-index='0']").click(); env.$("#hs-dict-ed-save").click(); await flush();
  assert.equal(env.rows.get("chem113")[0].note, "Instructor reading");
  assert.equal(env.rows.get("chem113")[0].ignore_case, "Yes");
  env.mounted.destroy();
});

test("a save finishing after unmount cannot clear or overwrite a newer reopened table draft", async () => {
  const env = await setup(); env.manual("lysozyme", "lye suh zime"); env.$("[data-action=approve][data-index='0']").click();
  const backend = globalThis.fetch; let release;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/entries") && options?.method === "DELETE" && !release) await new Promise(resolve => { release = resolve; });
    return backend(url, options);
  };
  env.$("#hs-dict-ed-save").click(); await flush(); assert.equal(typeof release, "function");
  env.mounted.destroy(); env.mounted = await mountHearSayWorkspace(env.root, { initialView: "dictionary" }); await flush();
  env.edit("#hs-dict-ed-tbody [data-field=substitution]", "new instructor reading");
  release(); await flush();
  assert.equal(env.rows.get("chem113")[0].substitution, "lye suh zime");
  assert.equal(env.$("#hs-dict-ed-tbody [data-field=substitution]").value, "new instructor reading");
  const draft = JSON.parse(env.storage.getItem("hearsay-editor-draft:https://test.supabase.co:chem113"));
  assert.equal(draft.rows[0].substitution, "new instructor reading");
  env.mounted.destroy();
});

test("remote changes block saves; refreshed checks retain manual wording and require approval again", async () => {
  const env = await setup(); env.manual("lysozyme", "lye suh zime"); env.$("[data-action=approve][data-index='0']").click();
  env.rows.set("chem113", [row("HCl", "hydrogen chloride")]);
  env.$("#hs-dict-ed-save").click(); await flush();
  assert.equal(env.rows.get("chem113").length, 1); assert.match(env.$("#hs-dict-ed-error").textContent, /shared dictionary changed/);
  env.$("#hs-workspace-settings-toggle").click(); env.$("#hs-dict-ed-pull").click(); await flush();
  assert.equal(env.$("[data-spoken='0']").value, "lye suh zime"); assert.match(env.$("#hs-ai-progress").textContent, /0 approved/);
  env.$("[data-action=approve][data-index='0']").click(); env.$("#hs-dict-ed-save").click(); await flush();
  assert.equal(env.rows.get("chem113").length, 2);
  env.mounted.destroy();
});

test("extension page capture enters the same source and review flow", async () => {
  const env = await setup({ extension: true, beforeMount() { globalThis.chrome = { runtime: { id: "abcdefghijklmnopabcdefghijklmnop" }, windows: { getLastFocused: async () => ({ id: 1 }) }, tabs: { query: async () => [{ id: 2, url: "https://example.edu/lesson", title: "Lesson" }] }, scripting: { executeScript: async () => [{ result: { text: source, source: "selection", totalLength: source.length } }] } }; } });
  env.$("#hs-content-pull").click(); await flush();
  assert.equal(env.$("#hs-ai-source").value, source);
  assert.match(env.$("#hs-content-source-details").textContent, /Lesson.*selection/);
  env.$("#hs-ai-analyze").click(); await flush(); assert.equal(env.scans, 1);
  env.mounted.destroy();
});

test("combined drafts refuse contradictory edits and rebase preserves unrelated remote changes", () => {
  const saved = [row("mL", "milliliters")], local = [row("mL", "mill uh liters")];
  assert.throws(() => combineWorkspaceChanges(saved, local, [{ row: row("mL", "m L"), replaceExisting: true }]), /different drafts/);
  const rebased = rebaseWorkspaceRows(saved, local, [...saved, row("HCl", "hydrogen chloride")]);
  assert.equal(rebased.conflicts.length, 0); assert.equal(rebased.rows.length, 2);
  assert.equal(rebased.rows.find(item => item.text === "mL").substitution, "mill uh liters");
  assert.equal(rebaseWorkspaceRows(saved, local, [row("mL", "m L")]).conflicts.length, 1);
});

test("manual review uses the selected sentence when a symbol has several contexts", async () => {
  const env = await setup();
  env.edit("#hs-ai-source", "M is a matrix. Use 5 M solution."); env.$("#hs-content-next").click();
  env.manual("M", "molar");
  assert.equal(env.$("#hs-ai-results .hs-ai-context").getAttribute("title"), "Use 5 M solution.");
  assert.match(env.$("#hs-content-position").textContent, /Sentence 2/);
  env.mounted.destroy();
});

test("manually added units with slashes or arrows stay editable and can be saved", async () => {
  const env = await setup();
  env.edit("#hs-ai-source", "Report ΔH in kJ/mol. Concentration in mol/L.");
  for (const [term, reading] of [["kJ/mol", "kilojoules per mole"], ["mol/L", "moles per liter"]]) {
    env.manual(term, reading);
    const index = [...env.root.querySelectorAll("[data-spoken]")].length - 1;
    assert.equal(env.$(`[data-spoken='${index}']`).value, reading, term);
    assert.doesNotMatch(env.$("#hs-ai-results").textContent, /Needs structural review|Review pronunciation/);
    env.$(`[data-action=approve][data-index='${index}']`).click();
  }
  assert.match(env.$("#hs-workspace-summary").textContent, /2 additions/);
  assert.equal(env.$("#hs-workspace-savebar").hidden, false);
  env.$("#hs-dict-ed-save").click(); await flush();
  assert.deepEqual(env.rows.get("chem113").map(item => item.text).sort(), ["kJ/mol", "mol/L"]);
  assert.match(env.$("#hs-workspace-summary").textContent, /Changes saved/);
  env.$("#hs-workspace-savebar-close").click();
  assert.equal(env.$("#hs-workspace-savebar").hidden, true);
  env.mounted.destroy();
});

test("loading the dictionary never pings other tabs, so two open workspaces cannot reload each other forever", async () => {
  const env = await setup({ rows: [row("mL", "milliliters")] });
  const key = "hearsay-dictionary-updated";
  assert.equal(env.storage.getItem(key), null, "initial load must not broadcast");
  // Another tab saved: this tab reloads quietly and must not echo back.
  let statuses = [];
  const status = env.$("#hs-dict-ed-status");
  const observer = new env.window.MutationObserver(() => statuses.push(status.textContent));
  observer.observe(status, { childList: true, characterData: true, subtree: true });
  const event = new env.window.Event("storage");
  Object.assign(event, { key, newValue: JSON.stringify({ classSlug: "chem113", at: Date.now(), source: "editor", viaStorage: true }) });
  env.window.dispatchEvent(event); await flush(); await flush();
  observer.disconnect();
  assert.equal(env.storage.getItem(key), null, "a reload triggered by another tab must not broadcast again");
  assert.ok(!statuses.includes("Loading…"), "background reloads stay silent");
  // A real save still notifies other tabs.
  env.manual("HCl", "H C L"); env.$("[data-action=approve][data-index='0']").click();
  env.$("#hs-dict-ed-save").click(); await flush();
  assert.match(env.storage.getItem(key) || "", /chem113/);
  env.mounted.destroy();
});

test("Course content: upload or paste, one action row for AI and listening, suggestions below", async () => {
  const env = await setup(); const { $ } = env;
  const card = $(".hs-content-card");
  for (const id of ["#hs-document-file", "#hs-ai-source", "#hs-ai-analyze", "#hs-content-scope", "#hs-content-hear-default", "#hs-content-hear-class", "#hs-content-add"]) assert.ok(card.contains($(id)), id);
  // Get AI suggestions and the listen controls share one row.
  const row = $("#hs-ai-analyze").parentElement;
  assert.ok(row.contains($("#hs-content-scope")));
  // ‹ › sit under each cell's Play button.
  assert.ok($("[data-voice=default]").contains($("#hs-content-previous")) && $("[data-voice=default]").contains($("#hs-content-next")));
  assert.equal($("[data-voice=class]").querySelectorAll(".hs-step[data-step]").length, 2);
  assert.equal($("#hs-content-pause"), null, "the play buttons double as pause");
  // Each reading has its play button beside it.
  assert.ok($("[data-voice=default]").contains($("#hs-content-hear-default")));
  assert.ok($("[data-voice=class]").contains($("#hs-content-hear-class")));
  assert.equal($("#hs-ai-source-panel"), null, "the text box is never collapsed away");
  assert.equal($("#hs-content-text"), null, "no separate passage copy");
  assert.equal($("#hs-ai-cancel").hidden, true, "no Cancel analysis button");
  assert.deepEqual([...$("#hs-content-scope").options].map(option => option.textContent), ["Whole passage", "Sentence", "Word", "Highlighted"]);
  // Suggestions sit inside the card, directly under the Default/Dictionary cells.
  assert.equal($("#hs-content-cells").nextElementSibling, $(".hs-content-review-column"));
  assert.ok($(".hs-content-review-column").contains($("#hs-ai-review")));
  env.mounted.destroy();
});

test("a clicked word keeps scientific notation together and drops sentence punctuation", () => {
  const text = "Dissolve CuSO₄·5H₂O, then report kJ/mol. Add NaCl(aq) (slowly).";
  assert.equal(wordAtOffset(text, text.indexOf("SO₄")), "CuSO₄·5H₂O");
  assert.equal(wordAtOffset(text, text.indexOf("kJ") + 6), "kJ/mol");
  assert.equal(wordAtOffset(text, text.indexOf("NaCl") + 2), "NaCl(aq)");
  // Balanced parentheses stay: entries such as (aq) depend on them.
  assert.equal(wordAtOffset(text, text.indexOf("slowly")), "(slowly)");
  assert.equal(wordAtOffset("Add NaCl (aq.", 10), "aq");
  assert.equal(wordAtOffset("", 0), "");
});

test("spoken text maps back to the source so each word can be highlighted while read", () => {
  const text = "Measure 5 mL of water now.";
  const plain = reviewSpeechWithMap(text);
  assert.equal(plain.spoken, reviewSpeech(text).spoken);
  const at = word => plain.spoken.indexOf(word);
  const slice = range => text.slice(range.start, range.end);
  assert.equal(slice(plain.locate(at("Measure"))), "Measure");
  assert.equal(slice(plain.locate(at("water"))), "water");
  assert.equal(slice(plain.locate(at("now"))), "now.");
  // With a class reading, the spoken replacement highlights the written term.
  const revised = reviewSpeechWithMap(text, { revised: true, preview: { pattern: "mL", substitution: "milliliters", ignore_case: "No" } });
  assert.match(revised.spoken, /milliliters/);
  assert.equal(slice(revised.locate(revised.spoken.indexOf("milliliters"))), "mL");
  assert.equal(slice(revised.locate(revised.spoken.indexOf("water"))), "water");
});

test("listen plays the whole passage or the sentence, as default JAWS or with the class dictionary", async () => {
  const env = await setup({ rows: [row("mL", "milliliters")] }); const { $ } = env;
  const heard = async (scope, voice) => {
    cancelSpeech(); // Stop anything still "playing" in the mock.
    env.utterances.length = 0; $("#hs-content-scope").value = scope;
    $(`#hs-content-hear-${voice}`).click(); await new Promise(resolve => setTimeout(resolve, 400));
    return env.utterances.join(" ");
  };
  env.edit("#hs-ai-source", source);
  // The mock never ends an utterance, so only the first queued sentence is recorded.
  assert.match(await heard("passage", "default"), /^Measure/);
  // The play button is also the pause button: Play -> Pause -> Resume.
  assert.equal($("#hs-content-hear-default").textContent, "Pause");
  assert.equal($("#hs-content-hear-class").disabled, false, "the other reading can be started at any time");
  $("#hs-content-hear-default").click();
  assert.equal($("#hs-content-hear-default").textContent, "▶ Resume");
  $("#hs-content-hear-default").click();
  assert.equal($("#hs-content-hear-default").textContent, "Pause");
  cancelSpeech();
  assert.equal($("#hs-content-hear-default").textContent, "▶ Play");
  $("#hs-content-next").click();
  const sentence = await heard("sentence", "default");
  assert.match(sentence, /lysozyme/); assert.doesNotMatch(sentence, /Measure/);
  // Word and Highlighted explain what to do before anything is chosen.
  assert.equal(await heard("word", "default"), ""); assert.match($("#hs-ai-status").textContent, /Click a word/);
  assert.equal(await heard("selection", "default"), ""); assert.match($("#hs-ai-status").textContent, /Highlight text/);
  // Same sentence: default JAWS spells the unit; the class dictionary reads it.
  $("#hs-content-previous").click();
  assert.doesNotMatch(await heard("sentence", "default"), /milliliters/);
  assert.match(await heard("sentence", "class"), /milliliters/);
  env.mounted.destroy();
});

test("Default and Dictionary cells show both pronunciations; Prev/Next step by sentence or word", async () => {
  const env = await setup({ rows: [row("mL", "milliliters")] }); const { $ } = env;
  env.edit("#hs-ai-source", source);
  assert.equal($("#hs-content-position").textContent, "Sentence 1 of 2");
  assert.doesNotMatch($("#hs-content-current").textContent, /milliliters/);
  assert.match($("#hs-content-proposed").textContent, /Measure milliliters of/);
  // Word: Next walks word by word; both cells follow.
  $("#hs-content-scope").value = "word"; $("#hs-content-scope").dispatchEvent(new Event("change"));
  assert.equal($("#hs-content-previous").getAttribute("aria-label"), "Previous word");
  $("#hs-content-next").click();
  assert.equal($("#hs-content-position").textContent, "Word: Measure");
  $("#hs-content-next").click();
  assert.equal($("#hs-content-position").textContent, "Word: mL");
  assert.equal($("#hs-content-proposed").textContent, "milliliters");
  $("#hs-content-previous").click();
  assert.equal($("#hs-content-position").textContent, "Word: Measure");
  // Whole passage has no stepping.
  $("#hs-content-scope").value = "passage"; $("#hs-content-scope").dispatchEvent(new Event("change"));
  assert.equal($("#hs-content-next").hidden, true);
  // Highlighted steps by sentence.
  $("#hs-content-scope").value = "selection"; $("#hs-content-scope").dispatchEvent(new Event("change"));
  $("#hs-content-next").click();
  assert.equal($("#hs-content-scope").value, "sentence");
  assert.equal($("#hs-content-position").textContent, "Sentence 2 of 2");
  env.mounted.destroy();
});

test("cells colour-code what reads differently from the written text: default JAWS vs class dictionary", async () => {
  const env = await setup({ rows: [row("mL", "milliliters")] }); const { $ } = env;
  env.edit("#hs-ai-source", "The customer needs: 5 mL.");
  const marked = (selector, kind) => [...env.root.querySelectorAll(`${selector} .hs-diff-${kind}`)].map(span => span.textContent.trim()).filter(Boolean);
  assert.equal($("#hs-content-written"), null, "the text box is the written text; no separate cell");
  // While a sentence is read, the text box marks it: ":" read differently by default JAWS, "mL" changed by the class dictionary.
  cancelSpeech(); $("#hs-content-hear-class").click();
  assert.ok(marked(".hs-source-backdrop", "symbol").includes(":"));
  assert.deepEqual(marked(".hs-source-backdrop", "course"), ["mL"]);
  cancelSpeech();
  // Default: "colon" is the default difference; nothing comes from the class dictionary.
  assert.match($("#hs-content-current").textContent, /colon/);
  assert.ok(marked("#hs-content-current", "symbol").includes("colon"));
  assert.deepEqual(marked("#hs-content-current", "course"), []);
  // Dictionary: "milliliters" comes from the class dictionary.
  assert.deepEqual(marked("#hs-content-proposed", "course"), ["milliliters"]);
  // Unchanged words are not coloured.
  assert.ok(!marked("#hs-content-current", "symbol").includes("customer"));
  env.mounted.destroy();
});

test("Default and Dictionary cells always describe the same text: never one filled and one blank", async () => {
  const env = await setup({ rows: [row("mL", "milliliters")] }); const { $ } = env;
  const both = label => {
    const def = $("#hs-content-current").textContent, dict = $("#hs-content-proposed").textContent;
    assert.ok(def && dict, `${label}: default "${def}" / dictionary "${dict}"`);
  };
  env.edit("#hs-ai-source", "Measure H1, H2, RT1, and RT2 in that order. Add 5 mL.");
  both("after paste");
  cancelSpeech(); $("#hs-content-hear-default").click(); both("playing default");
  cancelSpeech(); both("after stopping");
  $("#hs-content-hear-class").click(); both("playing dictionary");
  $("#hs-content-hear-class").click(); both("paused");
  $("#hs-content-hear-default").click(); both("switched voice");
  cancelSpeech(); $("#hs-content-next").click(); both("stepped to next sentence");
  $("#hs-content-scope").value = "word"; $("#hs-content-scope").dispatchEvent(new Event("change"));
  $("#hs-content-next").click(); both("word scope");
  assert.equal($("#hs-content-source-details").textContent, "", "no 'From DOCX file' line");
  env.mounted.destroy();
});

test("the Dictionary cell shows only saved class entries, never unsaved suggestions or staged edits", async () => {
  const env = await setup({ rows: [row("mL", "m L")] }); const { $ } = env;
  env.edit("#hs-ai-source", source); // "Measure mL of HCl. Test lysozyme."
  // A staged (unsaved) table edit is not read as the class pronunciation.
  env.edit("#hs-dict-ed-tbody [data-field=substitution]", "milliliters");
  env.mounted.showView?.("review");
  $("#hs-content-scope").value = "sentence"; $("#hs-content-scope").dispatchEvent(new Event("change"));
  assert.doesNotMatch($("#hs-content-proposed").textContent, /milliliters/);
  assert.match($("#hs-content-proposed").textContent, /m L/);
  // An open, unapproved suggestion is not read as the class pronunciation either.
  $("#hs-content-next").click();
  env.manual("lysozyme", "lye suh zime");
  $("#hs-content-scope").dispatchEvent(new Event("change"));
  assert.doesNotMatch($("#hs-content-proposed").textContent, /lye suh zime/);
  env.mounted.destroy();
});

test("suggestion cards preload ignore case from the AI and show it beside Add / Skip / Next", async () => {
  const env = await setup({ rows: [row("mL", "m L")], suggestions: [{ ...items[0], spoken: "milliliters", ignore_case: "Yes" }, { term: "lysozyme", spoken: "lye suh zime", evidence: "Test lysozyme.", reason: "Enzyme.", action: "dictionary", ignore_case: "Yes" }] });
  const { $ } = env;
  env.edit("#hs-ai-source", source); $("#hs-ai-analyze").click(); await flush();
  // mL is already saved (ignore case No), so it is not re-suggested; lysozyme keeps the AI proposal.
  assert.equal($("[data-case='0']").value, "Yes");
  assert.ok($("[data-case='0']").closest(".hs-ai-decision-row"), "ignore case is visible beside Add / Skip / Next");
  env.mounted.destroy();
});

test("Get AI suggestions says so when it finds nothing new, for highlighted text or the whole text", async () => {
  const env = await setup({ suggestions: [] }); const { $ } = env;
  env.edit("#hs-ai-source", source);
  const box = $("#hs-ai-source"), start = source.indexOf("Test lysozyme"); let active = box;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => active, set: value => { active = value; } });
  Object.assign(box, { selectionStart: start, selectionEnd: start + 13 }); box.dispatchEvent(new Event("mouseup", { bubbles: true }));
  $("#hs-ai-analyze").click(); await flush();
  assert.equal($("#hs-ai-status").textContent, "No suggestions for the highlighted text. Nothing in it looks like it needs a class dictionary entry.");
  assert.equal($("#hs-ai-status").previousElementSibling, $("#hs-ai-analyze").parentElement, "message sits right under the Get AI suggestions row");
  delete document.activeElement; env.mounted.destroy();
  const saved = await setup({ rows: [row("mL", "milliliters")], suggestions: [items[0]] });
  saved.edit("#hs-ai-source", source); saved.$("#hs-ai-analyze").click(); await flush();
  assert.match(saved.$("#hs-ai-status").textContent, /No new suggestions for this text: the term it found is already in your class dictionary\./);
  saved.mounted.destroy();
});

test("Save sits in the top row, confirms what will be added, and leaving with unsaved changes warns", async () => {
  const env = await setup(); const { $ } = env;
  assert.ok($(".hs-workspace-tabrow").contains($("#hs-dict-ed-save")), "Save is in the top row");
  assert.equal($("#hs-dict-ed-save").textContent, "Saved"); assert.equal($("#hs-dict-ed-save").disabled, true);
  env.edit("#hs-ai-source", source);
  env.manual("lysozyme", "lye suh zime"); $("[data-action=approve][data-index='0']").click();
  assert.equal($("#hs-dict-ed-save").textContent, "Save (1)"); assert.equal($("#hs-dict-ed-save").disabled, false);
  const leave = new env.window.Event("beforeunload", { cancelable: true }); env.window.dispatchEvent(leave);
  assert.equal(leave.defaultPrevented, true, "leaving with unsaved changes asks first");
  let asked = ""; env.window.confirm = message => { asked = message; return true; };
  $("#hs-dict-ed-save").click(); await flush();
  assert.match(asked, /Save to the .+ class dictionary\?/);
  assert.match(asked, /You are about to add 1 term:/);
  assert.match(asked, /\+ lysozyme → lye suh zime/);
  assert.equal($("#hs-dict-ed-save").textContent, "Saved");
  const after = new env.window.Event("beforeunload", { cancelable: true }); env.window.dispatchEvent(after);
  assert.equal(after.defaultPrevented, false, "no warning once everything is saved");
  env.mounted.destroy();
});

const lysozyme = { term: "lysozyme", spoken: "lye suh zime", evidence: "Test lysozyme.", reason: "Enzyme name.", action: "dictionary" };

test("AI does not re-suggest terms already in the class dictionary", async () => {
  const env = await setup({ rows: [row("mL", "milliliters")], suggestions: [items[0], lysozyme] }); const { $ } = env;
  env.edit("#hs-ai-source", source); $("#hs-ai-analyze").click(); await flush();
  assert.deepEqual([...env.root.querySelectorAll("#hs-ai-results h4")].map(h => h.textContent.split(" — ")[0]), ["lysozyme"]);
  assert.match($("#hs-ai-status").textContent, /1 new suggestion\. 1 already in your class dictionary \(skipped\)/);
  assert.equal($(".hs-ai-options").hidden, true, "no 'suggest alternatives' option");
  env.mounted.destroy();
});

test("highlighted text is all that is sent to the AI, and its suggestions join the existing queue", async () => {
  const env = await setup({ suggestions: [lysozyme] }); const { $ } = env;
  const bodies = []; const backend = globalThis.fetch;
  globalThis.fetch = async (url, options) => { if (String(url).endsWith("/api/createai/analyze")) bodies.push(JSON.parse(options.body)); return backend(url, options); };
  env.edit("#hs-ai-source", source);
  env.manual("HCl", "hydrogen chloride");
  // Simulate highlighting "Test lysozyme" in the text box (the test DOM has no selection API).
  const box = $("#hs-ai-source"), start = source.indexOf("Test lysozyme");
  let active = box;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => active, set: value => { active = value; } });
  Object.assign(box, { selectionStart: start, selectionEnd: start + "Test lysozyme".length });
  box.dispatchEvent(new Event("mouseup", { bubbles: true }));
  assert.equal($("#hs-ai-analyze").textContent, "Get AI suggestions for highlighted text");
  // "+ Add" appears beside it for the highlight; the old add-term block, Lab recovery and Clear are gone.
  assert.equal($("#hs-content-add").hidden, false);
  assert.equal($("#hs-content-add").textContent, "+ Add “Test lysozyme”");
  assert.ok($("#hs-ai-analyze").parentElement.contains($("#hs-content-add")));
  assert.equal($("#hs-content-tools").hidden, true);
  assert.ok($("#hs-ai-analyze").parentElement.contains($("#hs-ai-clear")), "Clear sits in the action row");
  assert.equal($("#hs-ai-clear").textContent, "Clear");
  globalThis.window.confirm = () => { throw new Error("adding to the queue must not ask to replace it"); };
  $("#hs-ai-analyze").click(); await flush();
  assert.equal(bodies.at(-1).text, "Test lysozyme");
  assert.equal($("#hs-ai-source").value, source, "the full text is kept");
  assert.deepEqual([...env.root.querySelectorAll("#hs-ai-results h4")].map(h => h.textContent.split(" — ")[0]), ["HCl", "lysozyme"]);
  assert.match($("#hs-ai-status").textContent, /from the highlighted text/);
  // Clicking without a highlight goes back to sending everything.
  active = box; Object.assign(box, { selectionStart: 3, selectionEnd: 3 }); box.dispatchEvent(new Event("mouseup", { bubbles: true }));
  assert.equal($("#hs-ai-analyze").textContent, "Get AI suggestions");
  assert.equal($("#hs-content-add").hidden, true, "no highlight, no + Add");
  delete document.activeElement;
  env.mounted.destroy();
});

test("conflicts are stated plainly with a fix that keeps both entries reading correctly", async () => {
  const env = await setup({ rows: [row("L", "liters")] }); const { $ } = env;
  env.edit("#hs-ai-source", "Add HCl slowly.");
  env.manual("HCl", "H C L");
  const list = $("[data-warnings='0']");
  assert.match(list.textContent, /The saved entry "L" \(read "liters"\) would re-read part of this/);
  assert.match(list.textContent, /H C liters/);
  const fix = list.querySelector("[data-action=fix]");
  assert.equal(fix.textContent, 'Read it as "H C el"');
  fix.click();
  assert.equal($("[data-spoken='0']").value, "H C el");
  assert.doesNotMatch($("[data-warnings='0']").textContent, /re-read/);
  env.mounted.destroy();
});

test("save bar stays hidden with nothing staged and settings open as a closable panel", async () => {
  const env = await setup();
  assert.equal(env.$("#hs-workspace-savebar").hidden, true);
  env.$("#hs-workspace-settings-toggle").click();
  assert.equal(env.$("#hs-workspace-settings").hidden, false);
  env.$("#hs-workspace-settings-close").click();
  assert.equal(env.$("#hs-workspace-settings").hidden, true);
  assert.equal(env.$("#hs-workspace-settings-toggle").getAttribute("aria-expanded"), "false");
  env.mounted.destroy();
});

test("review distinguishes saved readings from matching staged table changes", async () => {
  const env = await setup({ rows: [row("mL", "m L")] });
  env.edit("#hs-dict-ed-tbody [data-field=substitution]", "milliliters");
  env.manual("mL", "milliliters");
  assert.match(env.$("[data-decision='0']").textContent, /Staged in Class dictionary/);
  assert.match(env.$("#hs-ai-results").textContent, /Currently saved: m L/);
  assert.match(env.$("#hs-ai-results").textContent, /Staged dictionary reading \(not saved\): milliliters/);
  assert.equal(env.rows.get("chem113")[0].substitution, "m L");
  env.mounted.destroy();
});

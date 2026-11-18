import test from "node:test";
import assert from "node:assert/strict";
import { setupDom, flush } from "./helpers/review-dom.mjs";
import { mountScreenReaderLab } from "../src/review-workspace.js";
import { mountDictionaryEditor } from "../src/dictionary-editor.js";
import { mountExtensionShell } from "../src/extension-shell.js";

test("review selection, sentence navigation, draft preview and reopening keep original source", async () => {
  const env = setupDom(); let mounted = await mountScreenReaderLab(env.root, { context: "extension" });
  const $ = id => env.root.querySelector(`#${id}`);
  const input = $("review-input"); input.value = "Use the nozzle. Read T2 on pages 3-5."; input.dispatchEvent(new Event("input"));
  assert.equal($("review-original").textContent, "Use the nozzle.");
  input.focus(); input.selectionStart = 8; input.selectionEnd = 14; input.dispatchEvent(new Event("mouseup"));
  assert.equal($("review-pattern").value, "nozzle");
  $("review-spoken").value = "noz ull"; $("review-spoken").dispatchEvent(new Event("input"));
  assert.match($("review-revised").textContent, /noz ull/);
  $("review-hear-revised").click(); assert.equal(env.utterances.at(-1), $("review-revised").textContent);
  $("review-attention").click(); assert.match($("review-queue").textContent, /Needs attention/);
  $("review-next").click(); assert.match($("review-original").textContent, /T2 on pages 3 dash 5/);
  assert.equal(input.value, "Use the nozzle. Read T2 on pages 3-5.");
  env.window.scrollY = 240; mounted.destroy(); env.root.innerHTML = "";
  mounted = await mountScreenReaderLab(env.root, { context: "extension" });
  assert.match($("review-position").textContent, /Sentence 2 of 2/); assert.equal($("review-pattern").value, "nozzle");
  assert.equal($("review-spoken").value, "noz ull"); assert.equal(env.window.scrollY, 240);
  assert.equal($("review-input").value, "Use the nozzle. Read T2 on pages 3-5."); mounted.destroy();
});
test("save, course isolation, failed saves and shared Undo work against a simulated backend", async () => {
  const env = setupDom({ connected: true }); const mounted = await mountScreenReaderLab(env.root, { context: "extension" });
  const $ = id => env.root.querySelector(`#${id}`);
  $("review-input").value = "Use the nozzle."; $("review-input").dispatchEvent(new Event("input"));
  $("review-pattern").value = "nozzle"; $("review-spoken").value = "noz ull"; $("review-spoken").dispatchEvent(new Event("input"));
  $("review-save").click(); await flush();
  assert.equal(env.rows.get("chem113")[0].substitution, "noz ull"); assert.match($("review-queue").textContent, /Pronunciation added/);
  $("review-undo").click(); await flush(); assert.equal(env.rows.get("chem113").length, 0);
  $("review-pattern").value = "nozzle"; $("review-spoken").value = "my draft"; $("review-spoken").dispatchEvent(new Event("input"));
  env.failWrites(true); $("review-save").click(); await flush();
  assert.match($("review-status").textContent, /Save failed/); assert.equal($("review-spoken").value, "my draft");
  $("review-course").value = "bio181"; $("review-course").dispatchEvent(new Event("change")); await flush();
  assert.equal($("review-pattern").value, "");
  $("review-course").value = "chem113"; $("review-course").dispatchEvent(new Event("change")); await flush();
  assert.equal($("review-spoken").value, "my draft"); mounted.destroy();
});
test("dictionary exposes JAWS only and keeps an unfinished form across remount", async () => {
  const env = setupDom({ connected: true }); let mounted = await mountDictionaryEditor(env.root, { context: "extension" });
  const $ = id => env.root.querySelector(`#${id}`);
  assert.equal($("hs-dict-ed-export-jaws").hasAttribute("hidden"), false);
  for (const id of ["hs-dict-ed-export-addon", "hs-dict-ed-export-nvda", "hs-dict-ed-export-apple"]) assert.ok($(id).hasAttribute("hidden"));
  $("hs-dict-ed-new-pattern").value = "unfinished"; $("hs-dict-ed-new-spoken").value = "my draft";
  $("hs-dict-ed-new-spoken").dispatchEvent(new Event("input", { bubbles: true }));
  mounted.destroy(); mounted = await mountDictionaryEditor(env.root, { context: "extension" });
  assert.equal($("hs-dict-ed-new-pattern").value, "unfinished"); assert.equal($("hs-dict-ed-new-spoken").value, "my draft");
  mounted.destroy();
});

test("extension capture exposes provenance and truncation and appends without replacing", async () => {
  const env = setupDom();
  let capture = { text: "Captured T2.", source: "selection", truncated: true, totalLength: 15000 };
  globalThis.chrome = { windows: { getLastFocused: async () => ({ id: 1 }) },
    tabs: { query: async () => [{ id: 5, active: true, url: "https://example.edu/lesson", title: "Lesson one" }] },
    scripting: { executeScript: async () => [{ result: capture }] } };
  const mounted = await mountScreenReaderLab(env.root, { context: "extension" });
  const $ = id => env.root.querySelector(`#${id}`);
  $("review-pull").click(); await flush();
  assert.equal($("review-input").value, "Captured T2.");
  assert.match($("review-sources").textContent, /Lesson one.*selection.*Truncated from 15,000/);
  assert.equal($("review-sources").querySelector("a").getAttribute("href"), "https://example.edu/lesson");
  $("review-capture-mode").value = "append";
  capture = { text: "Next passage.", source: "selection", truncated: false, totalLength: 13 };
  $("review-pull").click(); await flush();
  assert.equal($("review-input").value, "Captured T2.\n\nNext passage.");
  capture = { text: "Whole body", source: "body", truncated: false };
  $("review-pull").click(); await flush();
  assert.equal($("review-input").value, "Captured T2.\n\nNext passage.");
  assert.match($("review-status").textContent, /Select text on the source/); mounted.destroy();
});

test("Lab save can be undone from Dictionary and review queue notices the undo", async () => {
  const env = setupDom({ connected: true }); let mounted = await mountScreenReaderLab(env.root, { context: "extension" });
  let $ = id => env.root.querySelector(`#${id}`);
  $("review-input").value = "Use nozzle."; $("review-input").dispatchEvent(new Event("input"));
  $("review-pattern").value = "nozzle"; $("review-spoken").value = "noz ull"; $("review-spoken").dispatchEvent(new Event("input"));
  $("review-save").click(); await flush(); mounted.destroy();
  mounted = await mountDictionaryEditor(env.root, { context: "extension" });
  assert.equal($("hs-dict-ed-undo").disabled, false);
  $("hs-dict-ed-undo").click(); await flush(); assert.equal(env.rows.get("chem113").length, 0); mounted.destroy();
  mounted = await mountScreenReaderLab(env.root, { context: "extension" });
  assert.match($("review-queue").textContent, /Needs attention/); mounted.destroy();
});

test("Dictionary preserves an unsaved row edit when leaving and reopening", async () => {
  const env = setupDom({ connected: true }); env.rows.set("chem113", [{ class_slug: "chem113", text: "nozzle", substitution: "old", app: "All Apps", ignore_case: "Yes", note: "" }]);
  let mounted = await mountDictionaryEditor(env.root, { context: "extension" });
  const cell = env.root.querySelector('[data-field="substitution"]'); cell.value = "unfinished pronunciation";
  cell.dispatchEvent(new Event("input", { bubbles: true })); mounted.destroy();
  mounted = await mountDictionaryEditor(env.root, { context: "extension" });
  assert.equal(env.root.querySelector('[data-field="substitution"]').value, "unfinished pronunciation");
  assert.equal(env.rows.get("chem113")[0].substitution, "old"); mounted.destroy();
});

test("actual extension tabs preserve review source, sentence, and unsaved pronunciation", async () => {
  const env = setupDom({ connected: true }); const shell = await mountExtensionShell(env.root);
  const $ = id => env.root.querySelector(`#${id}`);
  $("hs-ai-source").value = "Use nozzle. Read T2."; $("hs-ai-source").dispatchEvent(new Event("input"));
  $("hs-content-manual").value = "nozzle"; $("hs-content-manual").dispatchEvent(new Event("input")); $("hs-content-add").click();
  const spoken = env.root.querySelector("[data-spoken='0']"); spoken.value = "noz ull"; spoken.dispatchEvent(new Event("input", { bubbles: true }));
  $("hs-content-next").click();
  $("hs-workspace-dictionary-tab").click(); await flush();
  assert.ok($("hs-dict-ed-class"));
  $("hs-workspace-review-tab").click(); await flush();
  assert.equal($("hs-ai-source").value, "Use nozzle. Read T2.");
  assert.equal(env.root.querySelector("[data-spoken='0']").value, "noz ull"); assert.match($("hs-content-position").textContent, /Sentence 2 of 2/);
  assert.equal($("hs-workspace-review-tab").getAttribute("aria-selected"), "true"); shell.destroy();
});

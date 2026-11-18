import test from "node:test";
import assert from "node:assert/strict";
import { setupDom, flush } from "./helpers/review-dom.mjs";
import { mountDictionaryEditor } from "../src/dictionary-editor.js";
import { mountScreenReaderLab } from "../src/review-workspace.js";
import { mergeApprovedRows } from "../src/core/ai-review.js";

const source = "Measure mL of HCl. Test lysozyme.";
const items = [
  { term: "mL", spoken: "milliliters", evidence: "Measure mL of HCl.", reason: "Unit abbreviation.", action: "dictionary" },
  { term: "HCl", spoken: "H C L", evidence: "Measure mL of HCl.", reason: "Formula.", action: "dictionary" },
];
async function setup(suggestions = items) {
  const env = setupDom({ connected: true });
  globalThis.location.hostname = "localhost";
  env.window.location = { ...globalThis.location, href: "", protocol: "http:" };
  const backend = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url === "/api/createai/status") return Response.json({ available: true });
    if (url === "/api/createai/analyze") return Response.json({ suggestions, discarded: 0 });
    return backend(url, options);
  };
  env.mounted = await mountDictionaryEditor(env.root);
  env.$ = selector => env.root.querySelector(selector);
  env.edit = (selector, value) => { const el = env.$(selector); el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); };
  env.analyze = async () => { env.edit("#hs-ai-source", source); env.$("#hs-ai-analyze").click(); await flush(); };
  return env;
}

test("AI chosen and Lab automatic clipboard superscripts survive remount", async () => {
  const env = await setup();
  function paste(input, automatic = false) {
    input.selectionStart = input.selectionEnd = 0;
    const event = new Event("paste", { bubbles: true, cancelable: true });
    event.clipboardData = { getData: type => type === "text/plain" ? "5.00 × 10-3 M" : '<p>5.00 × 10<sup>-3</sup> M</p>' };
    input.dispatchEvent(event);
    assert.equal(event.defaultPrevented, automatic);
    if (!automatic) {
      input.value = "5.00 × 10-3 M"; input.dispatchEvent(new Event("input", { bubbles: true }));
      const button = env.root.querySelector("[data-preserve-superscripts]");
      assert.equal(button.parentNode.hidden, false); button.click();
    }
    assert.equal(input.value, "5.00 × 10⁻³ M");
  }
  paste(env.$("#hs-ai-source"));
  env.mounted.destroy(); env.mounted = await mountDictionaryEditor(env.root);
  assert.equal(env.$("#hs-ai-source").value, "5.00 × 10⁻³ M");
  env.mounted.destroy();
  const lab = await mountScreenReaderLab(env.root, { context: "extension" });
  paste(env.$("#review-input"), true); lab.destroy();
  const reopened = await mountScreenReaderLab(env.root, { context: "extension" });
  assert.equal(env.$("#review-input").value, "5.00 × 10⁻³ M");
  assert.equal(env.rows.get("chem113").length, 0);
  reopened.destroy();
});

test("inline review stages a batch, preserves it on failed save, and supports one Undo and Lab handoff", async () => {
  const env = await setup(); const { $, edit } = env;
  await env.analyze();
  assert.equal(env.window.document.activeElement.id, "hs-ai-term-0");
  edit("[data-spoken='0']", "mill uh liters");
  $("[data-action='approve'][data-index='0']").click();
  assert.equal(env.window.document.activeElement.id, "hs-ai-term-1");
  $("[data-action='approve'][data-index='1']").click();
  assert.equal(env.rows.get("chem113").length, 0);
  assert.match($("#hs-ai-progress").textContent, /2 approved/);
  assert.equal($("#hs-ai-lab").disabled, true);
  env.failWrites(true); $("#hs-ai-save").click(); await flush();
  assert.match($("#hs-ai-status").textContent, /Not saved/);
  assert.match($("#hs-ai-progress").textContent, /2 approved/);
  assert.equal($("[data-spoken='0']").value, "mill uh liters");
  assert.equal(env.rows.get("chem113").length, 0);
  env.failWrites(false); $("#hs-ai-save").click(); await flush();
  assert.equal(env.rows.get("chem113").length, 2);
  assert.equal(env.rows.get("chem113")[0].substitution, "mill uh liters");
  assert.match($("#hs-ai-progress").textContent, /2 saved/);
  $("#hs-ai-lab").click();
  assert.equal(env.window.location.href, "../lab/");
  env.mounted.destroy();
  const lab = await mountScreenReaderLab(env.root, { context: "extension" });
  assert.equal($("#review-input").value, source);
  assert.equal($("#review-course").value, "chem113");
  lab.destroy(); env.mounted = await mountDictionaryEditor(env.root);
  $("#hs-dict-ed-undo").click(); await flush();
  assert.equal(env.rows.get("chem113").length, 0);
  env.mounted.destroy();
});

test("review drafts survive remount and stay isolated when switching classes", async () => {
  const env = await setup(); const { $, edit } = env;
  await env.analyze(); edit("[data-spoken='0']", "my edited pronunciation");
  $("[data-action='approve'][data-index='0']").click();
  $("[data-action='later'][data-index='1']").click();
  env.mounted.destroy(); env.mounted = await mountDictionaryEditor(env.root);
  assert.equal($("#hs-ai-source").value, source);
  assert.equal($("[data-spoken='0']").value, "my edited pronunciation");
  assert.match($("#hs-ai-progress").textContent, /1 approved.*1 for later/);
  $("#hs-dict-ed-class").value = "bio181"; $("#hs-dict-ed-class").dispatchEvent(new Event("change")); await flush();
  assert.equal($("#hs-ai-source").value, "");
  edit("#hs-ai-source", "Biology draft");
  $("#hs-dict-ed-class").value = "chem113"; $("#hs-dict-ed-class").dispatchEvent(new Event("change")); await flush();
  assert.equal($("#hs-ai-source").value, source);
  assert.match($("#hs-ai-progress").textContent, /1 approved/);
  $("#hs-ai-clear").click();
  assert.equal($("#hs-ai-source").value, "");
  assert.equal(env.rows.get("chem113").length, 0);
  env.mounted.destroy();
});

test("changed remote dictionary is not overwritten; refresh retains wording and requires review again", async () => {
  const env = await setup(); const { $, edit } = env;
  await env.analyze(); edit("[data-spoken='0']", "my wording");
  $("[data-action='approve'][data-index='0']").click();
  env.rows.set("chem113", [{ text: "remote", substitution: "someone else's change", ignore_case: "No" }]);
  $("#hs-ai-save").click(); await flush();
  assert.equal(env.rows.get("chem113")[0].text, "remote");
  assert.match($("#hs-ai-progress").textContent, /1 approved/);
  $("#hs-ai-refresh").click(); await flush();
  assert.equal($("[data-spoken='0']").value, "my wording");
  assert.match($("#hs-ai-progress").textContent, /0 approved/);
  $("[data-action='approve'][data-index='0']").click();
  $("#hs-ai-save").click(); await flush();
  assert.deepEqual(env.rows.get("chem113").map(row => row.text), ["mL", "remote"]);
  env.mounted.destroy();
});

test("existing pronunciations require explicit replacement; unchanged ones are already covered", async () => {
  const env = await setup(); const { $ } = env;
  env.rows.set("chem113", [{ class_slug: "chem113", text: "mL", substitution: "old wording", ignore_case: "No" }, { class_slug: "chem113", text: "HCl", substitution: "H C L", ignore_case: "No" }]);
  await env.mounted.pullWorkspace();
  $("#hs-ai-alternatives").checked = true; $("#hs-ai-alternatives").dispatchEvent(new Event("change"));
  await env.analyze();
  assert.match($("#hs-ai-progress").textContent, /1 already covered/);
  $("[data-action='approve'][data-index='0']").click();
  assert.match($("#hs-ai-status").textContent, /Choose Replace/);
  $("[data-replace='0']").checked = true; $("[data-replace='0']").dispatchEvent(new Event("change", { bubbles: true }));
  $("[data-action='approve'][data-index='0']").click();
  assert.match($("#hs-ai-save-summary").textContent, /1 replacements/);
  $("#hs-ai-save").click(); await flush();
  assert.equal(env.rows.get("chem113").length, 2);
  assert.equal(env.rows.get("chem113")[0].substitution, "milliliters");
  assert.throws(() => mergeApprovedRows([{ text: "mL", substitution: "old wording" }], [{ row: { text: "mL", substitution: "milliliters", ignore_case: "No" } }]), /Confirm replacement/);
  env.mounted.destroy();
});

test("mixed-script drafts require correction before approval or playback and editing removes approval", async () => {
  const env = await setup([{ ...items[0], term: "lysozyme", evidence: "Test lysozyme.", spoken: "LYE-soh-zाइम" }]);
  const { $, edit } = env; await env.analyze();
  assert.equal($("[data-spoken='0']").value, "");
  $("[data-action='term']").click(); $("[data-action='approve']").click();
  assert.equal(env.utterances.length, 0);
  edit("[data-spoken='0']", "lye suh zime");
  $("[data-action='term']").click(); assert.equal(env.utterances.at(-1), "lye suh zime");
  $("[data-action='approve']").click(); assert.match($("#hs-ai-progress").textContent, /1 approved/);
  edit("[data-spoken='0']", "new wording"); assert.match($("#hs-ai-progress").textContent, /0 approved/);
  env.mounted.destroy();
});

test("passage edits preserve approvals across reload and can be reverted without another ASU request", async () => {
  const env = await setup(); const { $, edit } = env; await env.analyze();
  $("[data-action='approve'][data-index='0']").click();
  edit("#hs-ai-source", "An edited passage.");
  assert.equal($("#hs-ai-save").disabled, true);
  assert.match($("#hs-ai-progress").textContent, /1 approved/);
  env.mounted.destroy(); env.mounted = await mountDictionaryEditor(env.root);
  assert.equal($("#hs-ai-source").value, "An edited passage.");
  assert.match($("#hs-ai-progress").textContent, /1 approved/);
  $("#hs-ai-revert-source").click();
  assert.equal($("#hs-ai-source").value, source);
  assert.equal($("#hs-ai-save").disabled, false);
  env.mounted.destroy();
});

test("a late analysis response cannot enter a different class's review", async () => {
  const env = await setup(); const { $, edit } = env;
  const backend = globalThis.fetch; let resolveAnalysis;
  globalThis.fetch = (url, options) => url === "/api/createai/analyze" ? new Promise(resolve => { resolveAnalysis = resolve; }) : backend(url, options);
  edit("#hs-ai-source", source); $("#hs-ai-analyze").click();
  $("#hs-dict-ed-class").value = "bio181"; $("#hs-dict-ed-class").dispatchEvent(new Event("change")); await flush();
  resolveAnalysis(Response.json({ suggestions: items })); await flush();
  assert.equal($("#hs-ai-source").value, "");
  assert.equal($("#hs-ai-results").children.length, 0);
  assert.equal(env.rows.get("bio181").length, 0);
  env.mounted.destroy();
});

test("uncertain personal names remain editable while structural equations cannot be approved as terms", async () => {
  const text = "The antidote passes through Tomović’s bloodstream. Use ΔG = ΔH - TΔS.";
  // The legacy generic review action must migrate without requiring a new scan.
  const env = await setup([
    { term: "Tomović", spoken: "", evidence: "through Tomović’s bloodstream", reason: "Confirm the person's intended pronunciation.", action: "review" },
    { term: "ΔG = ΔH - TΔS", spoken: "", evidence: "Use ΔG = ΔH - TΔS.", reason: "Complete equation.", action: "review", review_kind: "structure" },
  ]);
  const { $, edit } = env;
  edit("#hs-ai-source", text); $("#hs-ai-analyze").click(); await flush();
  assert.ok($("[data-spoken='0']"));
  assert.equal($("[data-spoken='0']").value, "");
  assert.match($("#hs-ai-results").textContent, /Pronunciation needs confirmation/);
  assert.equal($("[data-spoken='1']"), null);
  assert.equal($("[data-action='approve'][data-index='1']"), null);
  $("[data-action='approve'][data-index='0']").click();
  assert.equal($("#hs-ai-save").disabled, true);
  edit("[data-spoken='0']", "instructor confirmed reading");
  env.mounted.destroy(); env.mounted = await mountDictionaryEditor(env.root);
  assert.equal($("[data-spoken='0']").value, "instructor confirmed reading");
  $("[data-action='term'][data-index='0']").click();
  assert.equal(env.utterances.at(-1), "instructor confirmed reading");
  $("[data-action='approve'][data-index='0']").click();
  $("#hs-ai-save").click(); await flush();
  assert.equal(env.rows.get("chem113").length, 1);
  assert.equal(env.rows.get("chem113")[0].text, "Tomović");
  assert.equal(env.rows.get("chem113")[0].substitution, "instructor confirmed reading");
  env.mounted.destroy();
});

test("an existing generic name-review draft gains editing controls without calling ASU again", async () => {
  const env = await setup();
  env.mounted.destroy();
  env.storage.setItem("hearsay-ai-review-v1:https://test.supabase.co:chem113", JSON.stringify({
    source: "through Tomović’s bloodstream", base: [], cursor: 0,
    suggestions: [{ term: "Tomović", spoken: "", reason: "Confirm intended pronunciation.",
      evidence: "through Tomović’s bloodstream", action: "review", decision: "later" }],
  }));
  const backend = globalThis.fetch; let scans = 0;
  globalThis.fetch = (url, options) => { if (url === "/api/createai/analyze") scans++; return backend(url, options); };
  env.mounted = await mountDictionaryEditor(env.root);
  assert.ok(env.$("[data-spoken='0']"));
  assert.equal(env.$("[data-spoken='0']").value, "");
  assert.match(env.$("#hs-ai-progress").textContent, /1 for later/);
  assert.ok(env.$("[data-action='approve'][data-index='0']"));
  assert.equal(scans, 0);
  env.mounted.destroy();
});

test("normal scans preserve saved readings and scientific values require an explicit exact-text choice", async () => {
  const text = "Use ΔH° at 5.00 × 10⁻³ M.";
  const reading = "five point zero zero times ten to the power of negative three";
  const env = await setup([
    { term: "ΔH°", spoken: "delta H naught", evidence: text, reason: "Chemistry-specific reading.", action: "dictionary" },
    { term: "5.00 × 10⁻³", spoken: reading, evidence: text, reason: "Scientific notation.", action: "dictionary", review_kind: "pronunciation" },
    { term: "M", spoken: "molar", evidence: text, reason: "Concentration unit.", action: "dictionary", review_kind: "pronunciation" },
  ]);
  const { $, edit } = env;
  env.rows.set("chem113", [
    { class_slug: "chem113", text: "ΔH°", substitution: "delta H standard", ignore_case: "Yes" },
    { class_slug: "chem113", text: "M", substitution: "moh lurr", ignore_case: "No" },
  ]);
  await env.mounted.pullWorkspace();
  edit("#hs-ai-source", text); $("#hs-ai-analyze").click(); await flush();
  assert.equal($("[data-spoken='0']").value, "delta H standard");
  assert.equal($("[data-case='0']").value, "Yes");
  assert.equal($("[data-action='approve'][data-index='0']").disabled, true);
  assert.equal($("[data-existing='0']").hidden, true);
  assert.match($("#hs-ai-progress").textContent, /2 already covered/);
  assert.equal($("[data-spoken='1']").value, reading);
  $("[data-action='term'][data-index='1']").click();
  assert.equal(env.utterances.at(-1), reading);
  $("[data-action='approve'][data-index='1']").click();
  assert.match($("#hs-ai-status").textContent, /Choose Add a class dictionary entry/);
  assert.match($("#hs-ai-progress").textContent, /0 approved/);
  assert.equal($("[data-spoken='2']").value, "moh lurr");
  assert.equal($("[data-action='approve'][data-index='2']").disabled, true);
  assert.equal(env.rows.get("chem113")[0].substitution, "delta H standard");
  env.mounted.destroy();
});

test("scientific notation can be edited, approved and saved as a chosen exact expression", async () => {
  const text = "R is the gas constant, 8.314 × 10⁻³ kJ/(mol·K).";
  const term = "8.314 × 10⁻³", reading = "eight point three one four times ten to the power of negative three";
  const env = await setup([{ term, spoken: reading, evidence: text, reason: "Complete scientific notation value.", action: "review", review_kind: "structure" }]);
  const { $, edit } = env;
  edit("#hs-ai-source", text); $("#hs-ai-analyze").click(); await flush();
  edit("[data-spoken='0']", "eight point three one four times ten to the negative third power");
  $("[data-exact-text='0']").checked = true; $("[data-exact-text='0']").dispatchEvent(new Event("change", { bubbles: true }));
  $("[data-action='approve'][data-index='0']").click();
  assert.match($("#hs-ai-progress").textContent, /1 approved/);
  edit("[data-spoken='0']", reading);
  assert.match($("#hs-ai-progress").textContent, /0 approved/);
  $("[data-action='approve'][data-index='0']").click();
  assert.equal(env.rows.get("chem113").length, 0);
  env.mounted.destroy(); env.mounted = await mountDictionaryEditor(env.root);
  assert.equal($("[data-spoken='0']").value, reading);
  assert.equal($("[data-exact-text='0']").hasAttribute("checked"), true);
  assert.match($("#hs-ai-progress").textContent, /1 approved/);
  $("#hs-ai-save").click(); await flush();
  assert.equal(env.rows.get("chem113").length, 1);
  assert.equal(env.rows.get("chem113")[0].text, term);
  assert.equal(env.rows.get("chem113")[0].substitution, reading);
  assert.equal($("#hs-ai-source").value, text);
  assert.match($("#hs-ai-progress").textContent, /1 saved/);
  env.mounted.destroy();
});

test("older scientific review drafts gain controls without another analysis or auto approval", async () => {
  const env = await setup();
  const text = "Use 8.314 × 10⁻³.";
  env.mounted.destroy();
  const fixture = { source: text, analyzedSource: text, suggestions: [{ term: "8.314 × 10⁻³", spoken: "eight point three one four times ten to negative three", evidence: text, reason: "Scientific notation.", action: "review", review_kind: "structure", decision: "approved" }] };
  env.storage.setItem("hearsay-ai-review-v1:https://test.supabase.co:chem113", JSON.stringify(fixture));
  const backend = globalThis.fetch; let scans = 0;
  globalThis.fetch = (url, options) => { if (url === "/api/createai/analyze") scans++; return backend(url, options); };
  env.mounted = await mountDictionaryEditor(env.root);
  assert.ok(env.$("[data-spoken='0']"));
  assert.equal(env.$("[data-exact-text='0']").hasAttribute("checked"), false);
  assert.match(env.$("#hs-ai-progress").textContent, /0 approved/);
  assert.equal(scans, 0);
  env.mounted.destroy();
});

test("reusable power entry covers different coefficients after saving and keeps units separate", async () => {
  const text = "Use 8.314 × 10⁻³ and 5.00 × 10⁻³ M.";
  const env = await setup([{ term: "8.314 × 10⁻³", spoken: "eight point three one four times ten to negative three", evidence: text, reason: "Scientific notation.", action: "review", review_kind: "structure" }]);
  const { $, edit } = env;
  edit("#hs-ai-source", text); $("#hs-ai-analyze").click(); await flush();
  $("[data-action='reuse-power'][data-index='0']").click();
  assert.match($("#hs-ai-term-0").textContent, /^× 10⁻³/);
  assert.equal($("[data-exact-text='0']"), null);
  edit("[data-spoken='0']", "times ten to the power of negative three");
  $("[data-action='approve'][data-index='0']").click(); $("#hs-ai-save").click(); await flush();
  assert.equal(env.rows.get("chem113").length, 1);
  assert.equal(env.rows.get("chem113")[0].text, "× 10⁻³");
  env.mounted.destroy();
  const lab = await mountScreenReaderLab(env.root, { context: "extension" });
  const input = $("#review-input"); input.value = text; input.dispatchEvent(new Event("input"));
  assert.equal(($("#review-revised").textContent.match(/times ten to the power of negative three/g) || []).length, 2);
  assert.equal(input.value, text);
  lab.destroy();
});

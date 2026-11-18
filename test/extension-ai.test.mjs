import test from "node:test";
import assert from "node:assert/strict";
import { setupDom, flush } from "./helpers/review-dom.mjs";
import { mountExtensionShell } from "../src/extension-shell.js";
import { mountDictionaryEditor } from "../src/dictionary-editor.js";
import { localRequestAllowed } from "../tools/local-request.mjs";
import { loadSupabaseConfigFromBrowser } from "../src/supabase/dictionary-api.js";
import { isSupabaseConnected } from "../src/supabase/connect-guard.js";

const id = "abcdefghijklmnopabcdefghijklmnop";
const helper = "http://127.0.0.1:8123";
const source = "Measure 5 mL.";
const suggestion = { term: "mL", spoken: "milliliters", evidence: source, reason: "Unit abbreviation.", action: "dictionary" };

test("local helper accepts only exact authorized extension IDs and loopback hosts", async () => {
  const req = origin => ({ headers: { host: "127.0.0.1:8123", origin } });
  assert.equal(await localRequestAllowed(req(`chrome-extension://${id}`), 8123, async () => [id]), true);
  assert.equal(await localRequestAllowed(req(`chrome-extension://${id}`), 8123, async () => []), false);
  assert.equal(await localRequestAllowed(req(`chrome-extension://${id}/page.html`), 8123, async () => [id]), false);
  assert.equal(await localRequestAllowed(req("https://other.example"), 8123, async () => [id]), false);
  assert.equal(await localRequestAllowed({ headers: { host: "other.example:8123", origin: `chrome-extension://${id}` } }, 8123, async () => [id]), false);
  assert.equal(await localRequestAllowed(req("http://127.0.0.1:8123"), 8123, async () => { throw new Error(); }), true);
});

test("extension reuses the local public connection fields and remembers them", async () => {
  setupDom(); globalThis.location.protocol = "chrome-extension:";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `${helper}/api/supabase/config`); assert.equal(options.method, "POST");
    return Response.json({ url: "https://test.supabase.co", anonKey: "public-fixture" });
  };
  const config = await loadSupabaseConfigFromBrowser();
  assert.equal(config.anonKey, "public-fixture"); assert.equal(isSupabaseConnected(), true);
  globalThis.fetch = () => { throw new Error("Should not reconnect"); };
  await loadSupabaseConfigFromBrowser();
});

test("side panel shares source, approvals and batch save across workspace views", async () => {
  const env = setupDom({ connected: true });
  globalThis.location.protocol = "chrome-extension:";
  globalThis.chrome = { runtime: { id } };
  const backend = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => {
    if (url === `${helper}/api/createai/status`) return Response.json({ available: true });
    if (url === `${helper}/api/createai/analyze`) { calls.push(JSON.parse(options.body)); return Response.json({ suggestions: [suggestion] }); }
    return backend(url, options);
  };
  const mounted = await mountExtensionShell(env.root);
  await flush();
  const $ = selector => env.root.querySelector(selector);
  $("#hs-ai-source").value = source; $("#hs-ai-source").dispatchEvent(new Event("input"));
  assert.equal($("#hs-ai-assistant").hidden, false);
  assert.equal($("#hs-dict-ed-cloud").textContent, "Connection settings");
  assert.equal($("#hs-ai-use-lab").hidden, true);
  $("#hs-ai-analyze").click(); await flush();
  $("[data-action='approve']").click();
  assert.equal(env.rows.get("chem113").length, 0);
  $("#hs-workspace-dictionary-tab").click(); await flush();
  assert.equal($("#hs-ai-source").value, source);
  $("#hs-workspace-review-tab").click(); await flush();
  assert.match($("#hs-ai-progress").textContent, /1 approved/);
  $("#hs-dict-ed-save").click(); await flush();
  assert.equal(env.rows.get("chem113")[0].substitution, "milliliters");
  assert.equal($("#hs-workspace-review-tab").getAttribute("aria-selected"), "true");
  assert.equal($("#hs-ai-source").value, source);
  assert.deepEqual(calls, [{ text: source, existingRows: [], suggestAlternatives: false }]);
  mounted.destroy(); delete globalThis.chrome;
});

test("extension shows helper setup instead of silently hiding AI while normal editing remains available", async () => {
  const env = setupDom({ connected: true }); globalThis.location.protocol = "chrome-extension:";
  const backend = globalThis.fetch;
  globalThis.fetch = (url, options) => url === `${helper}/api/createai/status` ? Promise.resolve(new Response(null, { status: 403 })) : backend(url, options);
  const mounted = await mountDictionaryEditor(env.root, { context: "extension" }); await flush();
  assert.equal(env.root.querySelector("#hs-ai-assistant").hidden, false);
  assert.match(env.root.querySelector("#hs-ai-helper-status").textContent, /not authorized/);
  assert.equal(env.root.querySelector("#hs-ai-analyze").disabled, true);
  assert.equal(env.root.querySelector("#hs-dict-ed-add").disabled, false);
  mounted.destroy();
});

import test from "node:test";
import assert from "node:assert/strict";
import { setupDom, flush } from "./helpers/review-dom.mjs";
import { loadSupabaseConfigFromBrowser, getStoredSupabaseConfig } from "../src/supabase/dictionary-api.js";
import { isSupabaseConnected } from "../src/supabase/connect-guard.js";
import { openCloudSettingsModal } from "../src/supabase/cloud-settings.js";
import { browserSupabaseConfig } from "../tools/supabase-browser-config.mjs";
import { mountDictionaryEditor } from "../src/dictionary-editor.js";

test("saved connection is reused on Dictionary and Lab without fetching configuration again", async () => {
  setupDom({ connected: true });
  globalThis.fetch = () => { throw new Error("Unexpected configuration fetch"); };
  for (const pathname of ["/dictionary/", "/lab/", "/"]) {
    globalThis.location.pathname = pathname;
    const config = await loadSupabaseConfigFromBrowser();
    assert.equal(config.url, "https://test.supabase.co");
    assert.equal(isSupabaseConnected(), true);
  }
});

test("local startup loads browser-safe config once and remembers it for the next page", async () => {
  setupDom(); globalThis.location.hostname = "localhost";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([url, options.method]);
    return Response.json({ url: "https://test.supabase.co", anonKey: "fixture-public-key", courseId: "chem113" });
  };
  await loadSupabaseConfigFromBrowser();
  assert.deepEqual(calls, [["/api/supabase/config", "POST"]]);
  assert.equal(getStoredSupabaseConfig().anonKey, "fixture-public-key");
  assert.equal(isSupabaseConnected(), true);
  await loadSupabaseConfigFromBrowser(); assert.equal(calls.length, 1);
});

test("deployed configuration path is independent of the active page", async () => {
  setupDom(); globalThis.location.pathname = "/Hearsay/dictionary/";
  let configPath;
  globalThis.fetch = async url => { configPath = String(url); return Response.json({ url: "https://test.supabase.co", anonKey: "fixture-public-key" }); };
  await loadSupabaseConfigFromBrowser();
  assert.match(configPath, /\/supabase\/config\.public\.json$/);
  assert.ok(!configPath.includes("dictionary/supabase"));
  assert.equal(isSupabaseConnected(), true);
});

test("local browser configuration never includes server credentials", () => {
  const config = browserSupabaseConfig({ url: "https://test.supabase.co/", anonKey: "public", serviceRoleKey: "private", serviceToken: "private", courseId: "chem113" });
  assert.deepEqual(config, { url: "https://test.supabase.co", anonKey: "public", courseId: "chem113" });
  assert.equal(browserSupabaseConfig({ url: "https://test.supabase.co", serviceRoleKey: "private" }), null);
});

test("saved settings show Done without forcing a reconnect or reload", async () => {
  const env = setupDom({ connected: true }); let saves = 0;
  const mounted = await mountDictionaryEditor(env.root);
  assert.equal(env.root.querySelector("#hs-dict-ed-cloud").textContent, "Connection settings");
  openCloudSettingsModal({ url: "https://test.supabase.co", anonKey: "fixture", onSave: () => saves++ });
  const modal = env.window.document.querySelector(".ss-cloud-modal");
  assert.match(modal.textContent, /already saved/);
  assert.equal(modal.querySelector("#ss-cloud-save").textContent, "Done");
  assert.equal(modal.querySelector("details").hasAttribute("open"), false);
  modal.querySelector("#ss-cloud-save").click(); await flush();
  assert.equal(saves, 0);
  assert.equal(env.window.document.querySelector(".ss-cloud-modal"), null);
  mounted.destroy();
});

test("connection persistence errors are displayed rather than closing the dialog", async () => {
  const env = setupDom();
  openCloudSettingsModal({ onSave: () => { throw new Error("Storage blocked"); } });
  const doc = env.window.document;
  doc.querySelector("#ss-cloud-url").value = "https://test.supabase.co";
  doc.querySelector("#ss-cloud-key").value = "fixture";
  doc.querySelector("#ss-cloud-save").click(); await flush();
  assert.match(doc.querySelector("#ss-cloud-error").textContent, /allows site storage/);
  assert.ok(doc.querySelector(".ss-cloud-modal"));
});

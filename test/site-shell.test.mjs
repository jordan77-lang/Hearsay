// Shell-level UX contracts that are easy to regress and hard to notice:
// the extension's identity in Chrome, and reaching Connect from every page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

test("extension manifest declares icons at every size Chrome uses", () => {
  const manifest = JSON.parse(read("manifest.json"));
  // Without these Chrome shows a generic puzzle piece, and "pin HearSay from
  // the puzzle icon" becomes guesswork among identical placeholders.
  for (const size of ["16", "32", "48", "128"]) {
    assert.ok(manifest.icons?.[size], `icons.${size} missing`);
    assert.ok(manifest.action?.default_icon?.[size], `action.default_icon.${size} missing`);
  }
});

test("every file the manifest references exists", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const refs = [
    manifest.background.service_worker,
    manifest.side_panel.default_path,
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
  ];
  for (const ref of refs) {
    assert.ok(existsSync(join(ROOT, ref)), `manifest references missing file: ${ref}`);
  }
});

test("icon files are real PNGs", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const path of Object.values(manifest.icons ?? {})) {
    const head = readFileSync(join(ROOT, path)).subarray(0, 8);
    assert.ok(head.equals(PNG_MAGIC), `${path} is not a PNG`);
  }
});

test("site nav exposes Connect as an actionable control", () => {
  const nav = read("src/site-nav.js");
  // MathSay and the landing page consume the class dictionary but have no
  // cloud panel of their own, so the nav is the only route to Connect.
  assert.match(nav, /<button type="button" class="hs-site-nav-status/);
  assert.match(nav, /id="hs-site-nav-connect"/);
  assert.match(nav, /addEventListener\("click"/);
  assert.match(nav, /cloud-settings\.js/);
});

test("nav status distinguishes connected from disconnected", () => {
  const nav = read("src/site-nav.js");
  assert.match(nav, /☁ Connect/);
  assert.match(nav, /is-connected/);
  const css = read("src/ui.css");
  assert.match(css, /button\.hs-site-nav-status:focus-visible/);
  assert.match(css, /button\.hs-site-nav-status:not\(\.is-connected\)/);
});

test("cloud settings modal closes on Escape like every other modal", () => {
  const modal = read("src/supabase/cloud-settings.js");
  assert.match(modal, /e\.key === "Escape"/);
});

test("MathSay says plainly when it is not using the author's class", () => {
  const mathsay = read("src/mathsay.js");
  // "495 rules (bundled demo)" read as a working state; authors previewed the
  // wrong pronunciations without realising.
  assert.match(mathsay, /sample chemistry dictionary/);
  assert.match(mathsay, /Connect/);
});

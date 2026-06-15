// Shared top navigation for HearSay pages (landing, lab, dictionary).

import {
  getStoredCourseId,
} from "./supabase/dictionary-remote.js";
import { isSupabaseConnected } from "./supabase/connect-guard.js";
import { onSupabaseConnectionChanged } from "./dictionary-sync.js";
import { mountThemeToggle, initTheme } from "./theme.js";
import { SHOW_CANVAS_TRANSLATE, SHOW_MATHSAY } from "./site-config.js";

/**
 * @param {HTMLElement} container
 * @param {{ active?: 'home'|'playground'|'mathsay'|'dictionary'|'lab', base?: string }} opts
 *   base — path prefix to site root (e.g. ".." from /lab/)
 */
export function mountSiteNav(container, { active = "", base = "" } = {}) {
  if (!container) return;
  initTheme();
  const root = base ? `${base.replace(/\/$/, "")}/` : "./";
  const dictionary = `${root}dictionary/`;
  const lab = `${root}lab/`;
  const canvasTranslateLink = SHOW_CANVAS_TRANSLATE
    ? `<a role="listitem" class="hs-site-nav-link${active === "playground" ? " is-active" : ""}" href="${root}playground/">Canvas Translate</a>`
    : "";
  const mathsayLink = SHOW_MATHSAY
    ? `<a role="listitem" class="hs-site-nav-link${active === "mathsay" ? " is-active" : ""}" href="${root}mathsay/">MathSay</a>`
    : "";

  function statusText() {
    const connected = isSupabaseConnected();
    const course = getStoredCourseId();
    return connected
      ? `Connected${course ? ` · ${course}` : ""}`
      : "Not connected";
  }

  container.innerHTML = `
    <nav class="hs-site-nav" aria-label="HearSay">
      <div class="hs-site-nav-inner">
        <a class="hs-site-nav-brand" href="${root}">HearSay</a>
        <div class="hs-site-nav-links" role="list">
          ${mathsayLink}
          ${canvasTranslateLink}
          <a role="listitem" class="hs-site-nav-link${active === "lab" ? " is-active" : ""}" href="${lab}">Screen Reader Lab</a>
          <a role="listitem" class="hs-site-nav-link${active === "dictionary" ? " is-active" : ""}" href="${dictionary}">Dictionary</a>
        </div>
        <div class="hs-site-nav-end">
          <span class="hs-site-nav-status ss-type" title="Supabase connection">${escapeHtml(statusText())}</span>
          <span class="hs-theme-toggle-mount"></span>
        </div>
      </div>
    </nav>`;

  const themeMount = container.querySelector(".hs-theme-toggle-mount");
  if (themeMount) mountThemeToggle(themeMount);

  if (container._hsNavConnectionUnsub) container._hsNavConnectionUnsub();
  container._hsNavConnectionUnsub = onSupabaseConnectionChanged(() => {
    const statusEl = container.querySelector(".hs-site-nav-status");
    if (statusEl) statusEl.textContent = statusText();
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

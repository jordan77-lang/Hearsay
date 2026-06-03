// Shared top navigation for HearSay pages (landing, playground, dictionary).

import {
  getStoredSupabaseConfig,
  getStoredCourseId,
} from "./supabase/dictionary-remote.js";

/**
 * @param {HTMLElement} container
 * @param {{ active?: 'home'|'playground'|'dictionary', base?: string }} opts
 *   base — path prefix to site root (e.g. ".." from /playground/)
 */
export function mountSiteNav(container, { active = "", base = "" } = {}) {
  const root = base ? `${base.replace(/\/$/, "")}/` : "./";
  const playground = `${root}playground/`;
  const dictionary = `${root}dictionary/`;

  const connected = Boolean(getStoredSupabaseConfig());
  const course = getStoredCourseId();
  const status = connected
    ? `Connected${course ? ` · ${course}` : ""}`
    : "Not connected";

  container.innerHTML = `
    <nav class="hs-site-nav" aria-label="HearSay">
      <div class="hs-site-nav-inner">
        <a class="hs-site-nav-brand" href="${root}">HearSay</a>
        <div class="hs-site-nav-links" role="list">
          <a role="listitem" class="hs-site-nav-link${active === "playground" ? " is-active" : ""}" href="${playground}">Canvas Translate</a>
          <a role="listitem" class="hs-site-nav-link${active === "dictionary" ? " is-active" : ""}" href="${dictionary}">Dictionary</a>
        </div>
        <span class="hs-site-nav-status ss-type" title="Supabase connection">${escapeHtml(status)}</span>
      </div>
    </nav>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

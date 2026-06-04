// HearSay Chrome extension side panel: Screen Reader Lab + Dictionary.

import { mountThemeToggle, initTheme } from "./theme.js";
import {
  getStoredCourseId,
  DEMO_DICTIONARY_LABEL,
  isDemoDictionaryId,
} from "./supabase/dictionary-remote.js";
import { isSupabaseConnected } from "./supabase/connect-guard.js";
import { mountScreenReaderLab } from "./screen-reader-lab.js";
import { mountDictionaryEditor } from "./dictionary-editor.js";
import { notifyDictionaryUpdated, onSupabaseConnectionChanged } from "./dictionary-sync.js";

const VIEW_KEY = "hearsay-ext-view";

/** Reload in-memory dictionary when Dictionary saves (Lab tab may be unmounted). */
let labDictionaryReload = null;
let teardownView = null;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function navStatusHtml() {
  const connected = isSupabaseConnected();
  const course = getStoredCourseId();
  const courseLabel = isDemoDictionaryId(course) ? "demo" : course;
  return connected
    ? `Connected${courseLabel ? ` · ${courseLabel}` : ""}`
    : courseLabel && isDemoDictionaryId(course)
      ? DEMO_DICTIONARY_LABEL.replace(/ \(.*\)$/, "")
      : "Not connected";
}

/**
 * @param {HTMLElement} root
 */
export async function mountExtensionShell(root) {
  initTheme();
  let activeView = "lab";
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "lab" || saved === "dictionary") activeView = saved;
  } catch (_) {}

  root.innerHTML = `
    <div class="hs-ext-shell">
      <nav class="hs-ext-shell-nav" aria-label="HearSay extension">
        <div class="hs-ext-shell-nav-inner">
          <span class="hs-ext-shell-brand">HearSay</span>
          <div class="hs-ext-shell-tabs" role="tablist">
            <button type="button" role="tab" class="hs-ext-shell-tab" data-view="lab" aria-selected="false" id="hs-ext-tab-lab">Screen Reader Lab</button>
            <button type="button" role="tab" class="hs-ext-shell-tab" data-view="dictionary" aria-selected="false" id="hs-ext-tab-dict">Dictionary</button>
          </div>
          <div class="hs-ext-shell-nav-end">
            <span class="hs-site-nav-status ss-type" id="hs-ext-nav-status" title="Supabase">${escapeHtml(navStatusHtml())}</span>
            <span class="hs-theme-toggle-mount"></span>
          </div>
        </div>
      </nav>
      <div id="hs-ext-view" class="hs-ext-view" role="tabpanel"></div>
    </div>`;

  const themeMount = root.querySelector(".hs-theme-toggle-mount");
  if (themeMount) mountThemeToggle(themeMount);

  const viewRoot = root.querySelector("#hs-ext-view");
  const statusEl = root.querySelector("#hs-ext-nav-status");

  function refreshStatus() {
    if (statusEl) statusEl.textContent = navStatusHtml();
  }

  function setActiveTab(view) {
    root.querySelectorAll(".hs-ext-shell-tab").forEach((btn) => {
      const on = btn.dataset.view === view;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  async function showView(view) {
    activeView = view;
    teardownView?.();
    teardownView = null;
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch (_) {}
    setActiveTab(view);
    viewRoot.innerHTML = "";
    refreshStatus();

    if (view === "dictionary") {
      const mounted = await mountDictionaryEditor(viewRoot, {
        context: "extension",
        onNavigate: showView,
        onDictionarySaved: ({ classSlug }) => {
          notifyDictionaryUpdated({ classSlug });
          labDictionaryReload?.(classSlug);
          refreshStatus();
        },
      });
      teardownView = mounted?.destroy;
    } else {
      const mounted = await mountScreenReaderLab(viewRoot, {
        context: "extension",
        onNavigate: showView,
        registerDictionaryReload: (fn) => {
          labDictionaryReload = fn;
          return () => {
            if (labDictionaryReload === fn) labDictionaryReload = null;
          };
        },
      });
      teardownView = mounted?.destroy;
    }
    refreshStatus();

    viewRoot.querySelectorAll("[data-hs-ext-nav]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const next = el.getAttribute("data-hs-ext-nav");
        if (next === "lab" || next === "dictionary") showView(next);
      });
    });
  }

  root.querySelectorAll(".hs-ext-shell-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      if (view === "lab" || view === "dictionary") showView(view);
    });
  });

  await showView(activeView);
  onSupabaseConnectionChanged(refreshStatus);
}

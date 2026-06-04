// Light / dark theme toggle (persists in localStorage).

const STORAGE_KEY = "hearsay-theme";

/** @returns {"light" | "dark"} */
export function getTheme() {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" ? "light" : "dark";
}

/** @param {"light" | "dark"} theme */
export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (_) {}
  syncThemeToggleButtons();
}

export function toggleTheme() {
  applyTheme(getTheme() === "dark" ? "light" : "dark");
}

function syncThemeToggleButtons() {
  const theme = getTheme();
  const next = theme === "dark" ? "light" : "dark";
  const label = next === "light" ? "Switch to light mode" : "Switch to dark mode";
  document.querySelectorAll("[data-hs-theme-toggle]").forEach((btn) => {
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  });
}

/**
 * @param {HTMLElement} container
 */
export function mountThemeToggle(container) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "hs-theme-toggle";
  btn.setAttribute("data-hs-theme-toggle", "");
  btn.innerHTML =
    '<span class="hs-theme-toggle-icons" aria-hidden="true">' +
    '<span class="hs-theme-icon hs-theme-icon-sun">☀</span>' +
    '<span class="hs-theme-icon hs-theme-icon-moon">☾</span>' +
    "</span>";
  btn.addEventListener("click", toggleTheme);
  container.appendChild(btn);
  syncThemeToggleButtons();
}

export function initTheme() {
  syncThemeToggleButtons();
}

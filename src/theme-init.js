/**
 * Blocking theme bootstrap — include in <head> before ui.css to avoid flash.
 * Sets data-theme on <html> from localStorage or prefers-color-scheme.
 */
(function () {
  try {
    var stored = localStorage.getItem("hearsay-theme");
    var theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();

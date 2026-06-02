// Small “?” help buttons with click-to-open popovers (event delegation on root).

let tipCounter = 0;

/** Inline help button + hidden popover. `body` may contain simple HTML (<b>, <code>, lists). */
export function helpTip(body) {
  const id = `ss-help-${++tipCounter}`;
  return `<span class="ss-help-wrap">
    <button type="button" class="ss-help-btn" aria-expanded="false" aria-controls="${id}" aria-label="Help">?</button>
    <div id="${id}" class="ss-help-panel hidden" role="region">${body}</div>
  </span>`;
}

/** Wire help buttons inside `root` (safe to call once; works after innerHTML remounts). */
export function bindHelpTips(root) {
  if (root.dataset.helpBound) return;
  root.dataset.helpBound = "1";

  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".ss-help-btn");
    if (btn) {
      e.stopPropagation();
      const panel = root.querySelector(`#${CSS.escape(btn.getAttribute("aria-controls") ?? "")}`);
      if (!panel) return;
      const opening = panel.classList.contains("hidden");
      closeAllHelpPanels(root);
      if (opening) {
        panel.classList.remove("hidden");
        btn.setAttribute("aria-expanded", "true");
      }
      return;
    }
    if (!e.target.closest(".ss-help-panel")) closeAllHelpPanels(root);
  });

  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllHelpPanels(root);
  });
}

function closeAllHelpPanels(root) {
  root.querySelectorAll(".ss-help-panel:not(.hidden)").forEach((panel) => {
    panel.classList.add("hidden");
    const id = panel.id;
    root.querySelector(`[aria-controls="${id}"]`)?.setAttribute("aria-expanded", "false");
  });
}

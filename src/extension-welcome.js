// Welcome tab (classic script — chrome.* APIs available on extension pages).

(function () {
  function closeWelcomeTab() {
    chrome.tabs.getCurrent((tab) => {
      if (tab?.id) {
        chrome.tabs.remove(tab.id);
      } else {
        window.close();
      }
    });
  }

  document.getElementById("hs-ext-close")?.addEventListener("click", closeWelcomeTab);

  document.getElementById("hs-ext-open-panel")?.addEventListener("click", () => {
    chrome.windows.getLastFocused((win) => {
      if (win?.id != null) {
        chrome.sidePanel.open({ windowId: win.id }, () => {
          closeWelcomeTab();
        });
      } else {
        closeWelcomeTab();
      }
    });
  });
})();

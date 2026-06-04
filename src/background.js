// HearSay MV3 service worker — side panel + first-run welcome.

const WELCOME_PATH = "src/extension-welcome.html";

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("HearSay: failed to set panel behavior", err));

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PATH) }).catch(() => {});
  }
});

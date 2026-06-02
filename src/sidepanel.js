import { mountApp } from "./ui.js";
import { normalizePastedContent } from "./core/paste-normalize.js";
import {
  tryLoadRemoteDictionary,
  loadSupabaseConfig,
  getStoredCourseId,
} from "./supabase/dictionary-remote.js";

const config = await loadSupabaseConfig();
const sync = await tryLoadRemoteDictionary(config, getStoredCourseId());
const app = mountApp(document.getElementById("app"), { dictionarySync: sync, supabaseConfig: config });
// Pull the current text selection (or visible body text) from the active tab.
document.getElementById("ss-scan").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const sel = window.getSelection()?.toString();
        return (sel && sel.trim()) || document.body?.innerText?.slice(0, 5000) || "";
      },
    });
    if (result) {
      const input = document.getElementById("ss-input");
      input.value = normalizePastedContent(result);
      app.run();
    }
  } catch (err) {
    console.error("HearSay: scan failed", err);
  }
});

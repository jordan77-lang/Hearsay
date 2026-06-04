import {
  scrapePageTextInPage,
  pickBestScrapeResult,
  canPullFromTabUrl,
  pullSourceLabel,
} from "./page-scrape.js";
import { resolvePullTargetTab } from "./resolve-pull-tab.js";

export { pullSourceLabel };

/**
 * Pull text from the best target tab in the focused window (all frames).
 * @param {typeof chrome} chromeApi
 * @returns {Promise<{ ok: true, text: string, source: string, tabUrl?: string } | { ok: false, error: string }>}
 */
export async function pullTextFromActiveTab(chromeApi = chrome) {
  const tab = await resolvePullTargetTab(chromeApi);
  if (!tab?.id) {
    return {
      ok: false,
      error:
        "No course page found. Click the tab with your course content first, select text or focus an editor, then Pull again.",
    };
  }

  const urlCheck = canPullFromTabUrl(tab.url);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.reason };

  try {
    const results = await chromeApi.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: scrapePageTextInPage,
    });
    const picked = pickBestScrapeResult(results);
    if (!picked?.text) {
      return {
        ok: false,
        error:
          "Nothing to pull on that tab. Select text, click inside the quiz editor, or focus a text field — then try again.",
      };
    }
    return {
      ok: true,
      text: picked.text,
      source: picked.source,
      tabUrl: tab.url,
    };
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (/cannot access|Cannot access|not have permission|extensions gallery/i.test(msg)) {
      return {
        ok: false,
        error:
          "Chrome blocked scripting on that tab. Reload the page, click it once, then Pull again. If it persists, reload the extension at chrome://extensions.",
      };
    }
    if (/No tab with id|Receiving end does not exist/i.test(msg)) {
      return { ok: false, error: "That tab closed or changed. Refocus your course page and try again." };
    }
    return { ok: false, error: `Pull failed: ${msg}` };
  }
}

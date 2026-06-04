import { canPullFromTabUrl } from "./page-scrape.js";

/**
 * Find a page tab to read (not the extension welcome tab or chrome:// pages).
 * @param {typeof chrome} chromeApi
 * @returns {Promise<chrome.tabs.Tab | null>}
 */
export async function resolvePullTargetTab(chromeApi = chrome) {
  const win = await chromeApi.windows.getLastFocused({ populate: true });
  const windowId = win?.id;
  if (windowId == null) return null;

  const tabs = await chromeApi.tabs.query({ windowId });
  const active = tabs.find((t) => t.active);
  if (active?.id && canPullFromTabUrl(active.url).ok) return active;

  const pullable = tabs.filter((t) => t.id && canPullFromTabUrl(t.url).ok);
  if (!pullable.length) return null;

  pullable.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  return pullable[0];
}

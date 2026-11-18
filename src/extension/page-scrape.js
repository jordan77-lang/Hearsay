// Page text extraction for chrome.scripting.executeScript (must stay self-contained in
// scrapePageTextInPage — no imports inside that function).

/**
 * Runs inside the target page frame. Prefer selection, then focused field, then body (top frame only).
 * @returns {{ text: string, source: 'selection'|'focused'|'body' } | null}
 */
export function scrapePageTextInPage() {
  function capture(text, source, limit) {
    return { text: text.slice(0, limit), source, truncated: text.length > limit, totalLength: text.length };
  }
  const sel = window.getSelection?.()?.toString?.()?.trim?.();
  if (sel && sel.length > 0) {
    return capture(sel, "selection", 12000);
  }

  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement) {
    const v = el.value?.trim?.();
    if (v) return capture(v, "focused", 12000);
  }
  if (el && /** @type {HTMLElement} */ (el).isContentEditable) {
    const t = /** @type {HTMLElement} */ (el).innerText?.trim?.();
    if (t) return capture(t, "focused", 12000);
  }

  const editable = document.querySelector(
    '[contenteditable="true"]:focus, [role="textbox"]:focus, textarea:focus, input[type="text"]:focus',
  );
  if (editable) {
    const t =
      editable instanceof HTMLTextAreaElement || editable instanceof HTMLInputElement
        ? editable.value?.trim?.()
        : /** @type {HTMLElement} */ (editable).innerText?.trim?.();
    if (t) return capture(t, "focused", 12000);
  }

  if (window !== window.top) return null;

  const body = document.body?.innerText?.trim?.() ?? "";
  if (body.length > 40) {
    return capture(body, "body", 6000);
  }
  return null;
}

const SOURCE_PRIORITY = { selection: 0, focused: 1, body: 2 };

/**
 * @param {Array<{ result?: { text?: string, source?: string } | null }>} injectionResults
 * @returns {{ text: string, source: string } | null}
 */
export function pickBestScrapeResult(injectionResults) {
  const hits = (injectionResults ?? [])
    .map((r) => r?.result)
    .filter((r) => r && typeof r.text === "string" && r.text.trim().length > 0);

  if (!hits.length) return null;

  hits.sort((a, b) => {
    const pa = SOURCE_PRIORITY[a.source] ?? 9;
    const pb = SOURCE_PRIORITY[b.source] ?? 9;
    if (pa !== pb) return pa - pb;
    return b.text.length - a.text.length;
  });

  const best = hits[0];
  return { text: best.text, source: best.source, truncated: Boolean(best.truncated), totalLength: best.totalLength ?? best.text.length };
}

/** @param {string | undefined} tabUrl */
export function canPullFromTabUrl(tabUrl) {
  if (!tabUrl) return { ok: false, reason: "No active tab. Click the page you want to read, then try again." };
  const lower = tabUrl.toLowerCase();
  if (
    lower.startsWith("chrome://") ||
    lower.startsWith("chrome-extension://") ||
    lower.startsWith("edge://") ||
    lower.startsWith("https://chrome.google.com/webstore")
  ) {
    return { ok: false, reason: "Chrome and extension pages cannot be read. Open the course page you want to read first." };
  }
  if (lower.startsWith("file://")) {
    return { ok: false, reason: "Local files are blocked. Paste text manually, or host content on https://." };
  }
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
    return { ok: false, reason: "This page type is not supported. Open your course or LMS page in the browser." };
  }
  return { ok: true, reason: "" };
}

export function pullSourceLabel(source) {
  if (source === "paste") return "pasted text";
  if (source === "selection") return "selection";
  if (source === "focused") return "editor field";
  if (source === "body") return "page text";
  return "page";
}

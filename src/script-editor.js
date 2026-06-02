// Unicode sub/superscript helpers + modal for the main content editor.

import { insertAtCursor } from "./fraction-builder.js";

const TO_SUB = {
  "0": "\u2080",
  "1": "\u2081",
  "2": "\u2082",
  "3": "\u2083",
  "4": "\u2084",
  "5": "\u2085",
  "6": "\u2086",
  "7": "\u2087",
  "8": "\u2088",
  "9": "\u2089",
  "+": "\u208a",
  "-": "\u208b",
};

const TO_SUP = {
  "0": "\u2070",
  "1": "\u00b9",
  "2": "\u00b2",
  "3": "\u00b3",
  "4": "\u2074",
  "5": "\u2075",
  "6": "\u2076",
  "7": "\u2077",
  "8": "\u2078",
  "9": "\u2079",
  "+": "\u207a",
  "-": "\u207b",
};

/** Convert digits (and +/−) to unicode subscript characters. */
export function toUnicodeSubscript(text) {
  return String(text ?? "")
    .split("")
    .map((c) => TO_SUB[c] ?? c)
    .join("");
}

/** Convert digits (and +/−) to unicode superscript characters. */
export function toUnicodeSuperscript(text) {
  return String(text ?? "")
    .split("")
    .map((c) => TO_SUP[c] ?? c)
    .join("");
}

/** Build explicit markup the engine recognizes (not glued letters). */
export function buildScriptInsert(mode, base, scriptText) {
  const b = String(base ?? "").trim();
  const s = String(scriptText ?? "").trim();
  if (!b || !s) return "";

  if (mode === "sub") {
    if (/^[0-9+\-]+$/.test(s)) return `${b}${toUnicodeSubscript(s)}`;
    return `${b}_{${s}}`;
  }
  if (/^[0-9+\-]+$/.test(s)) return `${b}${toUnicodeSuperscript(s)}`;
  return `${b}^{${s}}`;
}

function readContext(textarea) {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const text = textarea.value;
  const selected = text.slice(start, end);
  const before = text.slice(Math.max(0, start - 1), start);

  let base = "";
  let scriptText = selected;
  let replaceStart = start;
  let replaceEnd = end;

  if (/^[A-Za-z\u0394]$/.test(selected) && selected.length === 1) {
    base = selected;
    scriptText = "";
  } else if (/^[A-Za-z\u0394]$/.test(before) && start === end) {
    base = before;
    scriptText = "";
    replaceStart = start - 1;
    replaceEnd = start;
  }
  // Multi-letter selections (e.g. "compare", "calorimeter") are subscript text only —
  // never split the first letter off as a base.

  return { base, scriptText, replaceStart, replaceEnd };
}

function previewInsert(mode, base, scriptText) {
  const built = buildScriptInsert(mode, base, scriptText);
  if (!built) return { built: "", note: "" };
  if (mode === "sub" && /_\{/.test(built)) {
    return { built, note: "Explicit subscript — renders as MathML in Canvas output" };
  }
  if (mode === "sub" && /[₀-₉]/.test(built)) {
    return { built, note: "Unicode subscript (e.g. T₂)" };
  }
  if (mode === "super" && /\^\{/.test(built)) {
    return { built, note: "Explicit superscript — renders as MathML in Canvas output" };
  }
  if (mode === "super" && /[⁰-⁹²³]/.test(built)) {
    return { built, note: "Unicode superscript (e.g. x²)" };
  }
  return { built, note: "" };
}

/**
 * @param {{ textarea: HTMLTextAreaElement, mode: 'sub' | 'super', onInsert?: () => void }} opts
 */
export function openScriptEditor({ textarea, mode, onInsert }) {
  const ctx = readContext(textarea);
  const isSub = mode === "sub";
  const title = isSub ? "Insert subscript" : "Insert superscript";
  const scriptLabel = isSub ? "Subscript text" : "Superscript text";

  const overlay = document.createElement("div");
  overlay.className = "ss-modal-overlay";
  overlay.innerHTML = `
    <div class="ss-modal ss-frac-modal" role="dialog" aria-modal="true" aria-labelledby="ss-script-title">
      <h2 id="ss-script-title" class="ss-title">${title}</h2>
      <p class="ss-sub ss-frac-hint">
        Sub/superscript from Google Docs usually pastes as plain text. Enter a base (optional for numbers-only)
        and the subscript or superscript text. HearSay marks it explicitly so words like “compare” are never split.
      </p>
      <label class="ss-frac-label" for="ss-script-base">Base (letter or symbol before the script)</label>
      <input id="ss-script-base" class="ss-input ss-frac-input" type="text" maxlength="2"
        placeholder="e.g. q, T, x" autocomplete="off" />
      <label class="ss-frac-label" for="ss-script-text">${scriptLabel}</label>
      <input id="ss-script-text" class="ss-input ss-frac-input" type="text" spellcheck="false"
        placeholder="${isSub ? "e.g. calorimeter, 2, H2O" : "e.g. 2, 3"}" autocomplete="off" />
      <p class="ss-frac-example">${isSub
        ? "Digits → unicode subscript (T + 2 → T₂). Words → q_{calorimeter}."
        : "Digits → unicode superscript (x + 2 → x²). Words → x^{n}."}</p>
      <div class="ss-frac-preview" id="ss-script-preview" aria-live="polite">
        <div class="ss-type">Preview</div>
        <div class="ss-frac-preview-code" id="ss-script-preview-text"></div>
        <div class="ss-type" id="ss-script-preview-note"></div>
      </div>
      <p class="ss-frac-error hidden" id="ss-script-error" role="alert"></p>
      <div class="ss-modal-actions">
        <button type="button" class="ss-btn" id="ss-script-cancel">Cancel</button>
        <button type="button" class="ss-btn primary" id="ss-script-insert">Insert</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const baseInput = overlay.querySelector("#ss-script-base");
  const scriptInput = overlay.querySelector("#ss-script-text");
  const previewText = overlay.querySelector("#ss-script-preview-text");
  const previewNote = overlay.querySelector("#ss-script-preview-note");
  const errorEl = overlay.querySelector("#ss-script-error");
  const replaceRange = { start: ctx.replaceStart, end: ctx.replaceEnd };

  baseInput.value = ctx.base;
  scriptInput.value = ctx.scriptText;

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.toggle("hidden", !msg);
  }

  function updatePreview() {
    const { built, note } = previewInsert(mode, baseInput.value, scriptInput.value);
    previewText.textContent = built ? `Inserts: ${built}` : "(enter base and script text)";
    previewNote.textContent = note;
    showError("");
  }

  function close() {
    document.removeEventListener("keydown", onDocKey);
    overlay.remove();
    textarea.focus();
  }

  function finish() {
    const built = buildScriptInsert(mode, baseInput.value, scriptInput.value);
    if (!baseInput.value.trim()) {
      showError("Enter a base letter (e.g. q or T).");
      baseInput.focus();
      return;
    }
    if (!scriptInput.value.trim()) {
      showError(`Enter ${scriptLabel.toLowerCase()}.`);
      scriptInput.focus();
      return;
    }
    if (!built) {
      showError("Could not build subscript/superscript.");
      return;
    }
    insertAtCursor(textarea, built, replaceRange);
    close();
    onInsert?.();
  }

  overlay.querySelector("#ss-script-cancel").addEventListener("click", close);
  overlay.querySelector("#ss-script-insert").addEventListener("click", finish);
  baseInput.addEventListener("input", updatePreview);
  scriptInput.addEventListener("input", updatePreview);
  scriptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish();
    }
    if (e.key === "Escape") close();
  });
  baseInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  function onDocKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onDocKey);

  updatePreview();
  (ctx.base ? scriptInput : baseInput).focus();

  return { close };
}

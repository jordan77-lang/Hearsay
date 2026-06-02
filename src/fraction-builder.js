// Guided fraction insert for pasted curriculum text → \frac{num}{den} LaTeX.

import { analyzeEquation } from "./core/transform.js";

/** Build LaTeX fraction syntax HearSay recognizes. */
export function formatFractionLatex(numerator, denominator) {
  const num = sanitizeFracPart(numerator);
  const den = sanitizeFracPart(denominator);
  if (!num || !den) return "";
  return `\\frac{${num}}{${den}}`;
}

/** Strip braces that would break \frac{..}{..} parsing. */
export function sanitizeFracPart(text) {
  return String(text ?? "")
    .trim()
    .replace(/[{}]/g, "");
}

/** If the user selected "14J/23g", split into numerator and denominator. */
export function parseSlashFraction(text) {
  const t = String(text ?? "").trim();
  if (!t || !t.includes("/")) return null;
  const m = t.match(/^([^/]+?)\s*\/\s*(.+)$/);
  if (!m) return null;
  const numerator = sanitizeFracPart(m[1]);
  const denominator = sanitizeFracPart(m[2]);
  if (!numerator || !denominator) return null;
  return { numerator, denominator };
}

/** Insert text at a saved cursor/selection range in a textarea. */
export function insertAtCursor(textarea, text, range) {
  const start = range?.start ?? textarea.selectionStart ?? textarea.value.length;
  const end = range?.end ?? textarea.selectionEnd ?? start;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  const pos = start + text.length;
  textarea.focus();
  textarea.setSelectionRange(pos, pos);
  return pos;
}

function fractionPreview(numerator, denominator) {
  const latex = formatFractionLatex(numerator, denominator);
  if (!latex) return { latex: "", spoken: "", mathml: "" };
  const { spoken, mathml } = analyzeEquation(latex);
  return { latex, spoken, mathml };
}

/**
 * Open a two-step wizard to build \frac{num}{den} at the textarea cursor.
 * @param {{ textarea: HTMLTextAreaElement, onInsert: () => void }} opts
 */
export function openFractionBuilder({ textarea, onInsert }) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const selected = textarea.value.slice(start, end);
  const parsed = parseSlashFraction(selected);

  const overlay = document.createElement("div");
  overlay.className = "ss-modal-overlay";
  overlay.innerHTML = `
    <div class="ss-modal ss-frac-modal" role="dialog" aria-modal="true" aria-labelledby="ss-frac-title">
      <h2 id="ss-frac-title" class="ss-title">Insert fraction</h2>
      <p class="ss-sub ss-frac-hint">
        Place your cursor where the fraction belongs, then enter the top and bottom.
        HearSay formats it for screen readers and Canvas.
      </p>
      <div class="ss-frac-steps" aria-hidden="true">
        <span class="ss-frac-step active" data-step="1">1. Numerator</span>
        <span class="ss-frac-step-arrow">\u2192</span>
        <span class="ss-frac-step" data-step="2">2. Denominator</span>
      </div>
      <div class="ss-frac-panel" data-panel="1">
        <label class="ss-frac-label" for="ss-frac-num">Numerator (number, units, or text)</label>
        <input id="ss-frac-num" class="ss-input ss-frac-input" type="text" spellcheck="false"
          placeholder="e.g. 14J, 286 kJ, \u0394H" autocomplete="off" />
        <p class="ss-frac-example">Examples: <code>14J</code>, <code>5.0 mL</code>, <code>286 kJ</code></p>
      </div>
      <div class="ss-frac-panel hidden" data-panel="2" hidden>
        <label class="ss-frac-label" for="ss-frac-den">Denominator (number, units, or text)</label>
        <input id="ss-frac-den" class="ss-input ss-frac-input" type="text" spellcheck="false"
          placeholder="e.g. 23g, mol, \u00b0C" autocomplete="off" />
        <p class="ss-frac-example">Examples: <code>23g</code>, <code>mol</code>, <code>g\u00b0C</code></p>
      </div>
      <div class="ss-frac-preview hidden" id="ss-frac-preview" hidden aria-live="polite">
        <div class="ss-type">Preview</div>
        <div class="ss-frac-preview-math" id="ss-frac-preview-math"></div>
        <div class="ss-spoken">Spoken: <b id="ss-frac-preview-spoken"></b></div>
        <div class="ss-frac-preview-code" id="ss-frac-preview-code"></div>
      </div>
      <p class="ss-frac-error hidden" id="ss-frac-error" role="alert"></p>
      <div class="ss-modal-actions">
        <button type="button" class="ss-btn" id="ss-frac-cancel">Cancel</button>
        <button type="button" class="ss-btn hidden" id="ss-frac-back" hidden>Back</button>
        <button type="button" class="ss-btn primary" id="ss-frac-next">Next</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const numInput = overlay.querySelector("#ss-frac-num");
  const denInput = overlay.querySelector("#ss-frac-den");
  const panel1 = overlay.querySelector('[data-panel="1"]');
  const panel2 = overlay.querySelector('[data-panel="2"]');
  const previewBox = overlay.querySelector("#ss-frac-preview");
  const previewMath = overlay.querySelector("#ss-frac-preview-math");
  const previewSpoken = overlay.querySelector("#ss-frac-preview-spoken");
  const previewCode = overlay.querySelector("#ss-frac-preview-code");
  const errorEl = overlay.querySelector("#ss-frac-error");
  const stepEls = overlay.querySelectorAll(".ss-frac-step");
  const btnCancel = overlay.querySelector("#ss-frac-cancel");
  const btnBack = overlay.querySelector("#ss-frac-back");
  const btnNext = overlay.querySelector("#ss-frac-next");

  let step = 1;
  const replaceRange = parsed ? { start, end } : { start, end: start };

  if (parsed) {
    numInput.value = parsed.numerator;
    denInput.value = parsed.denominator;
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.toggle("hidden", !msg);
  }

  function setStep(n) {
    step = n;
    panel1.hidden = step !== 1;
    panel2.hidden = step !== 2;
    panel1.classList.toggle("hidden", step !== 1);
    panel2.classList.toggle("hidden", step !== 2);
    btnBack.hidden = step === 1;
    btnBack.classList.toggle("hidden", step === 1);
    btnNext.textContent = step === 1 ? "Next" : "Insert fraction";
    stepEls.forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.step) === step);
    });
    previewBox.hidden = step !== 2;
    previewBox.classList.toggle("hidden", step !== 2);
    if (step === 2) updatePreview();
    showError("");
    (step === 1 ? numInput : denInput).focus();
    (step === 1 ? numInput : denInput).select();
  }

  function updatePreview() {
    const { latex, spoken, mathml } = fractionPreview(numInput.value, denInput.value);
    previewMath.innerHTML = mathml || "<span class='ss-type'>(enter both parts)</span>";
    previewSpoken.textContent = spoken || "\u2014";
    previewCode.textContent = latex ? `Inserts: ${latex}` : "";
  }

  function close() {
    document.removeEventListener("keydown", onDocKey);
    overlay.remove();
    textarea.focus();
  }

  function onDocKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onDocKey);

  function finish() {
    const num = sanitizeFracPart(numInput.value);
    const den = sanitizeFracPart(denInput.value);
    if (!num) {
      setStep(1);
      showError("Enter a numerator (top of the fraction).");
      return;
    }
    if (!den) {
      showError("Enter a denominator (bottom of the fraction).");
      denInput.focus();
      return;
    }
    const latex = formatFractionLatex(num, den);
    insertAtCursor(textarea, latex, replaceRange);
    close();
    onInsert?.();
  }

  btnCancel.addEventListener("click", close);
  btnBack.addEventListener("click", () => setStep(1));
  btnNext.addEventListener("click", () => {
    if (step === 1) {
      if (!sanitizeFracPart(numInput.value)) {
        showError("Enter a numerator before continuing.");
        numInput.focus();
        return;
      }
      setStep(2);
      return;
    }
    finish();
  });

  numInput.addEventListener("input", () => {
    if (step === 2) updatePreview();
    showError("");
  });
  denInput.addEventListener("input", () => {
    if (step === 2) updatePreview();
    showError("");
  });

  numInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnNext.click();
    }
    if (e.key === "Escape") close();
  });
  denInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish();
    }
    if (e.key === "Escape") close();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // If user highlighted "14J/23g", jump straight to denominator step with preview.
  if (parsed) {
    setStep(2);
  } else {
    numInput.focus();
  }

  return { close };
}

// Equation typer modal: LaTeX-style input with symbol palette, live preview,
// and insert-at-cursor into the main content textarea.

import { insertAtCursor } from "./fraction-builder.js";
import { analyzeEquation, normalizeEquationInsert } from "./core/transform.js";
import { speak } from "./speech.js";

const CARET = "\u0001";

const PALETTE = [
  {
    group: "Structure",
    items: [
      { label: "a\u2044b", title: "Fraction", insert: `\\frac{${CARET}}{}` },
      { label: "x\u00b2", title: "Superscript", insert: `^{${CARET}}` },
      { label: "x\u2099", title: "Subscript", insert: `_{${CARET}}` },
      { label: "\u221a", title: "Square root", insert: `\\sqrt{${CARET}}` },
    ],
  },
  {
    group: "Operators",
    items: [
      { label: "\u00d7", title: "times", insert: "\\times " },
      { label: "\u00f7", title: "divided by", insert: "\\div " },
      { label: "\u00b7", title: "dot", insert: "\\cdot " },
      { label: "\u00b1", title: "plus or minus", insert: "\\pm " },
      { label: "=", title: "equals", insert: "=" },
      { label: "\u2212", title: "minus", insert: "-" },
      { label: "\u2192", title: "yields", insert: "\\to " },
      { label: "\u21cc", title: "equilibrium", insert: "\\rightleftharpoons " },
      { label: "\u2264", title: "less than or equal", insert: "\\leq " },
      { label: "\u2265", title: "greater than or equal", insert: "\\geq " },
      { label: "\u2248", title: "approximately", insert: "\\approx " },
      { label: "\u00b0", title: "degree", insert: "\\degree " },
    ],
  },
  {
    group: "Greek",
    items: [
      { label: "\u0394", title: "Delta", insert: "\\Delta " },
      { label: "\u03b1", title: "alpha", insert: "\\alpha " },
      { label: "\u03b2", title: "beta", insert: "\\beta " },
      { label: "\u03b3", title: "gamma", insert: "\\gamma " },
      { label: "\u03b8", title: "theta", insert: "\\theta " },
      { label: "\u03bb", title: "lambda", insert: "\\lambda " },
      { label: "\u03bc", title: "mu", insert: "\\mu " },
      { label: "\u03c0", title: "pi", insert: "\\pi " },
      { label: "\u03c3", title: "sigma", insert: "\\sigma " },
      { label: "\u03c9", title: "omega", insert: "\\omega " },
      { label: "\u03a9", title: "Omega", insert: "\\Omega " },
      { label: "\u03a3", title: "Sigma", insert: "\\Sigma " },
    ],
  },
];

export function buildPalette(container, onInsert) {
  container.innerHTML = "";
  for (const grp of PALETTE) {
    const wrap = document.createElement("div");
    wrap.className = "ss-palette-group";
    const lbl = document.createElement("span");
    lbl.className = "ss-type";
    lbl.textContent = grp.group;
    wrap.appendChild(lbl);
    for (const it of grp.items) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ss-btn ss-sym";
      b.textContent = it.label;
      b.title = it.title;
      b.setAttribute("aria-label", it.title);
      b.addEventListener("click", () => onInsert(it.insert));
      wrap.appendChild(b);
    }
    container.appendChild(wrap);
  }
}

function insertSnippet(el, snippet, after) {
  const caretIdx = snippet.indexOf(CARET);
  const clean = snippet.replace(CARET, "");
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + clean + el.value.slice(end);
  const pos = caretIdx >= 0 ? start + caretIdx : start + clean.length;
  el.focus();
  el.setSelectionRange(pos, pos);
  after();
}

/**
 * Open the equation typer pop-out. Inserts normalized LaTeX at the main textarea cursor.
 * @param {{ textarea: HTMLTextAreaElement, onInsert: () => void, initial?: string }} opts
 */
export function openEquationEditor({ textarea, onInsert, initial }) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const selected = textarea.value.slice(start, end);
  const replaceRange = { start, end };

  const overlay = document.createElement("div");
  overlay.className = "ss-modal-overlay";
  overlay.innerHTML = `
    <div class="ss-modal ss-eq-modal" role="dialog" aria-modal="true" aria-labelledby="ss-eq-title">
      <h2 id="ss-eq-title" class="ss-title">Insert equation</h2>
      <p class="ss-sub ss-eq-hint">
        Type in LaTeX style (<code>_</code> subscript, <code>^</code> superscript,
        <code>\\frac{a}{b}</code>, <code>\\Delta</code>, <code>\\times</code>).
        HearSay converts it to Canvas-ready MathML with dictionary speech.
      </p>
      <div class="ss-palette" id="ss-eq-palette"></div>
      <label class="ss-frac-label" for="ss-eq-input">Equation</label>
      <input id="ss-eq-input" class="ss-input ss-eq-input" type="text" spellcheck="false"
        placeholder="e.g. T_2 = T_1 + \\Delta T" autocomplete="off" />
      <div class="ss-eq-preview" id="ss-eq-preview" aria-live="polite">
        <div class="ss-type">Rendered</div>
        <div class="ss-frac-preview-math" id="ss-eq-render"></div>
        <div class="ss-spoken">Spoken (via your dictionary): <b id="ss-eq-spoken"></b></div>
        <div class="ss-eq-insert-preview" id="ss-eq-insert-preview"></div>
      </div>
      <p class="ss-frac-error hidden" id="ss-eq-error" role="alert"></p>
      <div class="ss-modal-actions">
        <button type="button" class="ss-btn" id="ss-eq-cancel">Cancel</button>
        <button type="button" class="ss-btn" id="ss-eq-hear">\u25b6 Hear</button>
        <button type="button" class="ss-btn primary" id="ss-eq-insert">Insert equation</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const eqInput = overlay.querySelector("#ss-eq-input");
  const eqRender = overlay.querySelector("#ss-eq-render");
  const eqSpoken = overlay.querySelector("#ss-eq-spoken");
  const insertPreview = overlay.querySelector("#ss-eq-insert-preview");
  const errorEl = overlay.querySelector("#ss-eq-error");
  const btnCancel = overlay.querySelector("#ss-eq-cancel");
  const btnHear = overlay.querySelector("#ss-eq-hear");
  const btnInsert = overlay.querySelector("#ss-eq-insert");

  let eq = { mathml: "", spoken: "", insertText: "" };

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.toggle("hidden", !msg);
  }

  function runEq() {
    eq = analyzeEquation(eqInput.value);
    const insertText = normalizeEquationInsert(eqInput.value);
    eq.insertText = insertText;
    eqRender.innerHTML = eq.mathml || "<span class='ss-type'>(type an equation)</span>";
    eqSpoken.textContent = eq.spoken || "\u2014";
    insertPreview.textContent = insertText ? `Inserts: ${insertText}` : "";
    showError("");
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
    const insertText = normalizeEquationInsert(eqInput.value);
    if (!insertText) {
      showError("Enter an equation before inserting.");
      eqInput.focus();
      return;
    }
    if (!eq.mathml) {
      showError("Could not parse this equation. Check LaTeX syntax.");
      eqInput.focus();
      return;
    }
    insertAtCursor(textarea, insertText, replaceRange);
    close();
    onInsert?.();
  }

  buildPalette(overlay.querySelector("#ss-eq-palette"), (snippet) =>
    insertSnippet(eqInput, snippet, runEq),
  );

  eqInput.value = initial ?? selected ?? "T_2 = T_1 + \\Delta T";
  eqInput.addEventListener("input", runEq);
  eqInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish();
    }
    if (e.key === "Escape") close();
  });

  btnCancel.addEventListener("click", close);
  btnHear.addEventListener("click", () => speak(eq.spoken));
  btnInsert.addEventListener("click", finish);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  runEq();
  eqInput.focus();
  eqInput.select();

  return { close };
}

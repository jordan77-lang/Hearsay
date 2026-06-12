// MathSay page UI — equation-first LaTeX/MathML authoring for Canvas.

import { buildPalette } from "./equation-editor.js";
import { openFractionBuilder } from "./fraction-builder.js";
import { openScriptEditor } from "./script-editor.js";
import { ruleCount, dictionarySource } from "./core/dictionary.js";
import {
  MATHSAY_TEMPLATES,
  STRATEGY_LABELS,
  buildMathsayExport,
  analyzeMathsayEquation,
  approximateMathmlSpeech,
  suggestStrategy,
} from "./core/mathsay-export.js";
import { defaultSrSpeakVisible, setDefaultSrProfile } from "./core/default-sr-speech.js";
import { speak, speechSupported } from "./speech.js";
import { helpTip, bindHelpTips } from "./help-tip.js";
import { onDictionaryUpdated, dictionarySyncMatchesClass } from "./dictionary-sync.js";

const CARET = "\u0001";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDictionaryNote(dictionarySync) {
  const count = ruleCount();
  const source = dictionarySource();
  const course = dictionarySync?.courseId;
  if (source.startsWith("supabase")) {
    return `${count} rules${course ? ` · ${course}` : ""}`;
  }
  return `${count} rules (bundled demo)`;
}

function insertSnippet(el, snippet) {
  const caretIdx = snippet.indexOf(CARET);
  const clean = snippet.replace(CARET, "");
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + clean + el.value.slice(end);
  const pos = caretIdx >= 0 ? start + caretIdx : start + clean.length;
  el.focus();
  el.setSelectionRange(pos, pos);
}

async function copyText(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function speechPreview(exportResult, profileId, latex) {
  setDefaultSrProfile(profileId);
  const { strategy, spoken, visual } = exportResult;
  if (strategy === "mathml-stacked") {
    return approximateMathmlSpeech(latex);
  }
  if (strategy === "linear-mtext" || strategy === "accessible-text" || strategy === "page-spoken") {
    return spoken || visual;
  }
  if (strategy === "dual-notation") {
    return defaultSrSpeakVisible(visual);
  }
  return defaultSrSpeakVisible(visual);
}

/**
 * @param {HTMLElement} root
 * @param {{ dictionarySync?: object, supabaseConfig?: object }} opts
 */
export function mountMathsay(root, { dictionarySync } = {}) {
  const defaultLatex = MATHSAY_TEMPLATES[0].latex;

  root.innerHTML = `
    <div class="ss-wrap hs-mathsay">
      <header class="ss-page-header">
        <h1 class="ss-title">MathSay</h1>
        <p class="ss-sub">
          Build LaTeX equations, preview MathML, hear dictionary vs factory screen reader speech,
          then copy Canvas-safe HTML for quizzes or pages.
        </p>
        <p class="ss-type" id="ms-dict-meta"></p>
      </header>

      <div class="hs-mathsay-grid">
        <section class="ss-section hs-mathsay-build" aria-labelledby="ms-build-h">
          <h2 id="ms-build-h" class="ss-title">Equation</h2>
          ${helpTip(`<p>Type LaTeX: <code>_</code> subscript, <code>^</code> superscript, <code>\\frac{a}{b}</code>, <code>\\Delta</code>.</p>
            <p>Use templates or the palette for common chemistry symbols.</p>`)}

          <div class="hs-mathsay-templates" id="ms-templates" role="list"></div>

          <div class="ss-palette" id="ms-palette"></div>

          <label class="ss-frac-label" for="ms-eq-input">LaTeX</label>
          <textarea id="ms-eq-input" class="ss-input hs-mathsay-input" spellcheck="false"
            rows="3" placeholder="e.g. \\frac{14 J}{23 g}"></textarea>

          <div class="ss-toolbar">
            <button type="button" class="ss-btn" id="ms-insert-frac">⁄ Fraction</button>
            <button type="button" class="ss-btn" id="ms-insert-sub">Subscript</button>
            <button type="button" class="ss-btn" id="ms-insert-sup">Superscript</button>
          </div>
        </section>

        <section class="ss-section hs-mathsay-preview" aria-labelledby="ms-preview-h">
          <h2 id="ms-preview-h" class="ss-title">Preview</h2>
          <div class="ss-type">Rendered (Canvas display)</div>
          <div class="ss-render hs-mathsay-render" id="ms-render" aria-live="polite"></div>
          <ul class="hs-mathsay-warnings" id="ms-warnings" aria-live="polite"></ul>
        </section>

        <section class="ss-section hs-mathsay-speech" aria-labelledby="ms-speech-h">
          <h2 id="ms-speech-h" class="ss-title">Speech preview ${helpTip(`<p><b>Dictionary</b> — your class rules (target student pronunciation).</p>
            <p><b>NVDA / JAWS</b> — factory reader, no dictionary. Stacked MathML shows an <b>approximate</b> MathCAT reading.</p>`)}</h2>
          <div class="hs-mathsay-speech-grid">
            <div class="hs-mathsay-speech-col">
              <span class="hs-lab-legend-item"><span class="hs-lab-legend-swatch is-dict" aria-hidden="true"></span> Dictionary</span>
              <p class="hs-mathsay-speech-text" id="ms-speech-dict"></p>
              <button type="button" class="ss-btn" id="ms-hear-dict">▶ Hear</button>
            </div>
            <div class="hs-mathsay-speech-col">
              <span class="hs-lab-legend-item"><span class="hs-lab-legend-swatch is-baseline" aria-hidden="true"></span> NVDA (factory)</span>
              <p class="hs-mathsay-speech-text" id="ms-speech-nvda"></p>
              <button type="button" class="ss-btn" id="ms-hear-nvda">▶ Hear</button>
            </div>
            <div class="hs-mathsay-speech-col">
              <span class="hs-lab-legend-item"><span class="hs-lab-legend-swatch is-baseline" aria-hidden="true"></span> JAWS (factory)</span>
              <p class="hs-mathsay-speech-text" id="ms-speech-jaws"></p>
              <button type="button" class="ss-btn" id="ms-hear-jaws">▶ Hear</button>
            </div>
          </div>
        </section>

        <section class="ss-section hs-mathsay-export" aria-labelledby="ms-export-h">
          <h2 id="ms-export-h" class="ss-title">Copy for Canvas</h2>
          ${helpTip(`<p><b>Canvas New Quiz</b> — Dual notation for word fractions; MathML for numeric fractions.</p>
            <p><b>Canvas Page</b> — Page spoken uses aria-label; verify in Student View.</p>
            <p>Paste into the HTML editor (<code>&lt;/&gt;</code>) in Canvas.</p>`)}

          <div class="ss-controls hs-mathsay-export-controls">
            <label class="ss-type">Destination:
              <select id="ms-destination" class="ss-btn">
                <option value="quiz" selected>Canvas New Quiz</option>
                <option value="page">Canvas Page / Assignment</option>
              </select>
            </label>
            <label class="ss-type">Speech strategy:
              <select id="ms-strategy" class="ss-btn">
                ${Object.entries(STRATEGY_LABELS)
                  .map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`)
                  .join("")}
              </select>
            </label>
          </div>
          <p class="ss-type" id="ms-strategy-hint"></p>

          <div class="ss-toolbar">
            <button type="button" class="ss-btn primary" id="ms-copy-html">Copy Canvas HTML</button>
            <button type="button" class="ss-btn" id="ms-copy-mathml">Copy MathML</button>
            <button type="button" class="ss-btn" id="ms-copy-latex">Copy LaTeX</button>
            <button type="button" class="ss-btn" id="ms-copy-spoken">Copy accessible text</button>
            <span class="ss-type" id="ms-copy-stat" role="status" aria-live="polite"></span>
          </div>

          <div class="ss-type" style="margin-top:8px">HTML to paste:</div>
          <pre class="ss-canvas-code" id="ms-html-code"></pre>
        </section>
      </div>
    </div>`;

  bindHelpTips(root);

  const eqInput = root.querySelector("#ms-eq-input");
  const renderEl = root.querySelector("#ms-render");
  const warningsEl = root.querySelector("#ms-warnings");
  const speechDict = root.querySelector("#ms-speech-dict");
  const speechNvda = root.querySelector("#ms-speech-nvda");
  const speechJaws = root.querySelector("#ms-speech-jaws");
  const destinationSel = root.querySelector("#ms-destination");
  const strategySel = root.querySelector("#ms-strategy");
  const strategyHint = root.querySelector("#ms-strategy-hint");
  const htmlCode = root.querySelector("#ms-html-code");
  const copyStat = root.querySelector("#ms-copy-stat");
  const dictMeta = root.querySelector("#ms-dict-meta");

  let lastExport = buildMathsayExport(defaultLatex, { destination: "quiz", strategy: "auto" });
  let strategyManual = false;

  function updateDictMeta() {
    dictMeta.textContent = formatDictionaryNote(dictionarySync);
  }
  updateDictMeta();

  const templatesEl = root.querySelector("#ms-templates");
  templatesEl.innerHTML = MATHSAY_TEMPLATES.map(
    (t) =>
      `<button type="button" class="ss-btn hs-mathsay-template" role="listitem" data-latex="${escapeHtml(t.latex)}" title="${escapeHtml(t.latex)}">${escapeHtml(t.label)}</button>`,
  ).join("");

  templatesEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-latex]");
    if (!btn) return;
    eqInput.value = btn.getAttribute("data-latex") ?? "";
    strategyManual = false;
    refresh();
  });

  buildPalette(root.querySelector("#ms-palette"), (snippet) => {
    insertSnippet(eqInput, snippet);
    refresh();
  });

  function refresh() {
    const latex = eqInput.value.trim();
    const destination = /** @type {'quiz'|'page'} */ (destinationSel.value);
    let strategy = strategySel.value;

    if (!strategyManual && strategy === "auto") {
      const suggested = suggestStrategy(destination, latex);
      strategyHint.textContent = suggested
        ? `Auto selected: ${STRATEGY_LABELS[suggested] ?? suggested}`
        : "";
    } else if (strategy === "auto") {
      strategyHint.textContent = `Auto would pick: ${STRATEGY_LABELS[suggestStrategy(destination, latex)] ?? ""}`;
    } else {
      strategyHint.textContent = "";
    }

    const eq = analyzeMathsayEquation(latex);
    lastExport = buildMathsayExport(latex, { destination, strategy });

    renderEl.innerHTML =
      lastExport.html.replace(/^<p>|<\/p>$/g, "") ||
      (eq.mathml ? eq.mathml : "<span class='ss-type'>(type an equation)</span>");

    warningsEl.innerHTML = lastExport.warnings
      .map(
        (w) =>
          `<li class="hs-mathsay-warning is-${w.level}">${escapeHtml(w.text)}</li>`,
      )
      .join("");

    speechDict.textContent = lastExport.spoken || "—";
    speechNvda.textContent = speechPreview(lastExport, "nvda", latex) || "—";
    speechJaws.textContent = speechPreview(lastExport, "jaws", latex) || "—";

    if (lastExport.strategy === "mathml-stacked" && latex) {
      speechNvda.title = speechJaws.title = "Approximate MathCAT reading — actual math engine may differ";
    } else {
      speechNvda.title = speechJaws.title = "";
    }

    htmlCode.textContent = lastExport.html || "(empty)";
  }

  eqInput.value = defaultLatex;
  eqInput.addEventListener("input", () => refresh());

  destinationSel.addEventListener("change", () => {
    strategyManual = false;
    strategySel.value = "auto";
    refresh();
  });

  strategySel.addEventListener("change", () => {
    strategyManual = strategySel.value !== "auto";
    refresh();
  });

  root.querySelector("#ms-insert-frac").addEventListener("click", () => {
    openFractionBuilder({
      textarea: eqInput,
      onInsert: () => refresh(),
    });
  });

  root.querySelector("#ms-insert-sub").addEventListener("click", () => {
    openScriptEditor({ textarea: eqInput, mode: "sub", onInsert: () => refresh() });
  });

  root.querySelector("#ms-insert-sup").addEventListener("click", () => {
    openScriptEditor({ textarea: eqInput, mode: "super", onInsert: () => refresh() });
  });

  function flashCopy(msg) {
    copyStat.textContent = msg;
    setTimeout(() => {
      if (copyStat.textContent === msg) copyStat.textContent = "";
    }, 2500);
  }

  root.querySelector("#ms-copy-html").addEventListener("click", async () => {
    const ok = await copyText(lastExport.html);
    flashCopy(ok ? "Canvas HTML copied." : "Copy failed.");
  });

  root.querySelector("#ms-copy-mathml").addEventListener("click", async () => {
    const ok = await copyText(lastExport.mathml || "");
    flashCopy(ok ? "MathML copied." : "Nothing to copy.");
  });

  root.querySelector("#ms-copy-latex").addEventListener("click", async () => {
    const ok = await copyText(eqInput.value.trim());
    flashCopy(ok ? "LaTeX copied." : "Nothing to copy.");
  });

  root.querySelector("#ms-copy-spoken").addEventListener("click", async () => {
    const ok = await copyText(lastExport.spoken || "");
    flashCopy(ok ? "Accessible text copied." : "Nothing to copy.");
  });

  root.querySelector("#ms-hear-dict").addEventListener("click", () => {
    if (speechSupported() && lastExport.spoken) speak(lastExport.spoken);
  });
  root.querySelector("#ms-hear-nvda").addEventListener("click", () => {
    const t = speechPreview(lastExport, "nvda", eqInput.value.trim());
    if (speechSupported() && t) speak(t);
  });
  root.querySelector("#ms-hear-jaws").addEventListener("click", () => {
    const t = speechPreview(lastExport, "jaws", eqInput.value.trim());
    if (speechSupported() && t) speak(t);
  });

  if (dictionarySync) {
    onDictionaryUpdated((detail) => {
      if (!dictionarySyncMatchesClass(dictionarySync, detail)) return;
      updateDictMeta();
      refresh();
    });
  }

  refresh();
}

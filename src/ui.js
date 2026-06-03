// Shared UI for HearSay. Mounted by Canvas Translate (/playground/) and the
// extension side panel. Pure DOM + the core engine; no framework.

import { findTokens } from "./core/detect.js";
import { analyze, toCanvasHtml, canvasSpokenFromText, canvasOutputHearLines } from "./core/transform.js";
import { ruleCount, dictionarySource } from "./core/dictionary.js";
import { createHearController } from "./hear-ui.js";
import { speak, speakQueued, cancelSpeech, loadVoices, preloadSpeech, speechSupported } from "./speech.js";
import { openFractionBuilder, insertAtCursor } from "./fraction-builder.js";
import { openScriptEditor } from "./script-editor.js";
import { openEquationEditor } from "./equation-editor.js";
import { mountDictionaryPanel } from "./supabase/dictionary-ui.js";
import { normalizePastedContent, pasteDataFromEvent } from "./core/paste-normalize.js";
import { helpTip, bindHelpTips } from "./help-tip.js";

const RISK_LABEL = { high: "High risk", medium: "Medium risk", low: "Low risk" };

function formatDictionaryNote(dictionarySync) {
  const count = ruleCount();
  const source = dictionarySource();
  const course = dictionarySync?.courseId;
  if (source.startsWith("supabase-entries")) {
    const n = dictionarySync?.classRuleCount;
    const extra =
      n != null && dictionarySync?.mergedBundled
        ? ` · ${n} entries on bundled base`
        : n != null
          ? ` · ${n} entries`
          : "";
    return `${count} rules${course ? ` · ${course}` : ""} (Supabase entries${extra})`;
  }
  if (source.startsWith("supabase")) {
    return `${count} rules${course ? ` · ${course}` : ""} (Supabase)`;
  }
  if (dictionarySync?.ok === false && dictionarySync.reason === "empty-table") {
    return `${count} dictionary rules (bundled — Supabase table empty)`;
  }
  if (dictionarySync?.ok === false && dictionarySync.reason?.includes("Could not find the table")) {
    return `${count} dictionary rules (bundled — run supabase/schema.sql)`;
  }
  return `${count} dictionary rules (bundled)`;
}

const SAMPLE =
  "The specific heat of water is 4.18 J/g\u00b0C. Heat 10 mL of 3 M HCl and record T\u2081 and T\u2082, " +
  "where \u0394T = T\u2082 \u2212 T\u2081. The effective heat capacity is 2.0 J/\u00b0C and q = \\frac{14J}{23g}. " +
  "Dissolve CuSO4\u00b75H2O, then compare 2H2 + O2 \u2192 2H2O at 80\u00b0C with \u0394H = \u2212286 kJ/mol.";

export function mountApp(root, { initialText, dictionarySync, supabaseConfig: configFromCaller } = {}) {
  root.innerHTML = `
    <div class="ss-wrap">
      <h1 class="ss-title">Canvas Translate</h1>
      <p class="ss-sub">Paste authored content. HearSay flags tokens screen readers
        mispronounce, lets you hear the result, and builds Canvas-ready HTML.</p>

      <div class="ss-workflow-steps" aria-label="Workflow">
        <span><span class="ss-wf-num">1</span>Pick dictionary <a class="hs-inline-link" href="../dictionary/">(edit terms)</a></span>
        <span aria-hidden="true">→</span>
        <span><span class="ss-wf-num">2</span>Paste &amp; edit text</span>
        <span aria-hidden="true">→</span>
        <span><span class="ss-wf-num">3</span>Hear &amp; review</span>
        <span aria-hidden="true">→</span>
        <span><span class="ss-wf-num">4</span>Copy Canvas HTML</span>
        ${helpTip(`<p><b>Typical workflow</b></p><ul>
          <li><b>Course dictionary</b> — choose a class (or All classes) to load pronunciation rules from Supabase, or use the bundled dictionary offline.</li>
          <li><b>Paste text</b> — curriculum from Word or Canvas; HearSay normalizes subscripts and flags risky tokens.</li>
          <li><b>Hear (your dictionary)</b> — previews how a screen reader should read it with your class rules.</li>
          <li><b>Copy Canvas HTML</b> — paste into Canvas’s HTML editor for students.</li>
          <li><b>Add rules</b> — save new pronunciations to Supabase for your class (select a class, not All).</li>
        </ul>`)}
      </div>

      <div id="ss-dict-mount"></div>

      <label class="ss-sr-only" for="ss-input">Content to analyze</label>
      <div class="ss-findings-head" style="margin:12px 0 4px">
        <h2 class="ss-title" style="font-size:14px;margin:0">Your text</h2>
        ${helpTip(`<p>Paste or type curriculum here. Pasting from Word or Google Docs keeps line breaks and converts subscripts when possible (<code>T2</code> → <code>T₂</code>, <code>qcalorimeter</code> → <code>q_{calorimeter}</code>).</p>
          <p>Analysis runs automatically as you type. Click <b>Analyze</b> to refresh manually.</p>`)}
      </div>
      <textarea id="ss-input" class="ss-input" spellcheck="false"></textarea>
      <p class="ss-sub ss-input-hint">Tip: use <b>Subscript</b> / <b>Superscript</b> to mark scripts explicitly (e.g. <code>q_{calorimeter}</code>, <code>T₂</code>).
        Plain words like “compare” stay as-is. Also: <b>Insert fraction</b> or <b>Insert equation</b>.</p>

      <div class="ss-controls">
        <button class="ss-btn primary" id="ss-analyze">Analyze</button>
        <button class="ss-btn" id="ss-insert-eq" title="Type an equation and insert at the cursor">\u2211 Insert equation</button>
        <button class="ss-btn" id="ss-insert-frac" title="Build a fraction at the cursor">\u2044 Insert fraction</button>
        <button class="ss-btn" id="ss-insert-sub" title="Add a subscript at the cursor">x\u2099 Subscript</button>
        <button class="ss-btn" id="ss-insert-sup" title="Add a superscript at the cursor">x\u00b2 Superscript</button>
        <button class="ss-btn" id="ss-hear-orig" title="How TTS reads the raw text">\u25b6 Hear original</button>
        <button class="ss-btn" id="ss-hear-dict" title="What your course dictionary says to a screen reader">\u25b6 Hear (your dictionary)</button>
        ${helpTip(`<p><b>Hear original</b> — browser TTS reading the raw text (before dictionary rules).</p>
          <p><b>Hear (your dictionary)</b> — simulates composed speech using the loaded class or bundled dictionary. Multi-line text is read <b>one line at a time</b> with a pause between lines.</p>
          <p><b>Hear this output</b> (below) — reads the Canvas-ready spoken stream the same way.</p>
          <p>In Canvas, students can move paragraph-by-paragraph (each line is its own paragraph) with their screen reader&rsquo;s next-paragraph command.</p>`)}
        <button class="ss-btn" id="ss-sample">Load sample</button>
        <span id="ss-speech-note" class="ss-type"></span>
      </div>

      <div class="ss-summary" id="ss-summary" aria-live="polite"></div>
      <div class="ss-preview" id="ss-preview" aria-hidden="true"></div>

      <section class="ss-canvas" aria-labelledby="ss-canvas-h">
        <div class="ss-findings-head">
          <h2 id="ss-canvas-h" class="ss-title" style="font-size:14px;margin:0">Canvas-ready output</h2>
          ${helpTip(`<p>Generates HTML for Canvas’s <b>&lt;/&gt;</b> HTML editor.</p>
            <p><b>New Quizzes — MathML</b> (recommended) — formulae as MathML; units show as <code>J/g°C (jools per gram degree Celsius)</code> so New Quizzes reads your dictionary. Normal paragraph wrapping.</p>
            <p><b>New Quizzes — spoken text</b> — visible dictionary words instead of symbols (no MathML).</p>
            <p><b>Page</b> — keep symbols visible; <code>aria-label</code> carries dictionary speech (Pages only).</p>
            <p><b>Page — MathML + hidden units</b> — MathML for math plus hidden spoken text for units (Pages only).</p>`)}
        </div>
        <p class="ss-sub">Review the rendered preview, hear it, then copy the HTML into the Canvas HTML editor (<b>&lt;/&gt;</b> view). Units use visible parentheses for dictionary speech; formulae use MathML (NVDA 2026.1+ / MathCAT).</p>
        <div class="ss-controls">
          <label class="ss-type">Mode:
            <select id="ss-unit-strategy" class="ss-btn">
              <option value="quiz-mathml" selected>New Quizzes — MathML only (recommended)</option>
              <option value="quiz">New Quizzes — visible spoken text</option>
              <option value="spoken">Page — keep symbols visible (aria-label)</option>
              <option value="mathml">Page — MathML + hidden unit speech</option>
            </select>
          </label>
          <button class="ss-btn" id="ss-hear-canvas">\u25b6 Hear this output</button>
          <button class="ss-btn primary" id="ss-copy-canvas">Copy Canvas HTML</button>
          <span id="ss-canvas-stat" class="ss-type"></span>
        </div>
        <div class="ss-type" style="margin-top:6px">Rendered preview (how Canvas will display it):</div>
        <div class="ss-render" id="ss-render"></div>
        <div class="ss-type" style="margin-top:6px">HTML to paste into Canvas:</div>
        <pre class="ss-canvas-code" id="ss-canvas-code"></pre>
      </section>

      <section class="ss-findings-section" aria-labelledby="ss-findings-h">
        <div class="ss-findings-head">
          <h2 id="ss-findings-h" class="ss-title" style="font-size:14px;margin:0">Pronunciation findings</h2>
          <span id="ss-findings-count" class="ss-type"></span>
          ${helpTip(`<p>Tokens HearSay thinks a screen reader may misread. Click a yellow highlight above to jump to a finding.</p>
            <p><b>Recommended</b> — the reading Canvas output uses (course dictionary when available).</p>
            <p><b>▶ Hear</b> — compare any option before you save a rule.</p>
            <p><b>Save to class dictionary</b> — adds the recommended rule to Supabase (requires ☁ Connect and a class other than All classes).</p>`)}
        </div>
        <p class="ss-sub ss-findings-hint">Flagged tokens and copy-ready fixes. Click a highlight in the preview above to jump here.</p>
        <div id="ss-findings" class="ss-findings-scroll" aria-live="polite" tabindex="0"></div>
      </section>
    </div>`;

  const input = root.querySelector("#ss-input");
  const summary = root.querySelector("#ss-summary");
  const preview = root.querySelector("#ss-preview");
  const findingsEl = root.querySelector("#ss-findings");
  const findingsCount = root.querySelector("#ss-findings-count");
  const speechNote = root.querySelector("#ss-speech-note");
  const renderEl = root.querySelector("#ss-render");
  const canvasCode = root.querySelector("#ss-canvas-code");
  const canvasStat = root.querySelector("#ss-canvas-stat");
  const unitStrategy = root.querySelector("#ss-unit-strategy");

  input.value = initialText ?? SAMPLE;

  let current = {
    text: "",
    findings: [],
    canvasHtml: "",
    canvasSpoken: "",
    hearOrig: "",
    hearDict: "",
    hearCanvas: "",
  };
  const supabaseConfig = configFromCaller ?? dictionarySync?.config;
  let dictPanel = null;
  const hear = createHearController();

  function canSaveToDict() {
    return Boolean(dictPanel?.canSaveRules?.());
  }

  function run() {
    const { findings, counts, total, normalizedText } = analyze(input.value, findTokens);
    const text = normalizedText;
    if (text !== input.value) input.value = text;
    const { html, mathCount, textCount, spoken } = toCanvasHtml(text, findings, {
      mode: unitStrategy.value,
    });
    current = {
      text,
      findings,
      canvasHtml: html,
      canvasSpoken: spoken ?? "",
      hearOrig: text.replace(/\s*\n+\s*/g, " ").replace(/\s+/g, " ").trim(),
      hearDict: canvasSpokenFromText(text),
      hearCanvas:
        unitStrategy.value === "mathml"
          ? canvasOutputHearLines(text, findings, { mode: "mathml" }).join(" ")
          : canvasSpokenFromText(text),
    };
    renderSummary(summary, counts, total);
    renderPreview(preview, text, findings);
    renderFindings(findingsEl, findings, findingsCount, canSaveToDict());
    hear.resetIfDetached();
    renderEl.innerHTML = html || "<span class='ss-type'>(nothing to render)</span>";
    canvasCode.textContent = html;
    const mode = unitStrategy.value;
    canvasStat.textContent =
      mode === "quiz"
        ? `${textCount} spoken line(s) · quiz-safe (visible text)`
        : mode === "spoken"
          ? `${textCount} labeled line(s) · page mode`
          : mode === "quiz-mathml"
            ? `${mathCount} MathML formula(s) · dual notation for units`
            : `${mathCount} MathML · ${textCount} text fixes`;
  }

  root.querySelector("#ss-analyze").addEventListener("click", run);
  root.querySelector("#ss-insert-frac").addEventListener("click", () => {
    openFractionBuilder({ textarea: input, onInsert: run });
  });
  root.querySelector("#ss-insert-eq").addEventListener("click", () => {
    openEquationEditor({ textarea: input, onInsert: run });
  });
  root.querySelector("#ss-insert-sub").addEventListener("click", () => {
    openScriptEditor({ textarea: input, mode: "sub", onInsert: run });
  });
  root.querySelector("#ss-insert-sup").addEventListener("click", () => {
    openScriptEditor({ textarea: input, mode: "super", onInsert: run });
  });
  input.addEventListener("input", debounce(run, 250));
  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const raw = pasteDataFromEvent(e);
    const normalized = normalizePastedContent(raw);
    insertAtCursor(input, normalized);
    run();
  });
  root.querySelector("#ss-sample").addEventListener("click", () => {
    input.value = SAMPLE;
    run();
  });
  hear.bind(root.querySelector("#ss-hear-orig"), {
    hearLabel: "\u25b6 Hear original",
    hearTitle: "How TTS reads the raw text",
    getText: () => current.hearOrig,
  });
  hear.bind(root.querySelector("#ss-hear-dict"), {
    hearLabel: "\u25b6 Hear (your dictionary)",
    hearTitle: "What your course dictionary says to a screen reader",
    getText: () => current.hearDict,
  });
  hear.bind(root.querySelector("#ss-hear-canvas"), {
    hearLabel: "\u25b6 Hear this output",
    hearTitle: "Hear the Canvas spoken output",
    getText: () => current.hearCanvas,
  });

  unitStrategy.addEventListener("change", run);
  root.querySelector("#ss-copy-canvas").addEventListener("click", (e) => {
    navigator.clipboard?.writeText(current.canvasHtml);
    flashCopied(e.currentTarget);
  });

  // Clicking a highlight scrolls to its finding card.
  preview.addEventListener("click", (e) => {
    const hit = e.target.closest("mark.ss-hit");
    if (!hit) return;
    const card = findingsEl.querySelector(`[data-idx="${hit.dataset.idx}"]`);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Copy / hear / save on finding cards (event delegation).
  findingsEl.addEventListener("click", (e) => {
    const saveBtn = e.target.closest(".ss-save-dict");
    if (saveBtn && dictPanel) {
      dictPanel.saveFindingToDictionary({
        raw: saveBtn.dataset.pattern,
        primarySpoken: saveBtn.dataset.spoken,
      });
      return;
    }
    const hearBtn = e.target.closest(".ss-hear-fix");
    if (hearBtn) {
      hear.play(
        hearBtn,
        {
          hearLabel: "\u25b6 Hear",
          hearTitle: "Hear this pronunciation",
        },
        hearBtn.dataset.spoken ?? "",
      );
      return;
    }
    const btn = e.target.closest(".ss-copy");
    if (!btn) return;
    const code = btn.parentElement.querySelector("pre")?.textContent ?? "";
    navigator.clipboard?.writeText(code);
    const prev = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = prev), 1200);
  });

  const dictNote = formatDictionaryNote(dictionarySync);
  let voicePrefix = "";
  function refreshSpeechNote() {
    const note = formatDictionaryNote({
      ...dictionarySync,
      courseId: dictPanel?.getCourseId?.() ?? dictionarySync?.courseId,
    });
    speechNote.textContent = speechSupported()
      ? `${voicePrefix}${note}`
      : `Web Speech unavailable \u00b7 ${note}`;
  }
  if (speechSupported()) {
    preloadSpeech();
    loadVoices().then((v) => {
      voicePrefix = v.length ? `${v.length} voices \u00b7 ` : "";
      refreshSpeechNote();
    });
  } else {
    refreshSpeechNote();
  }

  dictPanel = mountDictionaryPanel(root.querySelector("#ss-dict-mount"), {
    config: supabaseConfig,
    initialCourseId: dictionarySync?.courseId,
    onDictionaryChange: () => {
      refreshSpeechNote();
      run();
    },
  });

  bindHelpTips(root);
  run();
  return { run, getState: () => current, dictPanel: () => dictPanel };
}

function renderSummary(el, counts, total) {
  if (!total) {
    el.innerHTML = `<span class="ss-chip low">No pronunciation risks detected</span>`;
    return;
  }
  el.innerHTML =
    `<span class="ss-chip high">${counts.high} high</span>` +
    `<span class="ss-chip medium">${counts.medium} medium</span>` +
    `<span class="ss-chip low">${counts.low} low</span>` +
    `<span class="ss-chip">${total} total</span>`;
}

function renderPreview(el, text, findings) {
  let html = "";
  let cursor = 0;
  findings.forEach((f, idx) => {
    html += escapeHtml(text.slice(cursor, f.start));
    html += `<mark class="ss-hit ${f.risk ?? "medium"}" data-idx="${idx}" title="${escapeAttr(
      f.primarySpoken ?? "",
    )}">${escapeHtml(text.slice(f.start, f.end))}</mark>`;
    cursor = f.end;
  });
  html += escapeHtml(text.slice(cursor));
  el.innerHTML = html || "<span class='ss-type'>(empty)</span>";
}

function renderFindings(el, findings, countEl, showDictSave = false) {
  if (countEl) {
    countEl.textContent = findings.length
      ? `${findings.length} item${findings.length === 1 ? "" : "s"}`
      : "";
  }
  if (!findings.length) {
    el.innerHTML = `<div class="ss-empty">Nothing flagged. Either the text is clean, or try the sample.</div>`;
    return;
  }
  el.innerHTML = findings
    .map((f, idx) => {
      const risk = f.risk ?? "medium";
      const fixes = (f.fixes ?? [])
        .map(
          (fx) => `
        <div class="ss-fix">
          <button type="button" class="ss-btn ss-copy">Copy</button>
          <div class="ss-fix-label">${escapeHtml(fx.label)}</div>
          <div class="ss-fix-support">${escapeHtml(fx.support)}</div>
          ${fx.caveat ? `<div class="ss-fix-caveat">\u26a0 ${escapeHtml(fx.caveat)}</div>` : ""}
          <pre>${escapeHtml(fx.snippet)}</pre>
        </div>`,
        )
        .join("");
      const saveDictBtn =
        showDictSave && f.primarySpoken
          ? `<button type="button" class="ss-btn ss-save-dict" data-pattern="${escapeAttr(
              f.raw,
            )}" data-spoken="${escapeAttr(f.primarySpoken)}">Save to class dictionary</button>`
          : "";
      const actions = saveDictBtn
        ? `<div class="ss-finding-actions">${saveDictBtn}</div>`
        : "";
      return `
      <div class="ss-finding ${risk}" data-idx="${idx}">
        <div class="ss-finding-head">
          <span class="ss-token">${escapeHtml(f.raw)}</span>
          <span class="ss-type">${escapeHtml(f.type)} \u00b7 ${RISK_LABEL[risk]}</span>
        </div>
        ${f.message ? `<div class="ss-msg">${escapeHtml(f.message)}</div>` : ""}
        ${f.note ? `<div class="ss-note">\u2139 ${escapeHtml(f.note)}</div>` : ""}
        ${renderPronunciationOptions(f)}
        ${fixes}
        ${actions}
      </div>`;
    })
    .join("");
}

function normalizeSpoken(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function isRecommendedSpoken(spoken, primary) {
  return normalizeSpoken(spoken) === normalizeSpoken(primary);
}

function hearAltButton(spoken, label = "Hear") {
  if (!speechSupported() || !spoken) return "";
  return `<button type="button" class="ss-btn ss-hear-fix ss-hear-alt" data-spoken="${escapeAttr(
    spoken,
  )}" title="Hear: ${escapeAttr(normalizeSpoken(spoken))}">\u25b6 ${escapeHtml(label)}</button>`;
}

function renderPronunciationOptions(f) {
  const primary = f.primarySpoken ?? "";
  const alts = f.alternatives ?? [];

  if (alts.length) {
    return `<div class="ss-pronounce-options">
      <div class="ss-pronounce-options-title">Pronunciation options</div>
      <ul class="ss-pronounce-list">
        ${alts
          .map((a) => {
            const rec = isRecommendedSpoken(a.spoken, primary);
            return `<li class="ss-pronounce-row${rec ? " is-recommended" : ""}">
            ${rec ? `<span class="ss-recommended-badge">Recommended</span>` : ""}
            <span class="ss-pronounce-label">${escapeHtml(a.label)}:</span>
            <span class="ss-pronounce-spoken"><b>${escapeHtml(a.spoken)}</b></span>
            ${hearAltButton(a.spoken)}
          </li>`;
          })
          .join("")}
      </ul>
      <p class="ss-pronounce-note ss-type">Canvas output uses the <b>Recommended</b> reading.</p>
    </div>`;
  }

  if (!primary) return "";
  return `<div class="ss-pronounce-options">
    <div class="ss-pronounce-row is-recommended">
      <span class="ss-recommended-badge">Recommended</span>
      <span class="ss-pronounce-label">Intended:</span>
      <span class="ss-pronounce-spoken"><b>${escapeHtml(primary)}</b></span>
      ${hearAltButton(primary)}
    </div>
  </div>`;
}

function flashCopied(btn) {
  const prev = btn.textContent;
  btn.textContent = "Copied!";
  setTimeout(() => (btn.textContent = prev), 1200);
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

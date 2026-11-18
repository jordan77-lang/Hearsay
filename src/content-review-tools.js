import { splitReviewPassages, loadReviewSession } from "./core/review-session.js";
import { splitDocumentSections } from "./core/document-text.js";
import { AI_TEXT_LIMIT } from "./core/ai-dictionary.js";
import { reviewSpeechWithMap } from "./core/review-speech.js";
import { speakQueued, cancelSpeech, toggleSpeechPause, subscribeSpeechPauseState, subscribeSpeechState, isSpeechActive } from "./speech.js";
import { pullTextFromActiveTab, pullSourceLabel } from "./extension/pull-from-tab.js";

// The word at a caret offset. Whitespace-delimited, so notation such as kJ/mol
// or CuSO₄·5H₂O stays one word; surrounding quotes, sentence punctuation and
// unbalanced parentheses are dropped.
export function wordBoundsAt(text, offset) {
  const space = ch => /\s/u.test(ch);
  let start = Math.max(0, Math.min(offset, text.length)), end = start;
  if (start > 0 && (start === text.length || space(text[start])) && !space(text[start - 1])) start--;
  while (start > 0 && !space(text[start - 1])) start--;
  while (end < text.length && !space(text[end])) end++;
  while (start < end && /["“‘']/u.test(text[start])) start++;
  while (end > start && /[.,;:!?"”’']/u.test(text[end - 1])) end--;
  const word = () => text.slice(start, end);
  if (word().startsWith("(") && !word().includes(")")) start++;
  if (word().endsWith(")") && !word().includes("(")) end--;
  return { start, end };
}
export function wordAtOffset(text, offset) {
  const { start, end } = wordBoundsAt(text, offset);
  return text.slice(start, end);
}

const SCOPES = {
  passage: { label: "Whole passage", empty: "Import or paste content first." },
  sentence: { label: "Sentence", empty: "Import or paste content first." },
  word: { label: "Word", empty: "Click a word in the text first." },
  selection: { label: "Highlighted", empty: "Highlight text in the text box first." },
};

// Listening, selection and manual review share the assistant's source and queue.
// The source text box is the passage: the caret picks the sentence and word,
// a highlight picks exact text. No separate Lab passage or save path exists.
//  - listenHost: the action row beside Get AI suggestions (scope, prev/next)
//  - cellsHost: under that row, the Default and Dictionary cells, each with its
//    own play/pause button. The written text is colour-coded in the text box.
//  - captureHost: above the text box (extension page capture, source details)
//  - host: below the text box (hint, add term, recovery)
export function mountContentReviewTools(host, { listenHost = host, cellsHost = host, captureHost = host, extension, sourceInput: source, getState, changed, addTerm, getPreview, status, isBusy, getLegacyScope, getCourseId, onSelectionChange = () => {} }) {
  captureHost.insertAdjacentHTML("beforeend", `${extension ? '<div class="hs-review-actions hs-content-capture"><label>Capture action <select id="hs-content-capture-mode" class="ss-btn"><option value="replace">Replace passage</option><option value="append">Append selection</option></select></label><button type="button" id="hs-content-pull" class="ss-btn">Pull from page</button></div>' : ""}
    <p id="hs-content-source-details" class="ss-sub"></p>`);
  listenHost.insertAdjacentHTML("beforeend", `<button type="button" id="hs-content-add" class="ss-btn hs-add-term" hidden>+ Add term</button>
    <div class="hs-listen" role="group" aria-labelledby="hs-content-listen-label">
      <label for="hs-content-scope" id="hs-content-listen-label" class="hs-listen-label">Listen to</label>
      <select id="hs-content-scope" class="ss-btn">${Object.entries(SCOPES).map(([value, { label }]) => `<option value="${value}"${value === "sentence" ? " selected" : ""}>${label}</option>`).join("")}</select>
    </div>`);
  cellsHost.insertAdjacentHTML("beforeend", `<div class="hs-speech" role="group" aria-labelledby="hs-content-position">
      <div class="hs-speech-top"><p id="hs-content-position" class="hs-speech-where"></p></div>
      <div class="hs-speech-cells">
        <div class="hs-speech-col"><p class="hs-speech-caption"><span class="hs-diff-symbol">Read differently by default JAWS</span></p><div class="hs-speech-cell" data-voice="default"><div class="hs-speech-head"><span class="hs-speech-label" id="hs-content-default-label">Default</span><div class="hs-speech-controls"><button type="button" class="ss-btn hs-play" id="hs-content-hear-default" data-label="▶ Play" aria-describedby="hs-content-default-label">▶ Play</button><div class="hs-speech-steps"><button type="button" class="ss-btn hs-step" id="hs-content-previous" data-step="-1" aria-label="Previous sentence" title="Previous">‹</button><button type="button" class="ss-btn hs-step" id="hs-content-next" data-step="1" aria-label="Next sentence" title="Next">›</button></div></div></div><p id="hs-content-current"></p></div></div>
        <div class="hs-speech-col"><p class="hs-speech-caption"><span class="hs-diff-course">Changed by your class dictionary</span></p><div class="hs-speech-cell" data-voice="class"><div class="hs-speech-head"><span class="hs-speech-label" id="hs-content-class-label">Dictionary</span><div class="hs-speech-controls"><button type="button" class="ss-btn hs-play" id="hs-content-hear-class" data-label="▶ Play" aria-describedby="hs-content-class-label">▶ Play</button><div class="hs-speech-steps"><button type="button" class="ss-btn hs-step" data-step="-1" aria-label="Previous sentence" title="Previous">‹</button><button type="button" class="ss-btn hs-step" data-step="1" aria-label="Next sentence" title="Next">›</button></div></div></div><p id="hs-content-proposed"></p></div></div>
      </div>
    </div>`);
  host.hidden = true;
  host.innerHTML = `<section aria-label="Add terms">
    <label for="hs-content-manual">Term to add</label><input id="hs-content-manual" class="ss-input" maxlength="160" /><button id="hs-content-adjust" type="button" class="ss-btn" hidden>Adjust selected text</button>
    <details id="hs-content-recovery" hidden><summary>Recover previous Lab work</summary><p class="ss-sub">Your previous Lab data is kept. Choose a passage or term to bring into this shared review; current work is not replaced automatically.</p><label>Previous passage section <select id="hs-content-recovery-section" class="ss-btn"></select></label><textarea id="hs-content-recovery-preview" class="ss-input" rows="4" readonly aria-label="Previous Lab passage"></textarea><button type="button" id="hs-content-recover-source" class="ss-btn">Use previous passage section</button><div id="hs-content-recovery-terms"></div></details></section>`;
  const $ = id => host.querySelector(`#hs-content-${id}`) || listenHost.querySelector(`#hs-content-${id}`) || cellsHost.querySelector(`#hs-content-${id}`) || captureHost.querySelector(`#hs-content-${id}`);
  const listeners = [];
  const on = (el, name, fn) => { el.addEventListener(name, fn); listeners.push(() => el.removeEventListener(name, fn)); };
  let selected = "", selectedStart = 0, passages = [], legacySections = [], legacyTerms = [], pullBusy = false, destroyed = false, lastSource = "";
  // Every change to the highlight goes through here so the AI button can say what it will send.
  function select(text, start = 0) {
    const before = selected; selected = text; selectedStart = start;
    if (before === text) return;
    onSelectionChange(text);
    // "+ Add" appears beside Get AI suggestions whenever text is highlighted.
    const term = text.trim(), short = term.length > 28 ? `${term.slice(0, 27)}…` : term;
    $("add").hidden = !term; $("add").textContent = term ? `+ Add “${short}”` : "+ Add term";
    $("add").setAttribute("aria-label", term ? `Add ${term} as a term to review` : "Add term");
  }
  // Caret position in the text box, for Word.
  let caret = null;
  // Word highlighting: a layer over the text box with the same text laid out
  // identically; only the current word's <mark> is visible.
  const wrap = document.createElement("div"); wrap.className = "hs-source-wrap";
  source.before(wrap); wrap.append(source);
  const backdrop = document.createElement("div"); backdrop.className = "hs-source-backdrop"; backdrop.setAttribute("aria-hidden", "true"); backdrop.hidden = true;
  wrap.append(backdrop);
  function placeBackdrop() {
    const style = globalThis.getComputedStyle?.(source) ?? globalThis.window?.getComputedStyle?.(source);
    // Coloured words cover the plain text underneath with the box's own background.
    if (style) backdrop.style.setProperty("--box-bg", style.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor) ? style.backgroundColor : "var(--surface)");
    if (style) for (const name of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "textIndent", "tabSize", "textTransform", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) backdrop.style[name] = style[name];
    Object.assign(backdrop.style, { top: `${source.offsetTop + source.clientTop}px`, left: `${source.offsetLeft + source.clientLeft}px`, width: `${source.clientWidth}px`, height: `${source.clientHeight}px` });
  }
  // The sentence being read gets a light tint, the word being spoken a strong
  // mark, and the parts that read differently their amber/green diff colours.
  let readingSentence = null, readingWord = null, readingDiffs = [];
  function highlight() {
    const text = source.value, valid = range => range && range.start >= 0 && range.end <= text.length && range.end > range.start;
    const sentence = valid(readingSentence) ? readingSentence : null;
    const word = valid(readingWord) && (!sentence || (readingWord.start >= sentence.start && readingWord.end <= sentence.end)) ? readingWord : null;
    if (!sentence && !word) return;
    placeBackdrop(); backdrop.hidden = false; // re-measured each time: the box can be resized mid-read
    const outer = sentence || word;
    const diffs = readingDiffs.filter(diff => diff.to > outer.start && diff.from < outer.end);
    const cuts = new Set([outer.start, outer.end]);
    for (const diff of diffs) { cuts.add(Math.max(outer.start, diff.from)); cuts.add(Math.min(outer.end, diff.to)); }
    if (word) { cuts.add(word.start); cuts.add(word.end); }
    const sorted = [...cuts].sort((a, b) => a - b), inner = [];
    let mark = null;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      if (b <= a) continue;
      let node = document.createTextNode(text.slice(a, b));
      const diff = diffs.find(item => item.from <= a && item.to >= b);
      if (diff) { const span = document.createElement("span"); span.className = `hs-diff-${diff.kind}`; span.append(node); node = span; }
      if (word && word.start <= a && word.end >= b) { const highlightMark = document.createElement("mark"); highlightMark.append(node); node = highlightMark; mark ??= highlightMark; }
      inner.push(node);
    }
    const container = document.createElement("span"); if (sentence) container.className = "hs-reading-sentence";
    container.append(...inner);
    backdrop.replaceChildren(text.slice(0, outer.start), container, `${text.slice(outer.end)}\n`);
    // Keep the spoken text in view while reading through a long passage.
    const target = mark || container;
    const top = target.offsetTop, bottom = top + target.offsetHeight;
    if (top < source.scrollTop || bottom > source.scrollTop + source.clientHeight) source.scrollTop = Math.max(0, top - source.clientHeight / 3);
    backdrop.scrollTop = source.scrollTop;
  }
  function clearHighlight() { readingSentence = readingWord = null; readingDiffs = []; if (!backdrop.hidden) { backdrop.hidden = true; backdrop.replaceChildren(); } }
  // Where, in the text box, a range reads differently (class-dictionary reading).
  function diffsFor(range) {
    const slice = source.value.slice(range.start, range.end);
    return writtenSegments(slice, reviewSpeechWithMap(slice, voiceOptions(true)).pieces).map(diff => ({ ...diff, from: diff.from + range.start, to: diff.to + range.start }));
  }
  on(source, "scroll", () => { backdrop.scrollTop = source.scrollTop; });
  // Re-lay out the highlight when the box changes size (window resize, dragging the corner).
  const resizeWatch = typeof ResizeObserver === "function" ? new ResizeObserver(() => { if (!backdrop.hidden) highlight(); }) : null;
  resizeWatch?.observe(source);
  on(source, "input", clearHighlight);
  // Each play button is also its pause button: Play -> Pause -> Resume.
  // Pressing the other reading's Play switches to it.
  let playingButton = null, paused = false;
  function showPlaying(button) {
    playingButton = button;
    if (!button) paused = false;
    for (const play of [$("hear-default"), $("hear-class")]) {
      const active = play === button;
      play.classList.toggle("is-playing", active && !paused);
      play.classList.toggle("is-paused", active && paused);
      play.textContent = active ? (paused ? "▶ Resume" : "Pause") : play.dataset.label;
      play.setAttribute("aria-pressed", String(active && !paused));
    }
  }
  const unsubscribeSpeech = subscribeSpeechState(playing => { if (!playing && !destroyed) { clearHighlight(); showPlaying(null); renderCells(); } });
  const sentenceAt = offset => passages.findIndex(part => offset >= part.start && offset < part.end);
  function rememberSelection() {
    if (document.activeElement !== source) return;
    const { selectionStart: start, selectionEnd: end } = source;
    if (!playingButton) clearHighlight(); // a click or keypress replaces any stepping tint
    if (end > start) {
      select(source.value.slice(start, end), start);
      if ($("scope").value !== "selection") $("scope").value = "selection"; // highlighting means "hear this"
    } else {
      select(""); caret = start;
      if ($("scope").value === "selection") $("scope").value = "sentence";
    }
    const index = sentenceAt(start);
    if (index >= 0 && index !== getState().sentence) { getState().sentence = index; refresh(); }
    if (selected.trim()) { getState().manualWritten = selected.trim().slice(0, 160); $("manual").value = getState().manualWritten; changed(); }
    renderCells();
  }
  // What to read, and where it starts in the text box (for highlighting).
  function targetFor(scope) {
    const state = getState();
    if (scope === "passage") return { text: state.source, base: 0 };
    if (scope === "sentence") { const part = passages[state.sentence]; return part && { text: part.text, base: part.start }; }
    if (scope === "word") { if (caret == null) return null; const { start, end } = wordBoundsAt(state.source, caret); return { text: state.source.slice(start, end), base: start }; }
    return { text: selected, base: selectedStart };
  }
  // The Dictionary reading is the SAVED class dictionary only: an unsaved or
  // unapproved reading is never shown or played as the class pronunciation.
  function voiceOptions(withClass) { return withClass ? { revised: true, preview: null } : {}; }
  // Colour-coded text. segments [{ from, to, kind }] mark what reads differently:
  // "symbol" = default screen reader, "course" = class dictionary entry.
  // mark { from, to } is the part being spoken right now.
  const DIFF_TITLES = { symbol: "Read differently by default JAWS", course: "Changed by your class dictionary" };
  function renderSegments(el, text, segments = [], mark = null) {
    const clamp = value => Math.max(0, Math.min(text.length, value));
    const cuts = new Set([0, text.length]);
    for (const segment of segments) { cuts.add(clamp(segment.from)); cuts.add(clamp(segment.to)); }
    if (mark) { cuts.add(clamp(mark.from)); cuts.add(clamp(mark.to)); }
    const sorted = [...cuts].sort((a, b) => a - b), nodes = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      if (b <= a) continue;
      let node = document.createTextNode(text.slice(a, b));
      const segment = segments.find(item => item.from <= a && item.to >= b);
      if (segment) { const span = document.createElement("span"); span.className = `hs-diff-${segment.kind}`; span.title = DIFF_TITLES[segment.kind] || ""; span.append(node); node = span; }
      if (mark && mark.from <= a && mark.to >= b) { const highlight = document.createElement("mark"); highlight.append(node); node = highlight; }
      nodes.push(node);
    }
    el.replaceChildren(...nodes);
  }
  const wordAround = (text, at) => { let end = at; while (end < text.length && !/\s/.test(text[end])) end++; return { from: at, to: end }; };
  // Where in the written text a reading differs (from the class-dictionary reading's pieces).
  function writtenSegments(text, pieces) {
    return pieces.filter(piece => piece.kind !== "plain").map(piece => {
      let from = piece.start, to = piece.end;
      while (from < to && /\s/.test(text[from])) from++;
      while (to > from && /\s/.test(text[to - 1])) to--;
      return { from, to, kind: piece.kind };
    }).filter(segment => segment.to > segment.from);
  }
  // What the cells describe when nothing is playing: the current word, highlight or sentence.
  function currentUnit() {
    const scope = $("scope").value, state = getState(), part = passages[state.sentence];
    const sentenceLabel = part ? `Sentence ${state.sentence + 1} of ${passages.length}` : "No text yet";
    if (scope === "word") { const target = targetFor("word"); return target?.text ? { ...target, where: `Word: ${target.text}` } : { text: "", where: "Word: click a word in the text" }; }
    if (scope === "selection") return selected.trim() ? { text: selected, base: selectedStart, where: "Highlighted text" } : { text: "", where: "Highlighted: select text in the text box" };
    return part ? { text: part.text, base: part.start, where: sentenceLabel } : { text: "", where: sentenceLabel };
  }
  // A reading of written text for one cell. Never blank when there is text:
  // if a reading fails, the cell shows the written text and the error is logged.
  function readingOf(text, withClass) {
    if (!text) return { spoken: "", segments: [] };
    try { return reviewSpeechWithMap(text, voiceOptions(withClass)); }
    catch (error) { console.warn(`HearSay: could not build the ${withClass ? "dictionary" : "default"} reading`, error); return { spoken: text, segments: [] }; }
  }
  // Both cells always describe the same written text.
  function showBoth(text) {
    const plain = readingOf(text, false), dictionary = readingOf(text, true);
    renderSegments($("current"), plain.spoken, plain.segments);
    renderSegments($("proposed"), dictionary.spoken, dictionary.segments);
  }
  function renderCells() {
    updateSteps();
    if (playingButton) return; // live captions own the cells while reading
    const unit = currentUnit();
    $("position").textContent = unit.where;
    showBoth(unit.text);
    for (const cell of cellsHost.querySelectorAll(".hs-speech-cell")) cell.classList.remove("is-speaking");
  }
  // Start of the previous/next whitespace-delimited word from a caret.
  function wordStart(text, at, delta) {
    const space = ch => /\s/.test(ch);
    let i = Math.max(0, Math.min(at, text.length));
    while (i > 0 && !space(text[i - 1])) i--;
    if (delta > 0) { let j = i; while (j < text.length && !space(text[j])) j++; while (j < text.length && space(text[j])) j++; return j < text.length ? j : i; }
    if (delta === 0) return i;
    let j = i - 1; while (j > 0 && space(text[j])) j--;
    if (j < 0 || space(text[j])) return i;
    while (j > 0 && !space(text[j - 1])) j--;
    return j;
  }
  // ‹ › sit under each cell's Play button; both pairs share the same state.
  function updateSteps() {
    const scope = $("scope").value, state = getState(), none = !passages.length || isBusy();
    const unit = scope === "word" ? "word" : "sentence";
    let previousDisabled, nextDisabled;
    if (scope === "word") {
      previousDisabled = none || caret == null || wordStart(state.source, caret, -1) === wordStart(state.source, caret, 0);
      nextDisabled = none || (caret != null && wordStart(state.source, caret, 1) === wordStart(state.source, caret, 0));
    } else {
      previousDisabled = none || !state.sentence;
      nextDisabled = none || state.sentence >= passages.length - 1;
    }
    for (const button of cellsHost.querySelectorAll(".hs-step[data-step]")) {
      const back = button.dataset.step === "-1";
      button.hidden = scope === "passage";
      button.disabled = back ? previousDisabled : nextDisabled;
      button.setAttribute("aria-label", `${back ? "Previous" : "Next"} ${unit}`);
    }
  }
  // Prev/Next step by word (Word) or sentence (Sentence, Highlighted) and tint it in the text.
  function step(delta) {
    cancelSpeech();
    const state = getState(), scope = $("scope").value;
    if (scope === "word") {
      const text = state.source;
      caret = caret == null ? text.search(/\S/) : wordStart(text, caret, delta);
      if (caret < 0) { caret = null; return; }
      const index = sentenceAt(caret); if (index >= 0) state.sentence = index;
      const { start, end } = wordBoundsAt(text, caret);
      readingSentence = { start, end };
    } else {
      if (scope === "selection") { $("scope").value = "sentence"; select(""); }
      state.sentence = Math.max(0, Math.min(passages.length - 1, (state.sentence || 0) + delta));
      const part = passages[state.sentence];
      readingSentence = part ? { start: part.start, end: part.end } : null;
    }
    readingWord = null; readingDiffs = readingSentence ? diffsFor(readingSentence) : []; highlight();
    changed(); refresh();
  }
  function hear(withClass) {
    const button = $(withClass ? "hear-class" : "hear-default");
    if (playingButton === button) { toggleSpeechPause(); return; } // Pause / Resume
    if (playingButton) cancelSpeech(); // switch to the other reading
    const scope = $("scope").value, target = targetFor(scope);
    if (!target?.text.trim()) return status(SCOPES[scope].empty);
    const { spoken, locate, segments } = reviewSpeechWithMap(target.text, voiceOptions(withClass));
    // Split where speech.js splits sentences, so word offsets line up per utterance.
    const chunks = []; let at = 0;
    for (const match of spoken.matchAll(/(?<=[.!?])\s+/g)) { chunks.push({ text: spoken.slice(at, match.index), offset: at }); at = match.index + match[0].length; }
    chunks.push({ text: spoken.slice(at), offset: at });
    cancelSpeech();
    const toSource = range => range && { start: target.base + range.start, end: target.base + range.end };
    // Live captions: the voice being heard fills its cell word by word; the
    // other cell shows the same sentence read the other way.
    const active = $(withClass ? "proposed" : "current"), other = $(withClass ? "current" : "proposed");
    const where = scope === "passage" ? null : currentUnit().where;
    let current = null, currentSegments = [];
    speakQueued(chunks.filter(chunk => chunk.text), { pauseMs: 220,
      // Tint the sentence as soon as it starts, even for voices without word events.
      onChunkStart: chunk => {
        current = chunk;
        const first = locate(chunk.offset), last = locate(chunk.offset + chunk.text.length - 1);
        readingSentence = first && last ? toSource({ start: first.start, end: Math.max(first.end, last.end) }) : null;
        readingWord = null;
        const index = readingSentence ? sentenceAt(readingSentence.start) : -1;
        $("position").textContent = where ?? (index >= 0 ? `Reading sentence ${index + 1} of ${passages.length}` : "Reading");
        currentSegments = segments.filter(item => item.to > chunk.offset && item.from < chunk.offset + chunk.text.length)
          .map(item => ({ ...item, from: item.from - chunk.offset, to: item.to - chunk.offset }));
        renderSegments(active, chunk.text, currentSegments);
        // The other cell reads the same written sentence the other way.
        const slice = readingSentence ? source.value.slice(readingSentence.start, readingSentence.end) : scope === "passage" ? "" : target.text;
        const otherReading = readingOf(slice, !withClass);
        if (otherReading.spoken) renderSegments(other, otherReading.spoken, otherReading.segments);
        active.closest(".hs-speech-cell").classList.add("is-speaking"); other.closest(".hs-speech-cell").classList.remove("is-speaking");
        try { readingDiffs = readingSentence ? diffsFor(readingSentence) : []; highlight(); }
        catch (error) { console.warn("HearSay: could not highlight the text being read", error); }
      },
      onboundary: event => {
        if (!current || (event.name && event.name !== "word")) return;
        readingWord = toSource(locate(current.offset + event.charIndex)); highlight();
        renderSegments(active, current.text, currentSegments, wordAround(current.text, event.charIndex));
      } });
    if (isSpeechActive()) showPlaying(button);
    else status("Speech is not available in this browser.");
  }
  function add() {
    if (isBusy()) return;
    const term = $("manual").value.trim();
    if (!term) return status("Highlight a word in the text or type it first.");
    if (addTerm(term)) { getState().manualWritten = ""; $("manual").value = ""; select(""); changed(); }
  }
  on($("manual"), "input", () => { getState().manualWritten = $("manual").value; changed(); });
  on($("manual"), "keydown", event => { if (event.key === "Enter") { event.preventDefault(); add(); } });
  on($("add"), "click", add);
  on(source, "mouseup", rememberSelection); on(source, "keyup", rememberSelection);
  on($("adjust"), "click", () => { if (selected.trim()) add(); else { $("manual").focus(); status("Highlight text in the text box, or type the word or phrase."); } });
  function refresh() {
    const state = getState();
    if (state.source !== lastSource) { select(""); caret = null; passages = splitReviewPassages(state.source); lastSource = state.source; }
    state.sentence = Math.max(0, Math.min(state.sentence || 0, passages.length - 1));
    $("manual").value = state.manualWritten || ""; $("manual").disabled = isBusy(); $("add").disabled = isBusy();
    renderCells();
    $("source-details").textContent = /^(From \S+ file|\S+ · Complete extracted text)$/.test(state.sourceDetails || "") ? "" : state.sourceDetails || "";
    if (extension) $("pull").disabled = isBusy() || pullBusy;
  }
  for (const button of cellsHost.querySelectorAll(".hs-step[data-step]")) on(button, "click", () => step(Number(button.dataset.step)));
  on($("scope"), "change", () => { if (!playingButton) clearHighlight(); renderCells(); });
  on($("hear-default"), "click", () => hear(false));
  on($("hear-class"), "click", () => hear(true));
  const unsubscribePause = subscribeSpeechPauseState(isPaused => { if (destroyed) return; paused = isPaused; if (playingButton) showPlaying(playingButton); });
  if (extension) on($("pull"), "click", async () => {
    if (isBusy() || pullBusy) return; pullBusy = true; refresh(); status("Reading the source page…");
    const startedState = getState();
    try {
      const capture = await pullTextFromActiveTab();
      if (destroyed || startedState !== getState()) return;
      if (!capture.ok) return status(capture.error);
      const state = getState(), append = $("capture-mode").value === "append";
      if (append && capture.source !== "selection") return status("Select text on the source page before appending.");
      const text = append && state.source ? `${state.source}\n\n${capture.text}` : capture.text;
      if (text.length > AI_TEXT_LIMIT) return status(`The combined content exceeds ${AI_TEXT_LIMIT.toLocaleString("en-US")} characters. Your current content is kept.`);
      if (!append && state.source && state.source !== text && !window.confirm("Replace the captured passage? Review decisions are retained until you analyze again.")) return;
      state.source = text; state.sentence = 0;
      state.sourceDetails = `${capture.tabTitle || "Source page"} · ${pullSourceLabel(capture.source)}${capture.truncated ? ` · Truncated from ${Number(capture.totalLength).toLocaleString()} characters; select another section for the rest.` : ""}`;
      source.value = text; source.dispatchEvent(new Event("input", { bubbles: true })); refresh();
      status("Passage captured. Listen, get AI suggestions, or highlight a term to add.");
    } catch (error) { status(`Capture failed: ${error.message}`); }
    finally { pullBusy = false; if (!destroyed) refresh(); }
  });
  function refreshRecovery() {
    let legacy;
    try { legacy = loadReviewSession(localStorage, getLegacyScope()); } catch { legacy = null; }
    if (!legacy || legacy.courseId !== getCourseId()) { $("recovery").hidden = true; return; }
    legacySections = legacy.passage ? splitDocumentSections([{ text: legacy.passage, label: "Previous Lab passage" }], AI_TEXT_LIMIT) : [];
    legacyTerms = [...(legacy.drafts?.[getCourseId()]?.pattern ? [legacy.drafts[getCourseId()]] : []), ...(legacy.queue || []).filter(item => item.courseId === getCourseId())].filter(item => item.pattern);
    $("recovery").hidden = !legacySections.length && !legacyTerms.length;
    $("recovery-section").replaceChildren(...legacySections.map((item, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = `${index + 1} of ${legacySections.length}`; return option; }));
    $("recovery-section").value = "0"; $("recovery-preview").value = legacySections[0]?.text || "";
    $("recover-source").disabled = !legacySections.length;
    $("recovery-terms").replaceChildren(...legacyTerms.map(item => { const button = document.createElement("button"); button.type = "button"; button.className = "ss-btn"; button.textContent = `Review previous term: ${item.pattern}`; button.addEventListener("click", () => addTerm(item.pattern, item.spoken || "", "Recovered from previous Lab work", item.ignore_case)); return button; }));
  }
  on($("recovery-section"), "change", () => { $("recovery-preview").value = legacySections[Number($("recovery-section").value)]?.text || ""; });
  on($("recover-source"), "click", () => { if (isBusy()) return; const text = $("recovery-preview").value;
    if (getState().source && getState().source !== text && !window.confirm("Use this previous passage section? Current review decisions remain available until you analyze again.")) return;
    getState().source = text; source.value = text; source.dispatchEvent(new Event("input", { bubbles: true })); refresh();
  });
  return { refresh, refreshRecovery, focusManual() { source.focus(); status("Highlight the word or phrase in the text, then choose + Add."); },
    /** The highlighted text in the text box, if any (for AI on a selection). */
    selection: () => selected.trim() ? { text: selected, start: selectedStart } : null,
    destroy() { destroyed = true; resizeWatch?.disconnect(); unsubscribePause(); unsubscribeSpeech(); cancelSpeech(); listeners.forEach(remove => remove()); listenHost.querySelector(".hs-listen")?.remove(); backdrop.remove(); wrap.replaceWith(source); } };
}

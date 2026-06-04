// Thin wrapper around the Web Speech API so sighted authors can HEAR how a
// default TTS engine renders text. This is the core "show authors the truth"
// feature: it does not perfectly match any specific screen reader, but it
// reliably surfaces the same classes of mispronunciation (dropped subscripts,
// spelled-out units, silent symbols).

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

let voicesCache = [];
let pendingSpeakTimer = null;
let voicesListenerAttached = false;
const stateListeners = new Set();
const pauseListeners = new Set();
let speechPaused = false;

/** @type {null | {
 *   expanded: Array<{ text: string, lineIndex?: number }>,
 *   index: number,
 *   rate: number,
 *   voiceURI: string | null,
 *   pauseMs: number,
 *   onend: (() => void) | null,
 *   onChunkStart: ((chunk: unknown, i: number) => void) | null,
 *   onboundary: ((event: SpeechSynthesisEvent) => void) | null,
 *   waitingBetweenChunks: boolean,
 * }} */
let activeQueue = null;

function notifySpeechState(playing) {
  for (const fn of stateListeners) fn(playing);
}

function notifyPauseState(paused) {
  for (const fn of pauseListeners) fn(paused);
}

function finishActiveQueue(onEnd) {
  const end = onEnd ?? activeQueue?.onend;
  activeQueue = null;
  speechPaused = false;
  notifyPauseState(false);
  notifySpeechState(false);
  end?.();
}

/** True while speech is pending, speaking, queued, or paused mid-playback. */
export function isSpeechActive() {
  if (pendingSpeakTimer != null) return true;
  if (activeQueue) return true;
  if (speechPaused) return true;
  if (!speechSupported()) return false;
  const synth = window.speechSynthesis;
  return synth.speaking || synth.pending;
}

/** True while playback is paused (utterance or between queued chunks). */
export function isSpeechPaused() {
  return speechPaused;
}

/** Subscribe to speech active/inactive changes. Returns an unsubscribe function. */
export function subscribeSpeechState(fn) {
  stateListeners.add(fn);
  fn(isSpeechActive());
  return () => stateListeners.delete(fn);
}

/** Subscribe to pause/resume changes. Returns an unsubscribe function. */
export function subscribeSpeechPauseState(fn) {
  pauseListeners.add(fn);
  fn(isSpeechPaused());
  return () => pauseListeners.delete(fn);
}

export function loadVoices() {
  return new Promise((resolve) => {
    if (!speechSupported()) return resolve([]);
    syncVoicesCache();
    if (voicesCache.length) return resolve(voicesCache);

    if (!voicesListenerAttached) {
      voicesListenerAttached = true;
      window.speechSynthesis.addEventListener("voiceschanged", () => {
        syncVoicesCache();
      });
    }

    window.speechSynthesis.onvoiceschanged = () => {
      syncVoicesCache();
      resolve(voicesCache.length ? voicesCache : window.speechSynthesis.getVoices());
    };
    setTimeout(() => {
      syncVoicesCache();
      resolve(voicesCache.length ? voicesCache : window.speechSynthesis.getVoices());
    }, 250);
  });
}

/** Warm voice list on startup (not required before speak). */
export function preloadSpeech() {
  if (!speechSupported()) return;
  syncVoicesCache();
  void loadVoices();
}

export function cancelSpeech() {
  if (!speechSupported()) return;
  if (pendingSpeakTimer != null) {
    window.clearTimeout(pendingSpeakTimer);
    pendingSpeakTimer = null;
  }
  activeQueue = null;
  speechPaused = false;
  notifyPauseState(false);
  window.speechSynthesis.cancel();
  notifySpeechState(false);
}

/** Pause current Hear playback (utterance or between queued lines). */
export function pauseSpeech() {
  if (!speechSupported() || speechPaused || !isSpeechActive()) return;
  speechPaused = true;
  if (pendingSpeakTimer != null) {
    window.clearTimeout(pendingSpeakTimer);
    pendingSpeakTimer = null;
    if (activeQueue) activeQueue.waitingBetweenChunks = true;
  }
  const synth = window.speechSynthesis;
  if (synth.speaking && !synth.paused) synth.pause();
  notifyPauseState(true);
}

/** Resume paused Hear playback. */
export function resumeSpeech() {
  if (!speechSupported() || !speechPaused) return;
  speechPaused = false;
  const synth = window.speechSynthesis;
  if (synth.paused) {
    synth.resume();
  } else if (activeQueue?.waitingBetweenChunks) {
    activeQueue.waitingBetweenChunks = false;
    speakNextFromQueue();
  }
  notifyPauseState(false);
}

/** Toggle pause; returns true when paused after the call. */
export function toggleSpeechPause() {
  if (speechPaused) resumeSpeech();
  else pauseSpeech();
  return speechPaused;
}

function synthIsSpeaking() {
  if (!speechSupported()) return false;
  return window.speechSynthesis.speaking;
}

function syncVoicesCache() {
  if (!speechSupported()) return;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) voicesCache = voices;
}

function voiceFromCache(voiceURI) {
  if (!voiceURI || !voicesCache.length) return null;
  return voicesCache.find((x) => x.voiceURI === voiceURI) ?? null;
}

function cancelSpeechForRestart() {
  if (!speechSupported()) return false;
  if (pendingSpeakTimer != null) {
    window.clearTimeout(pendingSpeakTimer);
    pendingSpeakTimer = null;
  }
  activeQueue = null;
  speechPaused = false;
  notifyPauseState(false);
  const wasSpeaking = synthIsSpeaking();
  if (wasSpeaking) window.speechSynthesis.cancel();
  return wasSpeaking;
}

const SPEAK_AFTER_CANCEL_MS = 320;

// Chrome/Edge drop the opening ~2-3 words while the audio sink cold-starts. We queue
// a SILENT (volume 0) warm-up utterance right before the first real one each batch:
// the clip lands on the inaudible pad, so curriculum text plays from its true start.
// Several words at a slow rate give the sink enough time to spin up.
const WARMUP_PAD_TEXT = "and and and and and and";

export function needsChromeClipGuard() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Chrome|Chromium|Edg\//.test(ua) && !/Firefox/.test(ua);
}

function speakSilentWarmup(synth, voiceURI) {
  const pad = new SpeechSynthesisUtterance(WARMUP_PAD_TEXT);
  pad.volume = 0;
  pad.rate = 0.7;
  pad.lang = "en-US";
  const v = voiceFromCache(voiceURI);
  if (v) pad.voice = v;
  synth.speak(pad);
}

function splitSpeechChunks(text) {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length > 1) return parts;
  if (text.length <= 120) return [text];
  return [text];
}

function expandSpeechChunks(chunks) {
  return (Array.isArray(chunks) ? chunks : [chunks])
    .map((c) => String(c ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((line) => splitSpeechChunks(line));
}

function scheduleSpeak(run) {
  pendingSpeakTimer = window.setTimeout(() => {
    pendingSpeakTimer = null;
    run();
  }, SPEAK_AFTER_CANCEL_MS);
}

function speakUtterance(
  text,
  { rate = 0.9, voiceURI = null, onend = null, onerror = null, onboundary = null, clipGuard = false } = {},
) {
  const synth = window.speechSynthesis;
  if (clipGuard && needsChromeClipGuard()) speakSilentWarmup(synth, voiceURI);
  const u = new SpeechSynthesisUtterance();
  u.rate = rate;
  u.lang = "en-US";
  const v = voiceFromCache(voiceURI);
  if (v) u.voice = v;
  u.text = text;
  if (onboundary) u.onboundary = onboundary;
  u.onend = () => onend?.();
  u.onerror = () => (onerror ?? onend)?.();
  synth.speak(u);
  if (synth.paused) synth.resume();
}

export function speak(text, { rate = 0.9, voiceURI = null, onend = null } = {}) {
  if (!speechSupported()) return null;
  const utterText = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!utterText) return null;

  const chunks = splitSpeechChunks(utterText);
  if (chunks.length > 1) {
    return speakQueued(chunks, { rate, voiceURI, pauseMs: 220, onend });
  }

  const hadActiveSpeech = cancelSpeechForRestart();
  notifySpeechState(true);

  const finish = () => {
    notifySpeechState(false);
    onend?.();
  };
  const start = () =>
    speakUtterance(utterText, {
      rate,
      voiceURI,
      clipGuard: true,
      onend: finish,
      onerror: finish,
    });

  if (hadActiveSpeech) scheduleSpeak(start);
  else start();

  return null;
}

function speakNextFromQueue() {
  if (!activeQueue || speechPaused) return;
  const q = activeQueue;
  if (q.index >= q.expanded.length) {
    finishActiveQueue();
    return;
  }
  const chunk = q.expanded[q.index];
  const clipGuard = q.index === 0;
  const chunkIndex = q.index;
  q.index += 1;
  q.waitingBetweenChunks = false;
  q.onChunkStart?.(chunk, chunkIndex);
  speakUtterance(chunk.text, {
    rate: q.rate,
    voiceURI: q.voiceURI,
    clipGuard,
    onboundary: q.onboundary,
    onend: () => {
      if (!activeQueue) return;
      if (q.index >= q.expanded.length) {
        finishActiveQueue();
        return;
      }
      if (speechPaused) {
        q.waitingBetweenChunks = true;
        return;
      }
      pendingSpeakTimer = window.setTimeout(() => {
        pendingSpeakTimer = null;
        speakNextFromQueue();
      }, q.pauseMs);
    },
    onerror: () => finishActiveQueue(),
  });
}

/** Speak each chunk in order with a short pause between lines (for multi-line preview). */
export function speakQueued(
  chunks,
  { rate = 0.9, pauseMs = 450, voiceURI = null, onend = null, onChunkStart = null, onboundary = null } = {},
) {
  if (!speechSupported()) return null;
  const normalized = (Array.isArray(chunks) ? chunks : [chunks]).map((chunk) => {
    if (chunk && typeof chunk === "object" && "text" in chunk) return chunk;
    return { text: String(chunk ?? "").trim() };
  });
  const lines = normalized
    .map((chunk) => ({ ...chunk, text: String(chunk.text ?? "").replace(/\s+/g, " ").trim() }))
    .filter((chunk) => chunk.text);
  const expanded = lines.flatMap((chunk) =>
    splitSpeechChunks(chunk.text).map((text) => ({ ...chunk, text })),
  );
  if (!expanded.length) return null;

  const hadActiveSpeech = cancelSpeechForRestart();
  speechPaused = false;
  notifyPauseState(false);
  activeQueue = {
    expanded,
    index: 0,
    rate,
    voiceURI,
    pauseMs,
    onend,
    onChunkStart,
    onboundary,
    waitingBetweenChunks: false,
  };
  notifySpeechState(true);

  if (hadActiveSpeech) scheduleSpeak(speakNextFromQueue);
  else speakNextFromQueue();

  return null;
}

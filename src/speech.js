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

function notifySpeechState(playing) {
  for (const fn of stateListeners) fn(playing);
}

/** True while speech is pending, speaking, or queued. */
export function isSpeechActive() {
  if (pendingSpeakTimer != null) return true;
  if (!speechSupported()) return false;
  const synth = window.speechSynthesis;
  return synth.speaking || synth.pending;
}

/** Subscribe to speech active/inactive changes. Returns an unsubscribe function. */
export function subscribeSpeechState(fn) {
  stateListeners.add(fn);
  fn(isSpeechActive());
  return () => stateListeners.delete(fn);
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
  window.speechSynthesis.cancel();
  notifySpeechState(false);
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
  { rate = 0.9, voiceURI = null, onend = null, onerror = null, clipGuard = false } = {},
) {
  const synth = window.speechSynthesis;
  if (clipGuard && needsChromeClipGuard()) speakSilentWarmup(synth, voiceURI);
  const u = new SpeechSynthesisUtterance();
  u.rate = rate;
  u.lang = "en-US";
  const v = voiceFromCache(voiceURI);
  if (v) u.voice = v;
  u.text = text;
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

/** Speak each chunk in order with a short pause between lines (for multi-line preview). */
export function speakQueued(chunks, { rate = 0.9, pauseMs = 450, voiceURI = null, onend = null } = {}) {
  if (!speechSupported()) return null;
  const lines = expandSpeechChunks(chunks);
  if (!lines.length) return null;

  const hadActiveSpeech = cancelSpeechForRestart();
  notifySpeechState(true);

  let index = 0;
  function speakNext() {
    if (index >= lines.length) {
      notifySpeechState(false);
      return;
    }
    const line = lines[index];
    const clipGuard = index === 0;
    index++;
    speakUtterance(line, {
      rate,
      voiceURI,
      clipGuard,
      onend: () => {
        if (index >= lines.length) {
          notifySpeechState(false);
          onend?.();
          return;
        }
        pendingSpeakTimer = window.setTimeout(() => {
          pendingSpeakTimer = null;
          speakNext();
        }, pauseMs);
      },
      onerror: () => {
        notifySpeechState(false);
        onend?.();
      },
    });
  }

  if (hadActiveSpeech) scheduleSpeak(speakNext);
  else speakNext();

  return null;
}

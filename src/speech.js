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
    const existing = window.speechSynthesis.getVoices();
    if (existing.length) {
      voicesCache = existing;
      return resolve(existing);
    }
    window.speechSynthesis.onvoiceschanged = () => {
      voicesCache = window.speechSynthesis.getVoices();
      resolve(voicesCache);
    };
    // Safety: some browsers never fire the event if already loaded.
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 250);
  });
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

function synthBusy() {
  if (!speechSupported()) return false;
  const synth = window.speechSynthesis;
  return synth.speaking || synth.pending;
}

function syncVoicesCache() {
  if (!speechSupported()) return;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) voicesCache = voices;
}

/** Cancel in-flight speech only when needed. Returns true if something was cancelled. */
function cancelSpeechForRestart() {
  if (!speechSupported()) return false;
  if (pendingSpeakTimer != null) {
    window.clearTimeout(pendingSpeakTimer);
    pendingSpeakTimer = null;
  }
  const wasBusy = synthBusy();
  if (wasBusy) window.speechSynthesis.cancel();
  return wasBusy;
}

// Browsers (especially Chrome/Edge) drop the start of an utterance when speak()
// follows cancel() in the same turn. Only delay after an actual cancel — calling
// cancel() when idle also truncates the next utterance's opening words.
const SPEAK_AFTER_CANCEL_MS = 280;

function scheduleSpeak(run) {
  pendingSpeakTimer = window.setTimeout(() => {
    pendingSpeakTimer = null;
    syncVoicesCache();
    run();
  }, SPEAK_AFTER_CANCEL_MS);
}

function speakUtterance(text, { rate = 0.9, voiceURI = null, onend = null, onerror = null } = {}) {
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  if (voiceURI) {
    const v = (voicesCache.length ? voicesCache : synth.getVoices()).find(
      (x) => x.voiceURI === voiceURI,
    );
    if (v) u.voice = v;
  }
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

  const hadActiveSpeech = cancelSpeechForRestart();
  notifySpeechState(true);
  syncVoicesCache();

  const finish = () => {
    notifySpeechState(false);
    onend?.();
  };
  const start = () => speakUtterance(utterText, { rate, voiceURI, onend: finish, onerror: finish });

  if (hadActiveSpeech) scheduleSpeak(start);
  else start();

  return null;
}

/** Speak each chunk in order with a short pause between lines (for multi-line preview). */
export function speakQueued(chunks, { rate = 0.9, pauseMs = 450 } = {}) {
  if (!speechSupported()) return null;
  const lines = (Array.isArray(chunks) ? chunks : [chunks])
    .map((c) => String(c ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const hadActiveSpeech = cancelSpeechForRestart();
  notifySpeechState(true);
  syncVoicesCache();

  let index = 0;
  function speakNext() {
    if (index >= lines.length) {
      notifySpeechState(false);
      return;
    }
    const line = lines[index++];
    speakUtterance(line, {
      rate,
      onend: () => {
        if (index >= lines.length) {
          notifySpeechState(false);
          return;
        }
        pendingSpeakTimer = window.setTimeout(() => {
          pendingSpeakTimer = null;
          speakNext();
        }, pauseMs);
      },
      onerror: () => notifySpeechState(false),
    });
  }

  if (hadActiveSpeech) scheduleSpeak(speakNext);
  else speakNext();

  return null;
}

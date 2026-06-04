// Shared Hear button behavior (play / stop toggle).

import {
  speak,
  speakQueued,
  cancelSpeech,
  toggleSpeechPause,
  isSpeechPaused,
  subscribeSpeechState,
  subscribeSpeechPauseState,
} from "./speech.js";

const HEAR_STOP_LABEL = "\u25a0 Stop";
const HEAR_PAUSE_LABEL = "\u23f8 Pause";
const HEAR_RESUME_LABEL = "\u25b6 Resume";

export function setHearPlaying(btn, playing, { hearLabel, hearTitle }) {
  if (!btn?.isConnected) return;
  btn.textContent = playing ? HEAR_STOP_LABEL : hearLabel;
  btn.title = playing ? "Stop playback" : hearTitle;
  btn.setAttribute("aria-pressed", playing ? "true" : "false");
  btn.classList.toggle("ss-btn-stop", playing);
  btn.classList.toggle("ss-hear-playing", playing);
}

export function createHearController() {
  let activeBtn = null;
  let activeMeta = null;

  function clear() {
    if (activeBtn && activeMeta) setHearPlaying(activeBtn, false, activeMeta);
    activeBtn = null;
    activeMeta = null;
  }

  function resetIfDetached() {
    if (activeBtn && !activeBtn.isConnected) {
      activeBtn = null;
      activeMeta = null;
    }
  }

  function play(btn, meta, text, hearOpts = {}) {
    if (btn.classList.contains("ss-hear-playing")) {
      cancelSpeech();
      hearOpts.onStop?.();
      return;
    }
    const rawChunks = Array.isArray(text) ? text : [text];
    const chunks = rawChunks
      .map((entry) => {
        if (entry && typeof entry === "object" && "text" in entry) {
          return { ...entry, text: String(entry.text ?? "").trim() };
        }
        return { text: String(entry ?? "").trim() };
      })
      .filter((c) => c.text);
    if (!chunks.length) return;
    if (chunks.length === 1 && chunks[0].lineIndex == null && !hearOpts.onChunkStart) {
      speak(chunks[0].text, { onend: hearOpts.onStop });
    } else {
      speakQueued(chunks, {
        onChunkStart: hearOpts.onChunkStart,
        onboundary: hearOpts.onboundary,
        onend: hearOpts.onStop,
      });
    }
    clear();
    activeBtn = btn;
    activeMeta = meta;
    setHearPlaying(btn, true, meta);
  }

  function bind(btn, meta) {
    btn.addEventListener("click", () => play(btn, meta, meta.getText()));
  }

  subscribeSpeechState((playing) => {
    if (!playing) clear();
  });

  function togglePause() {
    if (!activeBtn) return isSpeechPaused();
    return toggleSpeechPause();
  }

  function isPlaying() {
    return Boolean(activeBtn?.isConnected);
  }

  return {
    bind,
    play,
    clear,
    resetIfDetached,
    togglePause,
    isPlaying,
    isPaused: isSpeechPaused,
    subscribePauseState: subscribeSpeechPauseState,
    PAUSE_LABEL: HEAR_PAUSE_LABEL,
    RESUME_LABEL: HEAR_RESUME_LABEL,
  };
}

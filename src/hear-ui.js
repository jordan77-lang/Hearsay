// Shared Hear button behavior (play / stop toggle).

import { speak, speakQueued, cancelSpeech, subscribeSpeechState } from "./speech.js";

const HEAR_STOP_LABEL = "\u25a0 Stop";

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

  function play(btn, meta, text) {
    if (btn.classList.contains("ss-hear-playing")) {
      cancelSpeech();
      return;
    }
    const lines = Array.isArray(text) ? text : [text];
    const chunks = lines.map((l) => String(l ?? "").trim()).filter(Boolean);
    if (!chunks.length) return;
    if (chunks.length === 1) speak(chunks[0]);
    else speakQueued(chunks);
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

  return { bind, play, clear, resetIfDetached };
}

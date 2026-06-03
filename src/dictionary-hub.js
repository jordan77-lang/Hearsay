// Legacy hub entry — editor is embedded at /dictionary/ (Phase 3).

export { mountDictionaryEditor, mountDictionaryEditor as mountDictionaryHub } from "./dictionary-editor.js";

/** External Builder (screenreader repo); prefer embedded editor at /dictionary/. */
export const DICTIONARY_BUILDER_URL =
  "https://jordan77-lang.github.io/screenreader/dictionary-builder.html";

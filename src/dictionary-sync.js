// Notify every HearSay surface when a class dictionary is saved or pulled from Supabase.

export const DICTIONARY_SYNC_STORAGE_KEY = "hearsay-dictionary-updated";
export const DICTIONARY_SYNC_EVENT = "hearsay-dictionary-updated";
export const SUPABASE_CONNECTION_EVENT = "hearsay-supabase-connection-changed";

/**
 * @param {string | null | undefined} classSlug
 * @param {string | null | undefined} activeClass
 */
export function dictionarySyncMatchesClass(classSlug, activeClass) {
  if (!classSlug) return true;
  if (!activeClass) return true;
  return classSlug === activeClass;
}

/**
 * Broadcast that a class dictionary changed. All mounted HearSay instances should reload.
 * @param {{ classSlug?: string, source?: string, deleted?: string }} detail
 */
export function notifyDictionaryUpdated(detail = {}) {
  const payload = {
    classSlug: detail.classSlug ?? null,
    at: Date.now(),
    source: detail.source ?? null,
    deleted: detail.deleted ?? null,
    viaStorage: false,
  };
  try {
    localStorage.setItem(
      DICTIONARY_SYNC_STORAGE_KEY,
      JSON.stringify({ ...payload, viaStorage: true }),
    );
  } catch (_) {}
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DICTIONARY_SYNC_EVENT, { detail: payload }));
}

/** Broadcast that Supabase connect credentials changed in this browser. */
export function notifySupabaseConnectionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUPABASE_CONNECTION_EVENT));
}

/**
 * @param {(detail: { classSlug: string | null, at: number, source?: string | null, deleted?: string | null, viaStorage?: boolean }) => void} handler
 * @returns {() => void}
 */
export function onDictionaryUpdated(handler) {
  if (typeof window === "undefined") return () => {};
  const onEvent = (e) => handler({ ...(e.detail ?? {}), viaStorage: false });
  const onStorage = (e) => {
    if (e.key !== DICTIONARY_SYNC_STORAGE_KEY || !e.newValue) return;
    try {
      handler({ ...JSON.parse(e.newValue), viaStorage: true });
    } catch (_) {}
  };
  window.addEventListener(DICTIONARY_SYNC_EVENT, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(DICTIONARY_SYNC_EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * @param {() => void} handler
 * @returns {() => void}
 */
export function onSupabaseConnectionChanged(handler) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SUPABASE_CONNECTION_EVENT, handler);
  return () => window.removeEventListener(SUPABASE_CONNECTION_EVENT, handler);
}

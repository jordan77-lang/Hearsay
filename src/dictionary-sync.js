// Notify Lab / Dictionary when a class dictionary is saved or pulled from Supabase.

export const DICTIONARY_SYNC_STORAGE_KEY = "hearsay-dictionary-updated";
export const DICTIONARY_SYNC_EVENT = "hearsay-dictionary-updated";
export const SUPABASE_CONNECTION_EVENT = "hearsay-supabase-connection-changed";

/**
 * Broadcast that a class dictionary changed. Listeners reload from Supabase for that class.
 * @param {{ classSlug?: string, source?: string, deleted?: string }} detail
 */
export function notifyDictionaryUpdated(detail = {}) {
  const payload = {
    classSlug: detail.classSlug ?? null,
    at: Date.now(),
    source: detail.source ?? null,
    deleted: detail.deleted ?? null,
  };
  try {
    localStorage.setItem(DICTIONARY_SYNC_STORAGE_KEY, JSON.stringify(payload));
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
 * @param {(detail: { classSlug: string | null, at: number, source?: string | null }) => void} handler
 * @returns {() => void}
 */
export function onDictionaryUpdated(handler) {
  if (typeof window === "undefined") return () => {};
  const onEvent = (e) => handler(e.detail ?? {});
  const onStorage = (e) => {
    if (e.key !== DICTIONARY_SYNC_STORAGE_KEY || !e.newValue) return;
    try {
      handler(JSON.parse(e.newValue));
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

// Warn when Supabase-backed actions run without ☁ Connect credentials.

import { getStoredSupabaseConfig } from "./dictionary-api.js";

/** True when URL + anon key are saved in this browser. */
export function isSupabaseConnected() {
  const stored = getStoredSupabaseConfig();
  return Boolean(stored?.url && stored?.anonKey);
}

/**
 * User-facing message for blocked actions.
 * @param {string} [feature] e.g. "Saving terms"
 */
export function supabaseConnectMessage(feature) {
  const lead = feature ? `${feature} requires` : "This requires";
  return `${lead} Supabase. Click ☁ Connect and enter your project URL and anon key.`;
}

/**
 * Block an action when not connected; optionally alert and run connect UI.
 * @param {{
 *   feature: string,
 *   api?: object | null,
 *   alert?: boolean,
 *   onConnect?: () => void,
 * }} opts
 * @returns {boolean} true when OK to proceed
 */
export function requireSupabaseConnection({
  feature,
  api,
  alert: useAlert = false,
  onConnect,
} = {}) {
  const connected = isSupabaseConnected();
  const hasApi = api === undefined ? connected : Boolean(api);
  if (connected && hasApi) return true;

  const msg = supabaseConnectMessage(feature);
  if (useAlert) window.alert(msg);
  onConnect?.();
  return false;
}

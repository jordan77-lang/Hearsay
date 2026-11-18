// Team sign-in: one shared Supabase account whose email is built in, so
// authors only type the team password. Supabase row-level security (see
// supabase/team-access.sql) lets anyone read and only this account edit.
import { TEAM_EMAIL } from "./team-config.js";

const SESSION_KEY = "hearsay-team-session";
const REFRESH_MARGIN_MS = 60_000;
let refreshing = null;
const listeners = new Set();

function storage() { try { return globalThis.localStorage ?? null; } catch { return null; } }
function trimSlash(url) { return String(url ?? "").replace(/\/+$/, ""); }

function readSession() {
  try { const value = JSON.parse(storage()?.getItem(SESSION_KEY) || "null"); return value?.access_token && value?.refresh_token ? value : null; }
  catch { return null; }
}
function writeSession(session) {
  try { if (session) storage()?.setItem(SESSION_KEY, JSON.stringify(session)); else storage()?.removeItem(SESSION_KEY); } catch { /* storage blocked */ }
  for (const listener of listeners) listener(Boolean(session));
}
function toSession(url, body) {
  return { url: trimSlash(url), access_token: body.access_token, refresh_token: body.refresh_token,
    expires_at: Date.now() + Number(body.expires_in || 3600) * 1000, email: body.user?.email || TEAM_EMAIL };
}

/** True when this browser holds a team session for the given project. */
export function isTeamSignedIn(url) {
  const session = readSession();
  return Boolean(session && (!url || session.url === trimSlash(url)));
}

/** Subscribe to sign-in / sign-out. Returns an unsubscribe function. */
export function onTeamSessionChanged(listener) { listeners.add(listener); return () => listeners.delete(listener); }

/** Sign in with the team password. Throws a readable error when it fails. */
export async function signInTeam({ url, anonKey }, password) {
  let response;
  try {
    response = await fetch(`${trimSlash(url)}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEAM_EMAIL, password: String(password ?? "") }),
    });
  } catch { throw new Error("Could not reach the dictionary service. Check your internet connection and try again."); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(response.status === 400 || response.status === 401 ? "That password is not right." : response.status === 429 ? "Too many attempts. Wait a minute and try again." : "Sign-in failed. Try again.");
  }
  writeSession(toSession(url, body));
  return true;
}

export function signOutTeam() { writeSession(null); }

/**
 * A valid access token for requests to this project, refreshing it shortly
 * before it expires. Null when not signed in (requests then use the public
 * key and can only read).
 */
export async function teamAccessToken(url, anonKey) {
  const session = readSession();
  if (!session || session.url !== trimSlash(url)) return null;
  if (session.expires_at - Date.now() > REFRESH_MARGIN_MS) return session.access_token;
  refreshing ??= (async () => {
    try {
      const response = await fetch(`${trimSlash(url)}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.access_token) { writeSession(null); return null; }
      const next = toSession(url, body); writeSession(next); return next.access_token;
    } catch { return session.access_token; } // offline: keep the session; the request decides
    finally { refreshing = null; }
  })();
  return refreshing;
}

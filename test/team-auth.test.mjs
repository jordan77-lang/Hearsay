import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { signInTeam, signOutTeam, isTeamSignedIn, teamAccessToken } from "../src/supabase/team-auth.js";
import { createSupabaseClient } from "../src/supabase/client.js";
import { TEAM_EMAIL, TEAM_SUPABASE } from "../src/supabase/team-config.js";

const project = { url: "https://team.supabase.co", anonKey: "public-anon-key" };
function memoryStorage() { const values = new Map(); return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) }; }

test("team sign-in uses the built-in email, remembers the session and sends it with requests", async () => {
  globalThis.localStorage = memoryStorage();
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("grant_type=password")) {
      const body = JSON.parse(options.body);
      if (body.password !== "right") return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json({ access_token: "team-token", refresh_token: "refresh-1", expires_in: 3600, user: { email: body.email } });
    }
    return Response.json([]);
  };
  await assert.rejects(signInTeam(project, "wrong"), /That password is not right/);
  assert.equal(isTeamSignedIn(project.url), false);
  await signInTeam(project, "right");
  assert.equal(JSON.parse(calls[1].options.body).email, TEAM_EMAIL, "email is built in, never typed");
  assert.equal(TEAM_EMAIL, "dreamscape@hearsay.team");
  assert.equal(isTeamSignedIn(project.url), true);
  assert.equal(isTeamSignedIn("https://other.supabase.co"), false);
  // Requests carry the team session instead of the public key.
  const client = createSupabaseClient(project);
  await client.rest("entries?select=*");
  assert.equal(calls.at(-1).options.headers.Authorization, "Bearer team-token");
  assert.equal(calls.at(-1).options.headers.apikey, "public-anon-key");
  // Signed out: back to the public (read-only) key.
  signOutTeam();
  await client.rest("entries?select=*");
  assert.equal(calls.at(-1).options.headers.Authorization, "Bearer public-anon-key");
});

test("an expiring team session refreshes itself; a rejected refresh signs out", async () => {
  globalThis.localStorage = memoryStorage();
  let refreshOk = true;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("grant_type=password")) return Response.json({ access_token: "old", refresh_token: "r1", expires_in: 1 });
    if (String(url).includes("grant_type=refresh_token")) {
      // Supabase rotates refresh tokens: the first refresh sends r1, the next r2.
      assert.equal(JSON.parse(options.body).refresh_token, refreshOk ? "r1" : "r2");
      return refreshOk ? Response.json({ access_token: "new", refresh_token: "r2", expires_in: 3600 }) : Response.json({}, { status: 400 });
    }
    return Response.json([]);
  };
  await signInTeam(project, "pw");
  assert.equal(await teamAccessToken(project.url, project.anonKey), "new");
  assert.equal(await teamAccessToken(project.url, project.anonKey), "new", "fresh token is reused");
  // Force expiry again, then reject the refresh.
  const stored = JSON.parse(localStorage.getItem("hearsay-team-session")); stored.expires_at = 0;
  localStorage.setItem("hearsay-team-session", JSON.stringify(stored)); refreshOk = false;
  assert.equal(await teamAccessToken(project.url, project.anonKey), null);
  assert.equal(isTeamSignedIn(project.url), false);
});

test("command-line tools with a service-role key never use the team session", async () => {
  globalThis.localStorage = memoryStorage();
  localStorage.setItem("hearsay-team-session", JSON.stringify({ url: project.url, access_token: "team-token", refresh_token: "r", expires_at: Date.now() + 3600e3 }));
  let headers;
  globalThis.fetch = async (_url, options) => { headers = options.headers; return Response.json([]); };
  await createSupabaseClient({ url: project.url, serviceRoleKey: "service" }).rest("entries");
  assert.equal(headers.Authorization, "Bearer service");
});

test("the built-in connection is the public key only, and the SQL limits edits to the team account", async () => {
  if (TEAM_SUPABASE.anonKey) {
    const claims = JSON.parse(Buffer.from(TEAM_SUPABASE.anonKey.split(".")[1], "base64url").toString());
    assert.equal(claims.role, "anon", "never ship a service-role key");
  }
  const sql = await readFile(new URL("../supabase/team-access.sql", import.meta.url), "utf8");
  assert.match(sql, /dreamscape@hearsay\.team/);
  assert.match(sql, /revoke insert, update, delete on public\.%I from anon/);
  for (const table of ["classes", "courses", "dictionary_rules", "entries"]) assert.match(sql, new RegExp(`'${table}'`));
});

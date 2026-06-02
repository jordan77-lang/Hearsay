// Thin Supabase REST client (no npm dependency — works in browser + Node).

function trimSlash(url) {
  return url.replace(/\/+$/, "");
}

export function createSupabaseClient(config) {
  const baseUrl = trimSlash(config.url);
  const key = config.anonKey ?? config.serviceRoleKey;
  if (!baseUrl || !key) throw new Error("Supabase url and API key are required");

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  async function rest(path, { method = "GET", body, prefer } = {}) {
    const h = { ...headers };
    if (prefer) h.Prefer = prefer;
    const res = await fetch(`${baseUrl}/rest/v1/${path}`, {
      method,
      headers: h,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Supabase ${method} ${path}: ${res.status} ${detail}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return { rest, baseUrl, key };
}

export async function loadConfigFromPaths(paths) {
  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (res.ok) return await res.json();
    } catch {
      // try next path
    }
  }
  return null;
}

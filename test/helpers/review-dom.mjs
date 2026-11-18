import { parseHTML } from "linkedom";
export function setupDom({ connected = false } = {}) {
  const { window } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  const values = new Map(); const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  Object.assign(globalThis, { window, document: window.document, localStorage: storage, location: { pathname: "/lab/", reload() {} },
    requestAnimationFrame: fn => { fn(); return 1; }, CustomEvent: window.CustomEvent, DOMParser: window.DOMParser });
  Object.defineProperty(globalThis, "Event", { value: window.Event, configurable: true });
  Object.defineProperty(window.document, "activeElement", { value: null, writable: true, configurable: true });
  window.HTMLElement.prototype.focus = function () { window.document.activeElement = this; };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ top: 0 });
  Object.defineProperty(window.HTMLSelectElement.prototype, "value", { configurable: true,
    get() { return this.querySelector("option[selected]")?.getAttribute("value") ?? this.querySelector("option")?.getAttribute("value") ?? ""; },
    set(value) { this.querySelectorAll("option").forEach(option => option.toggleAttribute("selected", option.getAttribute("value") === value)); } });
  window.getSelection = () => null; window.scrollY = 0; window.scrollTo = (_x, y) => { window.scrollY = y; };
  window.confirm = () => true;
  const utterances = [];
  globalThis.SpeechSynthesisUtterance = class { constructor(text = "") { this.text = text; } };
  window.speechSynthesis = { speaking: false, paused: false, pending: false, getVoices: () => [{ voiceURI: "test" }],
    speak(utterance) { utterances.push(utterance.text); }, cancel() {}, resume() {}, pause() {}, addEventListener() {} };
  const classes = [{ slug: "chem113", label: "CHEM 113", file_prefix: "chem113", addon_defaults: {} }, { slug: "bio181", label: "BIO 181", file_prefix: "bio181", addon_defaults: {} }];
  const rows = new Map([["chem113", []], ["bio181", []]]);
  let failWrites = false;
  globalThis.fetch = async (url, options = {}) => {
    if (!String(url).startsWith("https://test.supabase.co/rest/v1/")) return new Response("", { status: 404 });
    const parsed = new URL(url), table = parsed.pathname.split("/").at(-1), method = options.method ?? "GET";
    const course = parsed.searchParams.get("class_slug")?.replace(/^eq\./, "") ?? "chem113";
    if (method !== "GET" && failWrites) return new Response("offline", { status: 503 });
    if (table === "classes") return Response.json(classes);
    if (table === "entries") {
      if (method === "DELETE") { rows.set(course, []); return new Response(null, { status: 204 }); }
      if (method === "POST") { const body = JSON.parse(options.body); rows.set(body[0].class_slug, body); return new Response(null, { status: 204 }); }
      if (parsed.searchParams.get("limit") === "0") return Response.json([]);
      return Response.json(parsed.searchParams.get("class_slug")?.startsWith("neq.") ? [...rows.values()].flat() : rows.get(course) || []);
    }
    return Response.json([]);
  };
  storage.setItem("hearsay-course-id", connected ? "chem113" : "demo");
  if (connected) storage.setItem("hearsay-supabase-config", JSON.stringify({ url: "https://test.supabase.co", anonKey: "test-key" }));
  return { window, storage, rows, utterances, root: window.document.getElementById("app"), failWrites(value) { failWrites = value; } };
}
export const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); };

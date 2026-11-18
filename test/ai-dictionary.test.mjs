import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { AI_TEXT_LIMIT, AI_SUGGESTION_LIMIT, defaultIgnoreCase, validateAiSuggestions, spokenWordingIssue, canEditAiPronunciation, requiresExactTextApproval, reusableScientificReading } from "../src/core/ai-dictionary.js";
import { analyzeDictionaryText, createAiHandler } from "../tools/createai-api.mjs";
import { mountDictionaryEditor } from "../src/dictionary-editor.js";
import { setupDom, flush } from "./helpers/review-dom.mjs";
import { existingPronunciationsForPassage } from "../src/core/ai-review.js";

const source = "Measure 5 mL of HCl. Use q = mcΔT.";
const suggestion = { term: "mL", spoken: "milliliters", evidence: "Measure 5 mL of HCl.", reason: "Review unit pronunciation.", action: "dictionary" };

test("possibly flattened exponents require source confirmation and cannot become dictionary rules", () => {
  const text = "Use 5.00 × 10-3 M.";
  const result = validateAiSuggestions({ suggestions: [{ ...suggestion, term: "5.00 × 10-3", evidence: text, spoken: "five times ten to negative three" }] }, text);
  assert.equal(result.suggestions[0].action, "review");
  assert.equal(result.suggestions[0].review_kind, "structure");
  assert.equal(canEditAiPronunciation(result.suggestions[0]), false);
  assert.match(result.suggestions[0].reason, /confirm the raised digits/);
  assert.deepEqual(validateAiSuggestions(result, text), result);
});

test("mixed-script pronunciation is flagged without damaging scientific source notation", () => {
  const source = "Lysozyme and ΔT appear with H₂O.";
  const items = [
    { ...suggestion, term: "Lysozyme", evidence: source, spoken: "LYE-soh-zाइम" },
    { ...suggestion, term: "ΔT", evidence: source, spoken: "delta tee" },
    { ...suggestion, term: "H₂O", evidence: source, spoken: "water" },
  ];
  const result = validateAiSuggestions({ suggestions: items }, source);
  assert.equal(result.discarded, 0);
  assert.match(result.suggestions[0].pronunciationWarning, /plain English/);
  assert.equal(result.suggestions[1].term, "ΔT");
  assert.equal(result.suggestions[1].pronunciationWarning, "");
  assert.equal(result.suggestions[2].term, "H₂O");
  assert.equal(spokenWordingIssue("lye suh zime"), "");
  assert.ok(spokenWordingIssue("ˈlaɪsəzaɪm"));
  assert.equal(validateAiSuggestions(result, source).suggestions.length, 3);
});

test("AI proposals require verbatim source evidence and equations stay review-only", () => {
  const payload = { suggestions: [suggestion, { ...suggestion }, { ...suggestion, term: "NaCl" },
    { ...suggestion, evidence: "The sample contains 5 mL." },
    { ...suggestion, term: "q = mcΔT", evidence: "Use q = mcΔT." },
    { ...suggestion, term: "HCl", spoken: "H\tC L" }] };
  const result = validateAiSuggestions(payload, source);
  assert.equal(result.discarded, 4);
  assert.equal(result.suggestions.length, 2);
  assert.equal(result.suggestions[1].action, "review");
  assert.throws(() => validateAiSuggestions({ suggestions: "hello" }, source));
});

test("source evidence tolerates reflow but preserves exact chemistry and reports discard causes", () => {
  const text = "Use ΔG°\r\n  at 298 K. Read\u00a0kJ/(mol·K). Then H₂O.";
  const payload = { suggestions: [
    { ...suggestion, term: "ΔG°", spoken: "delta G standard", evidence: "Use ΔG° at 298 K." },
    { ...suggestion, term: "kJ/(mol·K)", spoken: "kilojoules per mole kelvin", evidence: "Read kJ/(mol·K)." },
    { ...suggestion, term: "H2O", spoken: "H two O", evidence: "Then H2O." },
    { ...suggestion, term: "H₂O", spoken: "H two O", evidence: "H₂O freezes at 298 K." },
    { ...suggestion, term: "ΔS°", spoken: "delta S standard", evidence: "Use ΔG° at 298 K." },
  ] };
  const result = validateAiSuggestions(payload, text);
  assert.equal(result.suggestions.length, 2);
  assert.equal(result.suggestions[0].evidence, "Use ΔG°\r\n  at 298 K.");
  assert.equal(result.suggestions[1].evidence, "Read\u00a0kJ/(mol·K).");
  assert.equal(result.discardedReasons["source excerpt did not match"], 2);
  assert.equal(result.discardedReasons["term did not match its excerpt"], 1);
  assert.equal(validateAiSuggestions(result, text).suggestions.length, 2);
});

test("ASU quotation wrappers do not discard genuine terms or permit invented evidence", () => {
  const text = "ITE engineers compare ΔG° and ΔH°. Read kJ/(mol·K). Then H₂O.";
  const quoted = [
    ["ITE", "I T E", "“ITE engineers compare ΔG° and ΔH°.”"],
    ["ΔG°", "delta G standard", "\"ITE engineers compare ΔG° and ΔH°.\""],
    ["ΔH°", "delta H standard", "‘ITE engineers compare ΔG° and ΔH°.’"],
    ["kJ/(mol·K)", "kilojoules per mole kelvin", "`Read kJ/(mol·K).`"],
  ];
  const result = validateAiSuggestions({ suggestions: quoted.map(([term, spoken, evidence]) => ({ ...suggestion, term, spoken, evidence })) }, text);
  assert.equal(result.suggestions.length, 4);
  assert.equal(result.discarded, 0);
  assert.equal(result.repairedExcerpts, 4);
  assert.ok(result.suggestions.every(item => text.includes(item.evidence)));
  assert.equal(validateAiSuggestions(result, text).suggestions.length, 4);
  const rejected = validateAiSuggestions({ suggestions: [
    { ...suggestion, term: "H2O", spoken: "water", evidence: "“Then H2O.”" },
    { ...suggestion, term: "H₂O", spoken: "water", evidence: "“Then H₂O freezes.”" },
    { ...suggestion, term: "ITE", spoken: "I T E", evidence: "“ITE engineers'" },
  ] }, text);
  assert.equal(rejected.suggestions.length, 0);
  assert.equal(rejected.discardedReasons["source excerpt did not match"], 3);
  const actualQuotes = "The label says “ITE”.";
  const preserved = validateAiSuggestions({ suggestions: [{ ...suggestion, term: "ITE", spoken: "I T E", evidence: "“ITE”" }] }, actualQuotes);
  assert.equal(preserved.suggestions[0].evidence, "“ITE”");
  assert.equal(preserved.repairedExcerpts, 0);
});

test("unchanged glossary entries are omitted while case corrections and structural reviews survive", () => {
  const text = "Use lone pairs and formal charge. Compare NO with no. Use q = mcΔT.";
  const result = validateAiSuggestions({ suggestions: [
    { ...suggestion, term: "lone pairs", spoken: "lone pairs", evidence: text },
    { ...suggestion, term: "formal charge", spoken: "formal   charge", evidence: text },
    { ...suggestion, term: "NO", spoken: "no", evidence: text },
    { ...suggestion, term: "q = mcΔT", spoken: "q = mcΔT", evidence: text },
    { ...suggestion, term: "charge", spoken: "charge", action: "review", evidence: text },
  ] }, text);
  assert.equal(result.discarded, 2);
  assert.deepEqual(result.suggestions.map(item => item.term), ["NO", "q = mcΔT", "charge"]);
  assert.equal(result.suggestions[1].action, "review");
});

test("ignore case comes from the AI proposal, with a sensible default when it is missing", async () => {
  const text = "Use BSA and lysozyme in 5 mL. NO is a gas. Ask Dr. Tomović.";
  const result = validateAiSuggestions({ suggestions: [
    { term: "BSA", spoken: "B S A", evidence: text, reason: "Acronym.", action: "dictionary", review_kind: "pronunciation", ignore_case: "Yes" },
    { term: "lysozyme", spoken: "lye suh zime", evidence: text, reason: "Enzyme.", action: "dictionary", review_kind: "pronunciation" },
    { term: "mL", spoken: "milliliters", evidence: text, reason: "Unit.", action: "dictionary", review_kind: "pronunciation" },
  ] }, text);
  assert.deepEqual(result.suggestions.map(item => item.ignore_case), ["Yes", "Yes", "No"]);
  for (const [term, expected] of [["lysozyme", "Yes"], ["Tomović", "Yes"], ["BSA", "No"], ["mL", "No"], ["NO", "No"], ["kJ/mol", "No"], ["H2O", "No"]]) assert.equal(defaultIgnoreCase(term), expected, term);
  // The AI is asked for it: the structured-output schema requires ignore_case.
  const configLoader = async () => ({ token: "t", origin: "https://api-main.aiml.asu.edu", model: "defaults" });
  let body; const fetchImpl = async (_url, options) => { body = JSON.parse(options.body); return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ suggestions: [] }) } }] }); };
  await analyzeDictionaryText(source, { configLoader, fetchImpl });
  const item = body.response_format.json_schema.schema.properties.suggestions.items;
  assert.ok(item.required.includes("ignore_case")); assert.deepEqual(item.properties.ignore_case.enum, ["Yes", "No"]);
  // Cross-subject guidance from the course examples goes with every request.
  const system = body.messages.filter(message => message.role === "system").map(message => message.content).join(" ");
  for (const phrase of ["Skip authoring scaffolding", "v of max", "kilometers per second", "Text students must type exactly", "Do not create one entry per range", "economics"]) assert.ok(system.includes(phrase), phrase);
});

test("ASU analysis uses server credentials, validates output and rejects truncated replies", async () => {
  const configLoader = async () => ({ token: "private-fixture", origin: "https://api-main.aiml.asu.edu", model: "defaults" });
  let request;
  const fetchImpl = async (_url, options) => { request = options; return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ suggestions: [suggestion] }) } }] }); };
  const result = await analyzeDictionaryText(source, { configLoader, fetchImpl });
  assert.equal(result.suggestions.length, 1);
  assert.equal(request.headers.Authorization, "Bearer private-fixture");
  assert.equal(JSON.parse(request.body).response_format.type, "json_schema");
  const messages = JSON.parse(request.body).messages;
  assert.ok(messages.some(message => message.role === "system" && message.content.includes("stoy key oh metric")));
  assert.ok(!JSON.stringify(result).includes("private-fixture"));
  await assert.rejects(analyzeDictionaryText("x".repeat(AI_TEXT_LIMIT + 1), { configLoader, fetchImpl }), /passage/);
  await assert.rejects(analyzeDictionaryText(source, { configLoader, fetchImpl: async () => Response.json({ choices: [{ finish_reason: "length" }] }) }), /did not finish/);
  await assert.rejects(analyzeDictionaryText(source, { configLoader, fetchImpl: async () => new Response("private upstream information", { status: 403 }) }), /HTTP 403/);
});

test("whole-document analysis makes one text request and validates candidates beyond the former first section and 60-item cap", async () => {
  const terms = Array.from({ length: 80 }, (_, index) => `specialist${index}`);
  const text = "Opening material. ".repeat(2000) + terms.join(" ");
  const items = terms.map(term => ({ ...suggestion, term, spoken: `specialist ${term.slice(10)}`, evidence: term }));
  let calls = 0;
  const result = await analyzeDictionaryText(text, {
    configLoader: async () => ({ token: "fixture", origin: "https://api-main.aiml.asu.edu", model: "defaults" }), exampleLoader: async () => ({ documents: [] }),
    fetchImpl: async (_url, options) => {
      calls++;
      const input = JSON.parse(options.body);
      assert.equal(JSON.parse(input.messages.find(message => message.role === "user").content).source, text);
      assert.ok(input.messages.every(message => typeof message.content === "string"));
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ suggestions: items }) } }] });
    },
  });
  assert.equal(calls, 1); assert.equal(result.suggestions.length, 80);
  assert.equal(result.suggestions.at(-1).term, terms.at(-1));
});

test("model context-limit errors are safe and do not fall back to partial input", async () => {
  for (const response of [
    Response.json({ error: { code: "context_length_exceeded", message: "PRIVATE upstream details" } }, { status: 400 }),
    Response.json({ error_type: "context_limit" }, { status: 400 }),
    new Response("PRIVATE upstream details", { status: 413 }),
  ]) {
    let calls = 0;
    await assert.rejects(analyzeDictionaryText("Full document. ".repeat(2000), {
      configLoader: async () => ({ token: "fixture", origin: "https://api-main.aiml.asu.edu", model: "defaults" }), exampleLoader: async () => ({ documents: [] }),
      fetchImpl: async () => { calls++; return response; },
    }), error => /input limit/.test(error.message) && /nothing was silently shortened/.test(error.message) && !/PRIVATE/.test(error.message));
    assert.equal(calls, 1);
  }
});

test("AI suggestion bounds permit document-sized results and reject oversized lists", () => {
  const items = Array.from({ length: AI_SUGGESTION_LIMIT }, (_, index) => ({ ...suggestion, term: `term${index}`, spoken: `term ${index}`, evidence: `term${index}` }));
  const source = items.map(item => item.term).join(" ");
  assert.equal(validateAiSuggestions({ suggestions: items }, source).suggestions.length, AI_SUGGESTION_LIMIT);
  assert.throws(() => validateAiSuggestions({ suggestions: [...items, items[0]] }, source), /valid suggestion list/);
});

test("handmade dictionary style permits atomic variables and bonds, not whole equations or lost fractions", () => {
  const examples = [
    ["q_{calorimeter}", "q of calorimeter", "dictionary"],
    ["T₂", "T of 2", "dictionary"],
    ["O=O", "O double bond O", "dictionary"],
    ["(=)", "open parenthesis double bond close parenthesis", "dictionary"],
    ["N≡N", "N triple bond N", "dictionary"],
    ["q=mcΔT", "q equals m c delta T", "review"],
    ["C = mc", "capital C equals m c", "review"],
    ["\\frac{29 dogs}{30 rats}", "29 dogs divided by 30 rats", "review"],
  ];
  const text = examples.map(([term]) => term).join("; ");
  const result = validateAiSuggestions({ suggestions: examples.map(([term, spoken]) => ({ ...suggestion, term, spoken, evidence: text })) }, text);
  assert.deepEqual(result.suggestions.map(item => item.action), examples.map(([, , action]) => action));
  // Ambiguous chemical contexts stay review-only if that is what the model requests.
  const review = validateAiSuggestions({ suggestions: [{ ...suggestion, term: "O=O", spoken: "", action: "review", evidence: text }] }, text);
  assert.equal(review.suggestions[0].action, "review");
});

test("name review migrates to pronunciation controls without treating equations or fragments as editable words", () => {
  const text = "Tomović examines Fe–N≡C. Use ΔG = ΔH - TΔS.";
  const result = validateAiSuggestions({ suggestions: [
    { ...suggestion, term: "Tomović", spoken: "", evidence: "Tomović examines Fe–N≡C.", action: "review", review_kind: "structure" },
    { ...suggestion, term: "Fe–N≡C", spoken: "", evidence: "Tomović examines Fe–N≡C.", action: "review" },
    { ...suggestion, term: "ΔG = ΔH - TΔS", evidence: "Use ΔG = ΔH - TΔS.", action: "dictionary", review_kind: "pronunciation" },
  ] }, text);
  assert.equal(result.suggestions.length, 3);
  assert.deepEqual(result.suggestions.map(canEditAiPronunciation), [true, false, false]);
  assert.equal(result.suggestions[0].review_kind, "pronunciation");
  assert.deepEqual(validateAiSuggestions(result, text).suggestions.map(canEditAiPronunciation), [true, false, false]);
});

test("scientific notation and numeric powers are structural, while ionic and unit symbols remain atomic", () => {
  const examples = ["5.00 × 10⁻³ M", "5.00 x 10^-3 M", "10⁻³", "10^(-3)", "Na⁺", "m²"];
  const source = examples.join("; ");
  const result = validateAiSuggestions({ suggestions: examples.map(term => ({ ...suggestion, term, evidence: source, review_kind: "pronunciation" })) }, source);
  assert.deepEqual(result.suggestions.map(canEditAiPronunciation), [false, false, true, true, true, true]);
});

test("exact numeric entry option excludes equations, units and ambiguous lost formatting", () => {
  for (const term of ["8.314 × 10⁻³", "5.00 x 10^(-3)", "10^{-12}", "2³", "10⁺²"]) {
    assert.equal(requiresExactTextApproval({ term, review_kind: "structure" }), true, term);
  }
  for (const term of ["8.314 × 10-3", "8.314 × 10⁻³ kJ", "R = 8.314 × 10⁻³", "q = mcΔT", "Fe³⁺", "2^(-3", "2^3 + 4"]) {
    assert.equal(requiresExactTextApproval({ term, review_kind: "structure" }), false, term);
  }
});

test("reusable scientific notation retains the actual exponent spelling without the coefficient or unit", () => {
  for (const term of ["8.314 × 10⁻³", "5.00 × 10⁻³"]) {
    assert.deepEqual(reusableScientificReading({ term }), { term: "× 10⁻³", spoken: "times ten to the power of negative 3" });
  }
  assert.deepEqual(reusableScientificReading({ term: "2.0 x 10^(-12)" }), { term: "x 10^(-12)", spoken: "times ten to the power of negative 12" });
  for (const term of ["10⁻³", "8.314 × 10-3", "5.00 × 10⁻³ M", "R = 8.314 × 10⁻³", "Fe³⁺"]) assert.equal(reusableScientificReading({ term }), null);
});

test("ASU receives only relevant saved readings and preserves them by default", async () => {
  const source = "Use ΔH° for this calculation."; let submitted;
  const existingRows = [
    { text: "ΔH°", substitution: "delta H standard", ignore_case: "No", note: "private author note", serviceToken: "never send" },
    { text: "unrelated", substitution: "another reading" },
  ];
  assert.deepEqual(existingPronunciationsForPassage(existingRows, source), [{ text: "ΔH°", substitution: "delta H standard", ignore_case: "No" }]);
  await analyzeDictionaryText(source, {
    existingRows, exampleLoader: async () => ({ version: 1, documents: [] }),
    configLoader: async () => ({ token: "fixture-private", origin: "https://api-main.aiml.asu.edu", model: "defaults" }),
    fetchImpl: async (_url, options) => {
      submitted = JSON.parse(options.body);
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"suggestions":[]}' } }] });
    },
  });
  const user = JSON.parse(submitted.messages.find(item => item.role === "user").content);
  assert.equal(user.suggestAlternatives, false);
  assert.deepEqual(user.existingPronunciations, [{ text: "ΔH°", substitution: "delta H standard", ignore_case: "No" }]);
  assert.ok(!JSON.stringify(user).includes("private author note"));
  assert.ok(!JSON.stringify(user).includes("never send"));
});

test("local AI endpoint rejects foreign origins and oversized text without invoking ASU", async () => {
  const nativeFetch = globalThis.fetch;
  let calls = 0, handler;
  const server = createServer((req, res) => { void handler(req, res, req.url); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = server.address().port, origin = `http://127.0.0.1:${port}`;
  handler = createAiHandler(port, { analyze: async () => { calls++; return { suggestions: [] }; } });
  try {
    let response = await nativeFetch(`${origin}/api/createai/analyze`, { method: "POST", headers: { Origin: "https://other.example", "Content-Type": "application/json" }, body: JSON.stringify({ text: source }) });
    assert.equal(response.status, 403); assert.equal(calls, 0);
    response = await nativeFetch(`${origin}/api/createai/analyze`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ text: "x".repeat(AI_TEXT_LIMIT + 1) }) });
    assert.equal(response.status, 400); assert.equal(calls, 0);
    const complete = "Δ".repeat(AI_TEXT_LIMIT);
    response = await nativeFetch(`${origin}/api/createai/analyze`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ text: complete }) });
    assert.equal(response.status, 200); assert.equal(calls, 1);
    response = await nativeFetch(`${origin}/api/createai/analyze`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ text: source }) });
    assert.equal(response.status, 200); assert.equal(calls, 2);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test("all-discarded analysis is shown as inconclusive with specific rejection counts", async () => {
  const env = setupDom({ connected: true });
  globalThis.location.hostname = "localhost";
  const backend = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url === "/api/createai/status") return Response.json({ available: true });
    if (url === "/api/createai/analyze") return Response.json({ suggestions: [], discarded: 11,
      discardedReasons: { "source excerpt did not match": 9, "unchanged replacement": 2 } });
    return backend(url, options);
  };
  const mounted = await mountDictionaryEditor(env.root);
  const $ = selector => env.root.querySelector(selector);
  $("#hs-ai-source").value = source;
  $("#hs-ai-analyze").click(); await flush();
  assert.match($("#hs-ai-status").textContent, /inconclusive analysis/);
  assert.match($("#hs-ai-details").textContent, /source excerpt did not match: 9/);
  assert.equal(env.rows.get("chem113").length, 0);
  mounted.destroy();
});

import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { DOMParser } from "linkedom";
import { jsPDF } from "jspdf";
import { extractDocxText, extractPdfText, splitDocumentSections } from "../src/core/document-text.js";
import { mountDocumentImport } from "../src/document-import.js";
import { setupDom, flush } from "./helpers/review-dom.mjs";
import { mountHearSayWorkspace } from "../src/workspace.js";
import { resolve } from "node:path";

const wrap = xml => `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>${xml}</w:body></w:document>`;
async function docx(xml, styles) {
  const zip = new JSZip(); zip.file("word/document.xml", wrap(xml));
  if (styles) zip.file("word/styles.xml", styles);
  zip.file("word/media/secret.png", "SECRET_IMAGE_BYTES"); zip.file("word/header1.xml", "HEADER_NOT_ANALYZED");
  return zip.generateAsync({ type: "uint8array" });
}
const options = { Zip: JSZip, Parser: DOMParser };

test("DOCX import keeps explicit scripts, headings, tables and supported equations while excluding media and deleted content", async () => {
  const buffer = await docx('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chemistry</w:t></w:r></w:p><w:p><w:r><w:t>5.00 × 10</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>-3</w:t></w:r><w:r><w:t> M and q</w:t></w:r><w:r><w:rPr><w:rStyle w:val="Sub"/></w:rPr><w:t>solution</w:t></w:r><w:drawing><w:t>IMAGE_ALT_NOT_SENT</w:t></w:drawing><w:del><w:r><w:t>DELETED_SECRET</w:t></w:r></w:del></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Term</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><m:oMath><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup><m:r><m:t> = </m:t></m:r><m:f><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f></m:oMath></w:p>', '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:styleId="Sub"><w:rPr><w:vertAlign w:val="subscript"/></w:rPr></w:style></w:styles>');
  const result = await extractDocxText(buffer, options);
  const text = result.blocks.map(block => block.text).join("\n");
  assert.match(text, /# Chemistry/); assert.match(text, /5\.00 × 10\^\{-3\} M and q_\{solution\}/);
  assert.match(text, /Term\tValue/); assert.match(text, /x\^\{2\} = \(a\)\/\(b\)/);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|IMAGE_ALT|HEADER_NOT/);
  assert.equal(result.images, 1); assert.equal(result.equations, 1);
  assert.equal(result.unsupportedEquations, 0);
});

test("unsupported Word equations are explicitly omitted, image-only and invalid Word files fail clearly", async () => {
  const result = await extractDocxText(await docx('<w:p><w:r><w:t>Use </w:t></w:r><m:oMath><m:nary><m:e><m:r><m:t>UNSAFE_PARTIAL_MATH</m:t></m:r></m:e></m:nary></m:oMath></w:p>'), options);
  assert.equal(result.unsupportedEquations, 1); assert.match(result.blocks[0].text, /equation omitted/);
  assert.doesNotMatch(JSON.stringify(result), /UNSAFE_PARTIAL/);
  await assert.rejects(extractDocxText(await docx('<w:p><w:drawing/></w:p>'), options), /No readable text/);
  await assert.rejects(extractDocxText(new Uint8Array([1, 2, 3]), options));
});

test("document sections cover all text without exceeding the analysis limit or breaking surrogate pairs", () => {
  const blocks = [{ label: "Paragraph 1", text: "A ".repeat(8000) }, { label: "Paragraph 2", text: "😀".repeat(7000) }];
  const sections = splitDocumentSections(blocks);
  assert.ok(sections.length > 2); assert.ok(sections.every(item => item.text.length <= 12000));
  assert.equal(sections.map(item => item.text).join("").replace(/\s/g, ""), blocks.map(item => item.text).join("").replace(/\s/g, ""));
  assert.ok(sections.every(item => !/[\uD800-\uDBFF]$/.test(item.text)));
});

test("real PDF text extraction reads text without page rendering or image upload", async () => {
  const pdf = new jsPDF(); pdf.text("Gas constant R and lysozyme.", 10, 10); pdf.addPage(); pdf.text("Second page 5.00 x 10-3 M", 10, 10);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const result = await extractPdfText(pdf.output("arraybuffer"), { loadPdf: async () => ({ getDocument: options => pdfjs.getDocument({ ...options, standardFontDataUrl: resolve("node_modules/pdfjs-dist/standard_fonts") + "/" }) }) });
  assert.equal(result.kind, "PDF"); assert.equal(result.blocks.length, 2);
  assert.match(result.blocks[0].text, /Gas constant R and lysozyme/);
  assert.match(result.blocks[1].text, /5\.00 x 10-3/);
  assert.match(result.warnings.join(" "), /superscripts/);
});

test("image-only PDF pages are never treated as a complete successful text analysis", async () => {
  let destroyed = 0;
  const loadPdf = async () => ({ getDocument: () => ({ promise: Promise.resolve({ numPages: 1,
    getPage: async () => ({ getTextContent: async () => ({ items: [] }), cleanup() {} }) }), destroy: async () => { destroyed++; } }) });
  await assert.rejects(extractPdfText(new ArrayBuffer(1), { loadPdf }), /No selectable PDF text/);
  assert.equal(destroyed, 1);
});

test("import preview is local and passes the whole extraction only on Analyze, with stale loads discarded", async () => {
  const env = setupDom(); const used = []; let finish;
  const importer = mountDocumentImport(env.root, { onAnalyze: text => used.push(text), extract: () => new Promise(resolve => { finish = resolve; }) });
  const file = env.root.querySelector("input[type=file]"); Object.defineProperty(file, "files", { value: [{ name: "lesson.docx" }], configurable: true });
  file.dispatchEvent(new Event("change")); await flush();
  const first = "5.00 × 10^{-3} M ".repeat(1000), last = "Last page: lysozyme.";
  finish({ kind: "DOCX", blocks: [{ label: "Paragraph 1", text: first }, { label: "Paragraph 2", text: last }], warnings: ["Images excluded."] }); await flush();
  assert.equal(used.length, 0); assert.match(env.root.querySelector("textarea").value, /10\^\{-3\}/);
  assert.equal(env.root.querySelector("select"), null);
  env.root.querySelector("button").click(); assert.deepEqual(used, [`${first}\n\n${last}`]);
  file.dispatchEvent(new Event("change")); await flush(); importer.clear();
  finish({ kind: "DOCX", blocks: [{ label: "Paragraph 1", text: "Stale text" }], warnings: [] }); await flush();
  assert.equal(env.root.querySelector("#hs-document-result").hidden, true);
  importer.destroy();
});

test("actual dictionary upload sends only extracted text after Analyze, without file or image bytes", async () => {
  const env = setupDom({ connected: true }); globalThis.location.hostname = "localhost";
  const backend = globalThis.fetch, sent = []; let fail = false;
  globalThis.fetch = async (url, options) => {
    if (url === "/api/createai/status") return Response.json({ available: true });
    if (url === "/api/createai/analyze") {
      sent.push(JSON.parse(options.body));
      if (fail) return Response.json({ error: "ASU could not fit this document within the selected model's input limit." }, { status: 502 });
      return Response.json({ suggestions: [{ term: "haemoglobin", spoken: "hee moh glow bin", evidence: "Last page: haemoglobin.", reason: "Confirm specialist pronunciation.", action: "dictionary", review_kind: "pronunciation" }] });
    }
    return backend(url, options);
  };
  const mounted = await mountHearSayWorkspace(env.root, { initialView: "review" });
  const $ = selector => env.root.querySelector(selector);
  const buffer = await docx('<w:p><w:r><w:t>Use lysozyme with 5.00 × 10</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>-3</w:t></w:r><w:r><w:t> M.</w:t></w:r><w:drawing><w:t>IMAGE_ALT_NOT_SENT</w:t></w:drawing></w:p>' + '<w:p><w:r><w:t>Middle paragraphs and formatting. </w:t></w:r></w:p>'.repeat(1000) + '<w:p><w:r><w:t>Last page: haemoglobin.</w:t></w:r></w:p>');
  const file = $("#hs-document-file");
  // Large embedded images can make a short course document exceed the old
  // 20 MB guard; the browser-supplied size must allow that file through.
  Object.defineProperty(file, "files", { configurable: true, value: [{ name: "lesson.docx", size: 28.2 * 1024 * 1024, arrayBuffer: async () => buffer }] });
  file.dispatchEvent(new Event("change"));
  // One workflow: the extracted text goes straight into the text box; nothing is sent until Get AI suggestions.
  for (let attempt = 0; attempt < 100 && !$("#hs-ai-source").value; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.match($("#hs-ai-source").value, /10\^\{-3\}/, $("#hs-document-status").textContent);
  assert.equal($("#hs-document-result").hidden, true, "no separate preview window");
  assert.match($("#hs-document-status").textContent, /Loaded lesson\.docx/);
  assert.equal(sent.length, 0);
  $("#hs-ai-analyze").click();
  await flush();
  assert.equal(sent.length, 1);
  assert.ok(sent[0].text.length > 12000);
  assert.match(sent[0].text, /^Use lysozyme with 5\.00 × 10\^\{-3\} M\./);
  assert.match(sent[0].text, /Last page: haemoglobin\.$/);
  assert.equal(sent[0].text, $("#hs-ai-source").value);
  assert.match($("#hs-ai-results").textContent, /haemoglobin/);
  assert.doesNotMatch(JSON.stringify(sent), /SECRET_IMAGE|IMAGE_ALT|lesson\.docx|base64|word\/media/);
  assert.equal(env.rows.get("chem113").length, 0);
  fail = true; $("#hs-ai-analyze").click(); await flush();
  assert.match($("#hs-ai-status").textContent, /input limit/);
  assert.equal($("#hs-ai-source").value, sent[0].text);
  assert.match($("#hs-ai-results").textContent, /haemoglobin/);
  assert.equal(env.rows.get("chem113").length, 0);
  mounted.destroy();
  const restored = await mountHearSayWorkspace(env.root, { initialView: "review" }); await flush();
  assert.equal($("#hs-ai-source").value, sent[0].text);
  assert.match($("#hs-ai-results").textContent, /haemoglobin/);
  restored.destroy();
});

test("document import remains available for manual review when the AI helper is unavailable", async () => {
  const env = setupDom(); const used = [];
  const importer = mountDocumentImport(env.root, { canAnalyze: () => false,
    onAnalyze() { assert.fail("AI is unavailable"); }, onUseText: text => used.push(text),
    extract: async () => ({ kind: "PDF", blocks: [{ text: "Manual document review." }], warnings: [] }) });
  const file = env.root.querySelector("input[type=file]"); Object.defineProperty(file, "files", { value: [{}] });
  file.dispatchEvent(new Event("change")); await flush();
  assert.equal(env.root.querySelector("#hs-document-use").disabled, true);
  env.root.querySelector("#hs-document-manual").click();
  assert.deepEqual(used, ["Manual document review."]);
  importer.destroy();
});

test("oversized import reports actual size and local limit without reading the file", async () => {
  const env = setupDom(); let read = false;
  const importer = mountDocumentImport(env.root, { onUseText() { assert.fail("Oversized file cannot be imported"); } });
  const file = env.root.querySelector("input[type=file]");
  Object.defineProperty(file, "files", { value: [{ name: "large.docx", size: 110 * 1024 * 1024, arrayBuffer() { read = true; throw new Error("File must not be read"); } }] });
  file.dispatchEvent(new Event("change")); await flush();
  const status = env.root.querySelector("[role=status]").textContent;
  assert.match(status, /110\.0 MB/); assert.match(status, /up to 100 MB/);
  assert.equal(read, false);
  assert.equal(env.root.querySelector("#hs-document-result").hidden, true);
  importer.destroy();
});

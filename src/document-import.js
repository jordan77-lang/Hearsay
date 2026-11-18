import { DOCUMENT_FILE_LIMIT, DOCUMENT_TEXT_LIMIT, extractDocxText, extractPdfText } from "./core/document-text.js";
const fileLimitMB = DOCUMENT_FILE_LIMIT / (1024 * 1024);

async function defaultExtract(file) {
  if (file.size > DOCUMENT_FILE_LIMIT) throw new Error(`This file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Local import supports files up to ${fileLimitMB} MB. Export a smaller document or PDF page range. File size includes embedded images, even though images are excluded from ASU analysis.`);
  const extension = file.name?.split(".").at(-1)?.toLowerCase();
  if (!["docx", "pdf"].includes(extension)) throw new Error("Choose a .docx or .pdf file. In Google Docs, download Microsoft Word (.docx) for the best formatting support.");
  const buffer = await file.arrayBuffer();
  if (extension === "docx") {
    const { default: Zip } = await import("./vendor/jszip.js");
    return extractDocxText(buffer, { Zip });
  }
  return extractPdfText(buffer, { loadPdf: async () => {
    const pdf = await import("./vendor/pdfjs/pdf.mjs");
    const workerUrl = new URL("./vendor/pdfjs/pdf.worker.mjs", import.meta.url).href;
    pdf.GlobalWorkerOptions.workerSrc = workerUrl;
    return { getDocument(options) {
      // Supply a local worker explicitly: PDF.js's origin check otherwise uses
      // a blob wrapper for chrome-extension URLs, which extension CSP blocks.
      const port = new Worker(workerUrl, { type: "module" });
      const worker = new pdf.PDFWorker({ port });
      let task;
      try { task = pdf.getDocument({ ...options, worker, cMapPacked: true,
        cMapUrl: new URL("./vendor/pdfjs/cmaps/", import.meta.url).href,
        standardFontDataUrl: new URL("./vendor/pdfjs/standard_fonts/", import.meta.url).href }); }
      catch (error) { worker.destroy(); port.terminate(); throw error; }
      return { promise: task.promise, async destroy() { try { await task.destroy(); } finally { worker.destroy(); port.terminate(); } } };
    } };
  } });
}

// Keep the complete extracted text. The explicit Analyze button submits it once;
// file bytes and images never enter the helper request.
// direct: the extracted text goes straight into the caller's text box (one
// workflow with pasted text): no separate preview window or extra buttons.
export function mountDocumentImport(container, { onAnalyze, onUseText, isBusy = () => false, canAnalyze = () => true, extract = defaultExtract, id = "hs-document", direct = false } = {}) {
  let generation = 0, destroyed = false, reading = false, text = "", kind = "";
  const tip = `Word (.docx, up to ${fileLimitMB} MB) works best. From Google Docs: File → Download → Microsoft Word. The file is read in this browser; images are never sent.`;
  container.innerHTML = `<div class="hs-document-import">
    <div class="hs-document-pick"><input id="${id}-file" class="hs-file-input" type="file" aria-describedby="${id}-tip" accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf" /><label for="${id}-file" class="ss-btn hs-file-button" title="${tip}">Import Word or PDF</label><span id="${id}-tip" class="hs-visually-hidden">${tip}</span></div>
    <p id="${id}-status" role="status" aria-live="polite"></p>
    <div id="${id}-result" hidden>
    <label for="${id}-preview">Extracted text</label><textarea id="${id}-preview" class="ss-input" rows="8" readonly></textarea>
    <p class="ss-sub">Raised and lowered text appear as ^{…} and _{…}. Images and equations in images are left out.</p>
    <ul id="${id}-warnings"></ul><button id="${id}-use" class="ss-btn primary" type="button">Get AI suggestions for this document</button>
    <button id="${id}-manual" class="ss-btn" type="button">Use text without AI</button></div></div>`;
  const $ = suffix => container.querySelector(`#${id}-${suffix}`);
  function refresh() { $("file").disabled = reading || isBusy(); $("use").disabled = reading || isBusy() || !canAnalyze() || !text; $("manual").disabled = reading || isBusy() || !text; }
  async function read() {
    if (reading || isBusy()) return;
    const file = $("file").files?.[0]; if (!file) return;
    const current = ++generation; reading = true; text = ""; $("result").hidden = true; refresh();
    $("status").textContent = "Reading the file in this browser…";
    try {
      const result = await extract(file);
      if (destroyed || current !== generation) return;
      const complete = result.blocks.map(block => block.text).join("\n\n"); kind = result.kind;
      if (!complete.trim()) throw new Error("No readable text was found in this document.");
      if (complete.length > DOCUMENT_TEXT_LIMIT) throw new Error(`The extracted document exceeds ${DOCUMENT_TEXT_LIMIT.toLocaleString("en-US")} characters. Export a shorter document. Nothing was sent to ASU.`);
      text = complete;
      if (direct) {
        // Straight into the text box; a short line says what was loaded and left out.
        const loaded = onUseText(text, { kind, name: file.name || "", warnings: result.warnings });
        $("status").textContent = loaded === false ? "" : [`Loaded ${file.name || kind} (${text.length.toLocaleString()} characters). Nothing has been sent.`, ...result.warnings].join(" ");
        return;
      }
      $("preview").value = text;
      $("warnings").replaceChildren(...result.warnings.map(text => { const li = document.createElement("li"); li.textContent = text; return li; }));
      $("result").hidden = false;
      $("status").textContent = `${kind} text ready (${text.length.toLocaleString()} characters). Nothing has been sent yet.`;
    } catch (error) { if (!destroyed && current === generation) $("status").textContent = `Could not import: ${error.message || "Choose another file."}`; }
    finally { if (!destroyed && current === generation) { reading = false; $("file").value = ""; refresh(); } }
  }
  function use() { if (!reading && !isBusy() && canAnalyze() && text) onAnalyze(text, { kind }); }
  function manual() { if (!reading && !isBusy() && text) onUseText(text, { kind }); }
  $("file").addEventListener("change", read); $("use").addEventListener("click", use); $("manual").addEventListener("click", manual);
  return { refresh, clear() { generation++; reading = false; text = ""; $("file").value = ""; $("preview").value = ""; $("result").hidden = true; $("status").textContent = ""; refresh(); },
    destroy() { destroyed = true; generation++; $("file").removeEventListener("change", read); $("use").removeEventListener("click", use); $("manual").removeEventListener("click", manual); container.replaceChildren(); } };
}

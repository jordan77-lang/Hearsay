// Text-only document extraction. No media entry, image, annotation or embedded
// attachment is returned. Formatting is represented as explicit text notation.
export const DOCUMENT_FILE_LIMIT = 100 * 1024 * 1024;
export const DOCUMENT_TEXT_LIMIT = 500000;
const XML_LIMIT = 12 * 1024 * 1024;
const local = node => node?.nodeName?.split(":").at(-1);
const children = node => [...(node?.childNodes || [])].filter(child => child.nodeType === 1);
const child = (node, name) => children(node).find(item => local(item) === name);
const value = (node, name) => node?.getAttribute(`w:${name}`) ?? node?.getAttribute(name);

export function splitDocumentSections(blocks, limit = 12000) {
  const sections = []; let text = "", labels = [];
  const flush = () => { if (text) sections.push({ text, label: labels[0] === labels.at(-1) ? labels[0] : `${labels[0]} – ${labels.at(-1)}` }); text = ""; labels = []; };
  for (const block of blocks) {
    let rest = block.text.trim();
    while (rest) {
      if (text && text.length + 2 + rest.length > limit) flush();
      if (rest.length <= limit) { text += (text ? "\n\n" : "") + rest; labels.push(block.label); break; }
      let at = rest.lastIndexOf("\n", limit);
      if (at < limit / 2) at = rest.lastIndexOf(" ", limit);
      if (at < limit / 2) at = limit;
      // Do not split a UTF-16 surrogate pair at a hard boundary.
      if (/[\uD800-\uDBFF]/.test(rest[at - 1])) at--;
      text = rest.slice(0, at); labels = [block.label]; flush(); rest = rest.slice(at).trimStart();
    }
  }
  flush(); return sections;
}

export async function extractDocxText(buffer, { Zip, Parser = globalThis.DOMParser } = {}) {
  const zip = await Zip.loadAsync(buffer);
  async function xmlFile(path, required = false) {
    const entry = zip.file(path);
    if (!entry) { if (required) throw new Error("This file has no readable Word document. Use a .docx file, not the older .doc format."); return null; }
    if (entry._data?.uncompressedSize > XML_LIMIT) throw new Error("The Word text is too large. Export a shorter document.");
    const xml = await entry.async("string");
    if (xml.length > XML_LIMIT || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("This Word document uses unsupported XML or is too large.");
    const doc = new Parser().parseFromString(xml, "text/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("The Word document XML could not be read.");
    return doc;
  }
  const doc = await xmlFile("word/document.xml", true);
  const stylesDoc = await xmlFile("word/styles.xml");
  const styles = new Map();
  if (stylesDoc) for (const node of [...stylesDoc.getElementsByTagName("w:style")]) {
    styles.set(value(node, "styleId"), { parent: value(child(node, "basedOn"), "val"),
      script: value(child(child(node, "rPr"), "vertAlign"), "val") });
  }
  function styleScript(id, seen = new Set()) {
    if (!id || seen.has(id)) return ""; seen.add(id);
    const style = styles.get(id); return style?.script || styleScript(style?.parent, seen);
  }
  let images = 0, equations = 0, unsupportedEquations = 0, omittedObjects = 0;
  const warnings = ["Main document text and tables only. Headers, footers, footnotes, comments and text inside images are not analyzed.",
    "Formatting is represented as text: superscript ^{...}, subscript _{...}, headings and table rows. This is not a simulation of JAWS in Word or Google Docs."];
  function math(node) {
    if (!node) return "";
    const name = local(node);
    const get = key => math(child(node, key));
    if (name === "t") return node.textContent;
    if (name.endsWith("Pr") || name === "ctrlPr") return "";
    if (name === "f") return `(${get("num")})/(${get("den")})`;
    if (name === "sSup") return `${get("e")}^{${get("sup")}}`;
    if (name === "sSub") return `${get("e")}_{${get("sub")}}`;
    if (name === "sSubSup") return `${get("e")}_{${get("sub")}}^{${get("sup")}}`;
    if (name === "rad") return `${get("deg") ? `root[${get("deg")}]` : "sqrt"}(${get("e")})`;
    if (!["oMath", "oMathPara", "r", "e", "num", "den", "sup", "sub", "deg"].includes(name)) throw new Error("unsupported equation");
    return children(node).map(math).join("");
  }
  function text(node, inherited = "") {
    const name = local(node);
    if (["del", "moveFrom", "instrText", "delText"].includes(name)) return "";
    if (["drawing", "pict"].includes(name)) { images++; return ""; }
    if (["object", "altChunk"].includes(name)) { omittedObjects++; return ""; }
    if (["oMath", "oMathPara"].includes(name)) {
      equations++;
      try { return ` ${math(node)} `; }
      catch { unsupportedEquations++; return " [equation omitted: check original document] "; }
    }
    if (name === "t") return node.textContent;
    if (["br", "cr"].includes(name)) return "\n";
    if (name === "tab") return "\t";
    if (name === "r") {
      const properties = child(node, "rPr");
      const align = value(child(properties, "vertAlign"), "val") || styleScript(value(child(properties, "rStyle"), "val")) || inherited;
      const raw = children(node).filter(item => local(item) !== "rPr").map(item => text(item)).join("");
      return raw && ["superscript", "subscript"].includes(align) ? `${align === "superscript" ? "^" : "_"}{${raw}}` : raw;
    }
    if (["pPr", "rPr", "tblPr", "tcPr", "sectPr"].includes(name)) return "";
    if (name === "p") {
      const id = value(child(child(node, "pPr"), "pStyle"), "val");
      const heading = /heading\s*([1-6])/i.exec(id || "");
      return (heading ? "#".repeat(Number(heading[1])) + " " : "") + children(node).map(item => text(item, styleScript(id))).join("") + "\n";
    }
    if (name === "tr") return children(node).filter(item => local(item) === "tc").map(item => text(item).trim().replace(/\n+/g, " / ")).join("\t") + "\n";
    return children(node).map(item => text(item, inherited)).join("");
  }
  const body = child(doc.documentElement, "body");
  if (!body) throw new Error("This Word document has no readable main text.");
  const blocks = []; let length = 0, paragraph = 0, table = 0;
  for (const node of children(body)) {
    const name = local(node), label = name === "tbl" ? `Table ${++table}` : `Paragraph ${++paragraph}`;
    const content = text(node).trim();
    length += content.length + (blocks.length ? 2 : 0);
    if (length > DOCUMENT_TEXT_LIMIT) throw new Error("The extracted document exceeds 500,000 characters. Export a shorter document.");
    if (content) blocks.push({ label, text: content });
  }
  if (!blocks.length) throw new Error("No readable text was found. Images were excluded; use a document containing selectable text.");
  if (images) warnings.push(`${images} image or drawing objects excluded. Image captions remain when they are ordinary document text.`);
  if (unsupportedEquations) warnings.push(`${unsupportedEquations} Word equations could not be represented and were marked for source review.`);
  if (omittedObjects) warnings.push(`${omittedObjects} embedded or linked objects excluded.`);
  return { kind: "DOCX", blocks, warnings, images, equations, unsupportedEquations };
}

export async function extractPdfText(buffer, { loadPdf } = {}) {
  const pdfjs = await loadPdf();
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useWasm: false,
    useSystemFonts: false, disableFontFace: true, stopAtErrors: true });
  let pdf;
  try {
    pdf = await task.promise;
    if (pdf.numPages > 200) throw new Error("This PDF exceeds 200 pages. Export a smaller page range.");
    const blocks = [], emptyPages = []; let length = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent({ disableNormalization: true });
      let text = "", previous;
      for (const item of content.items) {
        if (typeof item.str !== "string") continue;
        if (previous && text && !/\s$/.test(text) && !/^\s/.test(item.str)) {
          const newLine = Math.abs((previous.transform?.[5] || 0) - (item.transform?.[5] || 0)) > Math.max(previous.height || 0, item.height || 0) * 0.7;
          const gap = (item.transform?.[4] || 0) - ((previous.transform?.[4] || 0) + (previous.width || 0));
          if (newLine) text += "\n"; else if (gap > Math.max(item.height || 0, 1) * 0.15) text += " ";
        }
        text += item.str + (item.hasEOL ? "\n" : ""); previous = item;
      }
      text = text.trim(); length += text.length + (text && blocks.length ? 2 : 0);
      if (length > DOCUMENT_TEXT_LIMIT) throw new Error("The extracted PDF exceeds 500,000 characters. Export a smaller page range.");
      if (text) blocks.push({ label: `Page ${number}`, text }); else emptyPages.push(number);
      page.cleanup();
    }
    if (!blocks.length) throw new Error("No selectable PDF text was found. Scanned pages and images are excluded; export a DOCX or a PDF with selectable text. OCR is not enabled.");
    return { kind: "PDF", blocks, emptyPages, warnings: [
      "PDF text extraction is approximate. Reading order, tables, superscripts, subscripts and equations may be lost. Prefer DOCX and check the original before approving readings.",
      "Images and page screenshots are excluded. No OCR is performed; text present only inside images is not analyzed.",
      ...(emptyPages.length ? [`No selectable text on pages ${emptyPages.join(", ")}. Those pages were not analyzed.`] : []),
    ] };
  } catch (error) {
    if (/password|destroyed/i.test(error?.message || "")) throw new Error("Password-protected PDFs are not supported. Choose an unlocked copy.");
    throw error;
  } finally { await task.destroy(); }
}

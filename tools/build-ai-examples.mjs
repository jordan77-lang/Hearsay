// Build local reference context for the AI helper, not a fine-tuning dataset.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { DOMParser } from "linkedom";

const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export async function extractExampleDocx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("Missing Word document content");
  const xml = await entry.async("string");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsupported XML declarations");
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  let omittedMath = 0, figures = 0;
  const local = node => node.nodeName?.split(":").at(-1);
  const isWord = node => node.nodeName?.startsWith("w:") || node.namespaceURI === WORD;
  function text(node) {
    const name = local(node);
    if (["oMath", "oMathPara"].includes(name)) { omittedMath++; return " [Word equation omitted; structural review needed] "; }
    if (isWord(node) && name === "del") return "";
    if (isWord(node) && ["drawing", "pict"].includes(name)) { figures++; return " [figure omitted] "; }
    if (isWord(node) && name === "t") return node.textContent;
    if (isWord(node) && ["br", "cr", "tab"].includes(name)) return " ";
    const value = [...node.childNodes].map(text).join("");
    if (isWord(node) && name === "r" && value.trim()) {
      const align = [...node.getElementsByTagName("w:vertAlign")][0]?.getAttribute("w:val");
      if (align === "subscript") return `_{${value}}`;
      if (align === "superscript") return `^{${value}}`;
    }
    return value;
  }
  // Paragraph locations are document XML positions, not guessed page numbers.
  const paragraphs = [...doc.getElementsByTagName("w:p")].map((node, index) => ({ paragraph: index + 1,
    text: text(node).replace(/\s+/gu, " ").trim() })).filter(item => item.text);
  if (!paragraphs.length) throw new Error("No readable Word paragraphs");
  return { paragraphs, omittedMath, figures };
}

export async function buildExampleCorpus(root = fileURLToPath(new URL("../", import.meta.url))) {
  const corpus = { version: 1, documents: [], errors: [] };
  let files;
  try { files = await readdir(join(root, "examples"), { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") files = []; else throw error; }
  for (const file of files.filter(file => file.isFile() && /\.docx$/i.test(file.name) && !file.name.startsWith("~$")).sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      const buffer = await readFile(join(root, "examples", file.name));
      const extracted = await extractExampleDocx(buffer);
      corpus.documents.push({ file: file.name, sha256: createHash("sha256").update(buffer).digest("hex"), ...extracted });
    } catch {
      corpus.errors.push({ file: file.name, reason: "Could not read this DOCX. Re-save or replace the file and rebuild." });
    }
  }
  await mkdir(join(root, "createai"), { recursive: true });
  await writeFile(join(root, "createai", "examples.local.json"), JSON.stringify(corpus));
  return corpus;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const corpus = await buildExampleCorpus();
    console.log(`AI example context: ${corpus.documents.length} documents indexed; ${corpus.errors.length} unreadable.`);
    for (const error of corpus.errors) console.warn(`${error.file}: ${error.reason}`);
    console.log("References are local, unreviewed course sources, not approved pronunciation rules.");
  } catch { console.error("Could not build AI examples. Check the examples folder and local write permissions."); process.exitCode = 1; }
}

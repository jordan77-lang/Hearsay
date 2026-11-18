const raised = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", "−": "⁻", "+": "⁺", "(": "⁽", ")": "⁾" };
const lowered = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "-": "₋", "−": "₋", "+": "₊", "(": "₍", ")": "₎" };

function clipboardDocument(html, Parser) {
  return new Parser().parseFromString(/<html\b/i.test(html) ? html : `<html><body>${html}</body></html>`, "text/html");
}

// This is a warning, not a rewrite: the exact same text can mean subtraction.
export function possibleLostExponents(text) {
  return [...String(text).matchAll(/\b\d+(?:\.\d+)?[ \t]*[×x][ \t]*10[-−]\d+\b/gu)]
    .map(match => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
}

// HTML-only clipboard fallback. Read inert nodes; never insert clipboard HTML.
export function plainTextFromClipboardHtml(html, Parser = globalThis.DOMParser) {
  if (!html || !Parser) return "";
  const doc = clipboardDocument(html, Parser);
  function read(node) {
    if (node.nodeType === 3) return node.textContent;
    const tag = node.nodeName?.toLowerCase();
    if (["script", "style", "head", "iframe", "object", "embed"].includes(tag)) return "";
    if (tag === "br") return "\n";
    const text = [...node.childNodes].map(read).join("");
    return text + (/^(?:p|div|li|h[1-6]|tr)$/.test(tag) ? "\n" : /^(?:td|th)$/.test(tag) ? "\t" : "");
  }
  return read(doc.body?.childNodes.length ? doc.body : doc.documentElement).replace(/[\n\t]+$/, "");
}

// Preserve plain-text spacing and only change characters whose numeric
// superscript formatting is explicitly present in matching clipboard HTML.
export function numericSuperscriptsFromClipboard(plain, html, Parser = globalThis.DOMParser) {
  return numericScriptsFromClipboard(plain, html, { Parser });
}

export function numericScriptsFromClipboard(plain, html, { Parser = globalThis.DOMParser, includeSubscripts = false } = {}) {
  if (!plain || !html || !Parser) return null;
  const doc = clipboardDocument(html, Parser);
  const htmlCharacters = [];
  function visit(node, script = "") {
    if (node.nodeType === 3) {
      for (const char of node.textContent) if (!/\s/u.test(char)) htmlCharacters.push({ char, script });
      return;
    }
    const tag = node.nodeName?.toLowerCase();
    if (["script", "style", "head", "iframe", "object", "embed"].includes(tag)) return;
    const style = node.getAttribute?.("style") || "";
    const vertical = /vertical-align\s*:\s*(super|sub|baseline)\b/i.exec(style)?.[1]?.toLowerCase();
    const active = vertical ? (vertical === "baseline" ? "" : vertical) : tag === "sup" ? "super" : tag === "sub" ? "sub" : script;
    for (const child of node.childNodes || []) visit(child, active);
  }
  visit(doc.body?.childNodes.length ? doc.body : doc.documentElement);
  const characters = [...plain], positions = [];
  characters.forEach((char, index) => { if (!/\s/u.test(char)) positions.push(index); });
  if (positions.length !== htmlCharacters.length) return null;
  let preserved = 0;
  for (let index = 0; index < positions.length; index++) {
    const position = positions[index], htmlChar = htmlCharacters[index];
    if (characters[position] !== htmlChar.char) return null;
    const map = htmlChar.script === "super" ? raised : includeSubscripts && htmlChar.script === "sub" ? lowered : null;
    if (map?.[htmlChar.char]) { characters[position] = map[htmlChar.char]; preserved++; }
  }
  return preserved ? { text: characters.join(""), preserved } : null;
}

// Chemical formula parser + spoken renderer.
//
// Parses tokens like: H2O, CO2, NaCl, C6H12O6, H2SO4, Ca(OH)2, CuSO4·5H2O,
// SO4^2-, Na+, Ca2+, 2H2O (with coefficient). Unicode sub/superscripts are
// normalized first. Returns null for things that are not valid formulae so the
// detector can avoid false positives on ordinary English words.

import {
  ELEMENTS,
  ELEMENT_SYMBOLS_BY_LENGTH,
  COMPOUND_NAMES,
  normalizeSubscripts,
  normalizeSuperscripts,
} from "./lexicon.js";

const ELEMENT_SET = new Set(ELEMENT_SYMBOLS_BY_LENGTH);

// Letter names spoken the way chemists say them aloud (avoids "oh" vs zero
// confusion for O, and "aitch" for H is correct).
const LETTER_NAMES = {
  H: "H", O: "O", N: "N", C: "C", S: "S", P: "P",
  K: "K", I: "I", F: "F", B: "B", V: "V", W: "W", U: "U", Y: "Y",
};

export function parseFormula(rawInput) {
  if (!rawInput) return null;
  let raw = rawInput.trim();
  if (!raw) return null;

  // Pull off a trailing charge such as ^2-, ²⁻, +, 2+, -.
  let charge = null;
  const superNormalized = normalizeSuperscripts(raw);
  const chargeMatch = superNormalized.match(/(\^?)(\d*)([+\-])$/);
  if (chargeMatch && /[A-Za-z)]/.test(superNormalized.slice(0, chargeMatch.index))) {
    const magnitude = chargeMatch[2] ? parseInt(chargeMatch[2], 10) : 1;
    charge = { value: magnitude, sign: chargeMatch[3] };
    raw = superNormalized.slice(0, chargeMatch.index);
  }

  raw = normalizeSubscripts(raw);

  // Hydrate / adduct notation: split on middot.
  let hydrate = null;
  const dotIdx = raw.search(/[·•]/);
  if (dotIdx !== -1) {
    const after = raw.slice(dotIdx + 1);
    hydrate = parseFormula(after);
    if (!hydrate) return null;
    raw = raw.slice(0, dotIdx);
  }

  // Optional leading stoichiometric coefficient.
  let coefficient = null;
  const coeffMatch = raw.match(/^(\d+)(?=[A-Z(])/);
  if (coeffMatch) {
    coefficient = parseInt(coeffMatch[1], 10);
    raw = raw.slice(coeffMatch[0].length);
  }

  const parsed = parseGroups(raw);
  if (!parsed || parsed.consumed !== raw.length || parsed.items.length === 0) {
    return null;
  }

  // Reject single bare element with no count/charge/coefficient and not a
  // known diatomic-ish compound: too likely to be an English word ("I", "He").
  const isSingleBareElement =
    parsed.items.length === 1 &&
    parsed.items[0].kind === "element" &&
    parsed.items[0].count === 1 &&
    !charge && coefficient === null && !hydrate;

  const canonical = canonicalString(parsed.items);
  const known = COMPOUND_NAMES[canonical];

  if (isSingleBareElement && !known) return null;

  return {
    raw: rawInput.trim(),
    coefficient,
    items: parsed.items,
    charge,
    hydrate,
    canonical,
    name: known ?? null,
  };
}

// Parse a run of element/group tokens. Supports one+ levels of parentheses.
function parseGroups(str) {
  const items = [];
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    if (ch === "(" || ch === "[") {
      const close = ch === "(" ? ")" : "]";
      const depthEnd = matchParen(str, i, ch, close);
      if (depthEnd === -1) return null;
      const inner = parseGroups(str.slice(i + 1, depthEnd));
      if (!inner || inner.consumed !== depthEnd - i - 1) return null;
      i = depthEnd + 1;
      const cnt = readCount(str, i);
      i = cnt.next;
      items.push({ kind: "group", items: inner.items, count: cnt.value });
      continue;
    }
    // Try a 2-letter then 1-letter element symbol.
    const two = str.slice(i, i + 2);
    const one = str.slice(i, i + 1);
    let sym = null;
    if (two.length === 2 && ELEMENT_SET.has(two)) sym = two;
    else if (ELEMENT_SET.has(one)) sym = one;
    if (!sym) return null;
    i += sym.length;
    const cnt = readCount(str, i);
    i = cnt.next;
    items.push({ kind: "element", symbol: sym, count: cnt.value });
  }
  return { items, consumed: i };
}

function matchParen(str, openIdx, open, close) {
  let depth = 0;
  for (let j = openIdx; j < str.length; j++) {
    if (str[j] === open) depth++;
    else if (str[j] === close) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

function readCount(str, i) {
  const m = str.slice(i).match(/^\d+/);
  if (m) return { value: parseInt(m[0], 10), next: i + m[0].length };
  return { value: 1, next: i };
}

function canonicalString(items) {
  return items
    .map((it) =>
      it.kind === "element"
        ? it.symbol + (it.count > 1 ? it.count : "")
        : "(" + canonicalString(it.items) + ")" + (it.count > 1 ? it.count : ""),
    )
    .join("");
}

// ---- Spoken renderings -----------------------------------------------------

// "Symbol reading": letters + counts, e.g. H2O -> "H 2 O". Most reversible and
// least ambiguous default; matches how a chemist reads an unfamiliar formula.
export function formulaToSymbolSpeech(parsed) {
  if (!parsed) return "";
  const parts = [];
  if (parsed.coefficient) parts.push(String(parsed.coefficient));
  parts.push(itemsToSymbolSpeech(parsed.items));
  if (parsed.charge) {
    const word = parsed.charge.sign === "+" ? "plus" : "minus";
    parts.push(parsed.charge.value > 1 ? `${parsed.charge.value} ${word}` : word);
  }
  if (parsed.hydrate) {
    parts.push("with");
    parts.push(formulaToSymbolSpeech(parsed.hydrate));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function itemsToSymbolSpeech(items) {
  return items
    .map((it) => {
      if (it.kind === "element") {
        const letters = sayElementLetters(it.symbol);
        return it.count > 1 ? `${letters} ${it.count}` : letters;
      }
      const inner = itemsToSymbolSpeech(it.items);
      return it.count > 1 ? `${inner} ${it.count}` : inner;
    })
    .join(" ");
}

function sayElementLetters(symbol) {
  // Spell out as letters with spaces so TTS reads each letter, not as a word.
  return symbol
    .split("")
    .map((c) => LETTER_NAMES[c.toUpperCase()] ?? c)
    .join(" ");
}

// "Name reading": element names (and known compound names), e.g.
// H2O -> "water" (if known) or "hydrogen 2 oxygen".
export function formulaToNameSpeech(parsed) {
  if (!parsed) return "";
  if (parsed.name && !parsed.charge && !parsed.hydrate && !parsed.coefficient) {
    return parsed.name;
  }
  const parts = [];
  if (parsed.coefficient) parts.push(String(parsed.coefficient));
  parts.push(itemsToNameSpeech(parsed.items));
  if (parsed.charge) {
    const word = parsed.charge.sign === "+" ? "plus" : "minus";
    parts.push(parsed.charge.value > 1 ? `${parsed.charge.value} ${word}` : word);
  }
  if (parsed.hydrate) {
    parts.push("with");
    parts.push(formulaToNameSpeech(parsed.hydrate));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function itemsToNameSpeech(items) {
  return items
    .map((it) => {
      if (it.kind === "element") {
        const name = ELEMENTS[it.symbol] ?? it.symbol;
        return it.count > 1 ? `${name} ${it.count}` : name;
      }
      const inner = itemsToNameSpeech(it.items);
      return it.count > 1 ? `${inner} ${it.count}` : inner;
    })
    .join(" ");
}

// MathML (presentation) for a formula, e.g. <msub> for subscripts and
// <msup>/<mmultiscripts> for charges. MathCAT (NVDA 2026.1+) and SRE speak this.
export function formulaToMathML(parsed) {
  if (!parsed) return "";
  const body = itemsToMathML(parsed.items);
  let core = body;
  if (parsed.charge) {
    const sup = `${parsed.charge.value > 1 ? parsed.charge.value : ""}${parsed.charge.sign}`;
    core = `<msup><mrow>${body}</mrow><mo>${sup}</mo></msup>`;
  }
  const coeff = parsed.coefficient ? `<mn>${parsed.coefficient}</mn>` : "";
  const hydrateCoeff = parsed.hydrate?.coefficient
    ? `<mn>${parsed.hydrate.coefficient}</mn>`
    : "";
  const hydrate = parsed.hydrate
    ? `<mo>&#183;</mo>${hydrateCoeff}${itemsToMathML(parsed.hydrate.items)}`
    : "";
  return `<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow>${coeff}${core}${hydrate}</mrow></math>`;
}

function itemsToMathML(items) {
  return items
    .map((it) => {
      if (it.kind === "element") {
        const base = `<mi mathvariant="normal">${it.symbol}</mi>`;
        return it.count > 1 ? `<msub>${base}<mn>${it.count}</mn></msub>` : base;
      }
      const inner = `<mrow><mo>(</mo>${itemsToMathML(it.items)}<mo>)</mo></mrow>`;
      return it.count > 1 ? `<msub>${inner}<mn>${it.count}</mn></msub>` : inner;
    })
    .join("");
}

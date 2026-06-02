// Minimal LaTeX-subset parser -> { mathml, spoken }.
//
// Supports the constructs used in CHEM 113 materials: \frac{}{}, subscripts (_),
// superscripts (^), grouping {}, Greek letters, and common operators/relations.
// It is intentionally small and dependency-free (no KaTeX/MathJax build step).

import { fracMathMLInner, normalizeNumberUnitSpacing, speakFracParts } from "./math.js";

const GREEK = {
  Delta: ["\u0394", "delta"], delta: ["\u03b4", "delta"],
  alpha: ["\u03b1", "alpha"], beta: ["\u03b2", "beta"], gamma: ["\u03b3", "gamma"],
  theta: ["\u03b8", "theta"], lambda: ["\u03bb", "lambda"], mu: ["\u03bc", "mu"],
  pi: ["\u03c0", "pi"], rho: ["\u03c1", "rho"], sigma: ["\u03c3", "sigma"],
  omega: ["\u03c9", "omega"], Omega: ["\u03a9", "omega"], Sigma: ["\u03a3", "sigma"],
};

const OPERATORS = {
  times: ["\u00d7", "times"], cdot: ["\u00b7", "times"], div: ["\u00f7", "divided by"],
  pm: ["\u00b1", "plus or minus"], mp: ["\u2213", "minus or plus"],
  leq: ["\u2264", "less than or equal to"], geq: ["\u2265", "greater than or equal to"],
  neq: ["\u2260", "not equal to"], approx: ["\u2248", "approximately"],
  to: ["\u2192", "yields"], rightarrow: ["\u2192", "yields"],
  rightleftharpoons: ["\u21cc", "in equilibrium with"], circ: ["\u2218", "degrees"],
  degree: ["\u00b0", "degrees"],
};

const CHAR_OPS = {
  "=": "equals", "+": "plus", "-": "minus", "*": "times", "/": "divided by",
  "(": "open parenthesis", ")": "close parenthesis", "<": "less than", ">": "greater than",
  ",": ",",
};

export function parseLatex(input) {
  const p = new Parser(input);
  const nodes = p.parseSequence();
  return {
    mathml:
      `<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow>` +
      nodes.map((n) => n.mathml).join("") +
      `</mrow></math>`,
    spoken: nodes.map((n) => n.spoken).join(" ").replace(/\s+/g, " ").trim(),
  };
}

class Parser {
  constructor(s) {
    this.s = s;
    this.i = 0;
  }
  peek() {
    return this.s[this.i];
  }
  eof() {
    return this.i >= this.s.length;
  }

  parseSequence(stopAtBrace = false) {
    const nodes = [];
    while (!this.eof()) {
      const c = this.peek();
      if (stopAtBrace && c === "}") break;
      if (c === " " || c === "\t" || c === "\n") {
        this.i++;
        continue;
      }
      const base = this.parseAtom();
      if (!base) {
        this.i++; // skip stray markers like _ or ^ with no base
        continue;
      }
      nodes.push(this.attachScripts(base));
    }
    return nodes;
  }

  // After an atom, consume any _/^ scripts and fold into msub/msup/msubsup.
  attachScripts(base) {
    let sub = null;
    let sup = null;
    while (!this.eof() && (this.peek() === "_" || this.peek() === "^")) {
      const marker = this.s[this.i++];
      const script = this.parseAtom();
      if (!script) break;
      if (marker === "_") sub = script;
      else sup = script;
    }
    if (!sub && !sup) return base;
    if (sub && sup) {
      return {
        mathml: `<msubsup><mrow>${base.mathml}</mrow><mrow>${sub.mathml}</mrow><mrow>${sup.mathml}</mrow></msubsup>`,
        spoken: `${base.spoken} sub ${sub.spoken} ${supWord(sup.spoken)}`,
      };
    }
    if (sub) {
      return {
        mathml: `<msub><mrow>${base.mathml}</mrow><mrow>${sub.mathml}</mrow></msub>`,
        spoken: `${base.spoken} sub ${sub.spoken}`,
      };
    }
    return {
      mathml: `<msup><mrow>${base.mathml}</mrow><mrow>${sup.mathml}</mrow></msup>`,
      spoken: `${base.spoken} ${supWord(sup.spoken)}`,
    };
  }

  parseAtom() {
    if (this.eof()) return null;
    const c = this.peek();
    if (c === "_" || c === "^") return null;
    if (c === "{") {
      this.i++;
      const inner = this.parseSequence(true);
      if (this.peek() === "}") this.i++;
      return {
        mathml: inner.map((n) => n.mathml).join(""),
        spoken: inner.map((n) => n.spoken).join(" "),
      };
    }
    if (c === "\\") return this.parseCommand();
    if (/[0-9.]/.test(c)) {
      let num = "";
      while (!this.eof() && /[0-9.]/.test(this.peek())) num += this.s[this.i++];
      return { mathml: `<mn>${num}</mn>`, spoken: num };
    }
    if (/[A-Za-z]/.test(c)) {
      this.i++;
      return { mathml: `<mi>${c}</mi>`, spoken: c };
    }
    if (c in CHAR_OPS) {
      this.i++;
      return { mathml: `<mo>${escapeXml(c)}</mo>`, spoken: CHAR_OPS[c] };
    }
    // Unknown char: pass through as <mo>.
    this.i++;
    return { mathml: `<mo>${escapeXml(c)}</mo>`, spoken: c };
  }

  parseCommand() {
    this.i++; // consume backslash
    let name = "";
    while (!this.eof() && /[A-Za-z]/.test(this.peek())) name += this.s[this.i++];
    if (name === "frac") {
      const numRaw = this.readBracedContent();
      const denRaw = this.readBracedContent();
      const num = normalizeNumberUnitSpacing(numRaw);
      const den = normalizeNumberUnitSpacing(denRaw);
      return {
        mathml: fracMathMLInner(num, den),
        spoken: speakFracParts(num, den),
      };
    }
    if (name === "sqrt") {
      const body = this.parseAtom() ?? { mathml: "", spoken: "" };
      return {
        mathml: `<msqrt><mrow>${body.mathml}</mrow></msqrt>`,
        spoken: `the square root of ${body.spoken}`,
      };
    }
    if (name in GREEK) {
      const [glyph, word] = GREEK[name];
      return { mathml: `<mi>${glyph}</mi>`, spoken: word };
    }
    if (name in OPERATORS) {
      const [glyph, word] = OPERATORS[name];
      return { mathml: `<mo>${glyph}</mo>`, spoken: word };
    }
    // Unknown command: render its name as text.
    return { mathml: `<mi>${escapeXml(name)}</mi>`, spoken: name };
  }

  readBracedContent() {
    if (this.peek() !== "{") return "";
    this.i++;
    let depth = 1;
    let raw = "";
    while (!this.eof() && depth > 0) {
      const c = this.peek();
      if (c === "{") depth++;
      if (c === "}") {
        depth--;
        if (depth === 0) {
          this.i++;
          break;
        }
      }
      raw += this.s[this.i++];
    }
    return raw.trim();
  }
}

function supWord(s) {
  if (s === "2") return "squared";
  if (s === "3") return "cubed";
  return `to the power of ${s}`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

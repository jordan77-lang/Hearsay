// Default screen reader speech (no class / user speech dictionary).
//
// Two selectable factory profiles:
//   - NVDA: driven directly by NVDA's English symbol dictionary
//     (source/locale/en/symbols.dic, master) at factory punctuation "some".
//   - JAWS: NVDA's table with verified JAWS 2023 wording/level overrides at
//     factory punctuation "Most" (Eleven Ways character tests, Freedom
//     Scientific docs, University of Houston JAWS tutorial).
// Both share NVDA's context rules (sentence endings, decimals, negative
// numbers) — testing shows JAWS handles these the same way at factory.
//
// How the native readers handle punctuation at factory settings:
//   - NVDA (punctuation "some"): speaks # % & * / @ + < > = ° × ÷ − ± µ,
//     bullets (•, ◦, ▪), sub/superscript digits ("subscript 2"), primes,
//     arrows, © ® ™ and check marks. Parens, brackets, quotes, dashes,
//     colons and semicolons are level "most"; sentence punctuation
//     (. ! ? ,) is level "all". Symbols below the user's level are passed
//     to the synthesizer, which renders them as pauses, not words.
//   - JAWS (factory "Most"): also speaks quotes, parens, colons, semis and
//     hyphens, but never sentence-ending . ! ? or commas — those only pause.
//   - VoiceOver (factory "Some"): speaks keyboard/math symbols (+ = etc.)
//     and "bullet", but quotes, parens and dashes only pause. (No profile
//     yet — pending a calibration pass on real hardware.)
//   Lab's default column follows the selected profile at its true factory
//   level, so the NVDA profile keeps parens silent while JAWS names them.
//
// Context-sensitive rules NVDA applies regardless of the simple table
// (complexSymbols in symbols.dic), reproduced below:
//   - Sentence-ending . ! ? are level "all" and always preserved: below
//     "all" they are silent pauses ("water." is never "water dot").
//   - A dot between digits is a decimal point: silent at every level
//     ("4.18" reads as a number). Other embedded dots (uh.edu) say "dot".
//   - "..." says "dot dot dot" and 4+ dots say "multiple dots", only at "all".
//   - A minus/hyphen directly before a number is "minus" at EVERY level
//     ("-5" and "−5" both read "minus 5").
// Document formatting, for reference (handled upstream or by symbols):
//   - Bullet characters (• ◦ ▪ ‣ ⁃) are spoken by name at factory level;
//     list/heading semantics ("list with 3 items", "heading level 2") come
//     from document markup, which plain pasted text does not carry.
//   - Tabs are whitespace: silent in say-all (named "tab" only at level
//     "all" or when arrowing by character). Blank lines say "blank" only
//     when navigating line by line, not during continuous reading.
//
// NVDA does NOT ship chemistry unit expansions (no "joules per gram…"). Those
// come from user speech dictionaries or course add-ons — the green column in Lab.
//
// Symbol source (English):
//   https://github.com/nvaccess/nvda/blob/master/source/locale/en/symbols.dic

import { labSpeechNeedsGap } from "./lab-speech-gap.js";

/** @typedef {{ display: string, spoken: string, changed: boolean }} DefaultSrSegment */

/** Factory-default NVDA punctuation level for general reading. */
export const DEFAULT_SR_PUNCTUATION_LEVEL = "some";

/** @type {Record<string, number>} */
const LEVEL_RANK = { none: 0, some: 1, most: 2, all: 3, char: 4 };

/** @typedef {{ spoken: string, level: keyof typeof LEVEL_RANK }} NvdaSymbolEntry */

/**
 * char → NVDA replacement + minimum level, mirroring en/symbols.dic.
 * Level "none" symbols are spoken at every punctuation setting.
 * @type {Map<string, NvdaSymbolEntry>}
 */
const NVDA_SYMBOLS = new Map([
  // Whitespace ("tab" is only named at level all; \n, \r, space are char-level)
  ["\t", { spoken: "tab", level: "all" }],
  ["\f", { spoken: "page break", level: "none" }],

  // Standard punctuation/symbols
  ["!", { spoken: "bang", level: "all" }],
  ['"', { spoken: "quote", level: "most" }],
  ["#", { spoken: "number", level: "some" }],
  ["$", { spoken: "dollar", level: "all" }],
  ["£", { spoken: "pound", level: "all" }],
  ["€", { spoken: "euro", level: "all" }],
  ["¢", { spoken: "cents", level: "all" }],
  ["¥", { spoken: "yen", level: "all" }],
  ["₹", { spoken: "rupee", level: "some" }],
  ["%", { spoken: "percent", level: "some" }],
  ["‰", { spoken: "per mille", level: "some" }],
  ["&", { spoken: "and", level: "some" }],
  ["'", { spoken: "tick", level: "all" }],
  ["(", { spoken: "left paren", level: "most" }],
  [")", { spoken: "right paren", level: "most" }],
  ["*", { spoken: "star", level: "some" }],
  [",", { spoken: "comma", level: "all" }],
  ["-", { spoken: "dash", level: "most" }],
  [".", { spoken: "dot", level: "some" }], // standalone only; sentence endings/decimals handled in context
  ["/", { spoken: "slash", level: "some" }],
  [":", { spoken: "colon", level: "most" }],
  [";", { spoken: "semi", level: "most" }],
  ["?", { spoken: "question", level: "all" }],
  ["@", { spoken: "at", level: "some" }],
  ["[", { spoken: "left bracket", level: "most" }],
  ["]", { spoken: "right bracket", level: "most" }],
  ["\\", { spoken: "backslash", level: "most" }],
  ["^", { spoken: "caret", level: "most" }],
  ["_", { spoken: "line", level: "most" }],
  ["`", { spoken: "graav", level: "most" }],
  ["{", { spoken: "left brace", level: "most" }],
  ["}", { spoken: "right brace", level: "most" }],
  ["|", { spoken: "bar", level: "most" }],
  ["¦", { spoken: "broken bar", level: "most" }],
  ["~", { spoken: "tilda", level: "most" }],
  ["¡", { spoken: "inverted exclamation point", level: "some" }],
  ["¿", { spoken: "inverted question mark", level: "some" }],
  ["·", { spoken: "middle dot", level: "most" }],
  ["‚", { spoken: "single low quote", level: "most" }],
  ["„", { spoken: "double low quote", level: "most" }],
  ["′", { spoken: "prime", level: "some" }],
  ["″", { spoken: "double prime", level: "some" }],
  ["‴", { spoken: "triple prime", level: "some" }],
  ["‐", { spoken: "hyphen", level: "most" }],

  // Typography and document characters
  ["•", { spoken: "bullet", level: "some" }],
  ["…", { spoken: "dot dot dot", level: "all" }],
  ["“", { spoken: "left quote", level: "most" }],
  ["”", { spoken: "right quote", level: "most" }],
  ["‘", { spoken: "left tick", level: "most" }],
  ["’", { spoken: "right tick", level: "most" }],
  ["–", { spoken: "en dash", level: "most" }],
  ["—", { spoken: "em dash", level: "most" }],
  ["\u00ad", { spoken: "soft hyphen", level: "most" }],
  ["⁃", { spoken: "hyphen bullet", level: "none" }],
  ["‣", { spoken: "triangular bullet", level: "none" }],
  ["●", { spoken: "circle", level: "most" }],
  ["○", { spoken: "white circle", level: "most" }],
  ["■", { spoken: "black square", level: "some" }],
  ["▪", { spoken: "black square", level: "some" }],
  ["◾", { spoken: "black square", level: "some" }],
  ["□", { spoken: "white square", level: "some" }],
  ["◦", { spoken: "white bullet", level: "some" }],
  ["✗", { spoken: "x-shaped bullet", level: "none" }],
  ["¶", { spoken: "paragraph marker", level: "most" }],
  ["§", { spoken: "section", level: "all" }],
  ["«", { spoken: "double left pointing angle bracket", level: "most" }],
  ["»", { spoken: "double right pointing angle bracket", level: "most" }],
  ["©", { spoken: "copyright", level: "some" }],
  ["®", { spoken: "registered", level: "some" }],
  ["™", { spoken: "trademark", level: "some" }],
  ["℠", { spoken: "ServiceMark", level: "some" }],
  ["†", { spoken: "dagger", level: "some" }],
  ["‡", { spoken: "double dagger", level: "some" }],
  ["←", { spoken: "left arrow", level: "some" }],
  ["↑", { spoken: "up arrow", level: "some" }],
  ["→", { spoken: "right arrow", level: "some" }],
  ["↓", { spoken: "down arrow", level: "some" }],
  ["⇨", { spoken: "right white arrow", level: "some" }],
  ["➔", { spoken: "right-pointing arrow", level: "some" }],
  ["➢", { spoken: "right arrowhead", level: "some" }],
  ["⇒", { spoken: "double right arrow", level: "none" }],
  ["⇐", { spoken: "is implied by", level: "none" }],
  ["⇄", { spoken: "right arrow over left arrow", level: "none" }],
  // Not in symbols.dic: spoken via Unicode/CLDR character names by NVDA + synths.
  ["↔", { spoken: "left-right arrow", level: "some" }],
  ["↕", { spoken: "up-down arrow", level: "some" }],
  ["↺", { spoken: "anticlockwise open circle arrow", level: "some" }],
  ["↻", { spoken: "clockwise open circle arrow", level: "some" }],
  ["↶", { spoken: "anticlockwise top semicircle arrow", level: "some" }],
  ["↷", { spoken: "clockwise top semicircle arrow", level: "some" }],
  ["⇠", { spoken: "leftwards dashed arrow", level: "some" }],
  ["⇡", { spoken: "upwards dashed arrow", level: "some" }],
  ["⇢", { spoken: "rightwards dashed arrow", level: "some" }],
  ["⇣", { spoken: "downwards dashed arrow", level: "some" }],
  ["✓", { spoken: "check", level: "some" }],
  ["✔", { spoken: "check", level: "some" }],

  // Superscripts and subscripts (NVDA speaks these at factory level "some")
  ["⁰", { spoken: "superscript 0", level: "some" }],
  ["¹", { spoken: "superscript 1", level: "some" }],
  ["²", { spoken: "superscript 2", level: "some" }],
  ["³", { spoken: "superscript 3", level: "some" }],
  ["⁴", { spoken: "superscript 4", level: "some" }],
  ["⁵", { spoken: "superscript 5", level: "some" }],
  ["⁶", { spoken: "superscript 6", level: "some" }],
  ["⁷", { spoken: "superscript 7", level: "some" }],
  ["⁸", { spoken: "superscript 8", level: "some" }],
  ["⁹", { spoken: "superscript 9", level: "some" }],
  ["⁺", { spoken: "superscript plus", level: "some" }],
  ["⁼", { spoken: "superscript equals", level: "some" }],
  ["⁽", { spoken: "superscript left paren", level: "some" }],
  ["⁾", { spoken: "superscript right paren", level: "some" }],
  ["ⁿ", { spoken: "superscript n", level: "some" }],
  ["₀", { spoken: "subscript 0", level: "some" }],
  ["₁", { spoken: "subscript 1", level: "some" }],
  ["₂", { spoken: "subscript 2", level: "some" }],
  ["₃", { spoken: "subscript 3", level: "some" }],
  ["₄", { spoken: "subscript 4", level: "some" }],
  ["₅", { spoken: "subscript 5", level: "some" }],
  ["₆", { spoken: "subscript 6", level: "some" }],
  ["₇", { spoken: "subscript 7", level: "some" }],
  ["₈", { spoken: "subscript 8", level: "some" }],
  ["₉", { spoken: "subscript 9", level: "some" }],
  ["₊", { spoken: "subscript plus", level: "some" }],
  ["₋", { spoken: "subscript minus", level: "some" }],
  ["₌", { spoken: "subscript equals", level: "some" }],
  ["₍", { spoken: "subscript left paren", level: "some" }],
  ["₎", { spoken: "subscript right paren", level: "some" }],

  // Sub/superscript LETTERS are not in NVDA's symbols.dic. Real readers still
  // voice them because the synthesizer (eSpeak, VoiceOver, Eloquence) normalizes
  // them to the base letter: Kₐ reads "K a", never "K subscript a". Browser TTS
  // usually skips them, so the simulation spells out that normalization here.
  ["ₐ", { spoken: "a", level: "none" }],
  ["ₑ", { spoken: "e", level: "none" }],
  ["ₒ", { spoken: "o", level: "none" }],
  ["ₓ", { spoken: "x", level: "none" }],
  ["ₔ", { spoken: "schwa", level: "none" }],
  ["ₕ", { spoken: "h", level: "none" }],
  ["ₖ", { spoken: "k", level: "none" }],
  ["ₗ", { spoken: "l", level: "none" }],
  ["ₘ", { spoken: "m", level: "none" }],
  ["ₙ", { spoken: "n", level: "none" }],
  ["ₚ", { spoken: "p", level: "none" }],
  ["ₛ", { spoken: "s", level: "none" }],
  ["ₜ", { spoken: "t", level: "none" }],
  ["ᵢ", { spoken: "i", level: "none" }],
  ["ᵣ", { spoken: "r", level: "none" }],
  ["ᵤ", { spoken: "u", level: "none" }],
  ["ᵥ", { spoken: "v", level: "none" }],
  ["ᵦ", { spoken: "beta", level: "none" }],
  ["ᵧ", { spoken: "gamma", level: "none" }],
  ["ᵨ", { spoken: "rho", level: "none" }],
  ["ᵩ", { spoken: "phi", level: "none" }],
  ["ᵪ", { spoken: "chi", level: "none" }],
  ["ⁱ", { spoken: "i", level: "none" }], // superscript i: missing from NVDA's dic (ⁿ is present); synths say the base letter

  // Arithmetic operators
  ["+", { spoken: "plus", level: "some" }],
  ["−", { spoken: "minus", level: "some" }],
  ["×", { spoken: "times", level: "some" }],
  ["⋅", { spoken: "times", level: "some" }],
  ["⨯", { spoken: "times", level: "none" }],
  // U+2715 is not in NVDA's symbols.dic (real NVDA is silent on it); HearSay
  // speaks it as "times" so Google Docs' multiplication cross is never lost.
  ["\u2715", { spoken: "times", level: "some" }],
  ["∕", { spoken: "divided by", level: "some" }],
  ["⁄", { spoken: "divided by", level: "some" }],
  ["÷", { spoken: "divide by", level: "some" }],
  ["∓", { spoken: "minus or plus", level: "some" }],
  ["±", { spoken: "plus or Minus", level: "some" }],
  ["⁻", { spoken: "inverse", level: "some" }],
  ["°", { spoken: "degrees", level: "some" }],
  ["µ", { spoken: "micro", level: "some" }],

  // Equality and comparison (level "none" = spoken at every setting)
  ["=", { spoken: "equals", level: "some" }],
  ["<", { spoken: "less", level: "some" }],
  [">", { spoken: "greater", level: "some" }],
  ["＜", { spoken: "less", level: "some" }], // fullwidth forms: synths normalize to ASCII
  ["＞", { spoken: "greater", level: "some" }],
  ["≠", { spoken: "not equal to", level: "none" }],
  ["≈", { spoken: "almost Equal to", level: "none" }],
  ["≅", { spoken: "approximately equal to", level: "none" }],
  ["≡", { spoken: "identical to", level: "none" }],
  ["∼", { spoken: "similar to", level: "none" }],
  ["≤", { spoken: "less- than or equal to", level: "none" }],
  ["≦", { spoken: "less- than or equal to", level: "none" }],
  ["≥", { spoken: "greater-than or equal to", level: "none" }],
  ["≧", { spoken: "greater-than or equal to", level: "none" }],
  ["≪", { spoken: "much smaller than", level: "none" }],
  ["≫", { spoken: "much bigger than", level: "none" }],

  // Other mathematical operators (all level "none" in NVDA)
  ["√", { spoken: "square root", level: "none" }],
  ["∛", { spoken: "cube root", level: "none" }],
  ["∜", { spoken: "fourth root", level: "none" }],
  ["∑", { spoken: "n-ary summation", level: "none" }],
  ["∏", { spoken: "n-ary product", level: "none" }],
  ["∫", { spoken: "integral", level: "none" }],
  ["∞", { spoken: "infinity", level: "none" }],
  ["∝", { spoken: "proportional to", level: "none" }],
  ["∂", { spoken: "partial derivative", level: "none" }],
  ["∇", { spoken: "gradient of", level: "none" }],
  ["∘", { spoken: "ring Operator", level: "none" }],
  ["∈", { spoken: "element of", level: "none" }],
  ["∉", { spoken: "not an element of", level: "none" }],
  ["∩", { spoken: "intersection", level: "none" }],
  ["∪", { spoken: "union", level: "none" }],
  ["∅", { spoken: "empty set", level: "none" }],
  ["⊂", { spoken: "subset of", level: "none" }],
  ["⊃", { spoken: "superset of", level: "none" }],
  ["⊆", { spoken: "subset of or equal to", level: "none" }],
  ["⊇", { spoken: "superset of or equal to", level: "none" }],
  ["∴", { spoken: "therefore", level: "none" }],
  ["∵", { spoken: "because", level: "none" }],
  ["∶", { spoken: "ratio", level: "none" }],
  ["∷", { spoken: "proportion", level: "none" }],
  ["∙", { spoken: "bullet Operator", level: "none" }],
  ["∣", { spoken: "divides", level: "none" }],
  ["¬", { spoken: "not", level: "none" }],
  ["∧", { spoken: "and", level: "none" }],
  ["∨", { spoken: "or", level: "none" }],
  ["⊕", { spoken: "circled plus", level: "none" }],
  ["⊖", { spoken: "circled minus", level: "none" }],
  ["∠", { spoken: "angle", level: "none" }],
  ["△", { spoken: "triangle", level: "none" }],
  ["⊥", { spoken: "perpendicular to", level: "none" }],
  ["∥", { spoken: "parallel to", level: "none" }],

  // Vulgar fractions (always spoken)
  ["¼", { spoken: "one quarter", level: "none" }],
  ["½", { spoken: "one half", level: "none" }],
  ["¾", { spoken: "three quarters", level: "none" }],
  ["⅓", { spoken: "one third", level: "none" }],
  ["⅔", { spoken: "two thirds", level: "none" }],
  ["⅕", { spoken: "one fifth", level: "none" }],
  ["⅖", { spoken: "two fifths", level: "none" }],
  ["⅗", { spoken: "three fifths", level: "none" }],
  ["⅘", { spoken: "four fifths", level: "none" }],
  ["⅙", { spoken: "one sixth", level: "none" }],
  ["⅚", { spoken: "five sixths", level: "none" }],
  ["⅐", { spoken: "one seventh", level: "none" }],
  ["⅛", { spoken: "one eighth", level: "none" }],
  ["⅜", { spoken: "three eights", level: "none" }],
  ["⅝", { spoken: "five eighths", level: "none" }],
  ["⅞", { spoken: "seven eighths", level: "none" }],
  ["⅑", { spoken: "one ninth", level: "none" }],
  ["⅒", { spoken: "one tenth", level: "none" }],

  // Number sets
  ["ℝ", { spoken: "real numbers", level: "none" }],
  ["ℕ", { spoken: "natural numbers", level: "none" }],
  ["ℤ", { spoken: "integers", level: "none" }],
  ["ℚ", { spoken: "rational numbers", level: "none" }],
  ["ℂ", { spoken: "complex numbers", level: "none" }],

  // Greek letters: not in NVDA's symbols.dic — the synthesizer reads them by
  // name (eSpeak, OneCore, and JAWS's Eloquence all say "delta" for Δ).
  // Lowercase plus the capitals that don't look like Latin letters.
  ["α", { spoken: "alpha", level: "none" }],
  ["β", { spoken: "beta", level: "none" }],
  ["γ", { spoken: "gamma", level: "none" }],
  ["δ", { spoken: "delta", level: "none" }],
  ["ε", { spoken: "epsilon", level: "none" }],
  ["ζ", { spoken: "zeta", level: "none" }],
  ["η", { spoken: "eta", level: "none" }],
  ["θ", { spoken: "theta", level: "none" }],
  ["ι", { spoken: "iota", level: "none" }],
  ["κ", { spoken: "kappa", level: "none" }],
  ["λ", { spoken: "lambda", level: "none" }],
  ["μ", { spoken: "mu", level: "none" }], // Greek mu (U+03BC), distinct from micro sign µ
  ["ν", { spoken: "nu", level: "none" }],
  ["ξ", { spoken: "xi", level: "none" }],
  ["π", { spoken: "pi", level: "none" }],
  ["ρ", { spoken: "rho", level: "none" }],
  ["σ", { spoken: "sigma", level: "none" }],
  ["ς", { spoken: "sigma", level: "none" }],
  ["τ", { spoken: "tau", level: "none" }],
  ["υ", { spoken: "upsilon", level: "none" }],
  ["φ", { spoken: "phi", level: "none" }],
  ["χ", { spoken: "chi", level: "none" }],
  ["ψ", { spoken: "psi", level: "none" }],
  ["ω", { spoken: "omega", level: "none" }],
  ["Γ", { spoken: "gamma", level: "none" }],
  ["Δ", { spoken: "delta", level: "none" }],
  ["Θ", { spoken: "theta", level: "none" }],
  ["Λ", { spoken: "lambda", level: "none" }],
  ["Ξ", { spoken: "xi", level: "none" }],
  ["Π", { spoken: "pi", level: "none" }],
  ["Σ", { spoken: "sigma", level: "none" }], // Greek capital sigma, distinct from ∑ summation
  ["Φ", { spoken: "phi", level: "none" }],
  ["Ψ", { spoken: "psi", level: "none" }],
  ["Ω", { spoken: "omega", level: "none" }],
]);

/**
 * JAWS 2023 factory wording/level overrides on top of the NVDA table.
 * Sources: Eleven Ways in-context factory tests, Freedom Scientific docs,
 * University of Houston JAWS tutorial. JAWS factory punctuation is "Most".
 * @type {Map<string, NvdaSymbolEntry>}
 */
const JAWS_OVERRIDES = new Map([
  // Different wording than NVDA (verified in context at factory settings)
  ["!", { spoken: "exclaim", level: "all" }],
  [";", { spoken: "semi-colon", level: "most" }],
  ["_", { spoken: "underline", level: "some" }], // "my underline file underline name dot JPG"
  ["|", { spoken: "vertical bar", level: "most" }],
  ["~", { spoken: "tilde", level: "some" }], // spoken in URLs at factory
  ["`", { spoken: "grave", level: "some" }],
  ["–", { spoken: "n dash", level: "most" }],
  ["—", { spoken: "m dash", level: "most" }],
  ["·", { spoken: "dot", level: "most" }],
  ["†", { spoken: "single dagger", level: "some" }],
  ["«", { spoken: "left double angle bracket", level: "most" }],
  ["»", { spoken: "right double angle bracket", level: "most" }],
  ["‹", { spoken: "single left pointing angle quotation mark", level: "most" }],
  ["›", { spoken: "single right pointing angle quotation mark", level: "most" }],
  ["‘", { spoken: "apostrophe", level: "most" }], // in-word rule still keeps don’t natural
  ["’", { spoken: "apostrophe", level: "most" }],
  // JAWS keeps these silent in running text (NVDA names them at "some")
  ["¡", { spoken: "inverted exclaim", level: "all" }],
  ["¿", { spoken: "inverted question", level: "all" }],
  // Spoken at factory by JAWS but not by factory NVDA
  ["§", { spoken: "section", level: "some" }], // "read section twenty four point one"
  ["¶", { spoken: "paragraph", level: "some" }],
  ["$", { spoken: "dollar", level: "some" }], // "$21" → "dollar twenty one"
  ["€", { spoken: "euro sign", level: "some" }],
  ["£", { spoken: "pounds", level: "some" }],
  ["¥", { spoken: "yen", level: "some" }],
  // Math wording differences (verified)
  ["µ", { spoken: "mu", level: "some" }], // JAWS says "mu", NVDA says "micro"
  ["‰", { spoken: "per mil", level: "some" }],
  ["÷", { spoken: "divided by", level: "some" }],
  ["±", { spoken: "plus or minus", level: "some" }],
  ["<", { spoken: "less than", level: "some" }],
  ["≠", { spoken: "not equal", level: "none" }],
  ["≈", { spoken: "almost equal to", level: "none" }],
  ["≤", { spoken: "less than or equal to", level: "none" }],
  ["≥", { spoken: "greater than or equal to", level: "none" }],
  ["¼", { spoken: "one fourth", level: "none" }],
  ["¾", { spoken: "three fourths", level: "none" }],
  ["∑", { spoken: "summation", level: "none" }],
  // Arrows: JAWS uses Unicode-style names (verified)
  ["←", { spoken: "leftwards arrow", level: "some" }],
  ["→", { spoken: "rightwards arrow", level: "some" }],
  ["↑", { spoken: "upwards arrow", level: "some" }],
  ["↓", { spoken: "downwards arrow", level: "some" }],
  ["↔", { spoken: "left right arrow", level: "some" }],
  ["⇒", { spoken: "rightwards double arrow", level: "some" }],
  ["⇐", { spoken: "leftwards triple arrow", level: "some" }], // verified JAWS 2023 quirk
  // Sub/superscript digits: JAWS does not announce "subscript"; the synth
  // reads the base digit (calibration pending — verify with your JAWS copy).
  ["₀", { spoken: "0", level: "none" }],
  ["₁", { spoken: "1", level: "none" }],
  ["₂", { spoken: "2", level: "none" }],
  ["₃", { spoken: "3", level: "none" }],
  ["₄", { spoken: "4", level: "none" }],
  ["₅", { spoken: "5", level: "none" }],
  ["₆", { spoken: "6", level: "none" }],
  ["₇", { spoken: "7", level: "none" }],
  ["₈", { spoken: "8", level: "none" }],
  ["₉", { spoken: "9", level: "none" }],
  ["₊", { spoken: "plus", level: "none" }],
  ["₋", { spoken: "minus", level: "none" }],
  ["₌", { spoken: "equals", level: "none" }],
  ["₍", { spoken: "left paren", level: "none" }],
  ["₎", { spoken: "right paren", level: "none" }],
  ["⁰", { spoken: "0", level: "none" }],
  ["¹", { spoken: "1", level: "none" }],
  ["²", { spoken: "2", level: "none" }],
  ["³", { spoken: "3", level: "none" }],
  ["⁴", { spoken: "4", level: "none" }],
  ["⁵", { spoken: "5", level: "none" }],
  ["⁶", { spoken: "6", level: "none" }],
  ["⁷", { spoken: "7", level: "none" }],
  ["⁸", { spoken: "8", level: "none" }],
  ["⁹", { spoken: "9", level: "none" }],
  ["⁺", { spoken: "plus", level: "none" }],
  ["⁼", { spoken: "equals", level: "none" }],
  ["⁽", { spoken: "left paren", level: "none" }],
  ["⁾", { spoken: "right paren", level: "none" }],
  ["ⁿ", { spoken: "n", level: "none" }],
]);

/** @type {Map<string, NvdaSymbolEntry>} */
const JAWS_SYMBOLS = new Map(NVDA_SYMBOLS);
for (const [ch, entry] of JAWS_OVERRIDES) JAWS_SYMBOLS.set(ch, entry);

/** @typedef {{ id: string, label: string, level: keyof typeof LEVEL_RANK, symbols: Map<string, NvdaSymbolEntry> }} SrProfile */

/** Selectable factory profiles for the Lab's default screen reader column. */
export const SR_PROFILES = {
  nvda: { id: "nvda", label: "NVDA (factory)", level: "some", symbols: NVDA_SYMBOLS },
  jaws: { id: "jaws", label: "JAWS (factory)", level: "most", symbols: JAWS_SYMBOLS },
};

let activeProfile = SR_PROFILES.nvda;

/** @param {string} id @returns {string} the resolved profile id */
export function setDefaultSrProfile(id) {
  activeProfile = SR_PROFILES[id] ?? SR_PROFILES.nvda;
  return activeProfile.id;
}

export function getDefaultSrProfileId() {
  return activeProfile.id;
}

function levelAtLeast(userLevel, need) {
  return (LEVEL_RANK[userLevel] ?? LEVEL_RANK.some) >= (LEVEL_RANK[need] ?? LEVEL_RANK.all);
}

function symbolSpokenAtLevel(ch, userLevel) {
  const entry = activeProfile.symbols.get(ch);
  if (!entry) return null;
  if (!levelAtLeast(userLevel, entry.level)) return null;
  return entry.spoken;
}

/** NVDA complexSymbols "negative number": (?<!\w)[-−](?=[$£€¥.]?\d) — "minus" at every level. */
function isNegativeNumberSign(text, i) {
  if (i > 0 && /[\w−-]/.test(text[i - 1])) return false;
  const next = text[i + 1] ?? "";
  if (/\d/.test(next)) return true;
  return /[$£€¥.]/.test(next) && /\d/.test(text[i + 2] ?? "");
}

/** NVDA complexSymbols "decimal point": dot before a digit, not preceded by a word char. */
function isDecimalPoint(text, i) {
  const next = text[i + 1] ?? "";
  if (!/\d/.test(next)) return false;
  const prev = i > 0 ? text[i - 1] : "";
  return !prev || /[\d\s−-]/.test(prev);
}

/** NVDA complexSymbols ". sentence ending": preceded by non-space, followed by quote/paren/space/end. */
function isSentenceEndingDot(text, i) {
  const prev = i > 0 ? text[i - 1] : "";
  if (!prev || /[\s.]/.test(prev)) return false;
  const next = text[i + 1] ?? "";
  return !next || /["'”’)\s]/.test(next);
}

/**
 * @param {string} visible
 * @param {keyof typeof LEVEL_RANK} [userLevel] defaults to the active profile's factory level
 * @returns {string}
 */
export function defaultSrSpeakVisible(visible, userLevel = activeProfile.level) {
  let out = "";
  let afterSpokenSymbol = false;
  for (const seg of defaultSrVisibleSegments(visible, userLevel)) {
    const piece = seg.spoken;
    if (!piece) continue;
    if (out && seg.changed && !/\s$/.test(out)) out += " ";
    else if (out && afterSpokenSymbol) out += " ";
    else if (out && labSpeechNeedsGap(out, piece)) out += " ";
    out += piece;
    afterSpokenSymbol = seg.changed;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Split visible text into unchanged runs and symbol substitutions for the active profile.
 * @param {string} visible
 * @param {keyof typeof LEVEL_RANK} [userLevel] defaults to the active profile's factory level
 * @returns {DefaultSrSegment[]}
 */
export function defaultSrVisibleSegments(visible, userLevel = activeProfile.level) {
  if (!visible) return [];
  /** @type {DefaultSrSegment[]} */
  const segments = [];
  let plain = "";

  function flushPlain() {
    if (!plain) return;
    segments.push({ display: plain, spoken: plain, changed: false });
    plain = "";
  }

  function pushSpoken(display, spoken) {
    flushPlain();
    segments.push({ display, spoken, changed: true });
  }

  for (let i = 0; i < visible.length; i++) {
    const ch = visible[i];
    if (ch === ".") {
      let j = i + 1;
      while (j < visible.length && visible[j] === ".") j++;
      const run = j - i;
      if (run >= 3) {
        // "..." → "dot dot dot", 4+ → "multiple dots"; both level all, preserved (pause) below.
        if (levelAtLeast(userLevel, "all")) pushSpoken(visible.slice(i, j), run === 3 ? "dot dot dot" : "multiple dots");
        else plain += visible.slice(i, j);
        i = j - 1;
        continue;
      }
      if (isDecimalPoint(visible, i)) {
        plain += ch; // silent at every level: "4.18" reads as a number
        continue;
      }
      if (isSentenceEndingDot(visible, i)) {
        // Level all, preserved: below "all" the period is a pause, never "dot".
        if (levelAtLeast(userLevel, "all")) pushSpoken(ch, "dot");
        else plain += ch;
        continue;
      }
      // Other dots (uh.edu, e.g.) fall through to the standalone "." entry (level some).
    }
    if ((ch === "-" || ch === "−") && isNegativeNumberSign(visible, i)) {
      pushSpoken(ch, "minus"); // negative numbers say "minus" at every level
      continue;
    }
    if ((ch === "'" || ch === "’") && i > 0 && /[\p{L}\p{N}]/u.test(visible[i - 1])) {
      // NVDA "in-word '": don’t / can't keep their apostrophe (level all, preserved).
      if (levelAtLeast(userLevel, "all")) pushSpoken(ch, "tick");
      else plain += ch;
      continue;
    }
    if (ch === "…" && !levelAtLeast(userLevel, "all")) {
      plain += ch; // preserved like "...": pause only below level all
      continue;
    }
    const spoken = symbolSpokenAtLevel(ch, userLevel);
    if (spoken) {
      pushSpoken(ch, spoken);
    } else {
      plain += ch;
    }
  }
  flushPlain();
  return coalesceDefaultSrSegments(segments);
}

/** NVDA reads °C as “degrees C”, not “degrees” then a separate letter. */
function coalesceDefaultSrSegments(segments) {
  /** @type {DefaultSrSegment[]} */
  const out = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const next = segments[i + 1];
    const unit = seg.display === "°" && next && !next.changed ? /^([CF])(?![A-Za-z0-9])/.exec(next.display) : null;
    if (unit) {
      out.push({ display: `°${unit[1]}`, spoken: `degrees ${unit[1]}`, changed: true });
      const rest = next.display.slice(1);
      if (rest) out.push({ display: rest, spoken: rest, changed: false });
      i += 1;
      continue;
    }
    out.push(seg);
  }
  return out;
}

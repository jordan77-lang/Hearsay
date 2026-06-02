// Chemistry lexicon for Sci-Speak.
//
// This file is intentionally plain data + a few small helpers so it can be
// imported unchanged by the Chrome extension (side panel / service worker),
// the standalone playground, and the Node test runner.
//
// Pronunciation philosophy:
//   Screen readers hand a *string* to a TTS engine. We cannot inject phonemes
//   portably, so the reliable lever is the literal text. Each entry below maps
//   a token to a "spoken" string that ordinary TTS engines render acceptably
//   (e.g. "mL" -> "milliliters"), plus metadata used to explain the risk.

// IUPAC element symbols, ordered so multi-letter symbols are tried before
// single-letter ones during formula parsing (e.g. "Cl" before "C").
export const ELEMENTS = {
  H: "hydrogen", He: "helium", Li: "lithium", Be: "beryllium", B: "boron",
  C: "carbon", N: "nitrogen", O: "oxygen", F: "fluorine", Ne: "neon",
  Na: "sodium", Mg: "magnesium", Al: "aluminium", Si: "silicon", P: "phosphorus",
  S: "sulfur", Cl: "chlorine", Ar: "argon", K: "potassium", Ca: "calcium",
  Sc: "scandium", Ti: "titanium", V: "vanadium", Cr: "chromium", Mn: "manganese",
  Fe: "iron", Co: "cobalt", Ni: "nickel", Cu: "copper", Zn: "zinc",
  Ga: "gallium", Ge: "germanium", As: "arsenic", Se: "selenium", Br: "bromine",
  Kr: "krypton", Rb: "rubidium", Sr: "strontium", Y: "yttrium", Zr: "zirconium",
  Nb: "niobium", Mo: "molybdenum", Tc: "technetium", Ru: "ruthenium", Rh: "rhodium",
  Pd: "palladium", Ag: "silver", Cd: "cadmium", In: "indium", Sn: "tin",
  Sb: "antimony", Te: "tellurium", I: "iodine", Xe: "xenon", Cs: "caesium",
  Ba: "barium", La: "lanthanum", Ce: "cerium", Pr: "praseodymium", Nd: "neodymium",
  Pm: "promethium", Sm: "samarium", Eu: "europium", Gd: "gadolinium", Tb: "terbium",
  Dy: "dysprosium", Ho: "holmium", Er: "erbium", Tm: "thulium", Yb: "ytterbium",
  Lu: "lutetium", Hf: "hafnium", Ta: "tantalum", W: "tungsten", Re: "rhenium",
  Os: "osmium", Ir: "iridium", Pt: "platinum", Au: "gold", Hg: "mercury",
  Tl: "thallium", Pb: "lead", Bi: "bismuth", Po: "polonium", At: "astatine",
  Rn: "radon", Fr: "francium", Ra: "radium", Ac: "actinium", Th: "thorium",
  Pa: "protactinium", U: "uranium", Np: "neptunium", Pu: "plutonium", Am: "americium",
  Cm: "curium", Bk: "berkelium", Cf: "californium", Es: "einsteinium", Fm: "fermium",
};

// Element symbols longest-first, for greedy matching during formula parsing.
export const ELEMENT_SYMBOLS_BY_LENGTH = Object.keys(ELEMENTS).sort(
  (a, b) => b.length - a.length,
);

// Common named compounds: when a whole formula matches, we can offer the
// natural-language name as an alternative spoken form.
export const COMPOUND_NAMES = {
  H2O: "water",
  CO2: "carbon dioxide",
  CO: "carbon monoxide",
  NaCl: "sodium chloride",
  NaOH: "sodium hydroxide",
  HCl: "hydrochloric acid",
  H2SO4: "sulfuric acid",
  HNO3: "nitric acid",
  NH3: "ammonia",
  CH4: "methane",
  C6H12O6: "glucose",
  CaCO3: "calcium carbonate",
  C2H5OH: "ethanol",
  O2: "oxygen gas",
  N2: "nitrogen gas",
  H2: "hydrogen gas",
};

// Units. `spoken` is singular-ish; readers handle pluralization poorly so we
// keep it simple and unambiguous. `risk` flags how badly default TTS mangles it.
export const UNITS = {
  // volume / amount
  mL: { spoken: "milliliters", risk: "high" },
  L: { spoken: "liters", risk: "low" },
  "µL": { spoken: "microliters", risk: "high" },
  "μL": { spoken: "microliters", risk: "high" },
  mol: { spoken: "moles", risk: "medium" },
  mmol: { spoken: "millimoles", risk: "high" },
  // mass
  g: { spoken: "grams", risk: "low" },
  mg: { spoken: "milligrams", risk: "medium" },
  kg: { spoken: "kilograms", risk: "low" },
  "µg": { spoken: "micrograms", risk: "high" },
  "μg": { spoken: "micrograms", risk: "high" },
  ng: { spoken: "nanograms", risk: "high" },
  Da: { spoken: "daltons", risk: "high" },
  kDa: { spoken: "kilodaltons", risk: "high" },
  // concentration
  M: { spoken: "molar", risk: "high" },
  mM: { spoken: "millimolar", risk: "high" },
  "µM": { spoken: "micromolar", risk: "high" },
  "μM": { spoken: "micromolar", risk: "high" },
  nM: { spoken: "nanomolar", risk: "high" },
  N: { spoken: "normal", risk: "high" },
  ppm: { spoken: "parts per million", risk: "high" },
  ppb: { spoken: "parts per billion", risk: "high" },
  // energy / temperature / pressure
  J: { spoken: "joules", risk: "medium" },
  kJ: { spoken: "kilojoules", risk: "medium" },
  cal: { spoken: "calories", risk: "low" },
  kcal: { spoken: "kilocalories", risk: "medium" },
  K: { spoken: "kelvin", risk: "high" },
  "°C": { spoken: "degrees Celsius", risk: "high" },
  "°F": { spoken: "degrees Fahrenheit", risk: "high" },
  Pa: { spoken: "pascals", risk: "medium" },
  kPa: { spoken: "kilopascals", risk: "medium" },
  atm: { spoken: "atmospheres", risk: "medium" },
  mmHg: { spoken: "millimeters of mercury", risk: "high" },
  bar: { spoken: "bar", risk: "low" },
  // length (chem-relevant)
  nm: { spoken: "nanometers", risk: "high" },
  pm: { spoken: "picometers", risk: "high" },
  "Å": { spoken: "angstroms", risk: "high" },
  // misc
  Hz: { spoken: "hertz", risk: "medium" },
  s: { spoken: "seconds", risk: "low" },
  min: { spoken: "minutes", risk: "low" },
  h: { spoken: "hours", risk: "low" },
};

/** Course NVDA convention — overrides generic UNITS.spoken when dictionary rows are missing. */
export const COURSE_UNIT_SPOKEN = {
  J: "jools",
  kJ: "killuh jools",
};

export function unitSpoken(unit) {
  return COURSE_UNIT_SPOKEN[unit] ?? UNITS[unit]?.spoken ?? unit;
}

// Compound (per / multiplied) units expressed with a slash or middot.
// Keyed by a normalized form; detection handles the raw variants.
export const COMPOUND_UNITS = {
  "mol/L": "moles per liter",
  "g/mol": "grams per mole",
  "kJ/mol": "kilojoules per mole",
  "J/mol": "joules per mole",
  "mg/mL": "milligrams per milliliter",
  "µg/mL": "micrograms per milliliter",
  "μg/mL": "micrograms per milliliter",
  "g/L": "grams per liter",
  "mol/dm3": "moles per cubic decimeter",
  "m/s": "meters per second",
  // Thermochemistry (CHEM 113 conventions)
  "J/g\u00b0C": "joules per gram degree Celsius",
  "J/(g\u00b0C)": "joules per gram degree Celsius",
  "J/g\u00b7\u00b0C": "joules per gram degree Celsius",
  "J/\u00b0C": "joules per degree Celsius",
  "kJ/\u00b0C": "kilojoules per degree Celsius",
  "J/gK": "joules per gram kelvin",
  "J/(g\u00b7K)": "joules per gram kelvin",
  "J/gC": "joules per gram degree Celsius",
  "cal/g\u00b0C": "calories per gram degree Celsius",
};

// Greek letters and operator/relation symbols common in chemistry.
export const SYMBOLS = {
  "Δ": { spoken: "delta", note: "Often means 'change in' or, over a reaction arrow, 'heat'.", risk: "high" },
  "λ": { spoken: "lambda", risk: "high" },
  "µ": { spoken: "micro", risk: "high" },
  "μ": { spoken: "micro", risk: "high" },
  "α": { spoken: "alpha", risk: "medium" },
  "β": { spoken: "beta", risk: "medium" },
  "γ": { spoken: "gamma", risk: "medium" },
  "π": { spoken: "pi", risk: "medium" },
  "Ω": { spoken: "ohms", risk: "high" },
  "→": { spoken: "yields", note: "Reaction arrow.", risk: "high" },
  "⟶": { spoken: "yields", risk: "high" },
  "⇌": { spoken: "is in equilibrium with", risk: "high" },
  "⇄": { spoken: "is in equilibrium with", risk: "high" },
  "↑": { spoken: "gas evolved", note: "Gas product.", risk: "high" },
  "↓": { spoken: "precipitate", note: "Precipitate forms.", risk: "high" },
  "×": { spoken: "times", risk: "medium" },
  "·": { spoken: "dot", note: "In hydrates, read as 'with' (e.g. CuSO4·5H2O).", risk: "high" },
  "≤": { spoken: "less than or equal to", risk: "high" },
  "≥": { spoken: "greater than or equal to", risk: "high" },
  "±": { spoken: "plus or minus", risk: "high" },
  "≈": { spoken: "approximately", risk: "high" },
  "∆": { spoken: "delta", risk: "high" },
  "‰": { spoken: "per mille", risk: "high" },
  "°": { spoken: "degrees", risk: "high" },
};

// Plain-text bond notation: O=O, N=O, H-H, N≡N (not equations like q=mcΔT).
export const BOND_NOTATION = /^[A-Za-z][=\-–≡][A-Za-z]$/;
export const BOND_NOTATION_MATCHER = /[A-Za-z][=\-–≡][A-Za-z]/g;

// State-of-matter and phase annotations.
export const STATES = {
  "(aq)": "aqueous",
  "(s)": "solid",
  "(l)": "liquid",
  "(g)": "gas",
};

// Unicode sub/superscript digit maps (for normalizing H₂O -> H2O etc).
export const SUBSCRIPTS = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "₊": "+", "₋": "-",
};

export const SUPERSCRIPTS = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-",
};

export function normalizeSubscripts(text) {
  return text.replace(/[₀-₉₊₋]/g, (c) => SUBSCRIPTS[c] ?? c);
}

export function normalizeSuperscripts(text) {
  return text.replace(/[⁰-⁹⁺⁻]/g, (c) => SUPERSCRIPTS[c] ?? c);
}

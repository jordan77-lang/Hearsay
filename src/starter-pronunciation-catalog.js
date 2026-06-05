// Starter pronunciation catalog for new classes (Dictionary editor).

/** @typedef {{ id: string, text: string, substitution: string, ignore_case?: string, note?: string }} StarterRow */
/** @typedef {{ id: string, label: string, rows: StarterRow[] }} StarterGroup */
/** @typedef {{ id: string, label: string, rows?: StarterRow[], groups?: StarterGroup[] }} StarterCategory */

/** @param {string} id @param {string} text @param {string} substitution @param {string} [note] @param {string} [ignore_case] @param {number} [rule_type] NVDA type: 0=anywhere, 1=regex, 2=whole word */
function row(id, text, substitution, note = "", ignore_case = "Yes", rule_type = undefined) {
  const entry = { id, text, substitution, ignore_case, note };
  if (rule_type != null) entry.rule_type = rule_type;
  return entry;
}

/** @type {StarterRow[]} */
const PUNCTUATION_ROWS = [
  row("punct-open-paren", "(", "open parenthesis", "parenthesis", "No"),
  row("punct-close-paren", ")", "close parenthesis", "parenthesis", "No"),
  row("punct-open-bracket", "[", "open bracket", "bracket", "No"),
  row("punct-close-bracket", "]", "close bracket", "bracket", "No"),
  row("punct-open-brace", "{", "open brace", "brace", "No"),
  row("punct-close-brace", "}", "close brace", "brace", "No"),
  row("punct-comma", ",", "comma", "punctuation", "No"),
  row("punct-period", ".", "period", "punctuation", "No"),
  row("punct-semicolon", ";", "semicolon", "punctuation", "No"),
  row("punct-colon", ":", "colon", "punctuation", "No"),
  row("punct-question", "?", "question mark", "punctuation", "No"),
  row("punct-exclaim", "!", "exclamation mark", "punctuation", "No"),
  row("punct-plus", "+", "plus", "operator", "No"),
  row("punct-minus", "-", "minus", "operator", "No"),
  row("punct-unicode-minus", "−", "minus", "operator", "No"),
  row("punct-times", "×", "times", "operator", "No"),
  row("punct-times-cross", "✕", "times", "operator", "No"),
  row("punct-divide", "÷", "divided by", "operator", "No"),
  row("punct-equals", "=", "equals", "operator", "No"),
  row("punct-not-equals", "≠", "not equal to", "operator", "No"),
  row("punct-approx", "≈", "approximately", "operator", "No"),
  row("punct-leq", "≤", "less than or equal to", "operator", "No"),
  row("punct-geq", "≥", "greater than or equal to", "operator", "No"),
  row("punct-pm", "±", "plus or minus", "operator", "No"),
  row("punct-slash", "/", "slash", "punctuation", "No"),
  row("punct-percent", "%", "percent", "punctuation", "No", 0),
];

/** Metric / SI — multi-character units only (no bare m, t, J, … — they false-match in prose and ΔT). */
/** @type {StarterRow[]} */
const METRIC_ROWS = [
  row("metric-km", "km", "kilometers", "length"),
  row("metric-cm", "cm", "centimeters", "length"),
  row("metric-mm", "mm", "millimeters", "length"),
  row("metric-um", "μm", "micrometers", "length"),
  row("metric-um-alt", "µm", "micrometers", "length"),
  row("metric-nm", "nm", "nanometers", "length"),
  row("metric-pm", "pm", "picometers", "length"),
  row("metric-angstrom", "Å", "angstroms", "length"),
  row("metric-m2", "m²", "square meters", "area"),
  row("metric-cm2", "cm²", "square centimeters", "area"),
  row("metric-mm2", "mm²", "square millimeters", "area"),
  row("metric-L", "L", "liters", "volume", "No", 2),
  row("metric-mL", "mL", "milliliters", "volume"),
  row("metric-uL", "μL", "microliters", "volume"),
  row("metric-uL-alt", "µL", "microliters", "volume"),
  row("metric-dL", "dL", "deciliters", "volume"),
  row("metric-cL", "cL", "centiliters", "volume"),
  row("metric-g", "g", "grams", "mass", "No", 2),
  row("metric-mg", "mg", "milligrams", "mass"),
  row("metric-kg", "kg", "kilograms", "mass"),
  row("metric-ug", "μg", "micrograms", "mass"),
  row("metric-ug-alt", "µg", "micrograms", "mass"),
  row("metric-ng", "ng", "nanograms", "mass"),
  row("metric-pg", "pg", "picograms", "mass"),
  row("metric-mol", "mol", "moles", "amount"),
  row("metric-mmol", "mmol", "millimoles", "amount"),
  row("metric-umol", "μmol", "micromoles", "amount"),
  row("metric-nmol", "nmol", "nanomoles", "amount"),
  row("metric-mM", "mM", "millimolar", "concentration"),
  row("metric-uM", "μM", "micromolar", "concentration"),
  row("metric-nM", "nM", "nanomolar", "concentration"),
  row("metric-pM", "pM", "picomolar", "concentration"),
  row("metric-kJ", "kJ", "killuh jools", "energy"),
  row("metric-MJ", "MJ", "megajoules", "energy"),
  row("metric-mJ", "mJ", "millijoules", "energy"),
  row("metric-cal", "cal", "calories", "energy"),
  row("metric-kcal", "kcal", "kilocalories", "energy"),
  row("metric-kW", "kW", "kilowatts", "power"),
  row("metric-MW", "MW", "megawatts", "power"),
  row("metric-mW", "mW", "milliwatts", "power"),
  row("metric-kN", "kN", "kilonewtons", "force"),
  row("metric-kPa", "kPa", "kilopascals", "pressure"),
  row("metric-MPa", "MPa", "megapascals", "pressure"),
  row("metric-hPa", "hPa", "hectopascals", "pressure"),
  row("metric-bar", "bar", "bar", "pressure"),
  row("metric-atm", "atm", "atmospheres", "pressure"),
  row("metric-mmHg", "mmHg", "millimeters of mercury", "pressure"),
  row("metric-C", "°C", "degrees Celsius", "temperature"),
  row("metric-Hz", "Hz", "hertz", "frequency"),
  row("metric-kHz", "kHz", "kilohertz", "frequency"),
  row("metric-MHz", "MHz", "megahertz", "frequency"),
  row("metric-GHz", "GHz", "gigahertz", "frequency"),
  row("metric-min", "min", "minutes", "time"),
  row("metric-mV", "mV", "millivolts", "electric"),
  row("metric-kV", "kV", "kilovolts", "electric"),
  row("metric-mA", "mA", "milliamps", "electric"),
  row("metric-ohm", "Ω", "ohms", "electric"),
  row("metric-ppm", "ppm", "parts per million", "concentration"),
  row("metric-ppb", "ppb", "parts per billion", "concentration"),
  row("metric-Da", "Da", "daltons", "mass (bio)"),
  row("metric-kDa", "kDa", "kilodaltons", "mass (bio)"),
];

/** @type {StarterRow[]} */
const IMPERIAL_ROWS = [
  row("imp-ft", "ft", "feet", "length"),
  row("imp-ft-dot", "ft.", "feet", "length"),
  row("imp-yd", "yd", "yards", "length"),
  row("imp-mi", "mi", "miles", "length"),
  row("imp-oz", "oz", "ounces", "mass"),
  row("imp-lb", "lb", "pounds", "mass"),
  row("imp-lbs", "lbs", "pounds", "mass"),
  row("imp-ton", "ton", "tons", "mass"),
  row("imp-fl-oz", "fl oz", "fluid ounces", "volume"),
  row("imp-tsp", "tsp", "teaspoons", "volume"),
  row("imp-tbsp", "tbsp", "tablespoons", "volume"),
  row("imp-cup", "cup", "cups", "volume"),
  row("imp-pt", "pt", "pints", "volume"),
  row("imp-qt", "qt", "quarts", "volume"),
  row("imp-gal", "gal", "gallons", "volume"),
  row("imp-F", "°F", "degrees Fahrenheit", "temperature"),
  row("imp-psi", "psi", "pounds per square inch", "pressure"),
  row("imp-psig", "psig", "pounds per square inch gauge", "pressure"),
  row("imp-inHg", "inHg", "inches of mercury", "pressure"),
  row("imp-mph", "mph", "miles per hour", "speed"),
];

/** @type {StarterRow[]} */
const SCIENCE_CHEM_ROWS = [
  row("chem-delta", "Δ", "delta", "symbol"),
  row("chem-deltaT", "ΔT", "delta T", "variable"),
  row("chem-deltaH", "ΔH", "delta H", "enthalpy"),
  row("chem-arrow", "→", "yields", "reaction"),
  row("chem-equil", "⇌", "is in equilibrium with", "reaction"),
  row("chem-dot", "·", "dot", "hydrate"),
  row("chem-aq", "(aq)", "aqueous", "state"),
  row("chem-s", "(s)", "solid", "state"),
  row("chem-l", "(l)", "liquid", "state"),
  row("chem-g", "(g)", "gas", "state"),
  row("chem-di-water", "DI water", "D I water", "lab"),
  row("chem-diwater", "DIwater", "D I water", "lab"),
  row("chem-h2o", "H2O", "H two O", "formula"),
  row("chem-j-per-gC", "J/g°C", "jools per gram degree Celsius", "unit"),
  row("chem-kj-per-mol", "kJ/mol", "killuh jools per mole", "unit"),
  row("chem-mol-per-L", "mol/L", "moles per liter", "unit"),
  row("chem-g-per-mol", "g/mol", "grams per mole", "unit"),
  row("chem-mg-per-mL", "mg/mL", "milligrams per milliliter", "unit"),
  row("chem-ug-per-mL", "μg/mL", "micrograms per milliliter", "unit"),
  row("chem-j-per-C", "J/°C", "jools per degree Celsius", "unit"),
  row("chem-ph", "pH", "P H", "acidity"),
  row("chem-nacl", "NaCl", "sodium chloride", "formula"),
  row("chem-hcl", "HCl", "H C L", "formula"),
  row("chem-naoh", "NaOH", "N A O H", "formula"),
  row("chem-co2", "CO2", "C O 2", "formula"),
  row("chem-nh3", "NH3", "N H 3", "formula"),
  row("chem-gas-up", "↑", "gas evolved", "state"),
  row("chem-ppt-down", "↓", "precipitate", "state"),
];

/** @type {StarterRow[]} */
const SCIENCE_BIO_ROWS = [
  row("bio-dna", "DNA", "D N A", "biology"),
  row("bio-rna", "RNA", "R N A", "biology"),
  row("bio-mrna", "mRNA", "messenger R N A", "biology"),
  row("bio-atp", "ATP", "A T P", "biology"),
  row("bio-pcr", "PCR", "P C R", "biology"),
  row("bio-bp", "bp", "base pairs", "genetics"),
  row("bio-kb", "kb", "kilobase pairs", "genetics"),
  row("bio-ug-per-mL", "µg/mL", "micrograms per milliliter", "concentration"),
  row("bio-cfu", "CFU", "colony forming units", "microbiology"),
  row("bio-od", "OD", "O D", "optical density"),
];

/** @type {StarterRow[]} */
const SCIENCE_PHYSICS_ROWS = [
  row("phys-pi", "π", "pi", "symbol"),
  row("phys-alpha", "α", "alpha", "symbol"),
  row("phys-beta", "β", "beta", "symbol"),
  row("phys-gamma", "γ", "gamma", "symbol"),
  row("phys-lambda", "λ", "lambda", "symbol"),
  row("phys-ms", "m/s", "meters per second", "unit"),
  row("phys-ms2", "m/s²", "meters per second squared", "unit"),
  row("phys-ms2-ascii", "m/s^2", "meters per second squared", "unit"),
  row("phys-nm-torque", "N·m", "newton meters", "unit"),
  row("phys-vsq", "v²", "v squared", "math"),
];

/** @type {StarterRow[]} */
const SCIENCE_GENERAL_ROWS = [
  row("gen-eg", "e.g.", "for example", "abbreviation"),
  row("gen-ie", "i.e.", "that is", "abbreviation"),
  row("gen-etc", "etc.", "etcetera", "abbreviation"),
  row("gen-vs", "vs.", "versus", "abbreviation"),
  row("gen-fig", "Fig.", "figure", "abbreviation"),
  row("gen-eq", "Eq.", "equation", "abbreviation"),
  row("gen-ref", "Ref.", "reference", "abbreviation"),
  row("gen-wrt", "w.r.t.", "with respect to", "abbreviation"),
];

/** @type {StarterCategory[]} */
export const STARTER_CATEGORIES = [
  { id: "punctuation", label: "Punctuation & operators", rows: PUNCTUATION_ROWS },
  { id: "metric", label: "Metric (SI) units", rows: METRIC_ROWS },
  { id: "imperial", label: "Imperial units", rows: IMPERIAL_ROWS },
  {
    id: "science",
    label: "Science",
    groups: [
      { id: "science-chem", label: "Chemistry", rows: SCIENCE_CHEM_ROWS },
      { id: "science-bio", label: "Biology", rows: SCIENCE_BIO_ROWS },
      { id: "science-physics", label: "Physics & math", rows: SCIENCE_PHYSICS_ROWS },
      { id: "science-general", label: "General", rows: SCIENCE_GENERAL_ROWS },
    ],
  },
];

/** @type {{ id: string, label: string, hint?: string, rowIds: string[] | "all" }}[] */
export const STARTER_PRESETS = [
  {
    id: "essentials",
    label: "Essentials",
    hint: "Small set for day one",
    rowIds: [
      "metric-mL",
      "metric-L",
      "metric-g",
      "metric-C",
      "chem-deltaT",
      "chem-di-water",
      "chem-diwater",
      "chem-j-per-gC",
      "chem-kj-per-mol",
      "punct-open-paren",
      "punct-close-paren",
    ],
  },
  { id: "all", label: "Entire catalog", hint: "Every starter below", rowIds: "all" },
  { id: "punctuation", label: "All punctuation", rowIds: "category:punctuation" },
  { id: "metric", label: "All metric units", rowIds: "category:metric" },
  { id: "imperial", label: "All imperial units", rowIds: "category:imperial" },
  { id: "science", label: "All science", rowIds: "category:science" },
  { id: "science-chem", label: "All chemistry", rowIds: "group:science-chem" },
  { id: "science-bio", label: "All biology", rowIds: "group:science-bio" },
  { id: "science-physics", label: "All physics & math", rowIds: "group:science-physics" },
  { id: "science-general", label: "All general science", rowIds: "group:science-general" },
  { id: "custom", label: "Pick individually", hint: "Use checkboxes below", rowIds: [] },
];

const _index = buildStarterIndex();

function buildStarterIndex() {
  /** @type {Map<string, StarterRow>} */
  const byId = new Map();
  /** @type {Map<string, string[]>} */
  const idsByCategory = new Map();
  /** @type {Map<string, string[]>} */
  const idsByGroup = new Map();

  for (const cat of STARTER_CATEGORIES) {
    const catIds = [];
    if (cat.rows) {
      for (const r of cat.rows) {
        byId.set(r.id, r);
        catIds.push(r.id);
      }
    }
    if (cat.groups) {
      for (const g of cat.groups) {
        const groupIds = [];
        for (const r of g.rows) {
          byId.set(r.id, r);
          catIds.push(r.id);
          groupIds.push(r.id);
        }
        idsByGroup.set(g.id, groupIds);
      }
    }
    idsByCategory.set(cat.id, [...new Set(catIds)]);
  }

  const allIds = [...byId.keys()];
  return { byId, idsByCategory, idsByGroup, allIds };
}

/** All starter rows keyed by id (deduped by id). */
export function getStarterRowById(id) {
  return _index.byId.get(id) ?? null;
}

/** Flat list of every starter row. */
export function getAllStarterRows() {
  return _index.allIds.map((id) => ({ ..._index.byId.get(id) }));
}

/** Resolve preset / category / group tokens to row ids. */
export function resolveStarterRowIds(spec) {
  if (spec === "all") return [..._index.allIds];
  if (typeof spec === "string" && spec.startsWith("category:")) {
    return [...(_index.idsByCategory.get(spec.slice(9)) ?? [])];
  }
  if (typeof spec === "string" && spec.startsWith("group:")) {
    return [...(_index.idsByGroup.get(spec.slice(6)) ?? [])];
  }
  if (Array.isArray(spec)) return spec.filter((id) => _index.byId.has(id));
  return [];
}

/** @param {string} presetId */
export function getStarterRowIdsForPreset(presetId) {
  const preset = STARTER_PRESETS.find((p) => p.id === presetId);
  if (!preset) return [];
  return resolveStarterRowIds(preset.rowIds);
}

/** @param {string[]} ids */
export function getStarterRowsByIds(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const r = _index.byId.get(id);
    if (!r) continue;
    seen.add(id);
    out.push({
      text: r.text,
      substitution: r.substitution,
      ignore_case: r.ignore_case ?? "Yes",
      note: r.note ?? "",
      app: "All Apps",
      ...(r.rule_type != null ? { rule_type: r.rule_type } : {}),
    });
  }
  return out;
}

/** Legacy flat export — essentials preset. */
export const STARTER_PRONUNCIATION_ROWS = getStarterRowsByIds(
  getStarterRowIdsForPreset("essentials"),
);

/** Row ids in a category or science subgroup. */
export function getStarterGroupRowIds(groupId) {
  if (_index.idsByGroup.has(groupId)) return [..._index.idsByGroup.get(groupId)];
  if (_index.idsByCategory.has(groupId)) return [..._index.idsByCategory.get(groupId)];
  return [];
}

export { _index as starterCatalogIndex };

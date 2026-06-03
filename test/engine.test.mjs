import { test } from "node:test";
import assert from "node:assert/strict";

import { parseFormula, formulaToSymbolSpeech, formulaToNameSpeech, formulaToMathML } from "../src/core/formula.js";
import { findTokens } from "../src/core/detect.js";
import { analyze, toSpokenText, toCanvasHtml, toDictionarySpeech, analyzeEquation, normalizeEquationInsert, canvasSpokenLinesFromText, canvasOutputHearLines } from "../src/core/transform.js";
import { lookup, applyDictionary, ruleCount, loadDictionary, loadClassDictionary, dictionarySource } from "../src/core/dictionary.js";
import { DICTIONARY_DIC } from "../src/core/dictionary-data.js";
import { dicToRows, rowsToDic } from "../src/supabase/dictionary-format.js";
import { normalizeNumberUnitSpacing } from "../src/core/math.js";
import { parseLatex } from "../src/core/latex.js";

test("parses common formulae", () => {
  assert.equal(parseFormula("H2O").canonical, "H2O");
  assert.equal(parseFormula("CO2").canonical, "CO2");
  assert.equal(parseFormula("C6H12O6").canonical, "C6H12O6");
  assert.equal(parseFormula("H2SO4").canonical, "H2SO4");
});

test("handles unicode subscripts", () => {
  assert.equal(parseFormula("H\u2082O").canonical, "H2O");
});

test("handles parentheses groups", () => {
  const p = parseFormula("Ca(OH)2");
  assert.ok(p);
  assert.equal(p.canonical, "Ca(OH)2");
});

test("handles charges", () => {
  const p = parseFormula("SO4^2-");
  assert.ok(p);
  assert.equal(p.charge.value, 2);
  assert.equal(p.charge.sign, "-");
});

test("handles hydrates", () => {
  const p = parseFormula("CuSO4\u00b75H2O");
  assert.ok(p);
  assert.ok(p.hydrate);
});

test("rejects ordinary English words", () => {
  for (const w of ["Hello", "Carbon", "Bin", "Nano", "as", "the", "and", "In", "He", "I"]) {
    assert.equal(parseFormula(w), null, `should reject "${w}"`);
  }
});

test("symbol speech reads letters and counts", () => {
  assert.equal(formulaToSymbolSpeech(parseFormula("H2O")), "H 2 O");
  assert.equal(formulaToSymbolSpeech(parseFormula("CO2")), "C O 2");
});

test("name speech uses known compound names", () => {
  assert.equal(formulaToNameSpeech(parseFormula("H2O")), "water");
  assert.equal(formulaToNameSpeech(parseFormula("NaCl")), "sodium chloride");
});

test("emits MathML with subscripts", () => {
  const ml = formulaToMathML(parseFormula("H2O"));
  assert.match(ml, /<msub><mi mathvariant="normal">H<\/mi><mn>2<\/mn><\/msub>/);
  assert.match(ml, /^<math/);
});

test("detects units after a number", () => {
  const found = findTokens("Add 5 mL of 0.1 M HCl at 25\u00b0C.");
  const raws = found.map((f) => f.raw);
  assert.ok(raws.includes("mL"));
  assert.ok(raws.includes("M"));
  assert.ok(raws.includes("\u00b0C"));
  assert.ok(raws.includes("HCl"));
});

test("detects compound units", () => {
  const found = findTokens("Concentration was 2 mol/L.");
  assert.ok(found.some((f) => f.type === "compound-unit" && f.raw === "mol/L"));
});

test("detects reaction symbols", () => {
  const found = findTokens("2H2 + O2 \u2192 2H2O");
  assert.ok(found.some((f) => f.type === "symbol" && f.raw === "\u2192"));
  assert.ok(found.some((f) => f.type === "formula"));
});

test("detects a formula glued to a trailing state annotation", () => {
  const found = findTokens("Add Ca(OH)2(aq) slowly.");
  assert.ok(found.some((f) => f.type === "formula" && f.raw === "Ca(OH)2"), "Ca(OH)2 detected");
  assert.ok(found.some((f) => f.type === "state" && f.raw === "(aq)"), "(aq) detected");
});

test("does not double-claim overlapping ranges", () => {
  const found = findTokens("25\u00b0C");
  // °C is a unit; ° is also a symbol. Unit should win, ° not separately claimed.
  const degreeSymbols = found.filter((f) => f.raw === "\u00b0");
  assert.equal(degreeSymbols.length, 0);
});

test("analyze returns risk counts", () => {
  const { findings, counts, total } = analyze("Dissolve 5 mg in 2 mL to make H2O.", findTokens);
  assert.ok(total >= 3);
  assert.ok(counts.high + counts.medium + counts.low === total);
});

test("toSpokenText substitutes spoken forms", () => {
  const text = "Heat to 25\u00b0C.";
  const { findings } = analyze(text, findTokens);
  const spoken = toSpokenText(text, findings);
  assert.match(spoken, /degrees Celsius/);
});

test("detects thermochem compound unit J/g\u00b0C", () => {
  const found = findTokens("specific heat 4.18 J/g\u00b0C here");
  assert.ok(found.some((f) => f.type === "compound-unit" && f.raw === "J/g\u00b0C"));
});

test("detects scripted variables T1 and T2", () => {
  const { findings } = analyze("\u0394T = T\u2082 \u2212 T\u2081", findTokens);
  const vars = findings.filter((f) => f.type === "scripted-var");
  assert.equal(vars.length, 2);
  assert.match(vars[0].mathml, /<msub><mi>T<\/mi><mn>2<\/mn><\/msub>/);
  // Dictionary default overrides the generic "T sub 2" with the course "T of 2".
  assert.match(vars[0].primarySpoken, /T of 2/);
});

test("scripted superscript reads as squared", () => {
  const { findings } = analyze("area x\u00b2 grows", findTokens);
  const v = findings.find((f) => f.type === "scripted-var");
  assert.ok(v);
  assert.match(v.primarySpoken, /squared/);
  assert.match(v.mathml, /<msup>/);
});

test("normalizeNumberUnitSpacing inserts space before units", () => {
  assert.equal(normalizeNumberUnitSpacing("14J"), "14 J");
  assert.equal(normalizeNumberUnitSpacing("23g"), "23 g");
  assert.equal(normalizeNumberUnitSpacing("\\frac{14J}{23g}"), "\\frac{14 J}{23 g}");
});

test("toCanvasHtml spoken mode renders fractions as MathML with spaced units", () => {
  const text = "q = \\frac{14J}{23g}";
  const { findings } = analyze(text, findTokens);
  const { html } = toCanvasHtml(text, findings, { mode: "spoken" });
  assert.match(html, /<mfrac>/);
  assert.match(html, /<mn>14<\/mn><mspace width="0.25em"\/><mtext>\u00A0<\/mtext><mi mathvariant="normal">J<\/mi>/);
  assert.match(html, /<mn>23<\/mn><mspace width="0.25em"\/><mtext>\u00A0<\/mtext><mi mathvariant="normal">g<\/mi>/);
  assert.match(html, /14 jools divided by 23 grams/);
  assert.doesNotMatch(html, /\\frac/);
});

test("detects and renders LaTeX fraction", () => {
  const { findings } = analyze("q = \\frac{14J}{23g}", findTokens);
  const frac = findings.find((f) => f.type === "fraction");
  assert.ok(frac);
  assert.match(frac.mathml, /<mfrac>/);
  // Course dictionary supplies the phonetic "jools".
  assert.match(frac.primarySpoken, /14 jools divided by 23 grams/);
});

test("CuSO4 speaks as symbol letters not raw token", () => {
  const spoken = toDictionarySpeech("Dissolve CuSO4 in water.");
  assert.match(spoken, /C U S O 4/);
  assert.doesNotMatch(spoken, /CuSO4/);
  const { html } = toCanvasHtml("Dissolve CuSO4 in water.", [], { mode: "spoken" });
  assert.match(html, /C U S O 4/);
  assert.match(html, /<mi mathvariant="normal">Cu<\/mi>/);
});

test("CuSO4 hydrate is one formula not partial H2O dictionary match", () => {
  const spoken = toDictionarySpeech("Heat CuSO4·5H2O to 80°C.");
  assert.match(spoken, /C U S O 4 with 5 H 2 O/);
  assert.doesNotMatch(spoken, /H two O/);
});

test("toCanvasHtml mathml mode: live MathML for math, hidden text for units", () => {
  const text = "Heat 10 mL where q = \\frac{14J}{23g}.";
  const { findings } = analyze(text, findTokens);
  const { html, mathCount, textCount } = toCanvasHtml(text, findings, { mode: "mathml" });
  assert.ok(mathCount >= 1, "math rendered as MathML");
  assert.ok(textCount >= 1, "units wrapped as hidden text");
  assert.match(html, /<mfrac>/, "fraction rendered as MathML");
  assert.doesNotMatch(html, /<math aria-hidden/, "math is live (navigable), not hidden");
  assert.match(html, /<span style="position:absolute[^"]*">milliliters<\/span>/);
});

test("toCanvasHtml spoken mode: one spoken stream per line for Canvas/NVDA", () => {
  const text = "Add 10 mL of H2O.";
  const { findings } = analyze(text, findTokens);
  const { html } = toCanvasHtml(text, findings, { mode: "spoken" });
  assert.match(html, /milliliters/);
  assert.match(html, /H two O/);
  assert.match(html, /<mi mathvariant="normal">H<\/mi>/);
  assert.equal((html.match(/aria-hidden="true"/g) || []).length, 1);
});

test("parenthetical J/g°C reads with units and parentheses", () => {
  const text = "The specific heat of water is 4.18 (J/g°C).";
  const spoken = toDictionarySpeech(text);
  assert.match(spoken, /open parenthesis jools per gram degree Celsius close parenthesis/);
  const { html } = toCanvasHtml(text, [], { mode: "spoken" });
  assert.match(html, /open parenthesis jools per gram degree Celsius close parenthesis/);
  assert.match(html, /aria-hidden="true">The specific heat of water is 4.18 \(J\/g°C\)/);
});

test("curriculum effective heat capacity equation composes from atomic terms", () => {
  const text =
    "Effective heat capacity (J/°C) = (mass of H₂O × cH₂O) + (mass of excess H₂ × cH₂)";
  const spoken = toDictionarySpeech(text);
  assert.match(spoken, /c of H two O/);
  assert.match(spoken, /open parenthesis jools per degree Celsius close parenthesis/);
  assert.doesNotMatch(spoken, /H twoO/);
  const { html } = toCanvasHtml(text, [], { mode: "spoken" });
  assert.match(html, /open parenthesis jools per degree Celsius close parenthesis/);
  assert.match(html, /c of H two O/);
  assert.match(html, /aria-hidden="true">Effective heat capacity \(J\/°C\)/);
  assert.equal((html.match(/aria-hidden="true"/g) || []).length, 1);
});

test("q = mcΔT reads as a full equation, not a glued delta T", () => {
  const spoken = toDictionarySpeech("q = mcΔT");
  assert.equal(spoken, "q equals m c delta T");
  assert.doesNotMatch(spoken, /mcdelta/);
});

test("q = mcΔT in a sentence uses the full equation reading", () => {
  const spoken = toDictionarySpeech("Use q = mcΔT to find the heat.");
  assert.equal(spoken, "Use q equals m c delta T to find the heat.");
});

test("parentheses around described variables are spoken", () => {
  const text =
    "calculate the heat absorbed by the calorimeter (q_{calorimeter}) and (C_{calorimeter} = 40 J/°C) and (ΔT):";
  const spoken = toDictionarySpeech(text);
  assert.match(spoken, /open parenthesis q of calorimeter close parenthesis/);
  assert.match(spoken, /open parenthesis capital C of calorimeter = 40 jools per degree Celsius close parenthesis/);
  assert.match(spoken, /open parenthesis delta T close parenthesis/);
});

test("solution subscript variables read as m sub solution not m of solution", () => {
  const text =
    "the mass of the solution (m_{solution} = 60 g) and (c_{solution} = 4.18 J/g°C)";
  const spoken = toDictionarySpeech(text);
  assert.match(spoken, /open parenthesis m sub solution = 60 grams close parenthesis/);
  assert.match(spoken, /open parenthesis c sub solution = 4.18 jools per gram degree Celsius close parenthesis/);
  assert.doesNotMatch(spoken, /m of solution/);
});

test("parentheses are spoken even when dictionary is loaded without paren rows", () => {
  const withoutParens = DICTIONARY_DIC.split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#") && !/^\(\t/.test(line) && !/^\)\t/.test(line))
    .join("\n");
  loadDictionary(withoutParens, "test-no-parens");
  assert.ok(ruleCount() > 0);
  const spoken = toDictionarySpeech("(qsolution)");
  assert.match(spoken, /open parenthesis q of solution close parenthesis/);
  loadDictionary(DICTIONARY_DIC, "bundled");
});

test("60 g reads as grams when dictionary omits unit rows", () => {
  const withoutUnits = DICTIONARY_DIC.split(/\r?\n/)
    .filter((line) => {
      if (!line.trim() || line.startsWith("#")) return true;
      const pattern = line.split("\t")[0];
      return pattern !== "g" && !/\\g\\b/.test(pattern);
    })
    .join("\n");
  loadDictionary(withoutUnits, "test-no-units");
  const spoken = toDictionarySpeech("(m_{solution} = 60 g)");
  assert.match(spoken, /60 grams/);
  assert.doesNotMatch(spoken, /60 g close/);
  loadDictionary(DICTIONARY_DIC, "bundled");
});

test("C_{calorimeter} reads as capital C of calorimeter even without remote C rules", () => {
  const withoutC = DICTIONARY_DIC.split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#") && !/^Ccalorimeter\t/.test(line) && !/^C_calorimeter\t/.test(line))
    .join("\n");
  loadDictionary(withoutC, "test-no-c-cal");
  const text = "q_{calorimeter} = C_{calorimeter} × ΔT";
  const spoken = toDictionarySpeech(text);
  assert.match(spoken, /capital C of calorimeter/i);
  assert.doesNotMatch(spoken, /C sub calorimeter/i);
  loadDictionary(DICTIONARY_DIC, "bundled");
});

test("spreadsheet cell B5 is not spoken as a subscript variable", () => {
  loadDictionary(DICTIONARY_DIC, "bundled");
  const { findings } = analyze("Place sample in cell B5", findTokens);
  assert.equal(findings.filter((f) => f.type === "described-var" || f.type === "scripted-var").length, 0);
  assert.equal(findings.filter((f) => f.type === "formula" && f.raw === "B5").length, 0);
  assert.doesNotMatch(toDictionarySpeech("cell B5"), /sub 5/i);
});

test("cell B5 in Canvas output stays plain text without MathML subscript", () => {
  loadDictionary(DICTIONARY_DIC, "bundled");
  const line = "Record the value of q_{calorimeter} in cell B5 of your Google sheet.";
  const { findings, normalizedText } = analyze(line, findTokens);
  assert.equal(findings.some((f) => f.type === "formula" && f.raw === "B5"), false);
  const { html } = toCanvasHtml(normalizedText, findings, { mode: "spoken" });
  assert.doesNotMatch(html, /cell B<\/.*msub|cell.*<msub><mi[^>]*>B/i);
  assert.match(html, /cell B5|cell B 5/i);
});

test("DI water speaks as D I water in common paste forms", () => {
  loadDictionary(DICTIONARY_DIC, "bundled");
  for (const text of ["DI water", "DIwater", "DI-water", "Add 50 mL of DI water."]) {
    const spoken = toDictionarySpeech(text);
    assert.match(spoken, /D I water/i, `failed for: ${text} => ${spoken}`);
  }
});

test("unicode and ascii minus speak as minus", () => {
  loadDictionary(DICTIONARY_DIC, "bundled");
  assert.match(toDictionarySpeech("T₂ − T₁"), /minus/i);
  assert.match(toDictionarySpeech("100 - 50"), /minus/i);
  assert.match(toDictionarySpeech("ΔT = T₂ − T₁"), /minus/i);
});

test("canvasSpokenLinesFromText returns one entry per line", () => {
  const lines = canvasSpokenLinesFromText("Line one\nLine two");
  assert.equal(lines.length, 2);
});

test("canvasOutputHearLines returns per-line preview for spoken and mathml modes", () => {
  const text = "Heat 10 mL\nRecord T₂";
  const { findings } = analyze(text, findTokens);
  const spokenLines = canvasOutputHearLines(text, findings, { mode: "spoken" });
  const mathmlLines = canvasOutputHearLines(text, findings, { mode: "mathml" });
  assert.equal(spokenLines.length, 2);
  assert.equal(mathmlLines.length, 2);
  assert.match(spokenLines[0], /milliliters/i);
  assert.match(mathmlLines[1], /T of 2/i);
});

test("multi-line Canvas output wraps each line in a paragraph", () => {
  const text =
    "Effective heat capacity (J/°C) = 72.0 J/°C + 28.6 J/°C\n" +
    "Effective heat capacity (J/°C) = 100.6 J/°C";
  const { html } = toCanvasHtml(text, [], { mode: "spoken" });
  assert.match(html, /<p>.*jools per degree Celsius/s);
  assert.equal((html.match(/<p>/g) || []).length, 2);
});

test("dictionary loads many rules", () => {
  assert.ok(ruleCount() > 100, "expected the course dictionary to load");
});

test("dictionary lookup matches course conventions", () => {
  assert.equal(lookup("J"), "jools");
  assert.equal(lookup("kJ/mol"), "killuh jools per mol");
  assert.equal(lookup("HCl"), "H C L");
  assert.equal(lookup("T\u2082"), "T of 2");
  assert.equal(lookup("mL"), "milliliters");
});

test("applyDictionary rewrites a phrase like NVDA would", () => {
  const out = applyDictionary("Heat 10 mL of 3 M HCl");
  assert.match(out, /milliliters/);
  assert.match(out, /moh lurr/);
  assert.match(out, /H C L/);
});

test("HearSay findings default to the dictionary pronunciation", () => {
  const { findings } = analyze("Add HCl now.", findTokens);
  const hcl = findings.find((f) => f.raw === "HCl");
  assert.equal(hcl.primarySpoken, "H C L");
});

test("toDictionarySpeech simulates the add-on output", () => {
  const spoken = toDictionarySpeech("record T\u2082 and \u0394T at 80\u00b0C");
  assert.match(spoken, /T of 2/);
  assert.match(spoken, /delta T/);
  assert.match(spoken, /degrees Celsius/);
});

test("LaTeX parser builds MathML and spoken for a fraction", () => {
  const { mathml, spoken } = parseLatex("\\frac{14J}{23g}");
  assert.match(mathml, /<mfrac>/);
  assert.match(mathml, /<mspace width="0.25em"\/>/);
  assert.match(mathml, /<mtext>\u00A0<\/mtext>/);
  assert.match(spoken, /14 jools divided by 23 grams/);
});

test("LaTeX parser shows visible number-unit gap when spaces already in frac args", () => {
  const { mathml } = parseLatex("\\frac{14 J}{23 g}");
  assert.match(mathml, /<mn>14<\/mn><mspace width="0.25em"\/>/);
  assert.match(mathml, /<mn>23<\/mn><mspace width="0.25em"\/>/);
});

test("LaTeX parser speaks spaced fraction parts as jools and grams", () => {
  const { spoken } = parseLatex("\\frac{14 J}{23 g}");
  assert.match(spoken, /14 jools divided by 23 grams/);
});

test("LaTeX parser handles subscripts, superscripts, Greek", () => {
  assert.match(parseLatex("T_2").mathml, /<msub>/);
  assert.match(parseLatex("x^2").spoken, /x squared/);
  assert.match(parseLatex("\\Delta T").spoken, /delta/i);
});

test("LaTeX parser supports \\sqrt", () => {
  const { mathml, spoken } = parseLatex("\\sqrt{16}");
  assert.match(mathml, /<msqrt>/);
  assert.match(spoken, /square root of 16/);
});

test("analyzeEquation applies the dictionary to spoken output", () => {
  const r = analyzeEquation("\\frac{14J}{23g}");
  assert.match(r.mathml, /^<math/);
  assert.match(r.spoken, /14 jools divided by 23 grams/);
  assert.match(r.accessibleText, /aria-hidden="true"/);
  assert.match(r.accessibleText, /jools divided by/);
});

test("analyzeEquation preserves unicode subscripts for curriculum prose", () => {
  const text =
    "Effective heat capacity (J/°C) = (mass of H₂O × cH₂O) + (mass of excess H₂ × cH₂)";
  const r = analyzeEquation(text);
  assert.match(r.mathml, /<mtext>.*H₂O/s);
  assert.match(r.spoken, /c of H two O/);
  assert.match(r.spoken, /c of H two[^O]/);
});

test("normalizeEquationInsert prepares LaTeX for main textarea", () => {
  assert.equal(normalizeEquationInsert("T₂ = T₁ + ΔT"), "T_2 = T_1 + \\Delta T");
});

test("inserted LaTeX equation reads in Canvas spoken mode", () => {
  const text = "Measure when T_2 = T_1 + \\Delta T.";
  const { findings } = analyze(text, findTokens);
  const eq = findings.find((f) => f.type === "latex-equation");
  assert.ok(eq, "expected latex-equation finding");
  assert.equal(eq.raw, "T_2 = T_1 + \\Delta T");
  const spoken = toDictionarySpeech(text);
  assert.match(spoken, /T of 2/);
  assert.match(spoken, /delta/i);
  const { html } = toCanvasHtml(text, findings, { mode: "spoken" });
  assert.match(html, /<math/);
  assert.match(html, /T of 2/);
  assert.match(html, /aria-hidden="true">Measure when <math/);
});

test("loadDictionary replaces in-memory rules", () => {
  const before = ruleCount();
  loadDictionary("ZZZTESTTOKEN\tspoken test word\t0\t2\n", "test");
  assert.equal(dictionarySource(), "test");
  assert.equal(lookup("ZZZTESTTOKEN"), "spoken test word");
  loadDictionary(DICTIONARY_DIC, "bundled");
  assert.equal(ruleCount(), before);
});

test("loadClassDictionary keeps bundled base when class has few rules", () => {
  const before = ruleCount();
  loadClassDictionary("ZZZTESTTOKEN\tspoken test word\t0\t2\n", "test-class");
  assert.ok(ruleCount() >= before, "class load should not drop bundled rules");
  assert.equal(lookup("ZZZTESTTOKEN"), "spoken test word");
  assert.ok(lookup("mL"), "bundled entries should still apply");
  loadDictionary(DICTIONARY_DIC, "bundled");
});

test("loadClassDictionary overrides bundled patterns", () => {
  loadClassDictionary("mL\tcustom milliliters\t0\t2\n", "test-class");
  assert.equal(lookup("mL"), "custom milliliters");
  loadDictionary(DICTIONARY_DIC, "bundled");
});

test("dic rows round-trip", () => {
  const raw = "J/g\tjools per gram\t0\t2\n°C\tdegrees C\t0\t0\n";
  const rows = dicToRows(raw, "chem113");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].pattern, "J/g");
  assert.equal(rows[1].case_sensitive, false);
  const back = rowsToDic(rows);
  assert.match(back, /^J\/g\tjools per gram\t0\t2/);
});

test("dictionary composition leaves English words like nozzle alone", () => {
  assert.match(toDictionarySpeech("Attach the nozzle firmly"), /nozzle/i);
  assert.doesNotMatch(toDictionarySpeech("Attach the nozzle firmly"), /N Ozzle/);
  assert.match(toDictionarySpeech("notice the flow"), /notice/i);
});

test("dictionary composition still speaks chem tokens NO and mL", () => {
  assert.match(toDictionarySpeech("The NO gas"), /N O gas/);
  assert.match(toDictionarySpeech("10 mL"), /milliliters/);
  assert.match(toDictionarySpeech("2NO"), /2 N O/);
});

test("dictionary composition speaks double and single bonds", () => {
  assert.match(toDictionarySpeech("O=O"), /O double bond O/);
  assert.match(toDictionarySpeech("N=O"), /N double bond O/);
  assert.match(toDictionarySpeech("H-H"), /H single bond H/);
  assert.match(toDictionarySpeech("N≡N"), /N triple bond N/);
});

test("described variables render subscripts in Canvas output", () => {
  const text = "q_{calorimeter} = C_{calorimeter} × ΔT";
  const { findings } = analyze(text, findTokens);
  const q = findings.find((f) => f.raw === "q_{calorimeter}");
  const c = findings.find((f) => f.raw === "C_{calorimeter}");
  assert.equal(q?.type, "described-var");
  assert.equal(c?.type, "described-var");
  assert.match(q?.mathml, /<msub>/);
  assert.match(q?.mathml, /calorimeter/);
  assert.match(q?.primarySpoken, /q of calorimeter/);
  const { html } = toCanvasHtml(text, findings, { mode: "spoken" });
  assert.match(html, /<msub>/);
});

test("plain English words like compare are not split into subscripts", () => {
  const { findings } = analyze("compare the values", findTokens);
  assert.equal(findings.filter((f) => f.type === "described-var").length, 0);
  assert.equal(toDictionarySpeech("compare"), "compare");
});

test("explicit subscript c_{dog} renders without affecting compare", () => {
  const { findings } = analyze("c_{dog}", findTokens);
  assert.equal(findings[0]?.type, "described-var");
  assert.match(findings[0]?.primarySpoken, /c sub dog/);
});

// Generates examples/heat-is-on.canvas.html: the "Heat Is On" paragraph in
// both Canvas output modes, ready to open in a browser, listen to, and copy
// the paste-ready HTML for the Canvas </> editor.
import { writeFile, mkdir } from "node:fs/promises";
import { findTokens } from "../src/core/detect.js";
import { analyze, toCanvasHtml } from "../src/core/transform.js";

const text =
  "The specific heat of water is 4.18 J/g\u00b0C. Heat 10 mL of 3 M HCl and record T\u2081 and T\u2082, " +
  "where \u0394T = T\u2082 \u2212 T\u2081. The effective heat capacity is 2.0 J/\u00b0C and q = \\frac{14J}{23g}. " +
  "Dissolve CuSO4\u00b75H2O, then compare 2H2 + O2 \u2192 2H2O at 80\u00b0C with \u0394H = \u2212286 kJ/mol.";

const { findings } = analyze(text, findTokens);
const spoken = toCanvasHtml(text, findings, { mode: "spoken" }).html;
const mathml = toCanvasHtml(text, findings, { mode: "mathml" }).html;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const page = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<title>Heat Is On - Canvas output</title>
<style>body{font-family:system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;line-height:1.7}
h2{margin-top:1.6rem}pre{background:#f4f4f4;border:1px solid #ddd;padding:10px;white-space:pre-wrap;word-break:break-word;font-size:12px}
.rendered{background:#fff;border:1px solid #ccc;padding:12px;border-radius:6px}</style></head>
<body>
<h1>"The Heat Is On" - paste-ready Canvas output</h1>

<h2>Mode 1: Spoken text (recommended - works in ALL screen readers, matches your dictionary)</h2>
<p>Rendered preview:</p>
<div class="rendered"><p>${spoken}</p></div>
<p>Paste this into the Canvas <b>&lt;/&gt;</b> HTML editor:</p>
<pre>${esc(spoken)}</pre>

<h2>Mode 2: MathML for math (navigable; needs NVDA 2026.1 / MathCAT to be announced)</h2>
<div class="rendered"><p>${mathml}</p></div>
<pre>${esc(mathml)}</pre>
</body></html>`;

await mkdir(new URL("../examples/", import.meta.url), { recursive: true });
await writeFile(new URL("../examples/heat-is-on.canvas.html", import.meta.url), page, "utf8");
console.log("Wrote examples/heat-is-on.canvas.html");

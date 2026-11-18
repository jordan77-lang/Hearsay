// Bundle browser-only deps (JSZip, jsPDF) so the site does not rely on a CDN at runtime.
import * as esbuild from "esbuild";
import { mkdirSync, cpSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "src", "vendor");

mkdirSync(OUT, { recursive: true });

await esbuild.build({
  entryPoints: {
    jszip: join(ROOT, "tools", "vendor-entries", "jszip.js"),
    jspdf: join(ROOT, "tools", "vendor-entries", "jspdf.js"),
  },
  outdir: OUT,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  minify: true,
});

const pdfOut = join(OUT, "pdfjs");
mkdirSync(pdfOut, { recursive: true });
for (const file of ["pdf.mjs", "pdf.worker.mjs"]) cpSync(join(ROOT, "node_modules", "pdfjs-dist", "legacy", "build", file), join(pdfOut, file));
for (const directory of ["cmaps", "standard_fonts"]) cpSync(join(ROOT, "node_modules", "pdfjs-dist", directory), join(pdfOut, directory), { recursive: true });
cpSync(join(ROOT, "node_modules", "pdfjs-dist", "LICENSE"), join(pdfOut, "LICENSE"));
console.log("Wrote local JSZip, jsPDF and PDF.js browser dependencies");

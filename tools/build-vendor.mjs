// Bundle browser-only deps (JSZip, jsPDF) so the site does not rely on a CDN at runtime.
import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
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

console.log("Wrote src/vendor/jszip.js and src/vendor/jspdf.js");

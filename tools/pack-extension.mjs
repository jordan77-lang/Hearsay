// Build download/hearsay-chrome-extension.zip and dist/hearsay-chrome-extension/ for Load unpacked.

import JSZip from "jszip";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "dist");
const DOWNLOAD_DIR = join(ROOT, "download");
const UNPACKED = join(OUT_DIR, "hearsay-chrome-extension");
const ZIP = join(DOWNLOAD_DIR, "hearsay-chrome-extension.zip");

const BUNDLE_ITEMS = ["manifest.json", "src", "extension"];

function addFolderToZip(zip, folder, basePath = folder) {
  for (const name of readdirSync(folder)) {
    const abs = join(folder, name);
    const entry = relative(basePath, abs).replace(/\\/g, "/");
    if (statSync(abs).isDirectory()) {
      addFolderToZip(zip, abs, basePath);
    } else {
      zip.file(entry, readFileSync(abs));
    }
  }
}

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(DOWNLOAD_DIR, { recursive: true });
rmSync(UNPACKED, { recursive: true, force: true });
mkdirSync(UNPACKED, { recursive: true });

for (const item of BUNDLE_ITEMS) {
  const src = join(ROOT, item);
  if (!existsSync(src)) continue;
  cpSync(src, join(UNPACKED, item), { recursive: true });
}

for (const file of ["INSTALL.bat", "INSTALL-Mac.command", "INSTALL.txt"]) {
  const src = join(ROOT, "extension", file);
  if (existsSync(src)) cpSync(src, join(UNPACKED, file));
}

if (existsSync(ZIP)) rmSync(ZIP);

const zip = new JSZip();
addFolderToZip(zip, UNPACKED);
const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
writeFileSync(ZIP, buffer);

console.log(`\nUnpacked extension: ${UNPACKED}`);
console.log(`Zip: ${ZIP} (${buffer.length} bytes)`);
console.log("Chrome: extract the zip → chrome://extensions → Developer mode → Load unpacked → select the extracted folder.");
console.log("(Do not load the .zip directly.)");

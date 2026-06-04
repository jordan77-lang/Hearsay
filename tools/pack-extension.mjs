// Build dist/hearsay-chrome-extension.zip and an unpacked folder for Load unpacked.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "dist");
const UNPACKED = join(OUT_DIR, "hearsay-chrome-extension");
const ZIP = join(OUT_DIR, "hearsay-chrome-extension.zip");

const BUNDLE_ITEMS = ["manifest.json", "src", "extension"];

mkdirSync(OUT_DIR, { recursive: true });
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

if (process.platform === "win32") {
  const dest = ZIP.replace(/'/g, "''");
  const srcDir = UNPACKED.replace(/'/g, "''");
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${dest}' -Force"`,
    { cwd: ROOT, stdio: "inherit" },
  );
} else {
  execSync(`cd "${UNPACKED}" && zip -r "${ZIP}" .`, { stdio: "inherit" });
}

console.log(`\nUnpacked extension: ${UNPACKED}`);
console.log(`Zip: ${ZIP}`);
console.log("Chrome: extract the zip → chrome://extensions → Developer mode → Load unpacked → select the extracted folder.");
console.log("(Do not load the .zip directly.)");

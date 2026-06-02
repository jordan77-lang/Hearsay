// Build dist/hearsay-chrome-extension.zip for internal Chrome install (Load unpacked).
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "dist");
const ZIP = join(OUT_DIR, "hearsay-chrome-extension.zip");

mkdirSync(OUT_DIR, { recursive: true });
if (existsSync(ZIP)) rmSync(ZIP);

if (process.platform === "win32") {
  const dest = ZIP.replace(/'/g, "''");
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path 'manifest.json','src' -DestinationPath '${dest}' -Force"`,
    { cwd: ROOT, stdio: "inherit" },
  );
} else {
  execSync(`zip -r "${ZIP}" manifest.json src/`, { cwd: ROOT, stdio: "inherit" });
}

console.log(`\nWrote ${ZIP}`);
console.log("Chrome: extract the zip, then chrome://extensions → Developer mode → Load unpacked.");

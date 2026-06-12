// Assemble static files for GitHub Pages into _site/
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "_site");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

execSync("npm run pack:extension", { stdio: "inherit", cwd: ROOT });
execSync("npm run build:user-guide", { stdio: "inherit", cwd: ROOT });

for (const item of ["index.html", "playground", "mathsay", "dictionary", "lab", "src", "download", "docs"]) {
  cpSync(join(ROOT, item), join(OUT, item), { recursive: true });
}

const extensionZip = join(OUT, "download", "hearsay-chrome-extension.zip");
if (!existsSync(extensionZip)) {
  console.error("Missing extension zip after build:", extensionZip);
  process.exit(1);
}
console.log(`Extension zip ready for Pages: ${extensionZip} (${statSync(extensionZip).size} bytes)`);

// Optional Supabase config for read-only auto-load (anon key only — safe to publish with RLS).
const url = process.env.HEARSAY_SUPABASE_URL?.trim();
const anonKey = process.env.HEARSAY_SUPABASE_ANON_KEY?.trim();
if (url && anonKey) {
  mkdirSync(join(OUT, "supabase"), { recursive: true });
  writeFileSync(
    join(OUT, "supabase", "config.public.json"),
    JSON.stringify({ url, anonKey, courseId: process.env.HEARSAY_COURSE_ID ?? "chem113" }, null, 2),
  );
  console.log("Wrote supabase/config.public.json from environment variables.");
}

writeFileSync(join(OUT, ".nojekyll"), "");
console.log(`GitHub Pages site ready: ${OUT}`);

// Generate HearSay author user guide PDF → docs/HearSay-Author-User-Guide.pdf

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildAuthorUserGuidePdfBuffer,
  AUTHOR_USER_GUIDE_FILENAME,
} from "../src/author-user-guide.js";

const outDir = join(process.cwd(), "docs");
const outPath = join(outDir, AUTHOR_USER_GUIDE_FILENAME);

await mkdir(outDir, { recursive: true });
const buffer = await buildAuthorUserGuidePdfBuffer();
await writeFile(outPath, Buffer.from(buffer));
console.log(`Wrote ${outPath}`);

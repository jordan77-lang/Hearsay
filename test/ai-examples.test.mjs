import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractExampleDocx, buildExampleCorpus } from "../tools/build-ai-examples.mjs";
import { selectExampleContext } from "../tools/ai-example-context.mjs";
import { analyzeDictionaryText } from "../tools/createai-api.mjs";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";

async function docx(xml) {
  const zip = new JSZip(); zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>${xml}</w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}
const corpus = { version: 1, documents: [
  { file: "chemistry.docx", paragraphs: [{ paragraph: 2, text: "Calorimetry measures heat capacity using 0.1000 kJ/(mol·K)." }] },
  { file: "astronomy.docx", paragraphs: [{ paragraph: 8, text: "Comet orbital velocity changes along its elliptical path." }] },
] };

test("Word reference extraction preserves scripted runs and omits structured equations and deleted content", async () => {
  const buffer = await docx('<w:p><w:r><w:t>Use q</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>solution</w:t></w:r><w:r><w:t> and T</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r><w:del><w:r><w:t>deleted secret</w:t></w:r></w:del><m:oMath><m:f><m:num><m:r><m:t>29 dogs</m:t></m:r></m:num><m:den><m:r><m:t>30 rats</m:t></m:r></m:den></m:f></m:oMath></w:p>');
  const result = await extractExampleDocx(buffer);
  assert.match(result.paragraphs[0].text, /q_\{solution\} and T\^\{2\}/);
  assert.match(result.paragraphs[0].text, /Word equation omitted/);
  assert.ok(!result.paragraphs[0].text.includes("29 dogs"));
  assert.ok(!result.paragraphs[0].text.includes("deleted secret"));
  assert.equal(result.omittedMath, 1);
});

test("reference selection stays relevant, bounded and preserves decimal notation", () => {
  const selected = selectExampleContext(corpus, "Compare calorimetry and heat capacity.");
  assert.equal(selected.length, 1); assert.equal(selected[0].document, "chemistry.docx");
  assert.match(selected[0].text, /0\.1000/);
  assert.equal(selected[0].status, "unlabeled scanning example");
  assert.equal(selectExampleContext(corpus, "Comet orbital velocity")[0].document, "astronomy.docx");
  assert.deepEqual(selectExampleContext(corpus, "Unrelated perfume branding"), []);
  assert.deepEqual(selectExampleContext(corpus, "calorimetry heat capacity", { maxCharacters: 10 }), []);
});

test("corrupt examples are reported while readable documents still build", async () => {
  const folder = await mkdtemp(join(tmpdir(), "hearsay-examples-"));
  try {
    await mkdir(join(folder, "examples"));
    await writeFile(join(folder, "examples", "valid.docx"), await docx("<w:p><w:r><w:t>Course source text.</w:t></w:r></w:p>"));
    await writeFile(join(folder, "examples", "broken.docx"), "incomplete ZIP");
    const result = await buildExampleCorpus(folder);
    assert.equal(result.documents.length, 1); assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].file, "broken.docx");
    const saved = JSON.parse(await readFile(join(folder, "createai", "examples.local.json"), "utf8"));
    assert.equal(saved.documents[0].paragraphs[0].text, "Course source text.");
  } finally {
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
    assert.ok(basename(folder).startsWith("hearsay-examples-"));
    await rm(folder, { recursive: true, force: true });
  }
});

test("example context reaches ASU as data and cannot authorize a term absent from the scanned passage", async () => {
  const source = "Calorimetry measures heat capacity in mL."; let submitted;
  const result = await analyzeDictionaryText(source, {
    exampleLoader: async () => corpus,
    configLoader: async () => ({ token: "fixture-private", origin: "https://api-main.aiml.asu.edu", model: "defaults" }),
    fetchImpl: async (_url, options) => {
      submitted = JSON.parse(options.body);
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ suggestions: [
        { term: "orbital", spoken: "orbit ull", reason: "Reference-only word", evidence: "Comet orbital velocity changes along its elliptical path.", action: "dictionary" },
        { term: "mL", spoken: "milliliters", reason: "Unit", evidence: source, action: "dictionary" },
      ] }) } }] });
    },
  });
  const user = JSON.parse(submitted.messages.find(item => item.role === "user").content);
  assert.equal(user.scanExamples[0].status, "unlabeled scanning example");
  assert.equal(user.source, source);
  assert.ok(!JSON.stringify(user).includes("fixture-private"));
  assert.deepEqual(result.suggestions.map(item => item.term), ["mL"]);
  assert.equal(result.referenceExamplesUsed, 1);
});

import { readFile } from "node:fs/promises";
import { splitReviewPassages } from "../src/core/review-session.js";

const stop = new Set("the and for that this with from are was were have has had will would should could can not you your their they them these those into each then than when where which what how use used using first second third table figure answer feedback question calculate value values given following step objective reaction reactions data example examples model models one two three four five all any also more most some only under over before after through about between change changes standard conditions determine record enter result results".split(" "));
function terms(text) {
  return new Set((text.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_°·/{+}−-]*/gu) || [])
    .filter(word => !stop.has(word) && /\p{L}/u.test(word) && (word.length >= 3 || /[°δμ0-9]/u.test(word))));
}

export async function loadExampleCorpus() {
  try {
    const corpus = JSON.parse(await readFile(new URL("../createai/examples.local.json", import.meta.url), "utf8"));
    return corpus.version === 1 && Array.isArray(corpus.documents) ? corpus : { version: 1, documents: [] };
  } catch { return { version: 1, documents: [] }; }
}

export function selectExampleContext(corpus, passage, { maxExcerpts = 4, maxCharacters = 2800 } = {}) {
  const query = terms(passage), records = [], frequencies = new Map();
  for (const doc of corpus.documents || []) {
    const documentTerms = new Set();
    for (const paragraph of doc.paragraphs || []) {
      if (typeof paragraph.text !== "string") continue;
      // Keep context concise without manufacturing a summary or equation.
      const chunks = splitReviewPassages(paragraph.text).map(item => item.text);
      for (const chunk of chunks) {
        const value = chunk.trim();
        if (value.length < 25 || value.length > 1100) continue;
        const words = terms(value); words.forEach(word => documentTerms.add(word));
        records.push({ file: doc.file, paragraph: paragraph.paragraph, text: value, words });
      }
    }
    documentTerms.forEach(word => frequencies.set(word, (frequencies.get(word) || 0) + 1));
  }
  const scored = records.map(record => {
    const matches = [...query].filter(word => record.words.has(word));
    const score = matches.length < 2 ? 0 : matches.reduce((sum, word) => sum + Math.log(1 + (corpus.documents.length / (frequencies.get(word) || 1))), 0);
    return { ...record, score };
  }).filter(record => record.score > 0).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.paragraph - b.paragraph);
  const selected = [], seen = new Set(); let size = 0;
  for (const record of scored) {
    if (selected.length >= maxExcerpts) break;
    if (seen.has(record.text) || size + record.text.length > maxCharacters) continue;
    selected.push({ document: record.file, paragraph: record.paragraph, status: "unlabeled scanning example", text: record.text });
    seen.add(record.text); size += record.text.length;
  }
  return selected;
}

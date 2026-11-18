// Author-facing user guide PDF (how to use HearSay web app + extension).

let jsPdfLoader;

async function loadJsPDF() {
  if (!jsPdfLoader) {
    jsPdfLoader = import("./vendor/jspdf.js").then((m) => m.jsPDF);
  }
  return jsPdfLoader;
}

const C = {
  navy: [24, 58, 92],
  accent: [37, 99, 235],
  accentSoft: [219, 234, 254],
  ink: [15, 23, 42],
  body: [51, 65, 85],
  muted: [100, 116, 139],
  line: [226, 232, 240],
  panel: [248, 250, 252],
  white: [255, 255, 255],
};

/** Helvetica in jsPDF lacks emoji/arrows/Greek — normalize before doc.text(). */
export function sanitizeForPdf(text) {
  return String(text ?? "")
    .replace(/\u2601\s*/g, "") // cloud
    .replace(/\u25B6\s*/g, "") // play
    .replace(/\u23F8\s*/g, "") // pause
    .replace(/\u2715\s*/g, "Delete ") // multiplication x
    .replace(/\u2192/g, "->")
    .replace(/\u2191/g, "Up arrow")
    .replace(/\u2193/g, "Down arrow")
    .replace(/\u0394/g, "delta ")
    .replace(/[\u2080-\u2089]/g, (d) => String(d.charCodeAt(0) - 0x2080))
    .replace(/\u00B0C/g, " deg C")
    .replace(/\u00B0/g, " degrees")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00B7/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** @param {unknown} value */
function pdfText(value) {
  return sanitizeForPdf(value);
}

/** Plain-text guide sections (testable without jsPDF). */
export function buildAuthorUserGuideSections() {
  return {
    title: "HearSay Author User Guide", subtitle: "Review course pronunciation and prepare supplemental JAWS dictionaries", version: "JAWS-first review",
    intro: ["HearSay combines content review and class dictionary maintenance in one workspace.", "Speech is an approximation using your browser voice. It does not reproduce JAWS in Word, Google Docs or a PDF. Verify the original document with JAWS before distributing a dictionary."],
    sections: [
      { id: "overview", title: "One class workspace", bullets: ["Review content: import, paste, analyze, listen and adjust pronunciations in one place.", "Class dictionary: search saved entries, stage edits, import CSV and prepare JAWS source.", "The Chrome extension uses the same workspace alongside your source page."] },
      { id: "connect", title: "Choose your class once", body: ["Choose the class at the top of the workspace. Settings (top right) opens a panel with the project connection, class administration and AI connection. Connection settings are remembered in this browser.", "Demo dictionary is an offline, read-only sample. Select an editable connected class to save shared terms."] },
      { id: "lab", title: "Review content", steps: ["Import DOCX or selectable-text PDF, paste content, or use Pull from page in the extension. Files are read locally; images are excluded.", "Check the extracted text and warnings, then choose Get AI suggestions for this document. All extracted text is sent in one request. DOCX is preferred. Use text without AI loads it for manual review. For pasted text, choose Get AI suggestions. If text is highlighted in the box, only the highlight is sent and its suggestions join the current queue. Terms already in the class dictionary are not suggested again.", "HearSay accepts up to 500,000 text characters; the selected ASU model's token limit also applies. Limit errors keep the text and previous review. Nothing is silently shortened. AI review can miss terms.", "In the same row, choose Listen to: Whole passage, Sentence, Word or Highlighted, then play Default JAWS or Class dictionary. Sentence and Word follow your cursor in the text box; Prev and Next step by sentence or word. The Default and Dictionary cells show both pronunciations, and the text being spoken is highlighted in the text box as it is read. The playing button becomes Stop.", "Under Add a term, highlight a phrase in the text box or type it, then choose Add term. Manual terms and AI suggestions use the same pronunciation editor, including units such as kJ/mol.", "Edit, listen and approve entries. For supported scientific-notation suggestions, Use reusable entry covers a shared exponent phrase across coefficients; it is not a universal exponent rule."], note: "The passage and its formatting representation remain separate from pronunciation substitutions. Import does not establish that JAWS will pronounce the source incorrectly." },
      { id: "queue", title: "Review queue and drafts", bullets: ["Approve and next stages the reading; Skip and Review later retain the decision without publishing an entry.", "Review wording, passage and sentence position persist for the class in this browser. Switching views keeps the document preview and current fields mounted.", "When changes are staged, a save bar appears at the bottom of the window listing additions, replacements and removals. Save publishes one combined batch and creates one Undo entry; right after saving, the bar offers Undo.", "A failed save retains drafts and approvals. Refresh class checks, keep drafts in Settings retains wording and requires renewed approval after shared dictionary changes.", "Recover previous Lab work exposes older passages and term drafts. Existing Lab storage is kept.", "Clear content and review clears that local review. Saved dictionary terms are kept."] },
      { id: "dictionary", title: "Class dictionary", body: ["Table edits, removals and CSV imports stay as local drafts until you choose Save in the save bar.", "Add a term returns to the shared review editor. Search and maintenance of saved entries remain available in Class dictionary.", "Discard in the save bar restores table entries and returns approvals to pending while keeping suggested wording. Undo last dictionary change (above the table) checks for intervening shared edits before restoring a saved batch."] },
      { id: "extension", title: "Capture from your browser", steps: ["Open the source page, select text or focus its editor, then open the HearSay side panel.", "In Review content, choose Replace passage or Append selection before Pull from page. Appending requires a selection.", "The captured passage goes directly into the same source field used for import, paste and AI analysis. Capture details identify the page and warn about truncation.", "Switch between Review content and Class dictionary without transferring text or losing your place." ] },
      { id: "students", title: "Share with students", body: ["Share with students (beside the view tabs) opens the class export section. Save or discard staged changes before exporting.", "JAWS source TSV is a preparation list, not a student-ready installer. Native JDF or SBAK packaging and actual JAWS validation are still required before distribution. Preserve students' personal pronunciations." ] },
      { id: "workflow", title: "Typical workflow", steps: ["Choose the class once.", "Add course content.", "Review suggestions and listen; add manual terms as needed.", "Approve readings and review the combined change summary.", "Save changes to the class dictionary.", "Prepare and validate the student dictionary."] }
    ], footer: "HearSay - Author user guide"
  };
}

/**
 * @param {import('jspdf').jsPDF} doc
 * @param {ReturnType<typeof buildAuthorUserGuideSections>} guide
 */
function renderAuthorUserGuidePdf(doc, guide) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  const footerY = pageH - 36;
  let y = 0;

  function setFill([r, g, b]) {
    doc.setFillColor(r, g, b);
  }
  function setStroke([r, g, b]) {
    doc.setDrawColor(r, g, b);
  }
  function setInk([r, g, b]) {
    doc.setTextColor(r, g, b);
  }

  function newPage() {
    doc.addPage();
    y = margin;
  }

  function ensureSpace(need) {
    if (y + need > footerY - 16) newPage();
  }

  function drawPageFooters() {
    const total = doc.internal.getNumberOfPages();
    const footer = pdfText(guide.footer);
    for (let p = 1; p <= total; p += 1) {
      doc.setPage(p);
      setStroke(C.line);
      doc.setLineWidth(0.5);
      doc.line(margin, footerY - 10, pageW - margin, footerY - 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setInk(C.muted);
      doc.text(footer, margin, footerY);
      doc.text(`Page ${p} of ${total}`, pageW - margin, footerY, { align: "right" });
    }
  }

  function drawHero() {
    const bandH = 120;
    setFill(C.navy);
    doc.rect(0, 0, pageW, bandH, "F");
    setFill(C.accent);
    doc.rect(0, bandH - 4, pageW, 4, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    setInk(C.white);
    doc.text(pdfText(guide.title), margin, 48);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    setInk([203, 213, 225]);
    const subLines = doc.splitTextToSize(pdfText(guide.subtitle), contentW);
    doc.text(subLines, margin, 72);

    doc.setFontSize(10);
    doc.text(pdfText(guide.version), margin, bandH - 18);
    y = bandH + 28;
  }

  function drawBody(text, size = 11) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    setInk(C.body);
    for (const line of doc.splitTextToSize(pdfText(text), contentW)) {
      ensureSpace(15);
      doc.text(line, margin, y);
      y += 15;
    }
    y += 6;
  }

  function drawSectionTitle(text) {
    ensureSpace(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    setInk(C.ink);
    doc.text(pdfText(text), margin, y);
    y += 10;
    setStroke(C.accent);
    doc.setLineWidth(2);
    doc.line(margin, y, margin + 48, y);
    y += 18;
  }

  function drawSubTitle(text) {
    ensureSpace(22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    setInk(C.ink);
    doc.text(pdfText(text), margin, y);
    y += 16;
  }

  function drawBullets(items, indent = 16) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    setInk(C.body);
    for (const item of items) {
      const wrapped = doc.splitTextToSize(pdfText(item), contentW - indent);
      wrapped.forEach((line, i) => {
        ensureSpace(14);
        if (i === 0) {
          setFill(C.accent);
          doc.circle(margin + 4, y - 3, 2, "F");
        }
        doc.text(line, margin + indent, y);
        y += 14;
      });
      y += 2;
    }
    y += 4;
  }

  function drawNumberedSteps(steps) {
    const numR = 10;
    const textX = margin + numR * 2 + 12;
    const textW = contentW - (textX - margin);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    for (let i = 0; i < steps.length; i += 1) {
      const wrapped = doc.splitTextToSize(pdfText(steps[i]), textW);
      const blockH = wrapped.length * 14 + 4;
      ensureSpace(blockH);
      const cx = margin + numR + 2;
      setFill(C.accent);
      doc.circle(cx, y + 1, numR, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      setInk(C.white);
      const num = String(i + 1);
      doc.text(num, cx - doc.getTextWidth(num) / 2, y + 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      setInk(C.body);
      wrapped.forEach((line, li) => {
        doc.text(line, textX, y + li * 14);
      });
      y += blockH;
    }
    y += 8;
  }

  function drawNote(text) {
    const pad = 12;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(pdfText(text), contentW - pad * 2);
    const boxH = lines.length * 14 + pad * 2;
    ensureSpace(boxH + 8);
    setFill(C.accentSoft);
    setStroke(C.accent);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, contentW, boxH, 4, 4, "FD");
    setInk(C.body);
    lines.forEach((line, i) => {
      doc.text(line, margin + pad, y + pad + 10 + i * 14);
    });
    y += boxH + 10;
  }

  function drawIntroPanel(paragraphs) {
    const pad = 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    let innerH = 0;
    for (const p of paragraphs) {
      innerH += doc.splitTextToSize(pdfText(p), contentW - pad * 2).length * 15 + 4;
    }
    const boxH = innerH + pad * 2;
    ensureSpace(boxH + 8);
    setFill(C.panel);
    setStroke(C.line);
    doc.setLineWidth(0.75);
    doc.roundedRect(margin, y, contentW, boxH, 6, 6, "FD");
    let cy = y + pad + 11;
    setInk(C.body);
    for (const p of paragraphs) {
      for (const line of doc.splitTextToSize(pdfText(p), contentW - pad * 2)) {
        doc.text(line, margin + pad, cy);
        cy += 15;
      }
      cy += 4;
    }
    y += boxH + 16;
  }

  drawHero();
  drawIntroPanel(guide.intro);

  for (const section of guide.sections) {
    drawSectionTitle(section.title);
    if (section.body) {
      for (const p of section.body) drawBody(p);
    }
    if (section.bullets) drawBullets(section.bullets);
    if (section.steps) drawNumberedSteps(section.steps);
    if (section.note) drawNote(section.note);
    if (section.subsections) {
      for (const sub of section.subsections) {
        drawSubTitle(sub.title);
        if (sub.bullets) drawBullets(sub.bullets);
      }
    }
    y += 6;
  }

  drawPageFooters();
}

/** @returns {Promise<Blob>} */
export async function buildAuthorUserGuidePdfBlob() {
  const jsPDF = await loadJsPDF();
  const guide = buildAuthorUserGuideSections();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  renderAuthorUserGuidePdf(doc, guide);
  return doc.output("blob");
}

/** @returns {Promise<ArrayBuffer>} */
export async function buildAuthorUserGuidePdfBuffer() {
  const jsPDF = await loadJsPDF();
  const guide = buildAuthorUserGuideSections();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  renderAuthorUserGuidePdf(doc, guide);
  return doc.output("arraybuffer");
}

export const AUTHOR_USER_GUIDE_FILENAME = "HearSay-Author-User-Guide.pdf";

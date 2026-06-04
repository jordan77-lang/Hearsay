// Student-facing PDF install guide (bundled with NVDA add-on exports).

let jsPdfLoader;

async function loadJsPDF() {
  if (!jsPdfLoader) {
    jsPdfLoader = import("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm").then((m) => m.jsPDF);
  }
  return jsPdfLoader;
}

/** Print-friendly palette (light page, high contrast text). */
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
  success: [22, 163, 74],
  successSoft: [220, 252, 231],
  warnSoft: [254, 243, 199],
};

export function installGuidePdfFilename(addonFilename) {
  return String(addonFilename).replace(/\.nvda-addon$/i, "-install-guide.pdf");
}

/**
 * Plain-text sections for the student install PDF (testable without jsPDF).
 * @param {object} options — resolved add-on metadata
 */
export function buildInstallGuideSections(options, { addonFilename, literalCount, regexCount } = {}) {
  const courseName = options.dictionaryDisplayName || options.summary || "Course pronunciations";
  const file = addonFilename || `${options.addonId}-${options.version}.nvda-addon`;

  return {
    courseName,
    file,
    whatThisDoes: [
      `This guide helps you install ${courseName} on your computer.`,
      "You only need to do this once for the course.",
      "After you install and restart NVDA, chemistry and science terms in Canvas should read correctly — including New Quizzes. You do not need to change any Canvas settings.",
    ],
    requirements: [
      "A Windows computer.",
      "NVDA 2026.1 or later (free screen reader from nvaccess.org).",
      `The install file: ${file} (usually in your Downloads folder, next to this PDF).`,
    ],
    stepsPrimary: [
      "Open File Explorer and go to Downloads (or wherever you saved the file).",
      `Find ${file}.`,
      "Click the file once, then press Enter — or double-click it.",
      "NVDA opens and shows an install screen. Choose Install.",
      "When NVDA asks to restart, choose Yes.",
      "Wait for NVDA to finish restarting.",
    ],
    stepsAlternate: [
      "Open NVDA.",
      "Open Tools → Add-on Store.",
      "Choose Install from external source.",
      `Browse to ${file} and choose Install.`,
      "Restart NVDA when prompted.",
    ],
    test: [
      { sample: "kJ/mol", expect: "killuh jools per mol" },
      { sample: "10 mL", expect: "milliliters" },
      { sample: "J/g°C", expect: "jools per gram degree Celsius" },
    ],
    testIntro: "Open Notepad (Windows key, type Notepad, press Enter). Type each line below and listen.",
    testOutro: "If those sound right, you are ready for Canvas.",
    troubleshooting: [
      "If double-click does nothing, use Add-on Store instead: NVDA → Tools → Add-on Store → Install from external source → choose the .nvda-addon file.",
      "Make sure NVDA 2026.1 or later is installed (this add-on does not work on older NVDA). Update to NVDA 2026.1.1+ if File Explorer never opens NVDA when you activate the file.",
      "If NVDA says the package is invalid or incompatible, re-download the file and try again (a partial download can look like a broken zip).",
      "If NVDA says the add-on is not compatible, update NVDA to 2026.1 or newer.",
      "After restart, open Tools → Add-on Store and make sure the add-on is enabled.",
      "If terms still read as symbols (like J slash g), contact your instructor or campus accessibility office. Tell them your NVDA version and the file name above.",
    ],
    footer: `${courseName} · version ${options.version} · ${file}`,
    literalCount,
    regexCount,
  };
}

/**
 * @param {object} options
 * @param {{ addonFilename: string, literalCount?: number, regexCount?: number }} meta
 */
export async function buildInstallGuidePdfBlob(options, meta) {
  const jsPDF = await loadJsPDF();
  const s = buildInstallGuideSections(options, meta);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  const footerY = pageH - 28;
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

  function ensureSpace(need) {
    if (y + need > footerY - 12) {
      doc.addPage();
      y = margin;
    }
  }

  function drawHeroHeader() {
    const bandH = 108;
    setFill(C.navy);
    doc.rect(0, 0, pageW, bandH, "F");

    setFill(C.accent);
    doc.rect(0, bandH - 4, pageW, 4, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    setInk(C.white);
    const titleLines = doc.splitTextToSize(s.courseName, contentW);
    doc.text(titleLines, margin, 42);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    setInk([203, 213, 225]);
    doc.text("NVDA pronunciation dictionary · student install guide", margin, 42 + titleLines.length * 26 + 6);

    y = bandH + 28;
  }

  function drawSectionLabel(text) {
    ensureSpace(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setInk(C.accent);
    doc.text(text.toUpperCase(), margin, y);
    y += 14;
    setStroke(C.line);
    doc.setLineWidth(0.75);
    doc.line(margin, y, pageW - margin, y);
    y += 16;
  }

  function drawSectionTitle(text, size = 15) {
    ensureSpace(size + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    setInk(C.ink);
    doc.text(text, margin, y);
    y += size + 8;
  }

  function drawBody(text, size = 11, color = C.body) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    setInk(color);
    for (const line of doc.splitTextToSize(text, contentW)) {
      ensureSpace(15);
      doc.text(line, margin, y);
      y += 15;
    }
    y += 4;
  }

  function drawOverviewPanel(paragraphs) {
    const pad = 16;
    const innerW = contentW - pad * 2;
    let innerH = 0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    for (const p of paragraphs) {
      innerH += doc.splitTextToSize(p, innerW).length * 15 + 6;
    }
    const boxH = innerH + pad * 2;
    ensureSpace(boxH + 10);

    setFill(C.panel);
    setStroke(C.line);
    doc.setLineWidth(0.75);
    doc.roundedRect(margin, y, contentW, boxH, 6, 6, "FD");

    let cy = y + pad + 11;
    setInk(C.body);
    for (const p of paragraphs) {
      for (const line of doc.splitTextToSize(p, innerW)) {
        doc.text(line, margin + pad, cy);
        cy += 15;
      }
      cy += 6;
    }
    y += boxH + 16;
  }

  function drawHelpPanel(items) {
    const pad = 14;
    const innerW = contentW - pad * 2 - 18;
    let innerH = 0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    for (const item of items) {
      innerH += doc.splitTextToSize(item, innerW).length * 15 + 3;
    }
    const boxH = innerH + pad * 2;
    ensureSpace(boxH + 10);

    setFill(C.warnSoft);
    setStroke([253, 230, 138]);
    doc.setLineWidth(0.75);
    doc.roundedRect(margin, y, contentW, boxH, 6, 6, "FD");

    let cy = y + pad + 11;
    setInk(C.body);
    for (const item of items) {
      const lines = doc.splitTextToSize(item, innerW);
      lines.forEach((line, i) => {
        if (i === 0) {
          setFill([217, 119, 6]);
          doc.circle(margin + pad + 5, cy - 3, 2.5, "F");
        }
        doc.text(line, margin + pad + 18, cy);
        cy += 15;
      });
      cy += 3;
    }
    y += boxH + 14;
  }

  function drawFileCallout() {
    const pad = 16;
    const labelH = 14;
    const fileLines = doc.splitTextToSize(s.file, contentW - pad * 2);
    const boxH = pad * 2 + labelH + fileLines.length * 16 + 8;
    ensureSpace(boxH + 8);

    setFill(C.accentSoft);
    setStroke(C.accent);
    doc.setLineWidth(1);
    doc.roundedRect(margin, y, contentW, boxH, 8, 8, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setInk(C.accent);
    doc.text("YOUR INSTALL FILE", margin + pad, y + pad + 8);

    doc.setFont("courier", "bold");
    doc.setFontSize(11);
    setInk(C.ink);
    doc.text(fileLines, margin + pad, y + pad + labelH + 14);

    y += boxH + 16;
  }

  function drawBullets(items, indent = 18) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    setInk(C.body);
    for (const item of items) {
      const wrapped = doc.splitTextToSize(item, contentW - indent);
      wrapped.forEach((line, i) => {
        ensureSpace(15);
        if (i === 0) {
          setFill(C.accent);
          doc.circle(margin + 5, y - 3, 2.5, "F");
        }
        doc.text(line, margin + indent, y);
        y += 15;
      });
      y += 3;
    }
    y += 6;
  }

  function drawNumberedSteps(steps) {
    const numR = 11;
    const textX = margin + numR * 2 + 14;
    const textW = contentW - (textX - margin);

    for (let i = 0; i < steps.length; i += 1) {
      const wrapped = doc.splitTextToSize(steps[i], textW);
      const blockH = wrapped.length * 15 + 6;
      ensureSpace(blockH);

      setFill(C.accent);
      doc.circle(margin + numR + 2, y + 2, numR, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      setInk(C.white);
      doc.text(String(i + 1), margin + numR + 2, y + 6, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      setInk(C.body);
      wrapped.forEach((line, li) => {
        doc.text(line, textX, y + li * 15);
      });
      y += blockH;
    }
    y += 8;
  }

  function drawBadge(text) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const w = doc.getTextWidth(text) + 14;
    ensureSpace(18);
    setFill(C.success);
    doc.roundedRect(margin, y - 10, w, 16, 8, 8, "F");
    setInk(C.white);
    doc.text(text, margin + 7, y);
    y += 12;
  }

  function drawTestCards() {
    drawBody(s.testIntro);
    y += 4;

    for (const { sample, expect } of s.test) {
      const cardPad = 12;
      const sampleW = contentW - cardPad * 2;
      const expectLines = doc.splitTextToSize(`Should sound like: ${expect}`, sampleW);
      const cardH = cardPad * 2 + 18 + expectLines.length * 14;
      ensureSpace(cardH + 10);

      setFill(C.successSoft);
      setStroke([187, 247, 208]);
      doc.setLineWidth(0.75);
      doc.roundedRect(margin, y, contentW, cardH, 6, 6, "FD");

      doc.setFont("courier", "bold");
      doc.setFontSize(12);
      setInk(C.ink);
      doc.text(sample, margin + cardPad, y + cardPad + 10);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      setInk(C.muted);
      doc.text(expectLines, margin + cardPad, y + cardPad + 28);

      y += cardH + 10;
    }

    drawBody(s.testOutro);
  }

  function drawPageFooters() {
    const total = doc.internal.getNumberOfPages();
    for (let p = 1; p <= total; p += 1) {
      doc.setPage(p);
      setStroke(C.line);
      doc.setLineWidth(0.5);
      doc.line(margin, footerY - 10, pageW - margin, footerY - 10);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      setInk(C.muted);
      doc.text(s.footer, margin, footerY);
      doc.text(`Page ${p} of ${total}`, pageW - margin, footerY, { align: "right" });
    }
  }

  // --- Layout ---
  drawHeroHeader();

  drawSectionLabel("Overview");
  drawOverviewPanel(s.whatThisDoes);

  drawFileCallout();

  drawSectionLabel("Before you start");
  drawBullets(s.requirements);

  drawSectionLabel("Install");
  drawBadge("RECOMMENDED");
  drawSectionTitle("Open the install file");
  drawBody("When you click or double-click the .nvda-addon file, NVDA should start installing automatically.");
  drawNumberedSteps(s.stepsPrimary);

  drawSectionTitle("Another way — Add-on Store", 13);
  drawBullets(s.stepsAlternate);

  drawSectionLabel("Verify");
  drawTestCards();

  drawSectionLabel("Help");
  drawHelpPanel(s.troubleshooting);

  drawPageFooters();

  return doc.output("blob");
}

export async function downloadInstallGuidePdf(options, meta) {
  const blob = await buildInstallGuidePdfBlob(options, meta);
  const pdfName = installGuidePdfFilename(meta.addonFilename);
  return { blob, filename: pdfName };
}

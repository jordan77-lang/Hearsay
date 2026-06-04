// Student-facing PDF install guide (bundled with NVDA add-on exports).

let jsPdfLoader;

async function loadJsPDF() {
  if (!jsPdfLoader) {
    jsPdfLoader = import("./vendor/jspdf.js").then((m) => m.jsPDF);
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
      `Install ${courseName} once on your Windows computer.`,
      "After you restart NVDA, science and chemistry terms in readings and quizzes should sound correct. No changes are needed inside Canvas or other sites.",
    ],
    requirements: [
      "Windows computer with NVDA 2026.1 or later (free from nvaccess.org).",
      `Install file: ${file} (usually in Downloads, next to this PDF).`,
      "The file name must end in .nvda-addon — not .zip.",
    ],
    stepsPrimary: [
      "Open Downloads in File Explorer (or the folder where you saved the file).",
      `Double-click ${file}. NVDA should open and start installing the add-on.`,
      "If NVDA asks you to confirm, choose Install.",
      "When NVDA asks to restart, choose Yes and wait until NVDA is running again.",
      "If double-click does nothing (spinner, no NVDA), use Option B below instead of repeating the click.",
    ],
    stepsAlternate: [
      "Open NVDA and make sure it is running.",
      "Go to Tools → Add-on Store → Install from external source.",
      `Browse to ${file} (usually in Downloads), select it, and choose Install.`,
      "Restart NVDA when prompted.",
    ],
    test: [
      { sample: "kJ/mol", expect: "killuh jools per mol" },
      { sample: "10 mL", expect: "milliliters" },
      { sample: "J/g°C", expect: "jools per gram degree Celsius" },
    ],
    testIntro: "Open Notepad. Type each sample below and listen with NVDA.",
    testOutro: "If they sound like the descriptions, installation worked.",
    troubleshooting: [
      "Nothing happens when you double-click: use Option B — Tools → Add-on Store → Install from external source (same file). You can also try right-click → Open with → nvda.exe (usually C:\\Program Files\\NVDA\\).",
      "NVDA says the file is invalid: download again; the file must end in .nvda-addon, not .zip.",
      "NVDA says not compatible: update to NVDA 2026.1 or newer.",
      "After restart, check Tools → Add-on Store that the add-on is enabled.",
      "Terms still sound wrong (for example “J slash g”): contact your instructor with your NVDA version and the install file name above.",
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
  drawBadge("OPTION A — RECOMMENDED");
  drawSectionTitle("Double-click the install file");
  drawBody("Double-click the .nvda-addon file. NVDA opens, installs the dictionary, and asks you to restart.");
  drawNumberedSteps(s.stepsPrimary);

  drawBadge("OPTION B");
  drawSectionTitle("Install from Add-on Store (if double-click fails)", 13);
  drawBody(
    "Use this when the file does not open NVDA, you only see a spinner, or Windows asks what program to use. NVDA 2026.1.1+ is recommended so double-click works next time.",
  );
  drawNumberedSteps(s.stepsAlternate);

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

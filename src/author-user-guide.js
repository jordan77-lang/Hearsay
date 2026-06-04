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
    title: "HearSay Author User Guide",
    subtitle: "Build class dictionaries, test speech, export screen reader dictionaries for students",
    version: "June 2026",
    intro: [
      "HearSay helps course authors make science and math content pronounceable by screen readers — without asking students to edit personal dictionaries.",
      "Use the web app or Chrome extension to edit a shared class dictionary in Supabase, preview how speech will sound, and export screen reader dictionary files for your class (NVDA, JAWS, VoiceOver, and more).",
    ],
    sections: [
      {
        id: "overview",
        title: "What HearSay includes",
        bullets: [
          "Home — overview and links to every tool.",
          "Screen Reader Lab — paste or pull course text and compare default screen reader speech vs your class dictionary.",
          "Dictionary — connect to Supabase, edit pronunciation rows, import CSV, and export screen reader dictionaries for students.",
          "Chrome extension — same Lab and Dictionary in a side panel while you browse your LMS or Google Docs.",
        ],
      },
      {
        id: "connect",
        title: "Connect once (Cloud Connect)",
        body: [
          "Most authoring features need your team Supabase project. Click Cloud Connect on the Dictionary or Lab page and enter the project URL and anon key (shared privately with your team — never commit these to a public repo).",
          "Credentials are stored in this browser only. The top navigation shows Connected and your class name when linked.",
          "If you used the legacy Dictionary Builder, HearSay can migrate those saved credentials automatically.",
          "Without a connection you can still use the offline Demo dictionary in Screen Reader Lab and browse the Dictionary UI, but saving, pulling classes, and exports require Cloud Connect.",
        ],
      },
      {
        id: "lab",
        title: "Screen Reader Lab",
        body: [
          "Paste plain quiz or reading text — from Google Docs, Word, Canvas, or elsewhere. HearSay normalizes subscripts, superscripts, and glued variables (for example qcalorimeter, T2, DIwater).",
          "Two speech columns update live as you type:",
        ],
        bullets: [
          "Default screen reader — what students hear with no class dictionary loaded (factory symbol table: parentheses, slash, degrees, equals, etc.). Blue highlights show spelled-out symbols.",
          "Default + dictionary — your saved class terms applied on top. Green = class dictionary; blue = default only where your class has no rule.",
          "Use Hear on each column to listen. While playback runs, use Pause or Resume.",
          "Flagged tokens — a list of words where pronunciation changes. Click highlighted speech to jump to a token. In the extension you can edit a flagged term inline.",
          "Pick a class from the dropdown: Demo dictionary (offline chemistry sample) or your Supabase class after Connect.",
          "Try Load sample for a calorimetry example. Clear resets the editor.",
        ],
        note: "Google Docs equations sometimes lose their fraction bar on copy. HearSay detects glued fractions and inserts “divided by” so speech stays consistent.",
      },
      {
        id: "dictionary",
        title: "Dictionary editor",
        body: [
          "The Dictionary page is where authors maintain pronunciation rules stored in Supabase entries for each class.",
        ],
        subsections: [
          {
            title: "Classes",
            bullets: [
              "Demo dictionary — read-only offline sample; good for exploring Lab speech.",
              "Course dropdown — pick your class after Connect.",
              "+ Add class — create a new slug (e.g. chem114). Choose starter terms or start empty.",
              "Edit class — change display name and file prefix (slug is permanent).",
              "Delete class — removes the class from Supabase (with confirmation).",
              "Pull — reload all classes and rows from the cloud.",
              "Save class — save all rows again with confirmation (table edits also auto-save).",
            ],
          },
          {
            title: "Terms table",
            bullets: [
              "Pattern — exact text students see (e.g. delta T, mL, J/g deg C).",
              "Spoken — how the screen reader should say it (e.g. delta T, milliliters).",
              "Note — optional reminder for authors; included as comments in exported dictionary files.",
              "Ignore case — common dictionary setting (Yes/No); applies to NVDA and similar exports.",
              "Hear on each row — preview that row before saving.",
              "Delete — remove a row (confirms, then saves).",
              "Edits in the table auto-save to Supabase and refresh Screen Reader Lab for that class.",
              "Search — filter by words (all terms must match). Use Up/Down arrow keys or Enter to jump between hits.",
            ],
          },
          {
            title: "Add terms",
            bullets: [
              "Use the Add pronunciation form, or Import CSV (download Template CSV first).",
              "Starter terms — when creating a class, pick a starter bundle, copy from another class, or browse the category catalog.",
              "Hear on the add form tests speech before you add a row.",
            ],
          },
        ],
      },
      {
        id: "students",
        title: "Export screen reader dictionaries",
        body: [
          "From Dictionary, open Download for students. Your pronunciation rows export to the format each screen reader expects — pick what matches your class.",
        ],
        bullets: [
          "NVDA add-on (.nvda-addon) plus install PDF — packaged install for Windows students on NVDA 2026.1+ (double-click or Add-on Store).",
          "NVDA .dic — raw dictionary file for manual NVDA import or advanced users.",
          "JAWS source TSV — import into JAWS pronunciation dictionaries.",
          "Apple VoiceOver CSV — custom pronunciations on macOS.",
          "More screen reader formats are planned; the same class terms feed every export.",
          "Include regex rules (NVDA exports) — covers units after numbers (e.g. 10 mL) and patterns like parenthetical J/g deg C.",
          "Add-on settings — for NVDA packages: set version, add-on ID, summary, and author. Bump Version when you redistribute an update.",
        ],
      },
      {
        id: "extension",
        title: "Chrome extension",
        body: [
          "Install from the home page: download hearsay-chrome-extension.zip from the Download section, extract it, open chrome://extensions, enable Developer mode, Load unpacked, and select the extracted folder (not the zip).",
        ],
        bullets: [
          "Pin HearSay from the puzzle icon, then click the toolbar icon to open the side panel.",
          "Tabs: Screen Reader Lab and Dictionary — same tools as the website.",
          "Cloud Connect once in either tab (shared credentials).",
          "Pull from page (Lab tab) — select text on the active browser tab (LMS page, syllabus, quiz) and pull it into the Lab editor.",
          "Switch between Lab and Dictionary without losing your Connect session.",
        ],
      },
      {
        id: "workflow",
        title: "Typical author workflow",
        steps: [
          "Click Cloud Connect and pick or create your class in Dictionary.",
          "Add terms manually, import CSV, or use Starter terms when creating a class.",
          "Open Screen Reader Lab, select your class, paste sample quiz text (or Pull from page in the extension).",
          "Listen with Hear. Fix terms in Dictionary until green highlights match what you want students to hear.",
          "Download screen reader dictionary files from Dictionary -> Download for students (NVDA add-on, .dic, JAWS TSV, or VoiceOver CSV as needed).",
          "Share the files with students using the install instructions for their screen reader. They install once per computer; no Canvas changes required.",
        ],
      },
      {
        id: "tips",
        title: "Tips and troubleshooting",
        bullets: [
          "Demo dictionary vs class — Demo is offline and read-only. Your real class rows live in Supabase after Connect.",
          "Not connected — Save, Pull, Add class, and exports show a message and open Cloud Connect instead of failing silently.",
          "Screen Reader Lab shows combined speech (default + dictionary), not dictionary substitution alone.",
          "Chemistry bundled rules — Demo includes bundled chemistry pronunciations. Real classes use only their saved rows plus optional regex rules where supported.",
          "Test before sharing — use Lab with your class loaded, then spot-check speech on sample terms (kJ/mol, 10 mL, J/g deg C) in the reader your students use.",
          "Team privacy — treat the Supabase anon key like a team password; use Row Level Security appropriate for your project.",
        ],
      },
    ],
    footer: "HearSay · Author user guide · hearsay pronunciation assistant for course authors",
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

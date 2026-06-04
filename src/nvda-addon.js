// Build NVDA .nvda-addon packages (ported from screenreader dictionary-builder.html).

import { buildNvdaDic } from "./dictionary-export.js";
import { saveBlobAsFile } from "./save-download.js";

function sanitize(value) {
  return String(value ?? "").trim();
}

function escapeIniString(value) {
  return sanitize(value).replace(/"/g, '""');
}

function escapePythonString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function escapeHtml(value) {
  return sanitize(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {object} fields
 * @param {object} defaults
 */
export function resolveAddonOptions(fields, defaults = {}) {
  const addonId = sanitize(fields.addonId) || sanitize(defaults.addonId);
  const version = sanitize(fields.version) || sanitize(defaults.version);
  const summary = sanitize(fields.summary) || sanitize(defaults.summary);
  const author = sanitize(fields.author) || sanitize(defaults.author);
  const dictionaryName = sanitize(fields.dictionaryName) || sanitize(defaults.dictionaryName);
  const dictionaryDisplayName =
    sanitize(fields.dictionaryDisplayName) || sanitize(defaults.dictionaryDisplayName);

  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(addonId)) {
    throw new Error("Add-on ID must start with a letter and use only letters and numbers.");
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(dictionaryName)) {
    throw new Error(
      "Dictionary name must start with a letter and use letters, numbers, underscores, or hyphens.",
    );
  }
  if (!version) {
    throw new Error("Version is required.");
  }

  return { addonId, version, summary, author, dictionaryName, dictionaryDisplayName };
}

export function buildAddonManifest(options) {
  return [
    `name = "${escapeIniString(options.addonId)}"`,
    `summary = "${escapeIniString(options.summary)}"`,
    `description = """${escapeIniString(options.summary)}."""`,
    `author = "${escapeIniString(options.author)}"`,
    `url = "https://example.org"`,
    `version = "${escapeIniString(options.version)}"`,
    "docFileName = readme.html",
    'minimumNVDAVersion = "2026.1"',
    'lastTestedNVDAVersion = "2026.1"',
    "[speechDictionaries]",
    `[[${options.dictionaryName}]]`,
    `displayName = "${escapeIniString(options.dictionaryDisplayName)}"`,
    "mandatory = true",
  ].join("\r\n");
}

export function buildAddonInstallTasks(_options, dictionaryFileName) {
  const dictFile = escapePythonString(dictionaryFileName);
  return [
    "# Copies course pronunciations into NVDA Default dictionary on install.",
    "import os",
    "import shutil",
    "from NVDAState import WritePaths",
    "",
    "def onInstall():",
    "    addonRoot = os.path.abspath(os.path.dirname(__file__))",
    `    sourcePath = os.path.join(addonRoot, "speechDicts", "${dictFile}")`,
    "    if not os.path.isfile(sourcePath):",
    "        return",
    "    os.makedirs(WritePaths.speechDictsDir, exist_ok=True)",
    "    shutil.copy2(sourcePath, WritePaths.speechDictDefaultFile)",
    "",
    "def onUninstall():",
    "    pass",
  ].join("\r\n");
}

export function buildAddonReadmeHtml(summary, dictionaryFileName) {
  const safeSummary = escapeHtml(summary);
  const safeFileName = escapeHtml(dictionaryFileName);
  return [
    "<!doctype html>",
    '<html lang="en">',
    `<head><meta charset="utf-8"><title>${safeSummary}</title></head>`,
    "<body>",
    `<h1>${safeSummary}</h1>`,
    "<p>Speech pronunciation dictionary package for course terminology.</p>",
    `<p>Dictionary file: ${safeFileName}</p>`,
    "</body>",
    "</html>",
  ].join("\r\n");
}

export function buildAddonBootstrapPlugin(options, dictionaryFileName) {
  let moduleName = String(options.dictionaryName || "").replace(/[^A-Za-z0-9_]/g, "_");
  if (!moduleName) moduleName = "dictionaryBootstrap";
  if (!/^[A-Za-z_]/.test(moduleName)) moduleName = `dict_${moduleName}`;

  const addonId = escapePythonString(options.addonId);
  const dictName = escapePythonString(options.dictionaryName);
  const dictFile = escapePythonString(dictionaryFileName);

  const code = [
    '"""Ensures add-on speech dictionary entries are loaded and active."""',
    "import os",
    "import addonHandler",
    "import globalPluginHandler",
    "from logHandler import log",
    "from speechDictHandler import definitions",
    "from speechDictHandler.types import DictionaryType, SpeechDict",
    "",
    "addonHandler.initTranslation()",
    "",
    "class GlobalPlugin(globalPluginHandler.GlobalPlugin):",
    "    def __init__(self, *args, **kwargs):",
    "        super().__init__(*args, **kwargs)",
    "        self._injectedEntries = []",
    "        self._targetDefinition = None",
    "        try:",
    "            addonRoot = os.path.dirname(os.path.dirname(__file__))",
    `            dictPath = os.path.join(addonRoot, "speechDicts", "${dictFile}")`,
    "            if not os.path.isfile(dictPath):",
    '                log.error("Add-on speech dictionary file not found: %s", dictPath)',
    "                return",
    "            sourceDict = SpeechDict()",
    "            sourceDict.load(dictPath)",
    "            if not sourceDict:",
    '                log.error("Add-on speech dictionary loaded zero entries from %s", dictPath)',
    "                return",
    "            addonDefinition = None",
    "            for definition in definitions.listAvailableSpeechDictDefinitions():",
    `                if definition.name == "${dictName}" and definition.source == "${addonId}":`,
    "                    addonDefinition = definition",
    "                    break",
    "            if addonDefinition is not None and len(addonDefinition.dictionary) == 0:",
    "                addonDefinition.dictionary.extend(sourceDict)",
    "                log.info(",
    '                    "Populated add-on speech dictionary \'%s\' with %d entries.",',
    `                    "${dictName}",`,
    "                    len(sourceDict),",
    "                )",
    "            targetDefinition = definitions._getDictionaryDefinition(DictionaryType.DEFAULT)",
    "            self._targetDefinition = targetDefinition",
    "            existingPatterns = {entry.pattern for entry in targetDefinition.dictionary}",
    "            added = 0",
    "            for entry in sourceDict:",
    "                if entry.pattern in existingPatterns:",
    "                    continue",
    "                targetDefinition.dictionary.append(entry)",
    "                self._injectedEntries.append(entry)",
    "                existingPatterns.add(entry.pattern)",
    "                added += 1",
    "            log.info(",
    '                "Merged %d add-on speech dictionary entries into DEFAULT dictionary for \'%s\'.",',
    "                added,",
    `                "${addonId}",`,
    "            )",
    "        except Exception:",
    '            log.exception("Unable to load add-on speech dictionary entries.")',
    "",
    "    def terminate(self, *args, **kwargs):",
    "        try:",
    "            if self._targetDefinition is not None:",
    "                targetDict = self._targetDefinition.dictionary",
    "            else:",
    "                targetDict = definitions._getDictionaryDefinition(DictionaryType.DEFAULT).dictionary",
    "            for entry in self._injectedEntries:",
    "                try:",
    "                    targetDict.remove(entry)",
    "                except ValueError:",
    "                    pass",
    "        except Exception:",
    '            log.exception("Unable to unload add-on speech dictionary entries.")',
    "        self._injectedEntries = []",
    "        self._targetDefinition = None",
    "        super().terminate(*args, **kwargs)",
  ].join("\r\n");

  return { moduleName, code };
}

let jsZipLoader;

async function loadJSZip() {
  if (typeof globalThis.JSZip !== "undefined") return globalThis.JSZip;
  if (!jsZipLoader) {
    jsZipLoader = import("./vendor/jszip.js").then((m) => m.default);
  }
  return jsZipLoader;
}

/** Warm JSZip while the user is still on the page (speeds add-on export). */
export function preloadNvdaAddonDeps() {
  void loadJSZip();
}

export function downloadBlob(filename, blob) {
  void saveBlobAsFile(filename, blob);
}

/** Gap between back-to-back browser downloads (avoids multi-download warnings). */
export const DOWNLOAD_STAGGER_MS = 1500;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {object} params
 * @param {object} params.options — resolved add-on metadata
 * @param {string} params.dictionaryContent — full .dic body
 */
export async function buildNvdaAddonBlob({ options, dictionaryContent }) {
  const JSZip = await loadJSZip();
  const dictionaryFileName = `${options.dictionaryName}.dic`;
  const bootstrap = buildAddonBootstrapPlugin(options, dictionaryFileName);

  const zip = new JSZip();
  zip.file("manifest.ini", buildAddonManifest(options));
  zip.file(`speechDicts/${dictionaryFileName}`, dictionaryContent);
  zip.file(`globalPlugins/${bootstrap.moduleName}.py`, bootstrap.code);
  zip.file("installTasks.py", buildAddonInstallTasks(options, dictionaryFileName));
  zip.file("doc/en/readme.html", buildAddonReadmeHtml(options.summary, dictionaryFileName));

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function downloadNvdaAddon({ options, dictionaryContent, literalCount, regexCount }) {
  const blob = await buildNvdaAddonBlob({ options, dictionaryContent });
  const filename = `${options.addonId}-${options.version}.nvda-addon`;

  // Start the add-on download immediately — building the PDF first can expire the click
  // "user activation" window and Chrome will block the download with no error message.
  await saveBlobAsFile(filename, blob);

  let pdfFilename = null;
  let pdfBlob = null;
  let pdfError = null;
  try {
    const { downloadInstallGuidePdf } = await import("./student-install-guide.js");
    const pdf = await downloadInstallGuidePdf(options, {
      addonFilename: filename,
      literalCount,
      regexCount,
    });
    pdfBlob = pdf.blob;
    pdfFilename = pdf.filename;
    await delay(DOWNLOAD_STAGGER_MS);
    await saveBlobAsFile(pdfFilename, pdfBlob);
  } catch (err) {
    pdfError = err;
    // Add-on already downloaded; PDF is optional.
  }

  return {
    filename,
    pdfFilename,
    pdfError,
    message: buildNvdaDownloadAlertMessage({ filename, pdfFilename, pdfError }),
  };
}

/** Short browser alert after export — details live in the install PDF. */
const EXTERNAL_SOURCE_HINT =
  "If double-click fails: NVDA → Tools → Add-on Store → Install from external source.";

export function buildNvdaDownloadAlertMessage({ filename, pdfFilename, pdfError }) {
  const lines = [`Downloaded: ${filename}`];
  if (pdfFilename) {
    lines.push(`Also downloaded: ${pdfFilename}`);
    lines.push(
      "",
      "Students: double-click the .nvda-addon file, confirm Install, restart NVDA (2026.1+).",
      EXTERNAL_SOURCE_HINT,
      "Both methods are in the PDF (Option A and Option B).",
    );
  } else {
    if (pdfError) {
      lines.push("(Install PDF was not created; the add-on file is fine.)");
    }
    lines.push("", "Students: double-click the .nvda-addon file, confirm Install, restart NVDA (2026.1+).", EXTERNAL_SOURCE_HINT);
  }
  return lines.join("\n");
}

/** Default add-on metadata for a class slug/label. */
export function defaultAddonDefaults(slug, label) {
  return {
    author: "Accessibility Team",
    addonId: `${slug}Dictionary`,
    summary: `${label} Pronunciation Dictionary`,
    version: "1.0.0",
    dictionaryName: slug,
    dictionaryDisplayName: `${label} Pronunciations`,
    nvdaRegexEntries: [],
  };
}

/** Count regex lines in a .dic body (type column = 1). */
export function countRegexInDic(dicContent) {
  let count = 0;
  for (const line of String(dicContent).split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const parts = line.split("\t");
    if (parts.length >= 4 && parts[3] === "1") count += 1;
  }
  return count;
}

export { buildNvdaDic };

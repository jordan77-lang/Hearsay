# HearSay

**Current scope:** One class workspace for content review, class dictionary maintenance and JAWS preparation exports, shared with the Chrome extension. MathSay is paused; its source and tests remain in this repository, but its page and dedicated modules are excluded from website and extension releases. The legacy `/playground/` redirect is also excluded.

An authoring assistant that helps course authors make **course content**
pronounceable by screen readers — **without requiring students to edit their own
screen-reader dictionaries.**

Ships as a **web app**, **Chrome extension** (side panel), and (Safari extension
planned). Chemistry was the first curriculum; the same engine supports art history,
music theory, and other classes via per-class Supabase dictionaries.

---

## Active author workflow (JAWS-first)

Open `/workspace/`. **Review content** brings document import, paste, extension page capture, AI suggestions, manual term selection and browser speech previews into one passage and review queue. **Class dictionary** provides saved-entry search, staged table editing and CSV import; **Share with students** opens the JAWS export. Both views stay mounted, so switching preserves the source, sentence, document preview, queue and drafts.

Choose a class once at the top of the workspace. **Settings** opens a side panel with project connection, class administration and the AI connection. Select source text or type a term, edit its reading in the same suggestion editor used for AI, listen, and approve. Table edits, deletions and CSV imports are also staged locally. A save bar appears at the bottom only when changes are staged; it summarizes additions, replacements and removals, and **Save** commits the combined batch with one Undo entry. Unapproved wording stays local. Shared changes are checked before save. **Refresh class checks, keep drafts** in Settings retains local wording, merges unrelated remote changes and asks about overlapping table changes; approvals must be reviewed again.

The extension offers Replace passage and Append selection in Review content, with page provenance, capture type and explicit truncation notices. It mounts the same workspace as the website. No passage-transfer buttons or separate Lab save path are used. Browser speech is an approximation, not a reproduction of JAWS in the source application.

Old `/lab/` and `/dictionary/` bookmarks redirect into the shared workspace. Existing AI review keys and dictionary drafts are retained. An otherwise empty review recovers a previous Lab passage when it fits; **Recover previous Lab work** exposes older passages (split into sections if needed), term drafts and queue entries without overwriting a different AI passage. Previous Lab data is kept in its original storage key. Website and extension storage remain separate.

When copying from Google Docs, use ordinary **Paste**. In Review content, numeric superscripts
and subscripts are preserved automatically as characters when matching clipboard
formatting is available: `5.00 × 10⁻³ M`, `H₂O`. **Use plain text from last paste**
reverts that conversion before further edits; uncheck **Preserve numeric
superscripts and subscripts on paste** to use ordinary plain text. The same source
field serves manual and AI review in the website and extension. Source documents
are not changed. Fonts, tables and
equation structure are not retained in these text fields; this is not a faithful
Google Docs/JAWS rendering. **Pull from page** still captures plain text.

If formatting is already lost, a pattern such as `5.00 × 10-3` gets a warning.
Confirm the raised digits in the original document; HearSay does not infer them
from a minus sign. Recopy with formatting, or use an explicit plain-text form
such as `5.00 × 10^(-3)`. This capture aid is not a complete equation converter.

The active export is JAWS source TSV (a preparation list, not an installer). Other screen reader export code and paused tools remain in source but are hidden from the current author workflow. Student packaging and activation validation are separate work.

## Why this exists (the core problem)

Screen readers (NVDA, JAWS, VoiceOver, Narrator) don't speak — they hand a
**string of text** to a text-to-speech (TTS) engine. By the time text reaches
the TTS, most "smart" markup is gone. So science notation breaks badly:

| Authored | Common TTS result |
|---|---|
| `H₂O` | "H", subscript dropped |
| `NaCl` | "nackle" |
| `5 mL` | "5 m l" (spelled) |
| `2 mol/L` | "2 mol slash L" |
| `25°C` | "25 c" / "25 degrees" with no unit |
| `Δ`, `→`, `⇌` | the letter name, or silence |
| `CuSO₄·5H₂O` | dot and subscripts mangled |

### What actually works in 2026 (verified)

- **There is no inline-SSML mechanism that all screen readers honor by default.**
  The W3C *Spoken Presentation in HTML* spec (`data-ssml` / multi-attribute) is
  still a Working Draft and is implemented by ~one experimental NVDA add-on — so
  it would *still* require user-side setup, which defeats the goal.
- **`aria-label` works but overrides braille**, so braille users get your
  phonetic hint instead of the real text. Use with care.
- **MathML is the real no-config win.** It's now natively supported in Chrome,
  Edge, Firefox, and Safari, and **NVDA 2026.1 ships MathCAT built in**, giving
  high-quality speech *and* braille (Nemeth/UEB) with zero user setup. SRE is the
  in-browser equivalent.

HearSay therefore optimizes within reality: it produces the most
broadly-supported markup, makes trade-offs explicit, and — crucially — lets a
**sighted author *hear*** how default TTS will render their content.

---

## Defaults to YOUR course dictionary

HearSay bundles your NVDA speech dictionary (the `.dic` from the CHEM 113
add-on) and **defaults spoken output to it**, so previews and accessible-text
fixes match exactly what students hear today ("jools", "killuh jools per mol",
"T of 2", "H two to O two", "moh lurr"). Re-bundle after editing the `.dic`:

```bash
npm run build:dict   # regenerates src/core/dictionary-data.js from the .dic
```

Important nuance: the dictionary controls **plain-text/aria-label** delivery.
**MathML** is read by NVDA's math engine (MathCAT), which largely bypasses the
speech dictionary — you gain navigation + braille but the exact words are chosen
by the reader. That's why equations offer both a MathML output and a
dictionary-worded accessible-text alternative.

## Local AI Dictionary Assistant (ASU CreateAI)

The AI integration analyzes pasted or locally extracted document text in the local
website and Chrome extension through a local helper. A shared authenticated AI
service remains a future step.

1. Copy `createai/config.example.json` to `createai/config.local.json` and enter
   your approved ASU service token in `serviceToken`. The local file is gitignored;
   never put the token in browser code or commit it. Current release builders do
   not package the `createai/` or `tools/` directories.
2. Set `baseUrl` to your token's ASU environment. Production starts with
   `https://api-main.aiml.asu.edu/v1`. Keep `model: "defaults"` to use the project's
   configured model. The model must support JSON Schema structured responses.
3. Run `npm run test:createai` to check connectivity.
4. Run `npm run serve` (restart it after updating the server code), then open
   `http://localhost:8123/workspace/`. AI analysis is enabled when the helper is
   configured; manual review stays available without AI. The server binds to loopback only.
5. Choose your class, import a document or paste text, and select **Get AI suggestions**
   (for an imported file, **Get AI suggestions for this document**). This sends all extracted/pasted text to
   ASU in one request. No shared dictionary changes occur during
   analysis. The passage, edits and decisions are saved in this browser, separately
   for each project and class. **Clear content and review** removes the local review draft.
6. Review one suggestion at a time, or choose **All suggestions**. Listen to the
   original and proposed readings, edit wording inline, then **Approve and next**,
   **Skip**, or **Review later**. Approval stages a change without saving it.
   Existing identical rules are marked **Already covered**; replacements require
   an explicit checkbox. Editing an approved term requires approving it again.
   Relevant saved readings are supplied to ASU and preserved by default. Enable
   **Suggest alternatives for terms already saved in this class** before scanning
   only when you want to reconsider them. A different conventional phrasing is
   not sufficient reason to replace an instructor's wording.
7. Review the shared additions/replacements/removals summary, then **Save changes to class dictionary**. One
   confirmation saves the batch with one Undo entry. A pre-save comparison detects
   dictionary changes since analysis; **Refresh class checks** keeps draft wording
   and asks you to review approvals against the latest dictionary. This is a
   preflight check, not an atomic database lock against simultaneous writers.
8. Listen to the same passage in the integrated preview, or open **Class dictionary**
   to maintain entries. Views share the current class and keep the passage, queue
   and drafts mounted. No passage handoff is needed.

### Import a Word document or PDF for analysis

In **Review content → Course content → Import a Word or PDF file**, choose
a `.docx` or `.pdf` file up to 100 MB. For Google Docs, download **Microsoft Word
(.docx)**; this is the preferred input. The older `.doc` format is not supported.

Extraction runs locally in the browser, including the extension. File bytes,
embedded images, drawings and page screenshots are never submitted to ASU.
**Get AI suggestions for this document** copies the complete extracted text into the shared
content field and submits it in one ASU request, with the existing disclosed class
reading/example context. Selecting a file only prepares a local preview. **Use text
without AI** loads the extraction without an AI request and works when the
helper is unavailable. The loaded text is saved in the current browser review draft;
the original file is unchanged. Images, including equations inside images, are
excluded from the extraction.

Review the text preview and omission warnings, then select **Get AI suggestions for this
document**. There is no section picker or 12,000-character splitting. HearSay's
local bound is 500,000 extracted/pasted characters; PDFs are limited to 200 pages.
The selected model must also fit the text, instructions, examples and response
within its token limits. A model input-limit error preserves the complete text
and previous review; HearSay does not silently truncate or retry just the opening
section. Analysis allows up to 300 distinct suggestions and warns when that
response limit is reached. Incomplete model responses are rejected rather than
presented as complete results. AI review can still miss terms throughout a document.

DOCX extraction represents run superscripts as `^{...}`, subscripts as `_{...}`,
headings with `#`, and table rows/cells with line breaks/tabs. Common native Word
fractions, numeric powers, roots and subscripts are linearized for review. Other
equations are explicitly marked as omitted; they are never flattened silently.
Main body text only is included: headers, footers, footnotes and comments are
excluded. This is structured text for analysis, not a full Word renderer or
verified JAWS reading. Images are excluded even when they contain an equation.

PDF support extracts selectable text only, with page labels and warnings for
empty pages. It does not infer superscripts from glyph positions, perform OCR,
or guarantee mathematical formatting, table structure or reading order. Scanned
image-only PDFs fail with an explanation instead of reporting a successful scan.
Prefer DOCX whenever it is available. PDF.js, its worker, fonts and CMaps are
bundled locally; extraction does not use a remote document conversion service.

Suggestions require exact source evidence. Unsupported proposals are counted and
discarded. Ambiguous notation and complete equations require instructor or
structural review. An analysis can miss terms. Conflict checks are advisory and
include NVDA-derived behavior; browser speech and passing checks do not verify
JAWS pronunciation. Test accepted rules in JAWS before distributing them.

Only one analysis runs at a time. Cancel stops the browser waiting; an ASU request
already submitted may still finish and consume project usage. The local API
checks same-origin requests and never returns the service token. Do not expose
this development server as a public backend; shared deployment needs user
authentication and usage controls.

### AI review in the Chrome extension

The extension uses the same inline review, batch approval, save, Undo, and
per-class browser drafts. It never contains the ASU service token.

1. Run `npm run pack:extension` and load or reload `dist/hearsay-chrome-extension`
   at `chrome://extensions`. Keep using the same folder so its unpacked ID remains
   consistent. The downloadable zip contains the same extension files.
2. Copy the extension ID from Chrome (also shown under **Settings → AI connection**).
   Add `"allowedExtensionIds": ["YOUR_EXTENSION_ID"]` to the
   existing `createai/config.local.json`, alongside the service token settings.
   Only explicitly authorized extension origins can use the local helper.
3. Start `npm run serve` on its default port 8123. In the side panel, open
   **Settings → AI connection → Check helper connection**. The extension connects to the
   fixed loopback address `http://127.0.0.1:8123`; custom ports are not supported
   by this first extension integration.
4. In **Review content**, use **Pull from page**, document import or paste. Analyze
   and review in that same view, then save from the shared header. **Class dictionary**
   maintains entries and prepares exports without remounting the content review.

Saved Supabase connection settings are reused within the extension. An authorized
extension can also obtain the local server's URL and anon key automatically;
server-only Supabase keys are excluded. Website and extension drafts and storage
are separate. Changing extension IDs does not migrate the old extension's data.

When the helper is unavailable or the extension ID is not authorized, the AI
panel explains the setup and disables analysis. Ordinary dictionary editing,
speech preview, export, page capture, and Lab remain available. Each computer
currently needs its own helper; distributing the extension does not distribute
the service token or provide a shared backend.

### Course examples for AI context

Place Word `.docx` course examples in `examples/`. `npm run serve` builds a local
text index before starting the helper. You can also run `npm run build:ai-examples`
after changing the examples. The builder reports unreadable files and continues
with valid documents; input Word files are never modified.

These are examples for learning the scanning task: what kinds of names, acronyms,
variables, units and notation to notice in course writing. They do not define a
dictionary, required vocabulary or pronunciations for new passages. For each
passage, the helper selects up to four relevant excerpts (at most 2,800 text
characters) and sends them to ASU as labeled scanning examples. This is in-context
guidance; model weights are not fine-tuned. The interface discloses this, and
**Analysis details** lists the example documents consulted. Handwritten mappings
in `tools/createai-style.mjs` demonstrate possible speech-engine wording, without
requiring every class to adopt it. Terms found only in examples cannot pass the
source validation check and are never automatically added to a dictionary.

Pronunciation reviews (including uncertain personal names and diacritics) remain
editable: enter or revise spoken wording, listen, approve, and save with the batch.
An empty AI pronunciation does not remove these controls. Complete equations and
connected structural formulas use a separate structural-review state. Old saved
review drafts are reclassified on opening, so name reviews gain the controls
without requiring another ASU scan.

Scientific notation instructions preserve exponent structure, negative exponents
and significant trailing zeros. For example, in a concentration context,
`5.00 × 10⁻³ M` can use the reusable literal entry `× 10⁻³` → "times ten to the
power of negative three", with `M` kept as its separate class entry. This avoids
separate entries for every coefficient. AI instructions prefer these reusable
phrases; existing complete-value suggestions offer **Use reusable entry** to
switch without another scan. Duplicate phrases already in the review are reused.
The literal entry covers this exponent and spelling only; it is not a universal
exponent parser or verified JAWS pattern rule. Confirm actual matching on the
original document in JAWS. No regex capture/replacement support is assumed.
The AI should not include the unit or replace an existing unit reading. Explicit
numeric powers and scientific-notation values offer editable readings and
listening controls. To save one, choose **Add a class dictionary entry for this
exact expression**, then approve and save with the batch. This applies wherever
that exact text matches in the class dictionary; it does not create a general
exponent rule or modify the source document. Missing exponent formatting and
whole equations still require structural review. Older local numeric review
drafts gain these controls without another scan. Atomic units remain separate
class pronunciation entries.

Extraction preserves Word run subscripts/superscripts with explicit script
markers. Structured Word equations and figures are marked as omitted; these
references do not establish equation accessibility or pronunciation correctness.
Deleted tracked text and external linked resources are not included. Images are
not OCR-scanned. The generated `createai/examples.local.json` is gitignored.
Neither raw examples nor their index are included in website/extension builds,
and the development server blocks direct browser access to them. The extension
uses references through its authorized local helper, without bundling documents.

## Supabase (cloud dictionary)

HearSay stores pronunciation rules in Supabase so authors can pick a **class**,
reload rules, add pronunciations, and **Rebuild combined** without redeploying
the app.

**Dictionary Builder integration (Phase 1):** The [Dictionary Builder](https://github.com/jordan77-lang/screenreader)
saves class terms to Supabase **`entries`** (`text` → pattern, `substitution` →
spoken). HearSay loads **`entries` first** when you reload a class. Legacy
**`dictionary_rules`** rows (from the in-app add form or `npm run push:dict`) merge
on top. CHEM classes (`chem113`, …) still merge on the bundled `.dic` base;
other class slugs use Supabase rows only.

**Active site pages:** [Class workspace](workspace/) · [Home](index.html). Old Dictionary and Lab links redirect into the workspace.

The retained `/playground/` source redirects to MathSay; neither route is published while paused. Connect once per browser — legacy
[external Builder](https://jordan77-lang.github.io/screenreader/dictionary-builder.html)
credentials (`screenReaderBackendUrl` / `screenReaderBackendAnonKey`) migrate to HearSay automatically.

**Who connects:** Authors click **☁ Connect** — in the top nav on any page, or
in the cloud panel on Lab and Dictionary — and enter the project URL and
**anon key** (shared privately with your team — do not commit it or publish it
in a public repo). After connect, the app lists classes and loads rules for the
selected class.

**Setup (one time, your team project):**

1. Copy `supabase/config.example.json` → `supabase/config.local.json` and fill in
   project URL and anon key (local dev only; gitignored).
2. In the [Supabase SQL editor](https://supabase.com/dashboard), run:
   - **`supabase/setup-dictionary-rules.sql`** if the project already has
     `public.classes` (common for HearSay).
   - **`supabase/schema.sql`** for a fresh project using `courses` / `course_id`.
3. Add your **service role key** to `config.local.json` for CLI tools only.
   Never put the service role key in the browser or extension.
4. Seed rules from the bundled dictionary:

```bash
npm run push:dict
```

**Day-to-day:**

| Command | What it does |
|---|---|
| `npm run push:dict` | Upload `.dic` → Supabase (service role) |
| `npm run pull:dict` | Download Supabase → `.dic` + rebuild bundled JS |
| `npm run sync:dict` | Rebuild combined `all` dictionary (service role) |
| `npm run serve` | Local dev at `http://localhost:8123/` |

**Local dev:** The local server reads `supabase/config.local.json` and provides
only URL + anon key through a same-origin local endpoint; the private file and
service role key are never served. Restart the server after updating it. Loaded
connection details are remembered in this browser. Public deployment config is
resolved consistently from Home, Lab and Dictionary. Once saved, the button reads
**Connection settings**, and **Done** closes settings without reconnecting.
Storage is separate for each browser profile and origin: use one consistent
address (for example, `http://localhost:8123/`). Private browsing, cleared site
data, another port, `127.0.0.1`, and the published site have separate storage.
The **Chrome extension zip** does not
include that file — extension users use **☁ Connect** (credentials in
`localStorage`).

**Row Level Security (team authoring):** Policies in the SQL files allow the
**anon** role to read and write all `dictionary_rules` rows, including
`class_slug` / `course_id` **`all`**, so **Rebuild combined** works from the
browser. This assumes the anon key is **team-private**, not embedded in a public
site. Stricter policies (writes on class rows only, no browser rebuild of
`all`) are documented in comments in `setup-dictionary-rules.sql`.

**Bundled dictionary today:** The app still ships a large offline `.dic` (CHEM
curriculum) and merges class rules on top when Supabase loads. A future
**sign-in-first** mode (no class dictionary until ☁ Connect; demo sample only
on the load screen) is planned for multi-department use — see *Roadmap* below.

## Paused: MathSay (Canvas equations)

Retained for future work and excluded from current releases. MathSay builds LaTeX equations with live MathML preview, dictionary vs factory speech columns, and Canvas export (stacked MathML, dual notation for word fractions, accessible text). Use for quiz stems and fractions — not whole equations in the dictionary CSV.

## What the tool does

1. **Detects** risky chemistry tokens with source offsets: formulae (incl.
   parentheses, charges, hydrates, unicode subscripts), units, compound units,
   state symbols `(aq)`, Greek letters, and reaction operators.
2. **Explains** the risk and the intended pronunciation.
3. **Proposes copy-paste fixes**, best-first, each with support notes + caveats:
   - **MathML** (best; speech + braille, no user setup)
   - **Visually-hidden spoken text** (keeps the visual; works everywhere incl. braille)
   - **`aria-label`** (widely supported, but warns about the braille trade-off)
4. **Hear original vs. fixed** using the Web Speech API, so authors can verify.

---

## Project layout

```
manifest.json            Chrome extension (MV3) manifest
mathsay/                 Paused MathSay source (excluded from releases)
playground/              Paused legacy redirect (excluded from releases)
lab/                     Screen Reader Lab (raw vs dictionary speech)
dictionary/              Class dictionary editor + NVDA export
src/                     App logic (core engine, UI, Supabase, lab, dictionary)
tools/                   build-dictionary, build-pages, pack-extension, serve, Supabase CLI
test/                    Node test suite; test/fixtures/ sample Supabase export CSV
docs/chatgpt-dictionary-project/  Instructor ChatGPT project files (optional)
```

The engine has **no npm dependencies** and runs unchanged in the extension,
Lab, Dictionary, extension side panel, and Node tests.

`npm run build:doc` regenerates `test-document/index.html` locally (gitignored)
for manual screen-reader listening checks.

---

## Deploy to GitHub Pages

Live site (after first deploy): **https://jordan77-lang.github.io/Hearsay/**

### One-time GitHub setup

1. Push this repo to [github.com/jordan77-lang/Hearsay](https://github.com/jordan77-lang/Hearsay).
2. In the repo: **Settings → Pages → Build and deployment → Source** → **GitHub Actions**.
3. *(Optional)* To bake Supabase URL + anon key into the deployed site (only if
   you accept exposing the anon key on a public URL — usually **skip this** when
   the key is team-private and authors use **☁ Connect** instead):
   - **Settings → Secrets and variables → Actions**
   - Variable `HEARSAY_SUPABASE_URL`, secret `HEARSAY_SUPABASE_ANON_KEY`
   - Optional `HEARSAY_COURSE_ID` (default class slug)

Every push to `main` runs tests, builds the site (`npm run build:pages`), packs the Chrome extension zip, and deploys.

### Build locally

```bash
npm run build:pages
# output in _site/ — same folder GitHub Pages publishes
```

---

## Try it

**Live (GitHub Pages):** https://jordan77-lang.github.io/Hearsay/

### Local dev

```bash
npm run serve
```

Open `http://localhost:8123/` for the landing page or `/workspace/` for the shared class workspace. Old `/lab/` and `/dictionary/` links redirect there. Retained MathSay source is available locally for future work, but is not part of the active release.

### Web app

Use **Review content** to import, analyze and preview speech, and **Class dictionary** to maintain entries and prepare JAWS source.

### Chrome extension

Requires **Chrome 116+** (Manifest V3 side panel).

Download **`download/hearsay-chrome-extension.zip`** from the site (or run `npm run pack:extension` locally).

1. Extract the zip to a folder you will keep (must contain `manifest.json` at the top level).
2. Open `chrome://extensions` → **Developer mode** → **Load unpacked** → select that extracted folder (not the .zip).
3. Pin HearSay and open the **side panel** from the toolbar icon.
4. **☁ Connect** once (Supabase URL + anon key — stored in the extension).
5. Side panel: the same **Review content** and **Class dictionary** workspace as the website. One class selector, passage, review queue, combined save and Undo are shared across views.

**Pull from page** reads the course tab you have open (not the welcome tab). Click that page first, select text, then Pull.

After you change extension files locally, run `npm run pack:extension` again and use **Load unpacked** on the same extracted folder (or re-extract the new zip).

### Tests

```bash
npm test
```

---

## Honest limitations

- The Web Speech preview approximates default TTS; it is **not** a substitute for
  testing with a real screen reader (NVDA + a few voices is the gold standard).
- "Pull selection from page" reads text only; it does not yet write fixes back
  into web editors. Inline auto-fixing of CMS/editor DOM is the next milestone.
- Per-class dictionaries via Supabase; bundled CHEM dictionary still loads offline today.
- Sign-in-first + demo-only mode (no full dictionary until ☁ Connect) not implemented yet.
- Google Docs/Workspace is intentionally **not** the first surface: Docs largely
  prevents injecting ARIA/MathML, so it's better as a *flagging* surface later.

---

## Roadmap

- **Sign-in-first dictionary:** Require ☁ Connect before loading class rules;
  list classes from Supabase after connect; optional demo sample on first visit
  without shipping the full CHEM bundled dictionary to other departments.
- **Multi-tenant docs:** Step-by-step Supabase setup for other teams (separate
  projects) once sign-in-first behavior is implemented and verified.
- Inline apply-fix into common web editors (contenteditable, Quill, ProseMirror).
- Math support via Speech Rule Engine + MathML.
- Optional `data-ssml` emission for platforms the author controls.
- Configurable lexicon / institution glossaries.
- Real-screen-reader test matrix (NVDA, JAWS, VoiceOver) for each fix type.

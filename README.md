# HearSay

An authoring assistant that helps course authors make **Canvas content**
pronounceable by screen readers — **without requiring students to edit their own
screen-reader dictionaries.**

Ships as a **web app**, **Chrome extension** (side panel), and (Safari extension
planned). Chemistry was the first curriculum; the same engine supports art history,
music theory, and other classes via per-class Supabase dictionaries.

---

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

**Site pages:** [Canvas Translate](playground/) (paste, hear, copy Canvas HTML), [Dictionary](dictionary/)
(embedded Builder: edit `entries`, import CSV, Advanced NVDA/JAWS/VoiceOver exports),
and landing [index.html](index.html). Connect once per browser — legacy
[external Builder](https://jordan77-lang.github.io/screenreader/dictionary-builder.html)
credentials (`screenReaderBackendUrl` / `screenReaderBackendAnonKey`) migrate to HearSay automatically.

**Who connects:** Authors click **☁ Connect** and enter the project URL and
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
| `npm run serve` | Local dev at `http://localhost:8123/` (Canvas Translate at `/playground/`) |

**Local dev:** `supabase/config.local.json` can auto-load URL + anon key so you
do not have to paste them every time. The **Chrome extension zip** does not
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

## Equation typer

A LaTeX-style equation field (`_` subscript, `^` superscript, `\frac{a}{b}`,
`\Delta`, `\times`, `\div`, `\to`, …) with live MathML rendering, a spoken
preview run through your dictionary, and one-click copy of the MathML (for the
Canvas `</>` editor) or the accessible-text version.

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
src/
  core/
    lexicon.js           Chemistry data: elements, units, symbols, states
    formula.js           Chemical-formula parser + spoken/MathML renderers
    detect.js            Offset-aware detection engine (non-overlapping)
    transform.js         Findings -> suggestions, analyze(), spoken-text builder
  speech.js              Web Speech API wrapper (before/after preview)
  ui.js / ui.css         Shared UI (used by side panel + playground)
  background.js          Opens the side panel on toolbar click
  sidepanel.html/.js     Extension side panel (+ "pull selection from page")
playground/index.html    Standalone demo (no install needed)
test/engine.test.mjs     Node tests for the engine
```

The engine has **no dependencies** and runs unchanged in the extension, the
playground, and Node.

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

Open `http://localhost:8123/` for the landing page, or `http://localhost:8123/playground/` for Canvas Translate.

### Web app

Open **Canvas Translate** from the landing page, or `/playground/`. Click **Load sample** and **Analyze**.

### Chrome extension

1. Download `dist/hearsay-chrome-extension.zip` from the landing page (or run `npm run pack:extension`).
2. Extract the zip, then visit `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the extracted folder.
4. Click the HearSay toolbar icon; use **Pull selection from page** in Canvas.

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

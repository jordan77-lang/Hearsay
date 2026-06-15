# ChatGPT project: Class pronunciation dictionary builder

Help instructors produce **HearSay-importable CSV** files (atomic tokens only) via a ChatGPT Project.

## Files

| File | Use |
|------|-----|
| `INSTRUCTIONS-FOR-CHATGPT-PROJECT.txt` | Paste into ChatGPT **Instructions** (under 8,000 characters) |
| `HearSay-Dictionary-Assistant-Guide.html` | **Full detail** — Print → Save as PDF → attach as project knowledge (required) |
| `SUBSCRIPT-RULES.md` | Calorimetry/subscript labs — attach to project knowledge (recommended) |
| `hearsay-dictionary-template.csv` | Example template (same columns as HearSay **Template CSV** button) |
| `example-output-snippet.csv` | Token-only sample rows (recommended) |
| `PROJECT-FILES-GUIDE.md` | What **you** upload to the project vs what **instructors** attach per course |

## Quick setup

1. Create a ChatGPT **Project**.
2. **Print the HTML guide to PDF** and upload it under **Project files / Knowledge** (required).
3. Upload `SUBSCRIPT-RULES.md`, `hearsay-dictionary-template.csv`, and `example-output-snippet.csv` to project knowledge.
4. Paste `INSTRUCTIONS-FOR-CHATGPT-PROJECT.txt` into **Instructions** only — not as a project file.
5. Share the project link with instructors.

## Instructor workflow (PDF → HearSay)

1. Instructor **attaches course PDF** in chat (syllabus, lab manual, slides export).
2. ChatGPT scans for **atomic tokens** (units, variables, acronyms, formulas) — not whole equations.
3. Draft list → pronunciation choices → **confirmed CSV**.
4. HearSay → [Dictionary](https://jordan77-lang.github.io/Hearsay/dictionary/) → **Import** → **Save class** → test in [Lab](https://jordan77-lang.github.io/Hearsay/lab/) → **Download for students** (NVDA add-on).
5. Canvas equations → [MathSay](https://jordan77-lang.github.io/Hearsay/mathsay/) (not dictionary equation rows).

Required for student install: **NVDA 2026.1+** (Windows).

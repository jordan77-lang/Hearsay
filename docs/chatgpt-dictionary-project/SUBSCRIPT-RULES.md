# Subscript rules for HearSay dictionary CSV (ChatGPT project)

Use this when scanning chemistry/physics labs (calorimetry, thermochemistry, kinetics) where variables use **digit subscripts** (T₂), **word subscripts** (msolution, qcalorimeter), or **formula subscripts** (cH₂O).

One **Spoken** column works for **NVDA, JAWS, and VoiceOver** students. What differs is what each screen reader sees **before** the dictionary runs — so **Pattern** must match the **exact visible text** in the course PDF, Canvas page, or Google Doc (including plain vs unicode variants).

---

## 1. What unmodified screen readers do (why dictionary rows matter)

| Visible text | NVDA (factory) | JAWS (factory) | Without dictionary, students hear… |
|---|---|---|---|
| `T₂` or `T2` | “T subscript 2” or flat “T2” | “T 2” or flat “T2” | **Not** “T of 2” |
| `ΔT` | “delta T” (Greek via voice) | “delta T” | Usually OK |
| `msolution` | one glued word / mush | one glued word | **Not** “m sub solution” |
| `qcalorimeter` | glued / misread | glued / misread | **Not** “q of calorimeter” |
| `cH₂O` | “c H subscript 2 O”-ish | “c H 2 O” | **Not** “c of H two O” |
| `Ccalorimeter` | “C calorimeter” | similar | **Not** “capital C of calorimeter” |
| `(J/g°C)` | slash, degrees, silent parens (NVDA) | may name parens (JAWS) | Units not expanded |

**Dictionary Spoken** is the instructor’s target pronunciation for **all** export formats (NVDA add-on, JAWS TSV/SBAK, Apple VoiceOver CSV). HearSay converts patterns for JAWS automatically (glued text like `msolution`, not `m_{solution}`).

---

## 2. How authors should format subscripts in course materials

Goal: **what students copy from Canvas/Docs is what Pattern matches.**

### Digit subscripts (temperature, index variables)

- **Preferred in Word/Canvas:** unicode subscript digits — `T₂`, `T₁` (not “T2” in subscript styling unless that is all you have).
- **Also common in plain export:** `T2`, `T1` — **add a separate CSV row for each form** that appears in the PDF.
- **Do not** subscript spreadsheet cells: `B4`, `B5`, `B6`, `B7` stay plain.

### Word subscripts (mass, heat, specific heat, heat capacity)

Curriculum usually shows **glued plain text** (no visible subscript glyph):

| Meaning | Author in document | Avoid |
|---|---|---|
| mass of solution | `msolution` | `m solution` (space breaks matching) |
| mass of peroxide solution | `mperoxidesolution` or subscript word in editor | `mperoxide solution` with a space mid-variable |
| heat to calorimeter | `qcalorimeter` | `q calorimeter` |
| heat to solution | `qsolution` | |
| reaction heat | `qreaction` | |
| specific heat of solution | `csolution` | |
| heat capacity of calorimeter | `Ccalorimeter` (capital C) | `c calorimeter` (wrong variable) |

If the LMS subscript editor is used, exported text may look like `qcalorimeter` anyway — **copy from the live student view** for Pattern.

### Formula subscripts inside a variable (`cH₂O`, `cH₂`)

- Use **unicode** in formulas: `H₂O`, `H₂` (subscript 2), not plain `H2O` in subscript positions when possible.
- Pattern examples: `cH₂O`, `cH₂`, and plain `cH2O` if the PDF only has ASCII.

### Invisible characters (Google Docs / Canvas paste)

Docs often insert **zero-width spaces** (U+200B, U+180E) around subscripts and table cells. They break dictionary matching.

- When building Pattern from pasted text, **strip invisible characters** or ask the instructor for a clean re-paste.
- Flag in Note: `invisible chars removed from Pattern`.

### Long equations — do not default to dictionary rows

**Default: no whole-equation rows.** HearSay composes speech from atomic tokens (`qcalorimeter`, `Ccalorimeter`, `ΔT`, `×`, etc.). Instructors test full lines in **Screen Reader Lab** after importing atomic rows.

| Do | Don't |
|---|---|
| `qcalorimeter` → `q of calorimeter` | `qcalorimeter = Ccalorimeter × ΔT` → (whole line) |
| `ΔT` → `delta T` | `ΔT = T2 − T1` → (whole line) |
| `g` → `grams` | `200 g` → `two hundred grams` (use unit row only) |

**Canvas / quizzes:** stacked fractions and equation layout → **MathSay** (https://jordan77-lang.github.io/Hearsay/mathsay/), not CSV equation patterns.

**Rare exception:** one full-line row **only if** instructor confirms Screen Reader Lab still misreads after atomic rows are loaded, and the Pattern matches **verbatim** (complete, not truncated). Never add equation rows from PDF extract automatically.

---

## 3. Spoken conventions (use in every CSV row)

Use **lowercase words separated by spaces**. Match HearSay chemistry defaults:

| Variable type | Pattern examples | Spoken |
|---|---|---|
| Temperature (digit subscript) | `T2`, `T₂`, `T1`, `T₁` | `T of 2`, `T of 1` |
| Temperature change | `ΔT` | `delta T` |
| Heat transfer (q) | `qcalorimeter`, `qsolution`, `qreaction`, `q_calorimeter` | `q of calorimeter`, `q of solution`, `q of reaction` |
| Mass (m) | `msolution`, `mperoxidesolution`, `m_solution` | `m sub solution`, `m sub peroxide solution` |
| Specific heat (c) | `csolution`, `c_solution` | `c sub solution` |
| Specific heat with formula subscript | `cH₂O`, `cH₂`, `cH2O` | `c of H two O`, `c of H two` |
| Heat capacity (capital C) | `Ccalorimeter`, `C_calorimeter` | `capital C of calorimeter` |
| Compound unit | `J/g°C`, `J/°C` | `jools per gram degree Celsius`, `jools per degree Celsius` |
| Chemical formulas in prose | `H₂O`, `H₂O₂`, `%H₂O₂` | `H two O`, `H two O two`, `percent H two O two` |

**Naming rules:**

- **`q` variables** → always **`q of …`** (not “q sub”).
- **`m` and `c` word subscripts** → **`m sub …`** / **`c sub …`**.
- **`C` (capital)** heat capacity → **`capital C of …`**.
- **`c` + formula** (e.g. cH₂O) → **`c of H two O`** (expand formula counts).
- **Greek** → **`delta T`**, not “ΔT” as one letter.

**Ignore case:** `Yes` for most rows; **`No`** for `Ccalorimeter` vs `ccalorimeter` if both could appear (capital C matters).

---

## 4. Variant checklist (add a row for each that appears)

When scanning a calorimetry lab, check **every form** below against the PDF:

**Temperature:** `T2`, `T1`, `T₂`, `T₁`, `ΔT`, `ΔT = T2 − T1`, `ΔT = T₂ − T₁`

**Heat / mass / capacity:** `qcalorimeter`, `qsolution`, `qreaction`, `msolution`, `mperoxidesolution`, `csolution`, `Ccalorimeter`, `cH₂O`, `cH₂`

**Underscore forms (if PDF has them):** `q_calorimeter`, `q_solution`, `m_solution`, `c_solution`, `C_calorimeter`

**Units / formulas:** `J/g°C`, `J/°C`, `4.18 J/g°C`, `H₂O`, `H₂`, `H₂O₂`, `%H₂O₂`

**Phrases (optional, verbatim only):** Effective heat capacity equation — **omit unless Lab proves atomic rows fail**; prefer token rows only.

**Do not add:** `50 g`, `200 g`, `100 kJ` quantity rows — use `g`, `kJ` unit rows instead.

---

## 5. ChatGPT workflow for subscript-heavy PDFs

1. Extract text; **list invisible-character warnings** if paste looks broken.
2. Group findings: **digit subscripts**, **glued word variables**, **formula subscripts**, **units**.
3. Draft rows using section 3 Spoken rules — **never invent** patterns not in the document (label “suggested — confirm”).
4. For each variable, ask: “Does your PDF show `T2` or `T₂`? Glued `msolution` or spaced `m solution`?” if ambiguous.
5. Output CSV only after instructor confirms; include **Notepad test list** (5–10 **tokens**, not whole equations).
6. **Do not** add whole-equation or `NNN g` quantity rows unless instructor confirms Lab failure.

---

## 6. Example CSV rows (Peroxide / calorimetry lab)

```csv
Pattern,Spoken,Note,Ignore case
ΔT,delta T,temperature change,Yes
T2,T of 2,plain final temperature,Yes
T1,T of 1,plain initial temperature,Yes
T₂,T of 2,unicode final temperature,Yes
T₁,T of 1,unicode initial temperature,Yes
qcalorimeter,q of calorimeter,heat absorbed by calorimeter,Yes
qsolution,q of solution,heat absorbed by solution,Yes
qreaction,q of reaction,reaction energy,Yes
msolution,m sub solution,mass of solution,Yes
mperoxidesolution,m sub peroxide solution,mass of peroxide solution,Yes
csolution,c sub solution,specific heat of solution,Yes
Ccalorimeter,capital C of calorimeter,heat capacity of calorimeter,No
cH₂O,c of H two O,specific heat variable for water,Yes
cH₂,c of H two,specific heat variable for hydrogen,Yes
J/g°C,jools per gram degree Celsius,specific heat unit,Yes
J/°C,jools per degree Celsius,heat capacity unit,Yes
H₂O,H two O,water formula,Yes
H₂O₂,H two O two,hydrogen peroxide,Yes
%H₂O₂,percent H two O two,mass percent,Yes
```

---

## 7. Screen Reader Lab (instructors)

After CSV import, paste lab paragraphs into **Screen Reader Lab** (https://jordan77-lang.github.io/Hearsay/lab/). If full equations read correctly in the **green (dictionary) column** with token rows only, you do **not** need whole-equation CSV rows. For Canvas equation HTML, use **MathSay** (https://jordan77-lang.github.io/Hearsay/mathsay/).

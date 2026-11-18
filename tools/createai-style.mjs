// Selected instructor-supplied mappings illustrate speech-engine replacement style.
// They are examples, not a seed dictionary and not proof of JAWS pronunciation.
export const INSTRUCTOR_PRONUNCIATION_STYLE = `
Use these instructor-provided examples to understand the desired output style:
${JSON.stringify([
  ["ΔG", "delta G"],
  ["q_{calorimeter}", "q of calorimeter"],
  ["qsolution", "q of solution"],
  ["T₂", "T of 2"],
  ["J/g°C", "jools per gram degree Celsius"],
  ["kJ/mol", "killuh jools per mol"],
  ["M", "moh lurr"],
  ["ITE", "I T E"],
  ["DI water", "D I water"],
  ["H₂O₂", "H two O two"],
  ["NaCl", "sodium chloride"],
  ["O–H", "O single bond H"],
  ["O=O", "O double bond O"],
  ["N≡N", "N triple bond N"],
  ["stoichiometric", "stoy key oh metric"],
  ["microspatula", "micro spatula"],
])}
These examples do not authorize adding absent terms. Only suggest terms with exact
evidence in the submitted source. Preserve the exact source form, including braces,
subscripts, spaces and bond characters. Include separate notation variants only
when each occurs in the source; do not generate a speculative family of spellings.
Uppercase letters separated by spaces are intentional letter names, not stress marks.
English sound-alike spellings such as jools are acceptable speech-engine drafts.
Do not replace every formula with a compound name: letter-and-number readings may
be the teaching goal. Use source context to propose a reading and flag ambiguity.
M means molar only with supporting concentration context, never for every M.
Read an isolated two-element bond token such as O=O as a bond only in chemical
context; distinguish it from an equation or prose punctuation. Do not expand a
bare equals sign globally into double bond. Keep short subscripted variable tokens
eligible for a dictionary rule; they are not complete equations.
Instructor dictionaries may also contain one-off repairs for flattened fractions
and exact equations. Do not infer a missing division bar from glued words or
numbers. Flag lost layout and complete equations for review, even if a manual
dictionary happens to contain a similar repair. Never change or delete saved rules.
`;

// Cross-subject guidance (astronomy, statistics and data analysis, economics,
// chemistry). The examples are generic illustrations of the same style, not
// taken from any course, not instructor-provided and not a seed dictionary.
export const CROSS_SUBJECT_GUIDANCE = `
Courses are not only chemistry: expect astronomy, statistics and data analysis,
economics and other subjects. Apply the same style to each.

Illustrations of the style in other subjects (not instructor-provided, not a
dictionary; suggest one only when that exact text occurs in the source):
${JSON.stringify([
  ["v_{max}", "v of max"],
  ["v_{0}", "v of 0"],
  ["km/s", "kilometers per second"],
  ["g/cm³", "grams per cubic centimeter"],
  ["20^{o}", "20 degrees"],
  ["e.g.", "for example"],
  ["i.e.", "that is"],
])}

Skip authoring scaffolding. Course documents contain notes for course builders,
not students: all-capital production labels (DELETE BEFORE PUBLISHING, ANSWER
KEY, TODO, VERIFY), style-guide lines (Heading 1, 12 pt font), placeholders such
as XX, instructor-only labels, learning-standard codes (Common Core or NGSS codes),
course codes (BIO 101, CHEM200) and learning-objective or question IDs (LO1, Q3).
Do not suggest entries for these.
Capitalized words used for emphasis in instructions (HERE, NOT) are not terms.

Formatting written with markers. A raised lowercase o after a number (20^{o}) is a
degree sign: read it as degrees. A raised double quote or double prime after a
number (1^{"}, 10″) means arcseconds in astronomy and inches elsewhere; a single
prime means arcminutes or feet. Decide from context, and use action review when the
subject is unclear. Word subscripts on a variable (v_{max}, v_{0}) follow the
T of 2 style: letter, "of", then the subscript.

Units. Read compound units in words: a slash is "per", a squared or cubed unit is
"square" or "cubic" (km/s kilometers per second, g/cm³ grams per cubic
centimeter). µ is the prefix micro. Keep each unit a separate atomic entry, apart
from the number in front of it. Suggest a unit only when the default reading would
be wrong or unclear (km slash s, g slash cm 3); familiar whole words need no entry.

Text students must type exactly. Spreadsheet formulas and functions
(=AVERAGE(B2:B20)), cell references (B2, C10), code, file names and web addresses
must keep every character audible. Never propose a dictionary entry that changes
how their characters are read; at most add a review item explaining the issue.

Number ranges written with a hyphen or dash (10-20, 3-5) can be read as "dash"
or "minus". Do not create one entry per range. Add a single review item suggesting
the source be written as "10 to 20", and note that subtraction must not change.

Abbreviations. Short capital-letter abbreviations (MC, ATC, AVC, TC, MR, TR, AU)
are usually spelled out letter by letter. Suggest a letter-spaced reading (M R) only
when the abbreviation could be read as a word or title (MR as mister)
or the reading is unclear; expanding to the full term (marginal cost) is an
instructor choice to mention in reason, not a default. Abbreviations with periods
(e.g., i.e.) may be read letter by letter with "dot": suggest the spoken phrase.
Invented company or product names written in camel case (BrightLab) may run
together: suggest a listening check with a spaced reading (Bright Lab).

Ordinary words, numbers, percentages, money amounts and common symbols that a
screen reader already reads sensibly (20 percent, delta, divided by, times) need no
entry. Prefer fewer, reusable entries over many one-off ones.
`;

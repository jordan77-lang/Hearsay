// Supabase dictionary CRUD: per-class rules + merged "all" course.

import { createSupabaseClient, loadConfigFromPaths } from "./client.js";
import {
  addonEntriesToRows,
  entriesToRuleRows,
  mergeRuleRowsByPattern,
  normalizeRuleRow,
  normalizeRuleRows,
  rowClassId,
  rowsToDic,
  inferRuleType,
  ruleRowsToEntryRows,
} from "./dictionary-format.js";
import {
  loadBareClassDictionary,
  loadBundledChemistryDictionary,
  loadClassDictionary,
  loadDictionary,
  ruleCount,
} from "../core/dictionary.js";
import { notifySupabaseConnectionChanged } from "../dictionary-sync.js";

export const COMBINED_COURSE_ID = "all";

/** Built-in bundled chemistry sample — works offline; not stored in Supabase. */
export const DEMO_DICTIONARY_ID = "demo";
export const DEMO_DICTIONARY_LABEL = "Demo dictionary (sample chemistry)";

export function isDemoDictionaryId(classSlug) {
  return String(classSlug ?? "") === DEMO_DICTIONARY_ID;
}

/** True for real Supabase classes (not demo, not combined "all"). */
export function isDeletableClassSlug(classSlug) {
  const slug = String(classSlug ?? "").trim();
  return Boolean(slug && slug !== COMBINED_COURSE_ID && !isDemoDictionaryId(slug));
}

/** True only for the offline demo dictionary — real classes use their own rows only. */
export function includesBundledBaseByDefault(classSlug) {
  return shouldMergeBundledBase(classSlug);
}

export function shouldMergeBundledBase(classSlug) {
  return isDemoDictionaryId(classSlug);
}

/** @deprecated alias — bundled merge is demo-only */
export function shouldMergeBundledForClass(classSlug, _classRuleCount = 0) {
  return shouldMergeBundledBase(classSlug);
}

const ENTRY_COLUMNS = "class_slug,text,substitution,app,ignore_case,note,position";

const RULE_COLUMNS =
  "class_slug,sort_order,pattern,replacement,case_sensitive,rule_type,comment,updated_at";

const DEFAULT_COURSES = [
  {
    id: COMBINED_COURSE_ID,
    label: "All classes (combined)",
    description: "Union of every class dictionary.",
    sort_order: 0,
  },
  {
    id: "chem113",
    label: "CHEM 113",
    description: "General chemistry pronunciation dictionary.",
    sort_order: 1,
  },
];

const DEFAULT_ADDON = (slug, label) => ({
  author: "Accessibility Team",
  addonId: `${slug}Dictionary`,
  summary: `${label} Pronunciation Dictionary`,
  version: "1.0.0",
  dictionaryName: slug,
  dictionaryDisplayName: `${label} Pronunciations`,
  nvdaRegexEntries: [],
});

function isMissingTableError(err) {
  return String(err?.message ?? err).includes("PGRST205");
}

function isMissingColumnError(err) {
  const msg = String(err?.message ?? err);
  return msg.includes("column") && (msg.includes("class_slug") || msg.includes("course_id"));
}

/** Dedupe by pattern; first course in courseOrder wins. */
export function mergeRulesForCombined(rows, courseOrder) {
  const seen = new Set();
  const merged = [];
  let sortOrder = 0;
  for (const courseId of courseOrder) {
    if (courseId === COMBINED_COURSE_ID) continue;
    const courseRows = rows
      .filter((r) => rowClassId(r) === courseId)
      .sort((a, b) => a.sort_order - b.sort_order);
    for (const row of courseRows) {
      if (seen.has(row.pattern)) continue;
      seen.add(row.pattern);
      merged.push(
        normalizeRuleRow({
          class_slug: COMBINED_COURSE_ID,
          sort_order: sortOrder++,
          pattern: row.pattern,
          replacement: row.replacement,
          case_sensitive: row.case_sensitive,
          rule_type: row.rule_type,
          comment: row.comment ?? null,
        }),
      );
    }
  }
  return merged;
}

export function guessRuleType(pattern) {
  return inferRuleType(pattern);
}

export function createDictionaryApi(config) {
  const client = createSupabaseClient(config);
  let rulesTableState = null;
  let entriesTableState = null;

  async function probeEntriesTable() {
    if (entriesTableState) return entriesTableState;
    try {
      await client.rest("entries?limit=0&select=class_slug");
      entriesTableState = { exists: true };
    } catch (err) {
      if (isMissingTableError(err)) entriesTableState = { exists: false };
      else throw err;
    }
    return entriesTableState;
  }

  async function fetchEntriesForClass(classSlug) {
    const table = await probeEntriesTable();
    if (!table.exists) return null;
    try {
      const rows = await client.rest(
        `entries?class_slug=eq.${encodeURIComponent(classSlug)}&order=position.asc&select=${ENTRY_COLUMNS}`,
      );
      const rules = entriesToRuleRows(rows);
      return rules.length ? rules : null;
    } catch (err) {
      if (isMissingTableError(err)) {
        entriesTableState = { exists: false };
        return null;
      }
      throw err;
    }
  }

  async function fetchAllClassEntries() {
    const table = await probeEntriesTable();
    if (!table.exists) return [];
    try {
      const rows = await client.rest(
        `entries?class_slug=neq.${encodeURIComponent(COMBINED_COURSE_ID)}&order=class_slug.asc,position.asc&select=${ENTRY_COLUMNS}`,
      );
      return entriesToRuleRows(rows);
    } catch (err) {
      if (isMissingTableError(err)) {
        entriesTableState = { exists: false };
        return [];
      }
      throw err;
    }
  }

  async function probeRulesTable() {
    if (rulesTableState) return rulesTableState;
    try {
      await client.rest("dictionary_rules?limit=0&select=class_slug");
      rulesTableState = { exists: true, column: "class_slug" };
    } catch (err) {
      if (isMissingTableError(err)) {
        rulesTableState = { exists: false };
      } else {
        try {
          await client.rest("dictionary_rules?limit=0&select=course_id");
          rulesTableState = { exists: true, column: "course_id" };
        } catch (err2) {
          if (isMissingTableError(err2)) rulesTableState = { exists: false };
          else throw err2;
        }
      }
    }
    return rulesTableState;
  }

  function ruleFilterColumn() {
    return rulesTableState?.column === "course_id" ? "course_id" : "class_slug";
  }

  function ruleFields(row) {
    return {
      sort_order: row.sort_order,
      pattern: row.pattern,
      replacement: row.replacement,
      case_sensitive: row.case_sensitive,
      rule_type: row.rule_type,
      comment: row.comment ?? null,
    };
  }

  function ruleBody(classSlug, fields) {
    const col = ruleFilterColumn();
    return { [col]: classSlug, ...fields };
  }

  async function queryRulesTable(filterQuery, select = RULE_COLUMNS) {
    const table = await probeRulesTable();
    if (!table.exists) return null;

    try {
      const rows = await client.rest(
        `dictionary_rules?${filterQuery}&order=sort_order.asc&select=${select}`,
      );
      return normalizeRuleRows(rows);
    } catch (err) {
      if (isMissingColumnError(err) && select.includes("class_slug")) {
        const legacySelect = select.replace("class_slug", "course_id");
        const legacyFilter = filterQuery.replace(/class_slug/g, "course_id");
        const rows = await client.rest(
          `dictionary_rules?${legacyFilter}&order=sort_order.asc&select=${legacySelect}`,
        );
        rulesTableState = { exists: true, column: "course_id" };
        return normalizeRuleRows(rows);
      }
      if (isMissingTableError(err)) {
        rulesTableState = { exists: false };
        return null;
      }
      throw err;
    }
  }

  async function fetchClassRecord(slug) {
    try {
      const rows = await client.rest(
        `classes?slug=eq.${encodeURIComponent(slug)}&select=slug,label,addon_defaults`,
      );
      return rows?.[0] ?? null;
    } catch {
      return null;
    }
  }

  async function fetchAddonRules(classSlug) {
    const cls = await fetchClassRecord(classSlug);
    if (!cls?.addon_defaults) return [];
    return addonEntriesToRows(classSlug, cls.addon_defaults);
  }

  async function listCourses() {
    try {
      const rows = await client.rest("classes?order=sort_order.asc&select=slug,label,sort_order");
      if (rows?.length) {
        const mapped = rows
          .filter((r) => r.slug !== COMBINED_COURSE_ID)
          .map((r) => ({
            id: r.slug,
            label: r.label,
            sort_order: r.sort_order,
          }));
        return [
          {
            id: COMBINED_COURSE_ID,
            label: "All classes (combined)",
            sort_order: 0,
          },
          ...mapped,
        ];
      }
    } catch {
      // fall through to legacy courses table
    }

    try {
      const rows = await client.rest("courses?order=sort_order.asc&select=id,label,description,sort_order");
      if (rows?.length) return rows.map((r) => ({ ...r, id: r.id }));
    } catch {
      // table may not exist
    }

    return DEFAULT_COURSES;
  }

  async function fetchRules(classSlug) {
    const result = await fetchRulesWithMeta(classSlug);
    return result.rows;
  }

  async function fetchRulesWithMeta(classSlug) {
    await probeRulesTable();
    await probeEntriesTable();

    if (classSlug === COMBINED_COURSE_ID) {
      const allEntryRows = await fetchAllClassEntries();
      if (allEntryRows.length) {
        const courses = await listCourses();
        return {
          rows: mergeRulesForCombined(allEntryRows, courses.map((c) => c.id)),
          source: "supabase-entries-merged",
          rulesTableMissing: false,
          fromEntries: true,
        };
      }

      const combinedRows = await queryRulesTable(
        `${ruleFilterColumn()}=eq.${encodeURIComponent(COMBINED_COURSE_ID)}`,
      );
      if (combinedRows?.length) {
        return { rows: combinedRows, source: "supabase", rulesTableMissing: false };
      }

      const table = rulesTableState;
      if (table.exists) {
        const classRows = await fetchAllClassRules();
        if (classRows.length) {
          const courses = await listCourses();
          return {
            rows: mergeRulesForCombined(classRows, courses.map((c) => c.id)),
            source: "supabase-merged",
            rulesTableMissing: false,
          };
        }
      }

      const courses = await listCourses();
      const mergedAddon = [];
      for (const course of courses) {
        if (course.id === COMBINED_COURSE_ID) continue;
        mergedAddon.push(...(await fetchAddonRules(course.id)));
      }
      if (mergedAddon.length) {
        return {
          rows: mergeRulesForCombined(mergedAddon, courses.map((c) => c.id)),
          source: "addon_defaults",
          rulesTableMissing: !table.exists,
        };
      }

      return { rows: [], source: "remote-empty", rulesTableMissing: !table.exists };
    }

    const entryRows = (await fetchEntriesForClass(classSlug)) ?? [];
    const tableRows = (await queryRulesTable(
      `${ruleFilterColumn()}=eq.${encodeURIComponent(classSlug)}`,
    )) ?? [];

    if (entryRows.length || tableRows.length) {
      const merged = mergeRuleRowsByPattern(entryRows, tableRows);
      const fromEntries = entryRows.length > 0;
      const fromRules = tableRows.length > 0;
      let source = "supabase";
      if (fromEntries && fromRules) source = "supabase-entries+rules";
      else if (fromEntries) source = "supabase-entries";
      return {
        rows: merged,
        source,
        rulesTableMissing: false,
        fromEntries: fromEntries,
      };
    }

    const addonRows = await fetchAddonRules(classSlug);
    if (addonRows.length) {
      return {
        rows: addonRows,
        source: "addon_defaults",
        rulesTableMissing: !rulesTableState.exists,
      };
    }

    return { rows: [], source: "remote-empty", rulesTableMissing: !rulesTableState.exists };
  }

  async function fetchAllClassRules() {
    const entryRows = await fetchAllClassEntries();
    const col = ruleFilterColumn();
    const table = await probeRulesTable();
    const ruleRows = table.exists
      ? ((await queryRulesTable(`${col}=neq.${encodeURIComponent(COMBINED_COURSE_ID)}`)) ?? [])
      : [];
    if (entryRows.length || ruleRows.length) {
      return mergeRuleRowsByPattern(entryRows, ruleRows);
    }
    return [];
  }

  async function nextSortOrder(classSlug) {
    const col = ruleFilterColumn();
    try {
      const rows = await client.rest(
        `dictionary_rules?${col}=eq.${encodeURIComponent(classSlug)}&order=sort_order.desc&limit=1&select=sort_order`,
      );
      if (rows?.length) return (rows[0]?.sort_order ?? -1) + 1;
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
    }
    const addonRows = await fetchAddonRules(classSlug);
    return addonRows.length;
  }

  /** Insert or update a rule on a class dictionary (not "all"). */
  async function upsertRule(classSlug, { pattern, replacement, case_sensitive, rule_type, comment }) {
    if (classSlug === COMBINED_COURSE_ID) {
      throw new Error('Add rules to a class dictionary, not "all". Rebuild combined after.');
    }

    const table = await probeRulesTable();
    if (!table.exists) {
      throw new Error(
        "dictionary_rules table not found. Run supabase/setup-dictionary-rules.sql in the Supabase SQL editor, then npm run push:dict.",
      );
    }

    const trimmedPattern = String(pattern ?? "").trim();
    const trimmedReplacement = String(replacement ?? "").trim();
    if (!trimmedPattern || !trimmedReplacement) {
      throw new Error("Pattern and spoken replacement are required.");
    }

    const col = ruleFilterColumn();
    const existing = await client.rest(
      `dictionary_rules?${col}=eq.${encodeURIComponent(classSlug)}&pattern=eq.${encodeURIComponent(trimmedPattern)}&select=id,sort_order`,
    );

    const body = ruleBody(classSlug, {
      pattern: trimmedPattern,
      replacement: trimmedReplacement,
      case_sensitive: Boolean(case_sensitive),
      rule_type: Number(rule_type ?? guessRuleType(trimmedPattern)) || 0,
      comment: comment ?? null,
      updated_at: new Date().toISOString(),
    });

    if (existing?.length) {
      await client.rest(`dictionary_rules?id=eq.${existing[0].id}`, {
        method: "PATCH",
        body,
        prefer: "return=minimal",
      });
      return { updated: true, sort_order: existing[0].sort_order };
    }

    body.sort_order = await nextSortOrder(classSlug);
    await client.rest("dictionary_rules", {
      method: "POST",
      body: [body],
      prefer: "return=minimal",
    });
    return { updated: false, sort_order: body.sort_order };
  }

  /** Replace class_slug=all rows with merged union of every other class. */
  async function rebuildCombinedDictionary() {
    const table = await probeRulesTable();
    if (!table.exists) {
      throw new Error(
        "dictionary_rules table not found. Run supabase/setup-dictionary-rules.sql first.",
      );
    }

    const courses = await listCourses();
    const courseOrder = courses.map((c) => c.id);
    const classRows = await fetchAllClassRules();
    const merged = mergeRulesForCombined(classRows, courseOrder);

    const col = ruleFilterColumn();
    await client.rest(`dictionary_rules?${col}=eq.${encodeURIComponent(COMBINED_COURSE_ID)}`, {
      method: "DELETE",
      prefer: "return=minimal",
    });

    const BATCH = 100;
    for (let i = 0; i < merged.length; i += BATCH) {
      const chunk = merged
        .slice(i, i + BATCH)
        .map((row) => ruleBody(COMBINED_COURSE_ID, ruleFields(row)));
      await client.rest("dictionary_rules", {
        method: "POST",
        body: chunk,
        prefer: "return=minimal",
      });
    }
    return { count: merged.length };
  }

  async function loadCourseDictionary(classSlug, { mergeBundled } = {}) {
    if (isDemoDictionaryId(classSlug)) {
      loadBundledChemistryDictionary("demo");
      return {
        ruleCount: ruleCount(),
        classRuleCount: 0,
        source: "demo",
        skipped: false,
        courseId: classSlug,
        rulesTableMissing: false,
        fromEntries: false,
        mergedBundled: true,
        mergeBundled: true,
      };
    }

    const { rows, source, rulesTableMissing, fromEntries } = await fetchRulesWithMeta(classSlug);
    const sourceLabel = fromEntries ? `supabase-entries:${classSlug}` : `supabase:${classSlug}`;
    if (!rows.length) {
      loadBareClassDictionary(`${sourceLabel}-empty`);
      return {
        ruleCount: ruleCount(),
        classRuleCount: 0,
        source: "remote-empty",
        skipped: true,
        courseId: classSlug,
        rulesTableMissing,
        fromEntries: false,
        mergedBundled: false,
        mergeBundled: false,
      };
    }
    const raw = rowsToDic(rows);
    loadDictionary(raw, sourceLabel);
    return {
      ruleCount: ruleCount(),
      classRuleCount: rows.length,
      source,
      courseId: classSlug,
      rulesTableMissing,
      fromEntries: Boolean(fromEntries),
      mergedBundled: false,
      mergeBundled: false,
    };
  }

  /** Raw Builder rows for one class (Pattern / Spoken). */
  async function fetchEntryRecords(classSlug) {
    const table = await probeEntriesTable();
    if (!table.exists) return [];
    const rows = await client.rest(
      `entries?class_slug=eq.${encodeURIComponent(classSlug)}&order=position.asc&select=${ENTRY_COLUMNS}`,
    );
    return (rows ?? []).map((r) => ({
      text: r.text ?? "",
      substitution: r.substitution ?? "",
      app: r.app ?? "All Apps",
      ignore_case: r.ignore_case ?? "Yes",
      note: r.note ?? "",
      position: r.position,
    }));
  }

  async function fetchClassesWithMeta() {
    try {
      return (
        (await client.rest(
          "classes?order=sort_order.asc&select=slug,label,file_prefix,sort_order,addon_defaults",
        )) ?? []
      );
    } catch {
      return [];
    }
  }

  /** When entries is empty, show legacy dictionary_rules rows in the editor until Save class. */
  async function hydrateEntriesFromLegacyRules(entriesByClass, classes) {
    const legacyClassSlugs = [];
    await probeRulesTable();
    if (!rulesTableState?.exists) return { entriesByClass, legacyClassSlugs };
    const col = ruleFilterColumn();
    const ruleRows =
      (await queryRulesTable(`${col}=neq.${encodeURIComponent(COMBINED_COURSE_ID)}`)) ?? [];
    const bySlug = new Map();
    for (const row of ruleRows) {
      const slug = rowClassId(row);
      if (!slug || slug === COMBINED_COURSE_ID) continue;
      if (!bySlug.has(slug)) bySlug.set(slug, []);
      bySlug.get(slug).push(row);
    }
    for (const c of classes) {
      const slug = c.slug;
      if ((entriesByClass[slug]?.length ?? 0) > 0) continue;
      const legacy = ruleRowsToEntryRows(bySlug.get(slug) ?? []);
      if (legacy.length) {
        entriesByClass[slug] = legacy;
        legacyClassSlugs.push(slug);
      }
    }
    return { entriesByClass, legacyClassSlugs };
  }

  /** Load all classes and entries for the embedded Dictionary Builder. */
  async function pullEntriesWorkspace() {
    const table = await probeEntriesTable();
    if (!table.exists) {
      throw new Error(
        "Supabase entries table not found. Run the Dictionary Builder schema in your project.",
      );
    }
    const classes = (await fetchClassesWithMeta()).filter((c) => c.slug !== COMBINED_COURSE_ID);
    const raw = await client.rest(
      `entries?class_slug=neq.${encodeURIComponent(COMBINED_COURSE_ID)}&order=class_slug.asc,position.asc&select=${ENTRY_COLUMNS}`,
    );
    const entriesByClass = {};
    for (const r of raw ?? []) {
      const slug = r.class_slug;
      if (!entriesByClass[slug]) entriesByClass[slug] = [];
      entriesByClass[slug].push({
        text: r.text ?? "",
        substitution: r.substitution ?? "",
        app: r.app ?? "All Apps",
        ignore_case: r.ignore_case ?? "Yes",
        note: r.note ?? "",
      });
    }
    const hydrated = await hydrateEntriesFromLegacyRules(entriesByClass, classes);
    return {
      classes,
      entriesByClass: hydrated.entriesByClass,
      legacyClassSlugs: hydrated.legacyClassSlugs,
    };
  }

  /** Replace all entries for a class (Dictionary Builder Save Active Class). */
  async function saveEntryRecords(classSlug, records) {
    if (classSlug === COMBINED_COURSE_ID) {
      throw new Error('Cannot save rows to "All classes". Pick a specific class.');
    }
    const table = await probeEntriesTable();
    if (!table.exists) {
      throw new Error("entries table not found in Supabase.");
    }
    const cleaned = (records ?? [])
      .map((r) => ({
        text: String(r.text ?? "").trim(),
        substitution: String(r.substitution ?? "").trim(),
        app: String(r.app ?? "All Apps").trim() || "All Apps",
        ignore_case: String(r.ignore_case ?? "Yes").trim() || "Yes",
        note: String(r.note ?? "").trim(),
      }))
      .filter((r) => r.text && r.substitution);

    await client.rest(`entries?class_slug=eq.${encodeURIComponent(classSlug)}`, {
      method: "DELETE",
    });

    if (!cleaned.length) return { count: 0 };

    const body = cleaned.map((r, i) => ({
      class_slug: classSlug,
      text: r.text,
      substitution: r.substitution,
      app: r.app,
      ignore_case: r.ignore_case,
      note: r.note,
      position: i + 1,
    }));

    const chunk = 100;
    for (let i = 0; i < body.length; i += chunk) {
      await client.rest("entries", {
        method: "POST",
        body: body.slice(i, i + chunk),
        prefer: "return=minimal",
      });
    }
    return { count: body.length };
  }

  async function createCourse({ id, label, description }) {
    const slug = String(id ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug || slug === COMBINED_COURSE_ID || isDemoDictionaryId(slug)) {
      throw new Error("Invalid class id.");
    }

    const displayLabel = label || slug;

    try {
      const rows = await client.rest("classes?order=sort_order.desc&limit=1&select=sort_order");
      const sort_order = (rows?.[0]?.sort_order ?? 0) + 1;
      await client.rest("classes", {
        method: "POST",
        body: [
          {
            slug,
            label: displayLabel,
            file_prefix: slug,
            sort_order,
            sample_candidates: [],
            addon_defaults: DEFAULT_ADDON(slug, displayLabel),
          },
        ],
        prefer: "return=minimal",
      });
      return { id: slug, label: displayLabel, sort_order };
    } catch {
      // legacy greenfield projects use courses table
    }

    const rows = await client.rest("courses?order=sort_order.desc&limit=1&select=sort_order");
    const sort_order = (rows?.[0]?.sort_order ?? 0) + 1;
    await client.rest("courses", {
      method: "POST",
      body: [{ id: slug, label: displayLabel, description: description ?? null, sort_order }],
      prefer: "return=minimal",
    });
    return { id: slug, label: displayLabel, sort_order };
  }

  /** Update class metadata (label, file_prefix, addon_defaults) in Supabase. */
  async function updateClassMeta(classSlug, { label, file_prefix, addon_defaults } = {}) {
    const slug = String(classSlug ?? "").trim();
    if (!isDeletableClassSlug(slug)) {
      throw new Error("Cannot update this class.");
    }
    const body = {};
    if (label != null) body.label = String(label).trim();
    if (file_prefix != null) body.file_prefix = String(file_prefix).trim();
    if (addon_defaults != null) body.addon_defaults = addon_defaults;
    if (!Object.keys(body).length) return { slug };

    try {
      await client.rest(`classes?slug=eq.${encodeURIComponent(slug)}`, {
        method: "PATCH",
        body,
        prefer: "return=minimal",
      });
      return { slug, ...body };
    } catch (err) {
      const courseBody = {};
      if (label != null) courseBody.label = String(label).trim();
      if (Object.keys(courseBody).length) {
        await client.rest(`courses?id=eq.${encodeURIComponent(slug)}`, {
          method: "PATCH",
          body: courseBody,
          prefer: "return=minimal",
        });
        return { slug, ...courseBody };
      }
      throw err;
    }
  }

  async function deleteCourse(classSlug) {
    const slug = String(classSlug ?? "").trim();
    if (!isDeletableClassSlug(slug)) {
      throw new Error("Cannot delete this class.");
    }

    const entriesTable = await probeEntriesTable();
    if (entriesTable.exists) {
      await client.rest(`entries?class_slug=eq.${encodeURIComponent(slug)}`, {
        method: "DELETE",
        prefer: "return=minimal",
      });
    }

    const rulesTable = await probeRulesTable();
    if (rulesTable.exists) {
      const col = ruleFilterColumn();
      await client.rest(`dictionary_rules?${col}=eq.${encodeURIComponent(slug)}`, {
        method: "DELETE",
        prefer: "return=minimal",
      });
    }

    try {
      await client.rest(`classes?slug=eq.${encodeURIComponent(slug)}`, {
        method: "DELETE",
        prefer: "return=minimal",
      });
    } catch (err) {
      try {
        await client.rest(`courses?id=eq.${encodeURIComponent(slug)}`, {
          method: "DELETE",
          prefer: "return=minimal",
        });
      } catch {
        throw err;
      }
    }

    return { id: slug };
  }

  return {
    client,
    listCourses,
    fetchRules,
    fetchRulesWithMeta,
    fetchAllClassRules,
    upsertRule,
    rebuildCombinedDictionary,
    loadCourseDictionary,
    createCourse,
    updateClassMeta,
    deleteCourse,
    probeRulesTable,
    probeEntriesTable,
    fetchEntriesForClass,
    fetchEntryRecords,
    fetchClassesWithMeta,
    pullEntriesWorkspace,
    saveEntryRecords,
  };
}

export async function loadSupabaseConfigFromBrowser() {
  migrateBuilderSupabaseCredentials();
  const stored = getStoredSupabaseConfig();
  const paths =
    typeof location !== "undefined" && location.pathname.includes("/playground/")
      ? ["../supabase/config.local.json", "../supabase/config.public.json"]
      : ["supabase/config.local.json", "supabase/config.public.json"];

  // Skip config file fetches when ☁ Connect already saved credentials (avoids 404 noise).
  const fileConfig =
    stored?.url && stored?.anonKey ? null : await loadConfigFromPaths(paths);

  if (!fileConfig && !stored) return null;
  return {
    ...(fileConfig ?? {}),
    ...stored,
    url: stored?.url ?? fileConfig?.url,
    anonKey: stored?.anonKey ?? fileConfig?.anonKey,
    courseId: fileConfig?.courseId ?? getStoredCourseId(),
  };
}

const SUPABASE_CONFIG_STORAGE_KEY = "hearsay-supabase-config";
const LEGACY_SUPABASE_CONFIG_STORAGE_KEY = "sci-speak-supabase-config";
const COURSE_STORAGE_KEY = "hearsay-course-id";
const LEGACY_COURSE_STORAGE_KEY = "sci-speak-course-id";
/** Dictionary Builder (screenreader repo) localStorage keys — migrated on first HearSay connect. */
const BUILDER_URL_STORAGE_KEY = "screenReaderBackendUrl";
const BUILDER_ANON_KEY_STORAGE_KEY = "screenReaderBackendAnonKey";

/** Copy Builder backend credentials into HearSay Connect storage when HearSay has none. */
export function migrateBuilderSupabaseCredentials() {
  if (typeof localStorage === "undefined") return;
  if (getStoredSupabaseConfig()) return;
  const url = String(localStorage.getItem(BUILDER_URL_STORAGE_KEY) ?? "").trim();
  const anonKey = String(localStorage.getItem(BUILDER_ANON_KEY_STORAGE_KEY) ?? "").trim();
  if (url && anonKey) setStoredSupabaseConfig({ url, anonKey });
}

function migrateStorageKey(fromKey, toKey) {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(toKey) || !localStorage.getItem(fromKey)) return;
  localStorage.setItem(toKey, localStorage.getItem(fromKey));
}

migrateStorageKey(LEGACY_SUPABASE_CONFIG_STORAGE_KEY, SUPABASE_CONFIG_STORAGE_KEY);
migrateStorageKey(LEGACY_COURSE_STORAGE_KEY, COURSE_STORAGE_KEY);

export function getStoredSupabaseConfig() {
  if (typeof localStorage === "undefined") return null;
  try {
    let raw = localStorage.getItem(SUPABASE_CONFIG_STORAGE_KEY);
    if (!raw) raw = localStorage.getItem(LEGACY_SUPABASE_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const url = String(parsed?.url ?? "").trim().replace(/\/+$/, "");
    const anonKey = String(parsed?.anonKey ?? "").trim();
    if (!url || !anonKey) return null;
    return { url, anonKey };
  } catch {
    return null;
  }
}

export function setStoredSupabaseConfig({ url, anonKey }) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    SUPABASE_CONFIG_STORAGE_KEY,
    JSON.stringify({
      url: String(url ?? "")
        .trim()
        .replace(/\/+$/, ""),
      anonKey: String(anonKey ?? "").trim(),
    }),
  );
  notifySupabaseConnectionChanged();
}

export function clearStoredSupabaseConfig() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SUPABASE_CONFIG_STORAGE_KEY);
  notifySupabaseConnectionChanged();
}

export function getStoredCourseId(fallback = DEMO_DICTIONARY_ID) {
  if (typeof localStorage === "undefined") return fallback;
  return (
    localStorage.getItem(COURSE_STORAGE_KEY) ||
    localStorage.getItem(LEGACY_COURSE_STORAGE_KEY) ||
    fallback
  );
}

export function setStoredCourseId(courseId) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(COURSE_STORAGE_KEY, courseId);
  }
}

export async function tryLoadRemoteDictionary(config, courseId) {
  const id = courseId ?? config?.courseId ?? getStoredCourseId();
  if (isDemoDictionaryId(id)) {
    loadBundledChemistryDictionary("demo");
    return {
      ok: true,
      courseId: id,
      source: "demo",
      ruleCount: ruleCount(),
      classRuleCount: 0,
      mergedBundled: true,
      config,
    };
  }
  if (!config?.url || !config?.anonKey) {
    return { ok: false, reason: "no-config", courseId: id };
  }
  try {
    const api = createDictionaryApi(config);
    const result = await api.loadCourseDictionary(id);
    if (result.skipped) {
      return { ok: false, reason: "empty-table", config, courseId: id, rulesTableMissing: result.rulesTableMissing };
    }
    return { ok: true, ...result, config, courseId: id };
  } catch (err) {
    return { ok: false, reason: err.message, config, courseId: id };
  }
}

// Supabase dictionary CRUD: per-class rules + merged "all" course.

import { createSupabaseClient } from "./client.js";
import { addonEntriesToRows, normalizeRuleRow, normalizeRuleRows, rowClassId, rowsToDic } from "./dictionary-format.js";
import { loadDictionary } from "../core/dictionary.js";

export const COMBINED_COURSE_ID = "all";

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
  if (/[\\^$.*+?[\](){}|]/.test(pattern) && pattern.includes("\\")) return 1;
  if (/^[A-Za-z][A-Za-z0-9/-]*$/.test(pattern) && pattern.length <= 24) return 2;
  return 0;
}

export function createDictionaryApi(config) {
  const client = createSupabaseClient(config);
  let rulesTableState = null;

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

    if (classSlug === COMBINED_COURSE_ID) {
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

    const tableRows = await queryRulesTable(
      `${ruleFilterColumn()}=eq.${encodeURIComponent(classSlug)}`,
    );
    if (tableRows?.length) {
      return { rows: tableRows, source: "supabase", rulesTableMissing: false };
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
    const col = ruleFilterColumn();
    const rows = await queryRulesTable(`${col}=neq.${encodeURIComponent(COMBINED_COURSE_ID)}`);
    return rows ?? [];
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

  async function loadCourseDictionary(classSlug) {
    const { rows, source, rulesTableMissing } = await fetchRulesWithMeta(classSlug);
    if (!rows.length) {
      return { ruleCount: 0, source: "remote-empty", skipped: true, courseId: classSlug, rulesTableMissing };
    }
    const raw = rowsToDic(rows);
    loadDictionary(raw, `supabase:${classSlug}`);
    return { ruleCount: rows.length, source, courseId: classSlug, rulesTableMissing };
  }

  async function createCourse({ id, label, description }) {
    const slug = String(id ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug || slug === COMBINED_COURSE_ID) throw new Error("Invalid class id.");

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
    probeRulesTable,
  };
}

export async function loadSupabaseConfigFromBrowser() {
  const { loadConfigFromPaths } = await import("./client.js");
  const fileConfig = await loadConfigFromPaths([
    "../supabase/config.local.json",
    "../supabase/config.public.json",
    "supabase/config.local.json",
    "supabase/config.public.json",
  ]);
  const stored = getStoredSupabaseConfig();
  if (!fileConfig && !stored) return null;
  return {
    ...fileConfig,
    ...stored,
    url: stored?.url ?? fileConfig?.url,
    anonKey: stored?.anonKey ?? fileConfig?.anonKey,
    courseId: fileConfig?.courseId,
  };
}

const SUPABASE_CONFIG_STORAGE_KEY = "hearsay-supabase-config";
const LEGACY_SUPABASE_CONFIG_STORAGE_KEY = "sci-speak-supabase-config";
const COURSE_STORAGE_KEY = "hearsay-course-id";
const LEGACY_COURSE_STORAGE_KEY = "sci-speak-course-id";

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
}

export function clearStoredSupabaseConfig() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SUPABASE_CONFIG_STORAGE_KEY);
}

export function getStoredCourseId(fallback = "chem113") {
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
  if (!config?.url || !config?.anonKey) {
    return { ok: false, reason: "no-config" };
  }
  const id = courseId ?? config.courseId ?? getStoredCourseId();
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

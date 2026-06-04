// Backward-compatible entry: load remote dictionary from Supabase.
export {
  tryLoadRemoteDictionary,
  loadSupabaseConfigFromBrowser as loadSupabaseConfig,
  getStoredCourseId,
  setStoredCourseId,
  getStoredSupabaseConfig,
  setStoredSupabaseConfig,
  clearStoredSupabaseConfig,
  COMBINED_COURSE_ID,
  DEMO_DICTIONARY_ID,
  DEMO_DICTIONARY_LABEL,
  isDemoDictionaryId,
  includesBundledBaseByDefault,
} from "./dictionary-api.js";

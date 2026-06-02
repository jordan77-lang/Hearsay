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
} from "./dictionary-api.js";

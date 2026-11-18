import { mountDictionaryEditor } from "./dictionary-editor.js";

export async function mountHearSayWorkspace(root, { context = "web", base = "..", initialView } = {}) {
  let view = initialView;
  if (!view) {
    const hash = globalThis.location?.hash?.slice(1);
    if (["review", "dictionary"].includes(hash)) view = hash;
    try { view ||= localStorage.getItem("hearsay-workspace-view") || (context === "extension" && localStorage.getItem("hearsay-ext-view") === "dictionary" ? "dictionary" : "review"); } catch { view ||= "review"; }
  }
  return mountDictionaryEditor(root, { context, base, workspace: true, initialView: view });
}

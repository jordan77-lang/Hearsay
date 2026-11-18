// Website and extension share one workspace and a single live review queue.
import { mountHearSayWorkspace } from "./workspace.js";

export function mountExtensionShell(root) {
  return mountHearSayWorkspace(root, { context: "extension", base: ".." });
}

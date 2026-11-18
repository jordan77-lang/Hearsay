// Shared release boundary for the website and downloadable extension.
// Paused tools remain in the checkout, including their tests and shared helpers.
import { SHOW_CANVAS_TRANSLATE, SHOW_MATHSAY } from "../src/site-config.js";

const pausedPaths = [
  ...(!SHOW_MATHSAY ? ["mathsay", "src/mathsay.js", "src/core/mathsay-export.js"] : []),
  ...(!SHOW_CANVAS_TRANSLATE ? ["playground"] : []),
];

/** Accept a path relative to the project root (Windows or POSIX separators). */
export function isReleasePath(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  return !pausedPaths.some((paused) => normalized === paused || normalized.startsWith(paused + "/"));
}

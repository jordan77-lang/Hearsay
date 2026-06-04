// Shared spacing rules for Lab default/dictionary speech columns and default SR TTS.

const SPOKEN_PAREN_WORD = /^(?:right|left) (?:paren|bracket|brace)\b/;

/** Insert a space when spoken fragments would otherwise glue (parenΔT, timesΔT, T₂minus). */
export function labSpeechNeedsGap(left, right) {
  if (!left || !right) return false;
  if (/\s$/.test(left) || /^\s/.test(right)) return false;
  const l = left.at(-1);
  const r = right.charAt(0);
  if (!l || !r) return false;

  // Math identifier before spoken paren word (ΔT + right paren) — gap added in pushLabSpeech instead.
  if (/[A-Za-z0-9]$/.test(left) && SPOKEN_PAREN_WORD.test(right)) return false;

  // Subscript/superscript before next token (T₂ + minus).
  if (/[\p{M}\p{N}]/u.test(l)) return true;

  // Digits before letters (10 milliliters).
  if (/[0-9]$/.test(left) && /^[A-Za-z]/.test(right)) return true;

  // Spoken word or substitution after another (open parenthesis + q of calorimeter).
  if (/[a-z]$/.test(left) && /^[a-z]/.test(right)) return true;

  // Word boundary: lowercase end before uppercase (milliliters of D I water).
  if (/[a-z]$/.test(left) && /^[A-Z]/.test(right)) return true;

  // Uppercase letter before spoken word (J + slash, T + period).
  if (/[A-Z]$/.test(left) && /^[a-z]/.test(right)) return true;

  // Closing delimiter before math/Greek.
  if (/[)]$/.test(left) && /^[^a-z\s,.)]/.test(right)) return true;

  return false;
}

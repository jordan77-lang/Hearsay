import { numericScriptsFromClipboard, possibleLostExponents, plainTextFromClipboardHtml } from "./core/exponent-formatting.js";

// automatic: numeric superscripts/subscripts from clipboard formatting are
// always kept as characters (H₂O, 10⁻³). It is not an option to switch off.
export function bindExponentPaste(input, { onStatus = () => {}, automatic = false, includeSubscripts = false } = {}) {
  const host = document.createElement("div"); host.className = "hs-exponent-paste";
  const undo = document.createElement("button"); undo.type = "button"; undo.className = "ss-btn";
  undo.dataset.plainPaste = "true";
  undo.textContent = "Use plain text from last paste"; undo.hidden = true;
  const warning = document.createElement("p"); warning.className = "ss-sub"; warning.setAttribute("role", "status");
  const offer = document.createElement("div"); offer.hidden = true;
  const message = document.createElement("p"); message.className = "ss-sub";
  message.textContent = "Numeric superscript formatting is available in this paste. You can preserve it as superscript characters.";
  const accept = document.createElement("button"); accept.type = "button"; accept.className = "ss-btn";
  accept.textContent = "Preserve pasted superscripts"; accept.dataset.preserveSuperscripts = "true";
  offer.append(message, accept); host.append(warning, offer, undo); input.after(host);
  let proposal = null, restoration = null;
  function check() {
    const matches = possibleLostExponents(input.value);
    const text = matches.length ? `Possible lost exponent formatting: ${matches.slice(0, 3).map(item => item.text).join("; ")}. Confirm in the source whether the trailing digits are raised. No automatic correction has been made.` : "";
    if (warning.textContent !== text) warning.textContent = text;
    warning.hidden = !text;
    if (proposal && input.value !== proposal.expected) { offer.hidden = true; proposal = null; }
    if (restoration && input.value !== restoration.expected) { undo.hidden = true; restoration = null; }
  }
  function paste(event) {
    if (input.disabled || input.readOnly || event.defaultPrevented) return;
    proposal = null; offer.hidden = true; restoration = null; undo.hidden = true;
    const html = event.clipboardData?.getData("text/html") || "";
    const plain = (event.clipboardData?.getData("text/plain") || (automatic ? plainTextFromClipboardHtml(html) : "")).replace(/\r\n?/g, "\n");
    const alternative = numericScriptsFromClipboard(plain, html, { includeSubscripts });
    if (!alternative) return;
    const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
    const before = input.value.slice(0, start), after = input.value.slice(end);
    if (automatic) {
      const text = before + alternative.text + after;
      if (input.maxLength > 0 && text.length > input.maxLength) return;
      event.preventDefault();
      if (typeof input.setRangeText === "function") input.setRangeText(alternative.text, start, end, "end");
      else { input.value = text; input.selectionStart = input.selectionEnd = start + alternative.text.length; }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      onStatus("Kept raised and lowered numbers from the pasted formatting (for example 10⁻³, H₂O).");
      return;
    }
    proposal = { expected: before + plain + after, text: before + alternative.text + after };
    offer.hidden = false;
  }
  function restorePlain() {
    if (input.disabled || !restoration || input.value !== restoration.expected) return;
    input.value = restoration.text; restoration = null; undo.hidden = true;
    input.dispatchEvent(new Event("input", { bubbles: true })); input.focus();
    onStatus("Restored the plain text from the last paste. Numeric script formatting is no longer represented.");
  }
  function preserve() {
    if (input.disabled || !proposal || input.value !== proposal.expected) return;
    input.value = proposal.text; proposal = null; offer.hidden = true;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    onStatus("Preserved numeric superscripts from clipboard formatting. Review the captured passage; the Google document has not been changed.");
    input.focus();
  }
  input.addEventListener("paste", paste); input.addEventListener("input", check); accept.addEventListener("click", preserve);
  undo.addEventListener("click", restorePlain);
  check();
  return { refresh: check, destroy() { input.removeEventListener("paste", paste); input.removeEventListener("input", check); accept.removeEventListener("click", preserve); undo.removeEventListener("click", restorePlain); host.remove(); } };
}

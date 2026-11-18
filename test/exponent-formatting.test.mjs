import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import { numericSuperscriptsFromClipboard, numericScriptsFromClipboard, plainTextFromClipboardHtml, possibleLostExponents } from "../src/core/exponent-formatting.js";
import { bindExponentPaste } from "../src/exponent-paste.js";
import { setupDom } from "./helpers/review-dom.mjs";

test("clipboard formatting preserves numeric superscripts without changing plain spacing", () => {
  for (const html of [
    '<p>5.00 × 10<sup>-3</sup> M</p>',
    '<html><body><span>5.00 × 10</span><span style="vertical-align: super"><span>-3</span></span> M</body></html>',
  ]) {
    assert.deepEqual(numericSuperscriptsFromClipboard("5.00  × 10-3\nM", html, DOMParser), { text: "5.00  × 10⁻³\nM", preserved: 2 });
  }
});

test("missing or mismatched formatting cannot guess exponents or convert subscripts", () => {
  assert.equal(numericSuperscriptsFromClipboard("5.00 × 10-3", "", DOMParser), null);
  assert.equal(numericSuperscriptsFromClipboard("5.00 × 10-3", '<p>5.00 × 10-3</p>', DOMParser), null);
  assert.equal(numericSuperscriptsFromClipboard("5.00 × 10-4", '<p>5.00 × 10<sup>-3</sup></p>', DOMParser), null);
  assert.equal(numericSuperscriptsFromClipboard("H2O", '<p>H<sub>2</sub>O</p>', DOMParser), null);
  assert.deepEqual(numericSuperscriptsFromClipboard("x2 then 10-3", '<p>x<sup>2</sup> then 10-3</p>', DOMParser), { text: "x² then 10-3", preserved: 1 });
});

test("flattened scientific notation is flagged without rewriting other subtraction or charges", () => {
  assert.deepEqual(possibleLostExponents("Use 5.00 × 10-3 M").map(item => item.text), ["5.00 × 10-3"]);
  for (const text of ["5.00 × 10⁻³ M", "10 - 3", "Cl-", "pages 10-3", "5.00 × 10 - 3"]) assert.deepEqual(possibleLostExponents(text), []);
});

test("numeric scripts respect subscript and baseline overrides and HTML-only line breaks", () => {
  assert.deepEqual(numericScriptsFromClipboard("H2O and 10-3", '<p>H<span style="vertical-align:sub">2</span>O and 10<sup>-3</sup></p>', { Parser: DOMParser, includeSubscripts: true }), { text: "H₂O and 10⁻³", preserved: 3 });
  assert.deepEqual(numericScriptsFromClipboard("234", '<sup>2<span style="vertical-align:baseline">3</span><sub>4</sub></sup>', { Parser: DOMParser, includeSubscripts: true }), { text: "²3₄", preserved: 2 });
  assert.equal(plainTextFromClipboardHtml('<html><body><script>bad()</script><p>H<sub>2</sub>O</p><p>5.00 × 10<sup>-3</sup><br>M</p></body></html>', DOMParser), "H2O\n5.00 × 10-3\nM");
});

test("automatic script paste always keeps numeric scripts, with no opt-out or plain-text toggle", () => {
  const env = setupDom(); const input = document.createElement("textarea"); env.root.append(input);
  const binding = bindExponentPaste(input, { automatic: true, includeSubscripts: true });
  input.value = "Before replace after"; input.selectionStart = 7; input.selectionEnd = 14;
  function paste(plain = "H2O and 10-3", html = '<p>H<sub>2</sub>O and 10<sup>-3</sup></p>') {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    event.clipboardData = { getData: type => type === "text/plain" ? plain : html }; input.dispatchEvent(event); return event;
  }
  assert.equal(paste().defaultPrevented, true);
  assert.equal(input.value, "Before H₂O and 10⁻³ after");
  assert.equal(env.root.querySelector("input[type=checkbox]"), null, "no opt-out checkbox");
  assert.equal(env.root.querySelector("[data-plain-paste]").hidden, true, "no plain-text toggle");
  // Plain text that does not match the formatting is left to the browser.
  assert.equal(paste("H2O and 10-4").defaultPrevented, false);
  input.value = ""; input.selectionStart = input.selectionEnd = 0;
  assert.equal(paste("", '<p>H<sub>2</sub>O</p><p>10<sup>-3</sup></p>').defaultPrevented, true);
  assert.equal(input.value, "H₂O\n10⁻³");
  assert.equal(env.root.querySelector("script"), null);
  binding.destroy();
});

test("paste keeps native text until explicit preservation and cancels stale proposals", () => {
  const env = setupDom();
  const input = document.createElement("textarea"); env.root.append(input);
  const statuses = []; const binding = bindExponentPaste(input, { onStatus: text => statuses.push(text) });
  const button = env.root.querySelector("[data-preserve-superscripts]");
  function paste() {
    input.value = "Before selected after"; input.selectionStart = 7; input.selectionEnd = 15;
    const event = new Event("paste", { bubbles: true, cancelable: true });
    event.clipboardData = { getData: type => type === "text/plain" ? "5.00 × 10-3\r\nM" : '<p>5.00 × 10<sup>-3</sup><br>M</p>' };
    input.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    input.value = "Before 5.00 × 10-3\nM after"; input.dispatchEvent(new Event("input"));
    assert.equal(button.parentNode.hidden, false);
    assert.match(env.root.textContent, /Possible lost exponent formatting/);
  }
  paste(); button.click();
  assert.equal(input.value, "Before 5.00 × 10⁻³\nM after");
  assert.equal(statuses.length, 1);
  paste(); input.value += " edited"; input.dispatchEvent(new Event("input")); button.click();
  assert.equal(input.value, "Before 5.00 × 10-3\nM after edited");
  assert.equal(button.parentNode.hidden, true);
  binding.destroy();
});

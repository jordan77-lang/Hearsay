import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scrapePageTextInPage,
  pickBestScrapeResult,
  canPullFromTabUrl,
  pullSourceLabel,
} from "../src/extension/page-scrape.js";
import { runInNewContext } from "node:vm";

test("injected scraper is self-contained and reports original length and truncation", () => {
  const selected = "x".repeat(13001);
  const captured = runInNewContext(`(${scrapePageTextInPage.toString()})()`, { window: { getSelection: () => ({ toString: () => selected }) } });
  assert.equal(captured.text.length, 12000);
  assert.equal(captured.totalLength, 13001);
  assert.equal(captured.truncated, true);
  assert.equal(captured.source, "selection");
  const picked = pickBestScrapeResult([{ result: captured }]);
  assert.equal(picked.truncated, true);
  assert.equal(picked.totalLength, 13001);
});

test("pickBestScrapeResult prefers selection over body", () => {
  const picked = pickBestScrapeResult([
    { result: { text: "long body ".repeat(50), source: "body" } },
    { result: { text: "ΔT", source: "selection" } },
  ]);
  assert.equal(picked?.source, "selection");
  assert.equal(picked?.text, "ΔT");
});

test("pickBestScrapeResult prefers focused over body", () => {
  const picked = pickBestScrapeResult([
    { result: { text: "page body", source: "body" } },
    { result: { text: "10 mL HCl", source: "focused" } },
  ]);
  assert.equal(picked?.source, "focused");
});

test("canPullFromTabUrl blocks chrome:// and file://", () => {
  assert.equal(canPullFromTabUrl("chrome://extensions/").ok, false);
  assert.equal(canPullFromTabUrl("chrome-extension://abc/src/extension-welcome.html").ok, false);
  assert.equal(canPullFromTabUrl("file:///C:/x.html").ok, false);
  assert.equal(canPullFromTabUrl("https://canvas.instructure.com/courses/1").ok, true);
});

test("pullSourceLabel is human-readable", () => {
  assert.equal(pullSourceLabel("selection"), "selection");
  assert.equal(pullSourceLabel("focused"), "editor field");
});

import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("dictionary-sync", () => {
  /** @type {Map<string, string>} */
  let storage;
  /** @type {Array<{ type: string, detail?: unknown }>} */
  let events;

  beforeEach(async () => {
    storage = new Map();
    events = [];
    globalThis.localStorage = {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => {
        storage.set(k, v);
      },
      removeItem: (k) => {
        storage.delete(k);
      },
    };
    globalThis.window = {
      addEventListener: (type, fn) => {
        events.push({ type, fn });
      },
      removeEventListener: (type, fn) => {
        events = events.filter((e) => !(e.type === type && e.fn === fn));
      },
      dispatchEvent: (e) => {
        for (const { type, fn } of events) {
          if (type === e.type) fn(e);
        }
        return true;
      },
    };
  });

  afterEach(() => {
    delete globalThis.localStorage;
    delete globalThis.window;
  });

  it("notifyDictionaryUpdated writes storage and dispatches event", async () => {
    const { notifyDictionaryUpdated, DICTIONARY_SYNC_STORAGE_KEY, DICTIONARY_SYNC_EVENT } =
      await import("../src/dictionary-sync.js");

    let received = null;
    window.addEventListener(DICTIONARY_SYNC_EVENT, (e) => {
      received = e.detail;
    });

    notifyDictionaryUpdated({ classSlug: "chem113", source: "editor" });

    const stored = JSON.parse(storage.get(DICTIONARY_SYNC_STORAGE_KEY));
    assert.equal(stored.classSlug, "chem113");
    assert.equal(stored.source, "editor");
    assert.equal(received.classSlug, "chem113");
  });

  it("onDictionaryUpdated receives same-tab custom events", async () => {
    const { onDictionaryUpdated, notifyDictionaryUpdated } = await import("../src/dictionary-sync.js");
    const seen = [];
    const unsub = onDictionaryUpdated((detail) => seen.push(detail));

    notifyDictionaryUpdated({ classSlug: "chem114" });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].classSlug, "chem114");

    unsub();
    notifyDictionaryUpdated({ classSlug: "chem115" });
    assert.equal(seen.length, 1);
  });

  it("onDictionaryUpdated marks storage events with viaStorage", async () => {
    const { onDictionaryUpdated, DICTIONARY_SYNC_STORAGE_KEY } = await import("../src/dictionary-sync.js");
    const seen = [];
    onDictionaryUpdated((detail) => seen.push(detail));

    window.dispatchEvent({
      type: "storage",
      key: DICTIONARY_SYNC_STORAGE_KEY,
      newValue: JSON.stringify({ classSlug: "chem113", at: 123, source: "editor", viaStorage: true }),
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0].viaStorage, true);
    assert.equal(seen[0].source, "editor");
  });

  it("dictionarySyncMatchesClass accepts null classSlug as match-all", async () => {
    const { dictionarySyncMatchesClass } = await import("../src/dictionary-sync.js");
    assert.equal(dictionarySyncMatchesClass(null, "chem113"), true);
    assert.equal(dictionarySyncMatchesClass("chem113", "chem113"), true);
    assert.equal(dictionarySyncMatchesClass("chem114", "chem113"), false);
  });
});

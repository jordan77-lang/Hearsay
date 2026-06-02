import { test } from "node:test";
import assert from "node:assert/strict";

import { needsChromeClipGuard } from "../src/speech.js";

test("needsChromeClipGuard returns false without a navigator (Node)", () => {
  // In the Node test environment there is no navigator, so no clip guard.
  assert.equal(needsChromeClipGuard(), false);
});

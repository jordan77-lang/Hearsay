import test from "node:test";
import assert from "node:assert/strict";

test("key UI modules load without syntax errors", async () => {
  await import("../src/supabase/dictionary-ui.js");
  await import("../src/dictionary-sync.js");
  await import("../src/supabase/connect-guard.js");
});

test("notifySupabaseConnectionChanged is safe without window", async () => {
  const { notifySupabaseConnectionChanged, SUPABASE_CONNECTION_EVENT, onSupabaseConnectionChanged } =
    await import("../src/dictionary-sync.js");

  assert.doesNotThrow(() => notifySupabaseConnectionChanged());
  assert.equal(typeof onSupabaseConnectionChanged(() => {}), "function");
  assert.equal(SUPABASE_CONNECTION_EVENT, "hearsay-supabase-connection-changed");
});

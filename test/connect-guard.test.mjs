import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isSupabaseConnected,
  supabaseConnectMessage,
} from "../src/supabase/connect-guard.js";

test("supabaseConnectMessage names the blocked feature", () => {
  assert.match(supabaseConnectMessage("Saving terms"), /Saving terms requires Supabase/i);
  assert.match(supabaseConnectMessage(), /requires Supabase/i);
  assert.match(supabaseConnectMessage("Saving terms"), /Connect/i);
});

test("isSupabaseConnected is false without browser storage", () => {
  assert.equal(isSupabaseConnected(), false);
});

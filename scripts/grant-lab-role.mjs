#!/usr/bin/env node
/**
 * Grants (or revokes) the 'lab' role to an existing account, by email.
 *
 * The lab role gates /referral/lab and the RLS policies that let someone
 * mark a consultation attended/missed and attach results — it is
 * deliberately NOT self-service. It lives in app_metadata (only writable
 * via the service-role admin API), never user_metadata (client-settable by
 * anyone via the JS SDK, so it can never be trusted for authorization —
 * see README §5.2 and supabase/migrations/006_medical_labs_referral_flow.sql).
 *
 * Usage:
 *   node scripts/grant-lab-role.mjs someone@example.com
 *   node scripts/grant-lab-role.mjs someone@example.com --revoke
 *
 * Reads SUPABASE credentials from .env.local (same as the app).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  let text;
  try {
    text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    console.error("Missing .env.local — copy .env.example and fill in your project's values.");
    process.exit(1);
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnvLocal();

const [, , email, flag] = process.argv;
if (!email) {
  console.error("Usage: node scripts/grant-lab-role.mjs <email> [--revoke]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set in .env.local.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

let page = 1;
let user = null;
while (!user) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error(error.message); process.exit(1); }
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (data.users.length < 200) break;
  page++;
}

if (!user) {
  console.error(`No account found for ${email}. They need to have signed up first.`);
  process.exit(1);
}

const revoke = flag === "--revoke";
const nextAppMetadata = { ...user.app_metadata };
if (revoke) delete nextAppMetadata.role;
else nextAppMetadata.role = "lab";

const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
  app_metadata: nextAppMetadata,
});
if (updateErr) { console.error(updateErr.message); process.exit(1); }

console.log(`${revoke ? "Revoked" : "Granted"} lab role for ${email}.`);
console.log("They must sign out and back in for the new role to appear in their session.");

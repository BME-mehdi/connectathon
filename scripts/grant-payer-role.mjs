#!/usr/bin/env node
/**
 * Grants (or revokes) the 'payer' role to an existing account, by email.
 *
 * The payer role is what the custom access token hook in
 * supabase/migrations/007_payer_access.sql maps to the payer_readonly
 * Postgres role at login — the /payer dashboard authenticates as that role
 * exclusively, so a payer account can query aggregate_outcomes and nothing
 * else (see supabase/migrations/003_data_firewall.sql for the grants).
 * Deliberately NOT self-service, same reasoning as the lab role: it lives
 * in app_metadata (only writable via the service-role admin API), never
 * user_metadata (client-settable by anyone via the JS SDK).
 *
 * Usage:
 *   node scripts/grant-payer-role.mjs someone@example.com
 *   node scripts/grant-payer-role.mjs someone@example.com --revoke
 *
 * Reads SUPABASE credentials from .env.local (same as the app). The custom
 * access token hook must also be enabled in the Supabase Dashboard
 * (Authentication → Hooks → Custom Access Token) for this to take effect —
 * see the migration comment.
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
  console.error("Usage: node scripts/grant-payer-role.mjs <email> [--revoke]");
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
else nextAppMetadata.role = "payer";

const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
  app_metadata: nextAppMetadata,
});
if (updateErr) { console.error(updateErr.message); process.exit(1); }

console.log(`${revoke ? "Revoked" : "Granted"} payer role for ${email}.`);
console.log("They must sign out and back in for the new role to appear in their session.");

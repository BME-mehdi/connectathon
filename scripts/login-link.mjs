#!/usr/bin/env node
/**
 * scripts/login-link.mjs
 *
 * Generates an instant, direct authentication magic link via the Supabase Admin API,
 * bypassing Supabase's email rate limit entirely.
 *
 * Usage:
 *   node scripts/login-link.mjs <email> [site_url]
 *   npm run login <email>
 *
 * Examples:
 *   node scripts/login-link.mjs elaissi.mehdi.official@gmail.com
 *   node scripts/login-link.mjs elaissi.mehdi.official@gmail.com https://my-app.vercel.app
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  let text;
  try {
    text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    console.error("❌ Missing .env.local file. Ensure .env.local exists with Supabase keys.");
    process.exit(1);
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let [, , targetEmail, customSiteUrl] = process.argv;

// If no email supplied, list existing users to assist the developer
if (!targetEmail) {
  const { data: usersData, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 10 });
  if (!listErr && usersData?.users?.length) {
    console.log("ℹ️  Existing accounts in database:");
    usersData.users.forEach((u) => console.log(`   - ${u.email}`));
    console.log("");
    targetEmail = usersData.users[0].email;
    console.log(`Defaulting to first user: ${targetEmail}`);
  } else {
    console.error("Usage: node scripts/login-link.mjs <email> [site_url]");
    process.exit(1);
  }
}

const siteUrl = customSiteUrl || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const redirectTo = `${siteUrl.replace(/\/+$/, "")}/auth/callback`;

// Ensure user exists (create if not found)
const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
const existing = userList?.users?.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase());

if (!existing) {
  console.log(`User ${targetEmail} not found. Creating user directly...`);
  const { error: createErr } = await admin.auth.admin.createUser({
    email: targetEmail,
    email_confirm: true,
  });
  if (createErr) {
    console.error("❌ Failed to create user:", createErr.message);
    process.exit(1);
  }
  console.log(`✅ User ${targetEmail} created with auto-confirmed email.`);
}

const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: targetEmail,
  options: {
    redirectTo,
  },
});

if (error) {
  console.error("❌ Error generating direct login link:", error.message);
  process.exit(1);
}

const actionLink = data.properties?.action_link;

console.log("\n============================================================");
console.log("🔗 DIRECT LOGIN LINK (Bypasses Supabase Email Rate Limit)");
console.log("============================================================");
console.log(`Target Email : ${targetEmail}`);
console.log(`Redirect To  : ${redirectTo}`);
console.log("\n👉 Paste this URL into your browser to log in immediately:\n");
console.log(actionLink);
console.log("============================================================\n");

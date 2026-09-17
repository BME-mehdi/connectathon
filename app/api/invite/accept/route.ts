import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AcceptInviteSchema } from "@/lib/validation/invite";

/**
 * POST /api/invite/accept
 *
 * Called by the INVITED adult, after they have authenticated via the invite
 * link, to finalize joining the household with their own data. Uses the
 * service-role client because family_members INSERT is RLS-restricted to
 * the household owner (migrations/002_rls_policies.sql) — an invited member
 * is not the owner, so this route is the one narrow, server-verified
 * exception, gated entirely on the invite metadata Supabase Auth already
 * attached to this specific authenticated user's own session.
 *
 * This is the "self" consent step — distinct from guardian consent (minors)
 * and surface-level family-history consent. Never conflate the three.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = user.user_metadata?.invited_household_id as string | undefined;
  const relation = user.user_metadata?.invited_relation as string | undefined;
  if (!householdId || !relation) {
    return NextResponse.json({ error: "No pending invite for this account" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = AcceptInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createServiceClient();

  const { data: existing } = await admin
    .from("family_members")
    .select("id")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ family_member_id: existing.id });

  const { data: member, error: memberErr } = await admin
    .from("family_members")
    .insert({
      household_id: householdId,
      user_id: user.id,
      full_name: parsed.data.full_name,
      relation,
      is_minor: false,
      date_of_birth: parsed.data.date_of_birth,
      biological_sex: parsed.data.biological_sex ?? null,
    })
    .select("id")
    .single();

  if (memberErr || !member) {
    return NextResponse.json({ error: memberErr?.message ?? "Insert failed" }, { status: 500 });
  }

  const { error: consentErr } = await admin.from("consents").insert({
    family_member_id: member.id,
    consent_type: "self",
  });
  if (consentErr) {
    return NextResponse.json({ error: consentErr.message }, { status: 500 });
  }

  await admin.from("audit_log").insert({
    actor: user.id,
    action: "consent.granted.self",
    entity: "family_members",
    entity_id: member.id,
  });

  return NextResponse.json({ family_member_id: member.id }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FamilyMemberSchema } from "@/lib/validation/screening";
import { getMyHousehold } from "@/lib/household";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = FamilyMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Any adult already in the household (owner or invited member) can add a
  // new member — not just the owner. RLS enforces the same rule.
  const household = await getMyHousehold(supabase, user.id);
  if (!household) {
    return NextResponse.json({ error: "Household not found" }, { status: 404 });
  }
  if (parsed.data.household_id && parsed.data.household_id !== household.id) {
    return NextResponse.json({ error: "Household not found or access denied" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("family_members")
    .insert({
      household_id:   household.id,
      full_name:      parsed.data.full_name,
      relation:       parsed.data.relation,
      is_minor:       parsed.data.is_minor,
      date_of_birth:  parsed.data.date_of_birth,
      biological_sex: parsed.data.biological_sex ?? null,
      // user_id stays null for minors and uninvited members
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Record consent: guardian for minors, self for adults
  await supabase.from("consents").insert({
    family_member_id: data.id,
    consent_type: parsed.data.is_minor ? "guardian" : "self",
  });

  // Audit log
  await supabase.from("audit_log").insert({
    actor: user.id,
    action: "family_member.created",
    entity: "family_members",
    entity_id: data.id,
    metadata: { relation: data.relation, is_minor: data.is_minor },
  });

  return NextResponse.json(data, { status: 201 });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const household = await getMyHousehold(supabase, user.id);
  if (!household) return NextResponse.json([], { status: 200 });

  const { data, error } = await supabase
    .from("family_members")
    .select("id, full_name, relation, is_minor, date_of_birth, biological_sex")
    .eq("household_id", household.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

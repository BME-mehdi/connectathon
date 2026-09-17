import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canTransition } from "@/lib/referral/stateMachine";
import { ReferralUpdateSchema } from "@/lib/validation/screening";

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = ReferralUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Fetch current referral status
  const { data: referral } = await supabase
    .from("referrals").select("id, status").eq("id", parsed.data.referral_id).single();
  if (!referral) return NextResponse.json({ error: "Referral not found" }, { status: 404 });

  // Check JWT role for pharmacist-gated transitions
  const { data: { session } } = await supabase.auth.getSession();
  const actorRole = (session?.user?.user_metadata?.role as string) ?? undefined;

  const check = canTransition(referral.status as any, parsed.data.status, actorRole);
  if (!check.allowed) {
    return NextResponse.json({ error: check.reason }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("referrals")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.referral_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log
  await supabase.from("audit_log").insert({
    actor: user.id,
    action: `referral.${parsed.data.status}`,
    entity: "referrals",
    entity_id: parsed.data.referral_id,
    metadata: { from: referral.status, to: parsed.data.status },
  });

  return NextResponse.json(data);
}

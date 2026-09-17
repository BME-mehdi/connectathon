import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canTransition } from "@/lib/referral/stateMachine";
import { ReferralUpdateSchema } from "@/lib/validation/screening";

// PATCH /api/referral
//
// Two kinds of update, both gated by the state machine + RLS:
//  1. A real status transition (lab marking attended/no_show/results_ready,
//     or the household re-requesting after a no_show).
//  2. A reschedule: same status resubmitted with a new `scheduled_at`, only
//     meaningful (and only allowed by RLS) while status is 'request_sent'.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = ReferralUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data: referral } = await supabase
    .from("referrals").select("id, status").eq("id", parsed.data.referral_id).single();
  if (!referral) return NextResponse.json({ error: "Referral not found" }, { status: 404 });

  // app_metadata, not user_metadata: the latter is client-settable by any
  // signed-in user via the JS SDK, so it can never be trusted for role
  // gating. app_metadata is only writable via the service-role admin API.
  const { data: { session } } = await supabase.auth.getSession();
  const actorRole = (session?.user?.app_metadata?.role as string) ?? undefined;

  // Case 1: reschedule without a status change — only valid while still
  // 'request_sent'. RLS enforces this too (appointments_update_household).
  if (parsed.data.status === referral.status) {
    if ((referral.status !== "request_sent" && referral.status !== "scheduled") || !parsed.data.scheduled_at) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const { error } = await supabase
      .from("appointments")
      .update({ scheduled_at: parsed.data.scheduled_at })
      .eq("referral_id", referral.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("audit_log").insert({
      actor: user.id,
      action: "referral.rescheduled",
      entity: "referrals",
      entity_id: referral.id,
      metadata: { scheduled_at: parsed.data.scheduled_at },
    });

    return NextResponse.json({ status: referral.status, scheduled_at: parsed.data.scheduled_at });
  }

  // Case 2: a real state transition
  const check = canTransition(referral.status as any, parsed.data.status, actorRole);
  if (!check.allowed) {
    return NextResponse.json({ error: check.reason }, { status: 403 });
  }

  if (parsed.data.status === "results_ready" && !parsed.data.result_tier) {
    return NextResponse.json({ error: "result_tier is required to mark results_ready." }, { status: 400 });
  }

  const updatePayload: Record<string, unknown> = {
    status: parsed.data.status,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.status === "results_ready") {
    updatePayload.result_tier = parsed.data.result_tier;
    updatePayload.result_summary = parsed.data.result_summary ?? null;
    updatePayload.results_entered_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("referrals")
    .update(updatePayload)
    .eq("id", parsed.data.referral_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Side effects on the appointment row
  if (parsed.data.status === "analyzing") {
    await supabase.from("appointments")
      .update({ attended_at: new Date().toISOString() })
      .eq("referral_id", referral.id);
  }
  if ((parsed.data.status === "request_sent" || parsed.data.status === "scheduled") && parsed.data.scheduled_at) {
    await supabase.from("appointments")
      .update({ scheduled_at: parsed.data.scheduled_at })
      .eq("referral_id", referral.id);
  }

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

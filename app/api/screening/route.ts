import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ScreeningSubmissionSchema } from "@/lib/validation/screening";
import { computeDiabscore, FORMULA_VERSION, type DiabscoreInputs } from "@/lib/scoring";
import { nextBusinessSlot } from "@/lib/referral/scheduling";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = ScreeningSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify family member belongs to this user's household (RLS enforces this too)
  const { data: member } = await supabase
    .from("family_members")
    .select("id, household_id, households(region)")
    .eq("id", parsed.data.family_member_id)
    .single();
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Insert screening response
  const { data: response, error } = await supabase
    .from("screening_responses")
    .insert({
      family_member_id: parsed.data.family_member_id,
      age: parsed.data.age,
      waist_cm: parsed.data.waist_cm,
      height_cm: parsed.data.height_cm,
      family_history_t2d: parsed.data.family_history_t2d,
      gestational_diabetes_history: parsed.data.gestational_diabetes_history ?? null,
      activity_level: parsed.data.activity_level ?? null,
      diet_score: parsed.data.diet_score ?? null,
      bp_medication: parsed.data.bp_medication ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Compute the score and, if high-risk, auto-create the lab referral
  // right here — this is the app's single source of truth for scoring.
  // (No external service needs to be running for a screening to produce a
  // result; the n8n workflows in n8n-workflows/ remain available as optional
  // reference automation but nothing here depends on them.)
  const admin = createServiceClient();
  const result = computeDiabscore({
    age: response.age,
    waist_cm: response.waist_cm,
    height_cm: response.height_cm,
    family_history_t2d: response.family_history_t2d,
    gestational_diabetes_history: response.gestational_diabetes_history,
    // DB-constrained to exactly these values (001_initial_schema.sql CHECK),
    // but gen-types keeps CHECK-constrained TEXT columns as plain `string`.
    activity_level: response.activity_level as DiabscoreInputs["activity_level"],
    diet_score: response.diet_score,
    bp_medication: response.bp_medication,
  });

  const { data: score, error: scoreErr } = await admin
    .from("risk_scores")
    .insert({
      family_member_id:      response.family_member_id,
      screening_response_id: response.id,
      score_value:           result.score_value,
      tier:                  result.tier,
      formula_version:       FORMULA_VERSION,
      findrisc_bonus:        result.breakdown.findrisc_bonus || null,
    })
    .select()
    .single();

  if (scoreErr) return NextResponse.json({ error: scoreErr.message }, { status: 500 });

  let referralId: string | null = null;
  if (result.tier === "high") {
    // For demo purposes: find "Laboratoire d'Analyses médicales Farah Messai Mahjoub"
    let targetLabId: string | null = null;

    const { data: farahLab } = await admin
      .from("partner_labs")
      .select("id")
      .ilike("name", "%Farah Messai Mahjoub%")
      .maybeSingle();

    if (farahLab) {
      targetLabId = farahLab.id;
    } else {
      // Fallback: nearest active partner lab in the household's region
      const region = member.households?.region;
      if (region) {
        const { data: regLab } = await admin
          .from("partner_labs")
          .select("id")
          .eq("region", region)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (regLab) targetLabId = regLab.id;
      }
    }

    const { data: referral, error: referralErr } = await admin
      .from("referrals")
      .insert({
        family_member_id: response.family_member_id,
        risk_score_id: score.id,
        lab_id: targetLabId,
        status: "request_sent",
      })
      .select("id")
      .single();

    if (!referralErr && referral) {
      referralId = referral.id;

      if (targetLabId) {
        // Default slot: next business day at 09:00. The household can reschedule
        // from the referral page while the referral is still 'request_sent'.
        await admin.from("appointments").insert({
          referral_id: referral.id,
          lab_id: targetLabId,
          scheduled_at: nextBusinessSlot().toISOString(),
        });
      }
    }
  }

  // Best-effort — the payer dashboard (app/(payer)/payer) reads this
  // materialized view, and nothing else refreshes it on a schedule yet.
  // Never let a refresh failure fail the screening submission itself.
  try {
    await admin.rpc("refresh_aggregate_outcomes");
  } catch (err) {
    console.error("[screening] aggregate_outcomes refresh failed:", err);
  }

  return NextResponse.json({
    id: response.id,
    status: "scored",
    tier: result.tier,
    score_id: score.id,
    referral_id: referralId,
  }, { status: 201 });
}

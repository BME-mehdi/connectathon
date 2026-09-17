import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ScreeningSubmissionSchema } from "@/lib/validation/screening";
import { computeDiabscore, FORMULA_VERSION } from "@/lib/scoring";
import { nextBusinessSlot, getDemoConsultationSlot } from "@/lib/referral/scheduling";

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
    activity_level: response.activity_level,
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

    // 1. Try to find Farah Messai Mahjoub in partner_labs or partner_pharmacies
    const { data: farahLab } = await admin
      .from("partner_labs")
      .select("id")
      .ilike("name", "%Farah Messai Mahjoub%")
      .maybeSingle();

    if (farahLab) {
      targetLabId = farahLab.id;
    } else {
      const { data: farahPharm } = await admin
        .from("partner_pharmacies")
        .select("id")
        .ilike("name", "%Farah Messai Mahjoub%")
        .maybeSingle();
      if (farahPharm) {
        targetLabId = farahPharm.id;
      }
    }

    // 2. Fallback to regional lab if not found
    if (!targetLabId) {
      const region = (member as any).households?.region as string | undefined;
      if (region) {
        const { data: regLab } = await admin
          .from("partner_labs")
          .select("id")
          .eq("region", region)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (regLab) {
          targetLabId = regLab.id;
        } else {
          const { data: regPharm } = await admin
            .from("partner_pharmacies")
            .select("id")
            .eq("region", region)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          if (regPharm) {
            targetLabId = regPharm.id;
          }
        }
      }
    }

    // Insert referral (supporting both migration 006 lab_id and original pharmacy_id)
    let referral: any = null;
    let referralErr: any = null;

    const res1 = await admin
      .from("referrals")
      .insert({
        family_member_id: response.family_member_id,
        risk_score_id: score.id,
        lab_id: targetLabId,
        status: "request_sent",
      })
      .select("id")
      .single();

    if (!res1.error && res1.data) {
      referral = res1.data;
    } else {
      const res2 = await admin
        .from("referrals")
        .insert({
          family_member_id: response.family_member_id,
          risk_score_id: score.id,
          pharmacy_id: targetLabId,
          status: "scheduled",
        })
        .select("id")
        .single();
      referral = res2.data;
      referralErr = res2.error;
    }

    if (!referralErr && referral && targetLabId) {
      // Demo requirement: Friday at 13h00
      const scheduledAt = getDemoConsultationSlot().toISOString();

      const appt1 = await admin.from("appointments").insert({
        referral_id: referral.id,
        lab_id: targetLabId,
        scheduled_at: scheduledAt,
      });

      if (appt1.error) {
        await admin.from("appointments").insert({
          referral_id: referral.id,
          pharmacy_id: targetLabId,
          scheduled_at: scheduledAt,
        });
      }
      referralId = referral.id;
    } else if (!referralErr && referral) {
      referralId = referral.id;
    }
  }

  return NextResponse.json({
    id: response.id,
    status: "scored",
    tier: result.tier,
    score_id: score.id,
    referral_id: referralId,
  }, { status: 201 });
}

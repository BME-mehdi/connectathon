import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { computeDiabscore, FORMULA_VERSION } from "@/lib/scoring";
import { z } from "zod";

// This route is called by n8n OR directly for testing.
// Uses service role to write risk_scores (bypasses RLS — intentional),
// so it MUST verify the shared secret below before touching the DB —
// without it, anyone who learns a screening_response_id could write
// arbitrary risk_scores rows and repeatedly re-trigger referral creation,
// corrupting the CNAM-facing aggregate stats this app is built to protect.

const WebhookSchema = z.object({
  screening_response_id: z.string().uuid(),
});

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.SCORING_WEBHOOK_SECRET;
  if (!secret) return false; // fail closed if misconfigured

  const provided = req.headers.get("x-webhook-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = WebhookSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: response, error: fetchErr } = await supabase
    .from("screening_responses")
    .select("*")
    .eq("id", parsed.data.screening_response_id)
    .single();

  if (fetchErr || !response) {
    return NextResponse.json({ error: "Screening response not found" }, { status: 404 });
  }

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

  const { data: score, error: insertErr } = await supabase
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

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Trigger referral workflow if high-risk
  if (result.tier === "high") {
    const webhookUrl = process.env.N8N_WEBHOOK_BASE_URL;
    if (webhookUrl) {
      fetch(`${webhookUrl}/referral-trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family_member_id: response.family_member_id, risk_score_id: score.id }),
      }).catch(err => console.error("[referral trigger]", err));
    }
  }

  return NextResponse.json({ score_id: score.id, tier: result.tier });
}

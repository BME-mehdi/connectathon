import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ScreeningSubmissionSchema } from "@/lib/validation/screening";

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
    .select("id, household_id")
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

  // Trigger n8n scoring workflow (fire-and-forget — score arrives asynchronously)
  const webhookUrl = process.env.N8N_WEBHOOK_BASE_URL;
  if (webhookUrl) {
    fetch(`${webhookUrl}/scoring-trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screening_response_id: response.id }),
    }).catch(err => console.error("[n8n trigger]", err));
  }

  return NextResponse.json({ id: response.id, status: "pending_score" }, { status: 201 });
}

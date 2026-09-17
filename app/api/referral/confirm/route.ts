import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

// POST /api/referral/confirm
// PHARMACIST-ONLY action — sets status to physician_confirmed AND stamps confirmed_by_pharmacist_at on the appointment.
// This is the ONLY code path that can reach physician_confirmed.
// DB-level RLS also enforces this — belt and suspenders.

const ConfirmSchema = z.object({
  referral_id:    z.string().uuid(),
  appointment_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check role claim (set in Supabase user_metadata or JWT custom claim)
  const { data: { session } } = await supabase.auth.getSession();
  const role = session?.user?.user_metadata?.role as string | undefined;
  if (role !== "pharmacist") {
    return NextResponse.json(
      { error: "Only pharmacist role may confirm a test result." },
      { status: 403 }
    );
  }

  // Parse body (also handles form POST — content-type agnostic)
  let body: Record<string, string> = {};
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    body = await req.json();
  } else {
    const fd = await req.formData();
    fd.forEach((v, k) => { body[k] = v as string; });
  }

  const parsed = ConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify referral exists and is in a state that allows physician_confirmed
  const { data: referral } = await supabase
    .from("referrals").select("id, status").eq("id", parsed.data.referral_id).single();
  if (!referral) return NextResponse.json({ error: "Referral not found" }, { status: 404 });

  if (!["completed", "no_show"].includes(referral.status)) {
    return NextResponse.json(
      { error: `Cannot confirm from status '${referral.status}'. Must be completed or no_show first.` },
      { status: 409 }
    );
  }

  // Update referral status
  const { error: referralErr } = await supabase
    .from("referrals")
    .update({ status: "physician_confirmed", updated_at: new Date().toISOString() })
    .eq("id", parsed.data.referral_id);
  if (referralErr) return NextResponse.json({ error: referralErr.message }, { status: 500 });

  // Stamp appointment confirmation time
  const { error: aptErr } = await supabase
    .from("appointments")
    .update({ confirmed_by_pharmacist_at: new Date().toISOString() })
    .eq("id", parsed.data.appointment_id);
  if (aptErr) return NextResponse.json({ error: aptErr.message }, { status: 500 });

  // Audit log — physician_confirmed is always audited
  await supabase.from("audit_log").insert({
    actor:     user.id,
    action:    "referral.physician_confirmed",
    entity:    "referrals",
    entity_id: parsed.data.referral_id,
    metadata:  { appointment_id: parsed.data.appointment_id, confirmed_by: user.email },
  });

  return NextResponse.json({ status: "physician_confirmed" });
}

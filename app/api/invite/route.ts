import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { InviteAdultSchema } from "@/lib/validation/invite";
import { getMyHousehold } from "@/lib/household";

/**
 * POST /api/invite
 *
 * Household owner invites another adult. No personal data about the invitee
 * is written yet — only a Supabase Auth invite is sent. The invitee's own
 * family_members row + self-consent are created by THEM on acceptance
 * (see /api/invite/accept), which is the real consent step required by spec:
 * an adult's data is never entered by anyone else on their behalf.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = InviteAdultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Any adult already in the household — owner or invited member — can
  // invite another adult, not just the owner.
  const household = await getMyHousehold(supabase, user.id);
  if (!household) return NextResponse.json({ error: "Household not found" }, { status: 404 });

  const { origin } = new URL(req.url);
  const admin = createServiceClient();

  const { error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/onboarding/accept`,
    data: {
      invited_household_id: household.id,
      invited_household_name: household.name,
      invited_relation: parsed.data.relation,
    },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ invited: true, email: parsed.data.email }, { status: 201 });
}

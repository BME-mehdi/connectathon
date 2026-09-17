import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HouseholdCreateSchema } from "@/lib/validation/screening";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = HouseholdCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("households")
    .insert({ ...parsed.data, owner_user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Automatically add the owner as the first family member (relation: 'self')
  await supabase.from("family_members").insert({
    household_id: data.id,
    user_id: user.id,
    full_name: user.email ?? "Moi",
    relation: "self",
    is_minor: false,
    date_of_birth: "1900-01-01", // placeholder — updated in screening form
  });

  return NextResponse.json(data, { status: 201 });
}

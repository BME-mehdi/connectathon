import type { SupabaseClient } from "@supabase/supabase-js";

export interface MyHousehold {
  id: string;
  name: string;
  region: string;
  owner_user_id: string;
  isOwner: boolean;
}

/**
 * Resolves the current user's household whether they OWN it or were
 * invited into it as a member — never filter on owner_user_id alone, or
 * every non-owner adult in the household is locked out of their own data.
 * Relies on RLS ("households_select") already scoping visibility to
 * exactly the one household this user can see.
 */
export async function getMyHousehold(
  supabase: SupabaseClient,
  userId: string
): Promise<MyHousehold | null> {
  const { data } = await supabase
    .from("households")
    .select("id, name, region, owner_user_id")
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { ...data, isOwner: data.owner_user_id === userId };
}

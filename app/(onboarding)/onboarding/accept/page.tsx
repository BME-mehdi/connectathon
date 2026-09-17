import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AcceptForm from "./AcceptForm";

export default async function AcceptInvitePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const householdId = user.user_metadata?.invited_household_id as string | undefined;
  const householdName = (user.user_metadata?.invited_household_name as string | undefined) ?? "";

  if (!householdId) {
    // Not an invited user — regular onboarding path
    redirect("/onboarding");
  }

  const admin = createServiceClient();
  const { data: existingMember } = await admin
    .from("family_members")
    .select("id")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMember) redirect("/screening");

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Rejoindre le foyer</h1>
          <p className="text-slate-500 text-sm mt-1">
            Confirmez vos informations pour participer au dépistage.
          </p>
        </div>
        <AcceptForm householdName={householdName} />
      </div>
    </div>
  );
}

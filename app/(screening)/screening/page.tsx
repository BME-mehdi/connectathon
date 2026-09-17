import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function ScreeningIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get household & members eligible for screening
  const { data: household } = await supabase
    .from("households").select("id, name").eq("owner_user_id", user.id).single();
  if (!household) redirect("/onboarding");

  const { data: members } = await supabase
    .from("family_members")
    .select("id, full_name, relation, is_minor")
    .eq("household_id", household.id)
    .eq("is_minor", false); // Only adults are screened

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h1 className="text-xl font-semibold text-slate-900 mb-1">
            Dépistage familial
          </h1>
          <p className="text-slate-500 text-sm">
            Sélectionnez un membre pour compléter le questionnaire DIABSCORE.
          </p>
        </div>

        <ul className="space-y-3">
          {members?.map(member => (
            <li key={member.id}>
              <Link
                href={`/screening/${member.id}`}
                className="flex items-center justify-between bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-400 transition-colors"
              >
                <div>
                  <p className="font-medium text-slate-800">{member.full_name}</p>
                  <p className="text-xs text-slate-500">{member.relation}</p>
                </div>
                <span className="text-slate-400 text-lg">→</span>
              </Link>
            </li>
          ))}
        </ul>

        {(!members || members.length === 0) && (
          <p className="text-center text-slate-500 text-sm">
            Aucun membre adulte trouvé.{" "}
            <Link href="/onboarding/members/add" className="underline">Ajouter un membre</Link>
          </p>
        )}
      </div>
    </div>
  );
}

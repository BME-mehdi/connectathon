import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function MembersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: household } = await supabase
    .from("households").select("id, name").eq("owner_user_id", user.id).single();
  if (!household) redirect("/onboarding/create");

  const { data: members } = await supabase
    .from("family_members").select("id, full_name, relation, is_minor").eq("household_id", household.id);

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">Membres du foyer</h1>
          <p className="text-slate-500 text-sm">
            Ajoutez chaque membre adulte qui souhaite participer au dépistage.
          </p>

          {members && members.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {members.map(m => (
                <li key={m.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{m.full_name}</p>
                    <p className="text-xs text-slate-500">{m.relation}{m.is_minor ? " · mineur" : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-3 pt-2">
            <Link
              href="/onboarding/members/add"
              className="flex-1 text-center rounded-lg border border-slate-300 text-slate-700 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              + Ajouter un membre
            </Link>
            <Link
              href="/onboarding/invite"
              className="flex-1 text-center rounded-lg border border-slate-300 text-slate-700 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Inviter un adulte
            </Link>
          </div>
        </div>

        <Link
          href="/screening"
          className="block text-center rounded-lg bg-slate-800 text-white py-2.5 text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          Commencer le dépistage →
        </Link>
      </div>
    </div>
  );
}

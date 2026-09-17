import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FamilyTree, RELATION_LABEL } from "@/components/family/FamilyTree";
import { getMyHousehold } from "@/lib/household";

export default async function MembersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Owned household, or the one this user was invited into — either way,
  // this is "their" family tree.
  const household = await getMyHousehold(supabase, user.id);
  if (!household) redirect("/onboarding/create");

  const { data: members } = await supabase
    .from("family_members").select("id, full_name, relation, is_minor, email").eq("household_id", household.id);

  // The household owner's own row (relation: "self") is represented by the
  // "Vous" node in the tree / implicitly by the account — never list it
  // again as a separate member, or it would appear twice.
  const otherMembers = members?.filter(m => m.relation !== "self") ?? [];

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="bg-card rounded-2xl border border-border shadow-soft p-6 space-y-4">
          <h1 className="text-xl">Membres du foyer</h1>
          <p className="text-muted-foreground text-sm">
            Ajoutez chaque membre adulte qui souhaite participer au dépistage.
          </p>

          {otherMembers.length > 0 && (
            <ul className="divide-y divide-border">
              {otherMembers.map(m => (
                <li key={m.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {RELATION_LABEL[m.relation] ?? m.relation}{m.is_minor ? " · mineur" : ""}
                      {m.email ? ` · ${m.email}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-3 pt-2">
            <Link
              href="/onboarding/members/add"
              className="flex-1 text-center rounded-lg border border-border bg-background text-foreground py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              + Ajouter un enfant
            </Link>
            <Link
              href="/onboarding/invite"
              className="flex-1 text-center rounded-lg border border-border bg-background text-foreground py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              + Inviter un adulte
            </Link>
          </div>
        </div>

        {otherMembers.length > 0 && (
          <div className="bg-card rounded-2xl border border-border shadow-soft p-6 space-y-4">
            <div>
              <p className="label-caps text-accent-foreground mb-1">{household.name}</p>
              <h2 className="text-lg">Arbre familial</h2>
            </div>
            <FamilyTree ownerName="Vous" members={otherMembers} />
          </div>
        )}

        <Link
          href="/screening"
          className="block text-center rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/80 transition-colors"
        >
          Commencer le dépistage →
        </Link>
      </div>
    </div>
  );
}

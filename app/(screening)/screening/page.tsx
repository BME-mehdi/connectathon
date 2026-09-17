import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getMyHousehold } from "@/lib/household";
import { RELATION_LABEL } from "@/components/family/FamilyTree";

export default async function ScreeningIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get household (owned, or joined via invite) & members
  const household = await getMyHousehold(supabase, user.id);
  if (!household) redirect("/onboarding");

  const { data: allMembers } = await supabase
    .from("family_members")
    .select("id, full_name, relation, is_minor")
    .eq("household_id", household.id)
    .order("created_at", { ascending: true });

  const adultMembers = allMembers?.filter(m => !m.is_minor) ?? [];
  const minorMembers = allMembers?.filter(m => m.is_minor) ?? [];

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="bg-card rounded-2xl border border-border shadow-soft p-6 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-xl">
              Dépistage familial
            </h1>
            <span className="text-xs bg-secondary text-secondary-foreground px-2.5 py-1 rounded-full font-medium">
              {household.name}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Sélectionnez un membre adulte pour compléter le questionnaire clinique DIABSCORE.
          </p>
        </div>

        {/* Adult Members Eligible for Screening */}
        <div className="space-y-3">
          <h2 className="label-caps text-muted-foreground px-1">
            Adultes éligibles au dépistage
          </h2>
          {adultMembers.length > 0 ? (
            <ul className="space-y-2">
              {adultMembers.map(member => (
                <li key={member.id} className="flex items-center justify-between gap-2 bg-card rounded-xl border border-border p-4 hover:border-accent hover:shadow-soft transition-all">
                  <div>
                    <p className="font-medium text-foreground">{member.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {RELATION_LABEL[member.relation] ?? member.relation}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/screening/${member.id}/history`}
                      className="text-muted-foreground bg-muted px-3 py-1 rounded-lg text-xs font-medium hover:bg-muted/70"
                    >
                      Historique
                    </Link>
                    <Link
                      href={`/screening/${member.id}`}
                      className="text-primary bg-secondary px-3 py-1 rounded-lg text-xs font-medium hover:bg-secondary/70"
                    >
                      Évaluer →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="bg-card rounded-xl border border-border p-4 text-center text-sm text-muted-foreground">
              Aucun adulte trouvé pour le dépistage.
            </div>
          )}
        </div>

        {/* Minors / Children in Household */}
        {minorMembers.length > 0 && (
          <div className="space-y-3">
            <h2 className="label-caps text-muted-foreground px-1">
              Enfants & Mineurs du foyer
            </h2>
            <ul className="space-y-2">
              {minorMembers.map(child => (
                <li
                  key={child.id}
                  className="flex items-center justify-between bg-card rounded-xl border border-border p-4"
                >
                  <div>
                    <p className="font-medium text-foreground">{child.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {RELATION_LABEL[child.relation] ?? child.relation}
                    </p>
                  </div>
                  <span className="text-xs bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1 rounded-full font-medium">
                    Mineur (antécédents enregistrés)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Buttons to Add Members / Children */}
        <div className="bg-card rounded-2xl border border-border shadow-soft p-4 space-y-3">
          <p className="label-caps text-muted-foreground">
            Gérer la composition du foyer
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/onboarding/members/add"
              className="text-center rounded-lg border border-border bg-background text-foreground py-2.5 px-3 text-xs font-medium hover:bg-muted transition-colors"
            >
              + Ajouter un enfant
            </Link>
            <Link
              href="/onboarding/invite"
              className="text-center rounded-lg border border-border bg-background text-foreground py-2.5 px-3 text-xs font-medium hover:bg-muted transition-colors"
            >
              + Inviter un adulte
            </Link>
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <Link
            href="/referral"
            className="text-xs text-muted-foreground hover:text-primary underline"
          >
            Voir les orientations médicales et rendez-vous →
          </Link>
        </div>
      </div>
    </div>
  );
}

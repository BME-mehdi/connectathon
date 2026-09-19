import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { TIER_LABELS } from "@/lib/scoring";
import { STATUS_LABELS } from "@/lib/referral/labels";

interface Props {
  params: Promise<{ memberId: string }>;
}

const TIER_BADGE: Record<string, string> = {
  low:      "bg-emerald-50 text-emerald-800 border-emerald-200",
  moderate: "bg-amber-50 text-amber-800 border-amber-200",
  high:     "bg-rose-50 text-rose-800 border-rose-200",
};

export default async function EvaluationHistoryPage({ params }: Props) {
  const { memberId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // RLS scopes this to the caller's own household — a member not in this
  // household will simply get "not found" below.
  const { data: member } = await supabase
    .from("family_members").select("id, full_name").eq("id", memberId).single();
  if (!member) redirect("/screening");

  const { data: scores } = await supabase
    .from("risk_scores")
    .select("id, score_value, tier, formula_version, computed_at, referrals(id, status)")
    .eq("family_member_id", memberId)
    .order("computed_at", { ascending: false });

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="bg-card rounded-2xl border border-border shadow-soft p-6">
          <p className="label-caps text-accent-foreground mb-1">Historique</p>
          <h1 className="text-xl">{member.full_name}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Toutes les évaluations DIABSCORE passées pour ce membre.
          </p>
        </div>

        {scores && scores.length > 0 ? (
          <ul className="space-y-3">
            {scores.map(s => {
              const referral = s.referrals?.[0] ?? s.referrals;
              const status = referral ? STATUS_LABELS[referral.status] : null;
              return (
                <li key={s.id} className={`rounded-xl border p-4 space-y-2 ${TIER_BADGE[s.tier] ?? "bg-card border-border"}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-2xl font-heading font-bold">{Math.round(s.score_value)}</p>
                      <p className="text-sm font-medium">{TIER_LABELS[s.tier as keyof typeof TIER_LABELS]?.fr}</p>
                    </div>
                    <p className="text-xs opacity-70">
                      {new Date(s.computed_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <p className="text-xs opacity-60">Formule {s.formula_version}</p>
                  {referral && status && (
                    <Link
                      href={`/referral/${referral.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium underline"
                    >
                      {status.fr} →
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="bg-card rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
            Aucune évaluation pour l&apos;instant.
          </div>
        )}

        <Link href="/screening" className="block text-center text-muted-foreground text-sm underline">
          ← Retour au dépistage
        </Link>
      </div>
    </div>
  );
}

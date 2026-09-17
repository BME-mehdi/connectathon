import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TIER_LABELS } from "@/lib/scoring";

interface Props {
  params: Promise<{ memberId: string }>;
}

const TIER_COLORS = {
  low:      "bg-emerald-50 border-emerald-200 text-emerald-800",
  moderate: "bg-amber-50 border-amber-200 text-amber-800",
  high:     "bg-slate-100 border-slate-400 text-slate-900",
} as const;

const TIER_EXPLANATIONS: Record<string, string> = {
  low:
    "Votre score indique un risque faible de diabète de type 2 non diagnostiqué. Maintenez de bonnes habitudes de vie et refaites le dépistage dans 12 mois.",
  moderate:
    "Votre score indique un risque modéré. Il est recommandé de consulter un professionnel de santé pour un suivi et d'adopter des mesures préventives.",
  high:
    "Votre score indique un risque élevé. Nous vous orientons vers un test de confirmation auprès d'une pharmacie partenaire. Un pharmacien vous contactera.",
};

export default async function ResultPage({ params }: Props) {
  const { memberId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Poll for the most recent score for this member
  const { data: score } = await supabase
    .from("risk_scores")
    .select("score_value, tier, formula_version, computed_at")
    .eq("family_member_id", memberId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .single();

  const { data: member } = await supabase
    .from("family_members").select("full_name").eq("id", memberId).single();

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Non-diagnostic disclaimer — always shown, always above the score */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-xs text-blue-700 leading-relaxed">
            <strong>Important :</strong> Ce résultat est un <em>indicateur de risque</em>, pas un diagnostic médical.
            Seul un professionnel de santé peut établir un diagnostic après des examens cliniques appropriés.
          </p>
        </div>

        {score ? (
          <div className={`rounded-2xl border p-6 space-y-4 ${TIER_COLORS[score.tier as keyof typeof TIER_COLORS]}`}>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide opacity-60 mb-1">
                {member?.full_name ?? "Résultat"}
              </p>
              <p className="text-5xl font-bold tabular-nums">{Math.round(score.score_value)}</p>
              <p className="text-lg font-semibold mt-1">
                {TIER_LABELS[score.tier as keyof typeof TIER_LABELS]?.fr}
              </p>
            </div>

            <p className="text-sm leading-relaxed opacity-80">
              {TIER_EXPLANATIONS[score.tier]}
            </p>

            <p className="text-xs opacity-50">
              Formule : {score.formula_version} · Calculé le{" "}
              {new Date(score.computed_at).toLocaleDateString("fr-FR")}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto" />
            <p className="text-slate-500 text-sm">Calcul du score en cours…</p>
            <p className="text-xs text-slate-400">
              Rafraîchissez la page dans quelques secondes.
            </p>
          </div>
        )}

        {score?.tier === "high" && (
          <div className="bg-white rounded-2xl border border-slate-300 p-5 space-y-3">
            <p className="text-sm font-medium text-slate-800">Prochaine étape : test de confirmation</p>
            <p className="text-sm text-slate-500">
              Un rendez-vous dans une pharmacie partenaire de votre région a été créé.
            </p>
            <a
              href="/referral"
              className="block text-center rounded-lg bg-slate-800 text-white py-2 text-sm font-medium hover:bg-slate-700 transition-colors"
            >
              Voir mon rendez-vous →
            </a>
          </div>
        )}

        <a href="/screening" className="block text-center text-slate-500 text-sm underline">
          ← Retour aux membres
        </a>
      </div>
    </div>
  );
}

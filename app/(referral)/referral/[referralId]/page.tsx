import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

interface Props {
  params: Promise<{ referralId: string }>;
}

const STATUS_LABELS: Record<string, { fr: string; color: string }> = {
  flagged:             { fr: "En attente de rendez-vous",  color: "bg-amber-100 text-amber-800" },
  scheduled:           { fr: "Rendez-vous planifié",       color: "bg-blue-100 text-blue-800" },
  completed:           { fr: "Test réalisé",               color: "bg-muted text-muted-foreground" },
  no_show:             { fr: "Absent au rendez-vous",      color: "bg-rose-100 text-rose-800" },
  physician_confirmed: { fr: "Confirmé par le pharmacien", color: "bg-emerald-100 text-emerald-800" },
};

export default async function ReferralDetailPage({ params }: Props) {
  const { referralId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: referral } = await supabase
    .from("referrals")
    .select(`
      id, status, created_at,
      family_members(full_name),
      partner_pharmacies(name, address, phone, region),
      appointments(id, scheduled_at, confirmed_by_pharmacist_at),
      risk_scores(score_value, tier, formula_version, computed_at)
    `)
    .eq("id", referralId)
    .single();

  if (!referral) redirect("/referral");

  const status = STATUS_LABELS[referral.status] ?? { fr: referral.status, color: "bg-muted text-muted-foreground" };
  const pharmacy = referral.partner_pharmacies as any;
  const member   = referral.family_members as any;
  const score    = referral.risk_scores as any;
  const appointment = (referral.appointments as any[])?.[0];

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-4">

        <div className="bg-card rounded-2xl border border-border shadow-soft p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl">Orientation médicale</h1>
              <p className="text-muted-foreground text-sm">{member?.full_name}</p>
            </div>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.color}`}>
              {status.fr}
            </span>
          </div>

          {score && (
            <div className="bg-muted rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs text-muted-foreground">Score DIABSCORE</p>
              <p className="text-2xl font-heading font-bold text-primary">{Math.round(score.score_value)}</p>
              <p className="text-xs text-muted-foreground/70">
                Formule {score.formula_version} · {new Date(score.computed_at).toLocaleDateString("fr-FR")}
              </p>
            </div>
          )}

          {pharmacy && (
            <div className="space-y-1">
              <p className="label-caps text-muted-foreground">Pharmacie partenaire</p>
              <p className="text-sm font-medium text-foreground">{pharmacy.name}</p>
              <p className="text-xs text-muted-foreground">{pharmacy.address}</p>
              <p className="text-xs text-muted-foreground">{pharmacy.phone}</p>
            </div>
          )}

          {appointment ? (
            <div className="space-y-1">
              <p className="label-caps text-muted-foreground">Rendez-vous</p>
              <p className="text-sm text-foreground">
                {new Date(appointment.scheduled_at).toLocaleDateString("fr-FR", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                })}
              </p>
              {appointment.confirmed_by_pharmacist_at && (
                <p className="text-xs text-emerald-600">
                  Confirmé le {new Date(appointment.confirmed_by_pharmacist_at).toLocaleDateString("fr-FR")}
                </p>
              )}
            </div>
          ) : (
            referral.status === "flagged" && (
              <Link
                href={`/referral/${referralId}/book`}
                className="block text-center rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/80 transition-colors"
              >
                Choisir un créneau →
              </Link>
            )
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-xs text-blue-700">
            <strong>Rappel :</strong> Ce test de confirmation est réalisé par un pharmacien agréé.
            Le statut « Confirmé » ne peut être défini que manuellement par le professionnel de santé après l'examen.
          </p>
        </div>

        <Link href="/referral" className="block text-center text-muted-foreground text-sm underline">
          ← Retour aux orientations
        </Link>
      </div>
    </div>
  );
}

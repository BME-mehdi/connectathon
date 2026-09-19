import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { STATUS_LABELS, RESULT_TIER_LABELS } from "@/lib/referral/labels";

interface Props {
  params: Promise<{ referralId: string }>;
}

const STEPS = ["request_sent", "analyzing", "results_ready"] as const;

export default async function ReferralDetailPage({ params }: Props) {
  const { referralId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: referral } = await supabase
    .from("referrals")
    .select(`
      id, status, created_at, result_tier, result_summary, results_entered_at,
      family_members(full_name),
      partner_labs(name, address, phone, region),
      appointments(id, scheduled_at, attended_at),
      risk_scores(score_value, tier, formula_version, computed_at)
    `)
    .eq("id", referralId)
    .single();

  if (!referral) redirect("/referral");

  const status = STATUS_LABELS[referral.status] ?? { fr: referral.status, color: "bg-muted text-muted-foreground" };
  const lab    = referral.partner_labs;
  const member = referral.family_members;
  const score  = referral.risk_scores;
  const appointment = referral.appointments?.[0];

  // "no_show" is a detour off the main path, not a step on it
  const normalizedStatus = referral.status === "scheduled" || referral.status === "flagged" ? "request_sent" : referral.status;
  const stepIndex = STEPS.indexOf(normalizedStatus as typeof STEPS[number]);

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

          {/* Progress steps */}
          {stepIndex >= 0 && (
            <div className="flex items-center gap-1">
              {STEPS.map((s, i) => (
                <div key={s} className="flex-1 flex items-center gap-1">
                  <div className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-accent" : "bg-muted"}`} />
                </div>
              ))}
            </div>
          )}
          {referral.status === "no_show" && (
            <p className="text-xs text-rose-600">Consultation manquée — redemandez un rendez-vous ci-dessous.</p>
          )}

          {score && (
            <div className="bg-muted rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs text-muted-foreground">Score DIABSCORE</p>
              <p className="text-2xl font-heading font-bold text-primary">{Math.round(score.score_value)}</p>
              <p className="text-xs text-muted-foreground/70">
                Formule {score.formula_version} · {new Date(score.computed_at).toLocaleDateString("fr-FR")}
              </p>
            </div>
          )}

          {lab && (
            <div className="space-y-1">
              <p className="label-caps text-muted-foreground">Laboratoire partenaire</p>
              <p className="text-sm font-medium text-foreground">{lab.name}</p>
              <p className="text-xs text-muted-foreground">{lab.address}</p>
              <p className="text-xs text-muted-foreground">{lab.phone}</p>
            </div>
          )}

          {appointment && (
            <div className="space-y-1">
              <p className="label-caps text-muted-foreground">Rendez-vous</p>
              <p className="text-sm text-foreground">
                {new Date(appointment.scheduled_at).toLocaleDateString("fr-FR", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </p>
              {appointment.attended_at && (
                <p className="text-xs text-emerald-600">
                  Consultation confirmée le {new Date(appointment.attended_at).toLocaleDateString("fr-FR")}
                </p>
              )}
            </div>
          )}

          {(referral.status === "request_sent" || referral.status === "scheduled" || referral.status === "no_show") && (
            <Link
              href={`/referral/${referralId}/book`}
              className="block text-center rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/80 transition-colors"
            >
              {referral.status === "no_show" ? "Redemander un rendez-vous →" : "Changer le créneau →"}
            </Link>
          )}

          {referral.status === "results_ready" && referral.result_tier && (
            <div className="space-y-2">
              <p className="label-caps text-muted-foreground">Résultats</p>
              <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full ${RESULT_TIER_LABELS[referral.result_tier]?.color}`}>
                {RESULT_TIER_LABELS[referral.result_tier]?.fr}
              </span>
              {referral.result_summary && (
                <p className="text-sm text-foreground">{referral.result_summary}</p>
              )}
              {referral.results_entered_at && (
                <p className="text-xs text-muted-foreground">
                  Reçus le {new Date(referral.results_entered_at).toLocaleDateString("fr-FR")}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-xs text-blue-700">
            <strong>Rappel :</strong> Ce test de confirmation est réalisé par un laboratoire médical agréé.
            Seul le laboratoire peut confirmer la consultation et transmettre les résultats.
          </p>
        </div>

        <Link href="/referral" className="block text-center text-muted-foreground text-sm underline">
          ← Retour aux orientations
        </Link>
      </div>
    </div>
  );
}

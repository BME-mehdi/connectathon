import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AttendanceActions, ResultsForm } from "@/components/referral/LabActions";

// Lab-only view — everyone with the 'lab' role sees every pending referral
// and appointment (see supabase/migrations/006_medical_labs_referral_flow.sql
// for the RLS policies that gate this).
//
// The RLS policies are the real enforcement (a household account gets zero
// rows back either way), but we still check the role here rather than let a
// household member land on an empty "lab queue" page — same app_metadata.role
// read as app/api/referral/route.ts (never user_metadata, see README §5.2).
export default async function LabPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  if (user.app_metadata?.role !== "lab") redirect("/referral");

  const { data: pending } = await supabase
    .from("referrals")
    .select(`
      id, status,
      family_members(full_name),
      appointments(id, scheduled_at)
    `)
    .eq("status", "request_sent")
    .order("created_at", { ascending: true });

  const { data: analyzing } = await supabase
    .from("referrals")
    .select(`
      id, status,
      family_members(full_name),
      appointments(id, attended_at)
    `)
    .eq("status", "analyzing")
    .order("updated_at", { ascending: true });

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-card rounded-2xl border border-border shadow-soft p-6">
          <p className="label-caps text-accent-foreground mb-1">Laboratory Results</p>
          <h1 className="text-xl">File d&apos;attente du laboratoire</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Confirmez les consultations après réalisation, puis transmettez les résultats.
          </p>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          <strong>Rappel :</strong> Le statut ne peut être modifié que manuellement ici, après réalisation
          effective du test. Aucun système automatique ne peut le déclencher.
        </div>

        <section className="space-y-3">
          <h2 className="label-caps text-muted-foreground px-1">
            Consultations à confirmer ({pending?.length ?? 0})
          </h2>
          {pending && pending.length > 0 ? (
            <ul className="space-y-3">
              {pending.map(r => {
                const appointment = r.appointments?.[0];
                return (
                  <li key={r.id} className="bg-card rounded-xl border border-border p-4 space-y-3">
                    <div>
                      <p className="font-medium text-foreground">{r.family_members?.full_name}</p>
                      {appointment && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(appointment.scheduled_at).toLocaleDateString("fr-FR", { dateStyle: "long" })}
                        </p>
                      )}
                    </div>
                    <AttendanceActions referralId={r.id} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-center text-muted-foreground text-sm py-4">
              Aucune consultation en attente.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="label-caps text-muted-foreground px-1">
            En cours d&apos;analyse ({analyzing?.length ?? 0})
          </h2>
          {analyzing && analyzing.length > 0 ? (
            <ul className="space-y-3">
              {analyzing.map(r => (
                <li key={r.id} className="bg-card rounded-xl border border-border p-4 space-y-3">
                  <p className="font-medium text-foreground">{r.family_members?.full_name}</p>
                  <ResultsForm referralId={r.id} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-muted-foreground text-sm py-4">
              Aucune analyse en cours.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Pharmacist-only view — lists all appointments for their pharmacy
export default async function PharmacistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: appointments } = await supabase
    .from("appointments")
    .select(`
      id, scheduled_at, confirmed_by_pharmacist_at,
      referrals(id, status, family_members(full_name))
    `)
    .is("confirmed_by_pharmacist_at", null)
    .order("scheduled_at", { ascending: true });

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h1 className="text-xl font-semibold text-slate-900">Rendez-vous à confirmer</h1>
          <p className="text-slate-500 text-sm mt-1">
            Confirmez les tests après réalisation. Seule cette action déclenche le statut « confirmé ».
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-800">
            <strong>Rappel :</strong> Le statut « Confirmé par le pharmacien » ne peut être défini que
            manuellement ici, après réalisation effective du test. Aucun système automatique ne peut le déclencher.
          </p>
        </div>

        {appointments && appointments.length > 0 ? (
          <ul className="space-y-3">
            {appointments.map(apt => {
              const referral = apt.referrals as any;
              return (
                <li key={apt.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-slate-800">{referral?.family_members?.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(apt.scheduled_at).toLocaleDateString("fr-FR", { dateStyle: "long" })}
                      </p>
                    </div>
                    <span className="text-xs bg-amber-100 text-amber-800 font-medium px-2 py-1 rounded-full">
                      En attente
                    </span>
                  </div>
                  <ConfirmButton referralId={referral?.id} appointmentId={apt.id} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-center text-slate-400 text-sm py-8">
            Aucun rendez-vous en attente de confirmation.
          </p>
        )}
      </div>
    </div>
  );
}

// Client button is in a separate component to keep page as Server Component
function ConfirmButton({ referralId, appointmentId }: { referralId: string; appointmentId: string }) {
  return (
    <form action={`/api/referral/confirm`} method="POST">
      <input type="hidden" name="referral_id" value={referralId} />
      <input type="hidden" name="appointment_id" value={appointmentId} />
      <button
        type="submit"
        className="w-full rounded-lg bg-emerald-700 text-white py-2 text-sm font-medium hover:bg-emerald-800 transition-colors"
      >
        Confirmer le test réalisé
      </button>
    </form>
  );
}

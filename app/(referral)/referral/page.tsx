import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

const STATUS_LABELS: Record<string, { fr: string; color: string }> = {
  flagged:             { fr: "En attente de rendez-vous", color: "bg-amber-100 text-amber-800" },
  scheduled:           { fr: "Rendez-vous planifié",      color: "bg-blue-100 text-blue-800" },
  completed:           { fr: "Test réalisé",               color: "bg-slate-100 text-slate-700" },
  no_show:             { fr: "Absent au rendez-vous",      color: "bg-rose-100 text-rose-800" },
  physician_confirmed: { fr: "Confirmé par le pharmacien", color: "bg-emerald-100 text-emerald-800" },
};

export default async function ReferralPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: referrals } = await supabase
    .from("referrals")
    .select(`
      id, status, created_at,
      family_members(full_name),
      partner_pharmacies(name, address, region),
      appointments(id, scheduled_at)
    `)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h1 className="text-xl font-semibold text-slate-900">Mes orientations</h1>
          <p className="text-slate-500 text-sm mt-1">
            Suivi des tests de confirmation en pharmacie partenaire
          </p>
        </div>

        {referrals && referrals.length > 0 ? (
          <ul className="space-y-3">
            {referrals.map(r => {
              const status = STATUS_LABELS[r.status] ?? { fr: r.status, color: "bg-slate-100 text-slate-700" };
              const appointment = r.appointments?.[0];
              return (
                <li key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-slate-800">{(r.family_members as any)?.full_name}</p>
                      <p className="text-xs text-slate-500">{(r.partner_pharmacies as any)?.name}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.color}`}>
                      {status.fr}
                    </span>
                  </div>
                  {appointment && (
                    <p className="text-xs text-slate-500">
                      RDV : {new Date(appointment.scheduled_at).toLocaleDateString("fr-FR", { dateStyle: "long" })}
                    </p>
                  )}
                  <Link href={`/referral/${r.id}`} className="text-xs text-slate-600 underline">
                    Voir le détail →
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-center text-slate-400 text-sm">
            Aucune orientation pour l'instant.
          </p>
        )}
      </div>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { STATUS_LABELS } from "@/lib/referral/labels";

export default async function ReferralPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: referrals } = await supabase
    .from("referrals")
    .select(`
      id, status, created_at,
      family_members(full_name),
      partner_labs(name, address, region),
      appointments(id, scheduled_at)
    `)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="bg-card rounded-2xl border border-border shadow-soft p-6">
          <h1 className="text-xl">Mes orientations</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Suivi des tests de confirmation en laboratoire médical partenaire
          </p>
        </div>

        {referrals && referrals.length > 0 ? (
          <ul className="space-y-3">
            {referrals.map(r => {
              const status = STATUS_LABELS[r.status] ?? { fr: r.status, color: "bg-muted text-muted-foreground" };
              const appointment = r.appointments?.[0];
              return (
                <li key={r.id} className="bg-card rounded-xl border border-border p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-foreground">{r.family_members?.full_name}</p>
                      <p className="text-xs text-muted-foreground">{r.partner_labs?.name}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.color}`}>
                      {status.fr}
                    </span>
                  </div>
                  {appointment && (
                    <p className="text-xs text-muted-foreground">
                      RDV : {new Date(appointment.scheduled_at).toLocaleDateString("fr-FR", { dateStyle: "long" })}
                    </p>
                  )}
                  <Link href={`/referral/${r.id}`} className="text-xs text-primary underline">
                    Voir le détail →
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-center text-muted-foreground text-sm">
            Aucune orientation pour l&apos;instant.
          </p>
        )}
      </div>
    </div>
  );
}

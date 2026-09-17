import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Payer dashboard — reads ONLY from aggregate_outcomes
// Must never query individual tables
export default async function PayerDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Query ONLY the aggregate view — no individual data
  const { data: metrics } = await supabase
    .from("aggregate_outcomes")
    .select("region, period, cohort_size, pct_high_risk, pct_referral_completed, pct_confirmed_prediabetes")
    .order("period", { ascending: false });

  const totalCohort = metrics?.reduce((s, r) => s + (r.cohort_size ?? 0), 0) ?? 0;
  const avgHighRisk = metrics && metrics.length > 0
    ? (metrics.reduce((s, r) => s + (r.pct_high_risk ?? 0), 0) / metrics.length).toFixed(1)
    : "—";

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h1 className="text-xl font-semibold text-slate-900">Tableau de bord CNAM / Assureur</h1>
          <p className="text-slate-500 text-sm mt-1">
            Données agrégées uniquement · Aucune donnée individuelle accessible
          </p>
        </div>

        {/* KPI summary */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Personnes dépistées", value: totalCohort.toLocaleString("fr-FR") },
            { label: "% Risque élevé (moy.)", value: `${avgHighRisk}%` },
            { label: "Régions couvertes", value: new Set(metrics?.map(r => r.region)).size },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-4 space-y-1">
              <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
              <p className="text-xs text-slate-500">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Regional breakdown table */}
        {metrics && metrics.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Région","Période","Cohorte","% Risque élevé","% Référés confirmés","% Prédiabète confirmé"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.region}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(row.period).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.cohort_size}</td>
                    <td className="px-4 py-3 text-slate-700">{row.pct_high_risk ?? "—"}%</td>
                    <td className="px-4 py-3 text-slate-700">{row.pct_referral_completed ?? "—"}%</td>
                    <td className="px-4 py-3 text-slate-700">{row.pct_confirmed_prediabetes ?? "—"}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-center text-xs text-slate-400">
          Données agrégées · Vue matérialisée rafraîchie quotidiennement · Aucun enregistrement individuel
        </p>
      </div>
    </div>
  );
}

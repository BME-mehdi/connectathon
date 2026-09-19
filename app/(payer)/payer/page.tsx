import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// The proof-of-firewall page, not a product surface (deliberately unstyled —
// see supabase/migrations/007_payer_access.sql and 003_data_firewall.sql).
//
// This query runs under the caller's own session cookies. For a 'payer'
// account, the custom access token hook (007) has already rewritten their
// JWT so PostgREST executes this SELECT as the `payer_readonly` Postgres
// role — a role with a grant on aggregate_outcomes and NO grant on any
// other table (003). That isn't enforced by this page; it's enforced
// before this query ever runs. Swap the table name below to households,
// family_members, screening_responses, or risk_scores and the request
// fails with a Postgres permission error, not an empty result — that's
// the difference between "hidden" and "structurally impossible".
export default async function PayerDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  if (user.app_metadata?.role !== "payer") redirect("/onboarding");

  const { data: rows, error } = await supabase
    .from("aggregate_outcomes")
    .select("region, period, cohort_size, pct_high_risk, pct_referral_completed, pct_confirmed_prediabetes")
    .order("period", { ascending: false })
    .order("region", { ascending: true });

  return (
    <div className="p-4">
      <h1>Payer aggregate outcomes</h1>
      <p>
        Read-only, aggregate-only. Source: <code>aggregate_outcomes</code>, queried as the{" "}
        <code>payer_readonly</code> Postgres role. Zero individual identifiers in this table by
        construction (see §4 of the README).
      </p>

      {error && (
        <p style={{ color: "crimson" }}>
          Query failed: {error.message} — either the custom access token hook (007) isn&apos;t
          enabled yet in the Supabase Dashboard, or this account doesn&apos;t hold the payer role.
        </p>
      )}

      {!error && (!rows || rows.length === 0) && (
        <p>No aggregate rows yet — nobody has been screened, or the materialized view hasn&apos;t been refreshed.</p>
      )}

      {!error && rows && rows.length > 0 && (
        <table border={1} cellPadding={6}>
          <thead>
            <tr>
              <th>Region</th>
              <th>Period</th>
              <th>Cohort size</th>
              <th>% high risk</th>
              <th>% referral completed</th>
              <th>% confirmed prediabetes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.region}-${r.period}`}>
                <td>{r.region}</td>
                <td>{r.period ? new Date(r.period).toLocaleDateString("fr-FR", { year: "numeric", month: "long" }) : "—"}</td>
                <td>{r.cohort_size}</td>
                <td>{r.pct_high_risk ?? "—"}%</td>
                <td>{r.pct_referral_completed ?? "—"}%</td>
                <td>{r.pct_confirmed_prediabetes ?? "—"}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function patchReferral(body: Record<string, unknown>) {
  const res = await fetch("/api/referral", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error?.formErrors?.[0] ?? d.error ?? "Une erreur s'est produite");
  }
}

/** For a 'request_sent' referral: lab marks the visit attended or missed. */
export function AttendanceActions({ referralId }: { referralId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"analyzing" | "no_show" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(status: "analyzing" | "no_show") {
    setLoading(status);
    setError(null);
    try {
      await patchReferral({ referral_id: referralId, status });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => act("analyzing")}
          className="flex-1 rounded-lg bg-emerald-700 text-white py-2 text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors"
        >
          {loading === "analyzing" ? "…" : "Consultation réalisée"}
        </button>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => act("no_show")}
          className="flex-1 rounded-lg border border-border text-foreground py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
        >
          {loading === "no_show" ? "…" : "Absent"}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const RESULT_TIERS: { value: string; label: string }[] = [
  { value: "normal",                 label: "Normal" },
  { value: "confirmed_prediabetes",  label: "Prédiabète confirmé" },
  { value: "confirmed_diabetes",     label: "Diabète confirmé" },
];

/** For an 'analyzing' referral: lab enters the result. */
export function ResultsForm({ referralId }: { referralId: string }) {
  const router = useRouter();
  const [tier, setTier] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tier) return;
    setLoading(true);
    setError(null);
    try {
      await patchReferral({
        referral_id: referralId,
        status: "results_ready",
        result_tier: tier,
        result_summary: summary || undefined,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <select
        required
        value={tier}
        onChange={(e) => setTier(e.target.value)}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50"
      >
        <option value="">Résultat…</option>
        {RESULT_TIERS.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Note (optionnel)"
        rows={2}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={loading || !tier}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/80 disabled:opacity-50 transition-colors"
      >
        {loading ? "Envoi…" : "Transmettre les résultats"}
      </button>
    </form>
  );
}

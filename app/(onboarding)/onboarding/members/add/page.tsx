"use client";

/**
 * Add a minor to the household, entered directly by the guardian (household
 * owner). No personal health data is collected for the minor here — only
 * name, relation, and date of birth, per spec §5.1.
 *
 * Expected contract for POST /api/members (owned separately):
 *   Body:     { full_name: string; relation: "child"|"sibling"|"other"; date_of_birth: "YYYY-MM-DD" }
 *   Server:   verifies caller is the household owner (RLS via cookie session),
 *             inserts family_members { ...body, is_minor: true, household_id },
 *             AND inserts consents { family_member_id, consent_type: "guardian" }
 *             in the same request — guardian consent must be logged and must
 *             never be conflated with "self" or "surface_family_history".
 *   Response: 201 with the created family_members row (id at minimum).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

const MINOR_RELATIONS: { value: string; label: string }[] = [
  { value: "child", label: "Enfant" },
  { value: "sibling", label: "Frère / sœur" },
  { value: "other", label: "Autre" },
];

export default function AddMinorPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [relation, setRelation] = useState("");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        relation,
        date_of_birth: dob,
        email,
        is_minor: true,
      }),
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error?.formErrors?.[0] ?? d.error ?? "Une erreur s'est produite");
      setLoading(false);
      return;
    }

    router.push("/onboarding/members");
  }

  return (
    <div className="min-h-screen bg-hero-wash flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-card rounded-2xl shadow-soft border border-border p-8 space-y-6">
        <div>
          <h1 className="text-xl">Ajouter un enfant mineur</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Aucune donnée de santé personnelle n&apos;est collectée pour un
            mineur — uniquement son identité, à titre informatif pour le
            foyer.
          </p>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          En ajoutant un enfant mineur, vous confirmez agir en tant que
          tuteur légal et donnez votre consentement pour son inclusion dans
          le foyer.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Nom complet</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Lien de parenté</label>
            <select
              required
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50"
            >
              <option value="">Sélectionner…</option>
              {MINOR_RELATIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Date de naissance</label>
            <input
              type="date"
              required
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Email de contact</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@exemple.com"
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
            <p className="text-xs text-muted-foreground">
              Utilisé pour recevoir les résultats et notifications de dépistage de cet enfant.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/80 disabled:opacity-50 transition-colors"
          >
            {loading ? "Ajout…" : "Ajouter l'enfant"}
          </button>
        </form>
      </div>
    </div>
  );
}

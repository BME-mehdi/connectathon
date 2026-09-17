"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SEX_OPTIONS: { value: string; label: string }[] = [
  { value: "female", label: "Femme" },
  { value: "male", label: "Homme" },
  { value: "prefer_not_to_say", label: "Préfère ne pas préciser" },
];

export default function AcceptForm({ householdName }: { householdName: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState("");
  const [consented, setConsented] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        date_of_birth: dob,
        biological_sex: sex || undefined,
      }),
    });

    if (!res.ok) {
      const d = await res.json();
      setError(d.error?.formErrors?.[0] ?? d.error ?? "Une erreur s'est produite");
      setLoading(false);
      return;
    }

    router.push("/screening");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
        Vous rejoignez le foyer <strong>{householdName}</strong>. En continuant,
        vous consentez vous-même à la collecte de vos propres données de
        dépistage — ce consentement n&apos;est donné par personne d&apos;autre
        à votre place.
      </div>

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
        <label className="text-sm font-medium text-foreground">Sexe biologique (optionnel)</label>
        <select
          value={sex}
          onChange={(e) => setSex(e.target.value)}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50"
        >
          <option value="">Sélectionner…</option>
          {SEX_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          required
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5 accent-[var(--color-primary)]"
        />
        Je consens à la collecte de mes propres données de dépistage dans le
        cadre de ce foyer.
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={loading || !consented}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/80 disabled:opacity-50 transition-colors"
      >
        {loading ? "Confirmation…" : "Confirmer et rejoindre"}
      </button>
    </form>
  );
}

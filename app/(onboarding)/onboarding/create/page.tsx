"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TUNISIAN_REGIONS = [
  "Ariana","Béja","Ben Arous","Bizerte","Gabès","Gafsa","Jendouba",
  "Kairouan","Kasserine","Kébili","Kef","Mahdia","Manouba","Médenine",
  "Monastir","Nabeul","Sfax","Sidi Bouzid","Siliana","Sousse",
  "Tataouine","Tozeur","Tunis","Zaghouan",
];

export default function CreateHouseholdPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/households", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, region }),
    });

    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Une erreur s'est produite");
    } else {
      router.push("/onboarding/members");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">
        <h1 className="text-xl font-semibold text-slate-900">Informations du foyer</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Nom du foyer</label>
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              placeholder="Famille Ben Salah"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Gouvernorat</label>
            <select
              required
              value={region}
              onChange={e => setRegion(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <option value="">Sélectionner…</option>
              {TUNISIAN_REGIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-800 text-white py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Création…" : "Créer le foyer"}
          </button>
        </form>
      </div>
    </div>
  );
}

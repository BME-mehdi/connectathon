"use client";

import { useState } from "react";
import Link from "next/link";

const RELATIONS: { value: string; label: string }[] = [
  { value: "spouse", label: "Conjoint·e" },
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Frère / sœur" },
  { value: "other", label: "Autre" },
];

export default function InviteAdultPage() {
  const [email, setEmail] = useState("");
  const [relation, setRelation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, relation }),
    });

    if (!res.ok) {
      const d = await res.json();
      setError(d.error?.formErrors?.[0] ?? d.error ?? "Une erreur s'est produite");
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-hero-wash flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-card rounded-2xl shadow-soft border border-border p-8 space-y-6">
        {sent ? (
          <div className="space-y-4 text-center">
            <h1 className="text-xl">Invitation envoyée</h1>
            <p className="text-muted-foreground text-sm">
              Un lien de connexion a été envoyé à <strong>{email}</strong>. La
              personne invitée devra créer son propre compte et donner son
              consentement avant que ses données ne soient enregistrées —
              elles ne le sont jamais par quelqu&apos;un d&apos;autre.
            </p>
            <Link
              href="/onboarding/members"
              className="inline-block text-sm font-medium text-primary underline underline-offset-2"
            >
              ← Retour aux membres
            </Link>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-xl">Inviter un adulte</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Chaque adulte confirme lui-même son compte et son consentement
                avant que ses propres informations ne soient saisies.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50"
                  placeholder="conjoint@exemple.com"
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
                  {RELATIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/80 disabled:opacity-50 transition-colors"
              >
                {loading ? "Envoi…" : "Envoyer l'invitation"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

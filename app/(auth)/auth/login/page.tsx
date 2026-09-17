"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });

    if (error) setError(error.message);
    else setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="text-center space-y-2">
        <h1 className="text-xl">Vérifiez votre email</h1>
        <p className="text-muted-foreground text-sm">
          Un lien de connexion a été envoyé à <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl shadow-soft border border-border p-8 space-y-6">
      <div>
        <h1 className="text-2xl">Connexion</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Plateforme de dépistage familial du diabète de type 2
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Adresse email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50"
            placeholder="vous@exemple.com"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/80 disabled:opacity-50 transition-colors"
        >
          {loading ? "Envoi…" : "Envoyer le lien de connexion"}
        </button>
      </form>
    </div>
  );
}

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
        <h1 className="text-xl font-semibold text-slate-800">Vérifiez votre email</h1>
        <p className="text-slate-500 text-sm">
          Un lien de connexion a été envoyé à <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Connexion</h1>
        <p className="text-slate-500 text-sm mt-1">
          Plateforme de dépistage familial du diabète de type 2
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            Adresse email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            placeholder="vous@exemple.com"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-800 text-white py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Envoi…" : "Envoyer le lien de connexion"}
        </button>
      </form>
    </div>
  );
}

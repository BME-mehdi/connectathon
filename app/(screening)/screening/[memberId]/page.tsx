"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  params: Promise<{ memberId: string }>;
}

type Step = "core" | "findrisc" | "submitting";

export default function ScreeningFormPage({ params }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("core");
  const [error, setError] = useState<string | null>(null);

  const [memberId, setMemberId] = useState<string>("");
  const [age, setAge] = useState("");
  const [waist, setWaist] = useState("");
  const [height, setHeight] = useState("");
  const [familyHistory, setFamilyHistory] = useState<boolean | null>(null);
  const [gdm, setGdm] = useState<boolean | null>(null);
  // FINDRISC-lite
  const [activity, setActivity] = useState<string | null>(null);
  const [dietScore, setDietScore] = useState<number | null>(null);
  const [bpMed, setBpMed] = useState<boolean | null>(null);
  const [includesFindrisc, setIncludesFindrisc] = useState(false);

  // Resolve memberId from params
  params.then(p => { if (!memberId) setMemberId(p.memberId); });

  const whtr = waist && height
    ? ((parseFloat(waist) / parseFloat(height)) * 100).toFixed(1)
    : null;

  async function handleSubmit() {
    setStep("submitting");
    setError(null);

    const payload = {
      family_member_id: memberId,
      age: parseInt(age),
      waist_cm: parseFloat(waist),
      height_cm: parseFloat(height),
      family_history_t2d: familyHistory,
      gestational_diabetes_history: gdm,
      ...(includesFindrisc && {
        activity_level: activity,
        diet_score: dietScore,
        bp_medication: bpMed,
      }),
    };

    const res = await fetch("/api/screening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const d = await res.json();
      setError(d.error?.formErrors?.[0] ?? "Une erreur s'est produite");
      setStep("core");
      return;
    }

    router.push(`/screening/${memberId}/result`);
  }

  if (step === "submitting") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 text-sm">Calcul du score en cours…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Step: Core DIABSCORE */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Questionnaire DIABSCORE</h1>
            <p className="text-slate-500 text-xs mt-1">
              Outil de dépistage validé pour la population tunisienne
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Âge (années)</label>
            <input type="number" min={18} max={120} value={age}
              onChange={e => setAge(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              placeholder="ex: 45"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Tour de taille (cm)</label>
              <input type="number" min={40} max={250} value={waist}
                onChange={e => setWaist(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                placeholder="ex: 88"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Taille (cm)</label>
              <input type="number" min={80} max={280} value={height}
                onChange={e => setHeight(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                placeholder="ex: 168"
              />
            </div>
          </div>

          {whtr && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded px-3 py-2">
              Ratio taille/hauteur : <strong>{whtr}</strong>
            </p>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Antécédents familiaux de diabète de type 2 ?
            </label>
            <div className="flex gap-3">
              {[true, false].map(v => (
                <button key={String(v)} type="button"
                  onClick={() => setFamilyHistory(v)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    familyHistory === v
                      ? "bg-slate-800 text-white border-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {v ? "Oui" : "Non"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Antécédents de diabète gestationnel ? <span className="font-normal text-slate-400">(femmes)</span>
            </label>
            <div className="flex gap-3">
              {[true, false].map(v => (
                <button key={String(v)} type="button"
                  onClick={() => setGdm(v)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    gdm === v
                      ? "bg-slate-800 text-white border-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {v ? "Oui" : "Non"}
                </button>
              ))}
              <button type="button" onClick={() => setGdm(null)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  gdm === null
                    ? "bg-slate-100 border-slate-400 text-slate-700"
                    : "border-slate-200 text-slate-400 hover:bg-slate-50"
                }`}
              >
                N/A
              </button>
            </div>
          </div>
        </div>

        {/* Optional FINDRISC-lite */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">Évaluation approfondie (optionnel)</p>
              <p className="text-xs text-slate-500">FINDRISC-lite — pour un score plus précis</p>
            </div>
            <button type="button" onClick={() => setIncludesFindrisc(!includesFindrisc)}
              className={`relative w-10 h-6 rounded-full transition-colors ${includesFindrisc ? "bg-slate-700" : "bg-slate-200"}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${includesFindrisc ? "left-5" : "left-1"}`} />
            </button>
          </div>

          {includesFindrisc && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Activité physique</label>
                <div className="flex gap-2">
                  {[["high","Élevée"],["moderate","Modérée"],["low","Faible"]].map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setActivity(v)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        activity === v ? "bg-slate-800 text-white border-slate-800" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Alimentation (1=mauvaise, 5=excellente)</label>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" onClick={() => setDietScore(n)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        dietScore === n ? "bg-slate-800 text-white border-slate-800" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Traitement antihypertenseur ?</label>
                <div className="flex gap-3">
                  {[true, false].map(v => (
                    <button key={String(v)} type="button" onClick={() => setBpMed(v)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        bpMed === v ? "bg-slate-800 text-white border-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {v ? "Oui" : "Non"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!age || !waist || !height || familyHistory === null}
          className="w-full rounded-lg bg-slate-800 text-white py-3 text-sm font-medium hover:bg-slate-700 disabled:opacity-40 transition-colors"
        >
          Calculer mon score →
        </button>
      </div>
    </div>
  );
}

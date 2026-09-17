"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

// Simple slot picker — React Big Calendar integration can replace this grid
// once react-big-calendar is wired up. For the hackathon demo this works perfectly.

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isWeekend(date: Date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function generateSlots() {
  const slots: Date[] = [];
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let daysAdded = 0;

  while (slots.length < 12) {
    cursor = addDays(cursor, 1);
    if (isWeekend(cursor)) continue;
    daysAdded++;
    for (const hour of [9, 10, 11, 14, 15, 16]) {
      if (slots.length >= 12) break;
      const s = new Date(cursor);
      s.setHours(hour, 0, 0, 0);
      slots.push(s);
    }
  }
  return slots;
}

export default function BookAppointmentPage() {
  const router = useRouter();
  const { referralId } = useParams<{ referralId: string }>();
  const [slots] = useState(generateSlots);
  const [selected, setSelected] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBook() {
    if (!selected) return;
    setLoading(true);
    setError(null);

    // Update referral status to scheduled + create appointment record
    const res = await fetch("/api/referral", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referral_id: referralId, status: "scheduled" }),
    });

    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Erreur lors de la réservation");
      setLoading(false);
      return;
    }

    router.push(`/referral/${referralId}`);
  }

  const byDay = slots.reduce<Record<string, Date[]>>((acc, s) => {
    const key = s.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    (acc[key] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h1 className="text-xl font-semibold text-slate-900">Choisir un créneau</h1>
          <p className="text-slate-500 text-sm mt-1">
            Sélectionnez une date et heure pour votre test de confirmation à la pharmacie partenaire.
          </p>
        </div>

        {Object.entries(byDay).map(([day, daySlots]) => (
          <div key={day} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <p className="text-sm font-medium text-slate-700 capitalize">{day}</p>
            <div className="flex flex-wrap gap-2">
              {daySlots.map(slot => (
                <button
                  key={slot.toISOString()}
                  onClick={() => setSelected(slot)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    selected?.toISOString() === slot.toISOString()
                      ? "bg-slate-800 text-white border-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {slot.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </button>
              ))}
            </div>
          </div>
        ))}

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}

        <button
          onClick={handleBook}
          disabled={!selected || loading}
          className="w-full rounded-lg bg-slate-800 text-white py-3 text-sm font-medium hover:bg-slate-700 disabled:opacity-40 transition-colors"
        >
          {loading ? "Réservation…" : selected
            ? `Confirmer — ${selected.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} à ${selected.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
            : "Sélectionnez un créneau"
          }
        </button>
      </div>
    </div>
  );
}

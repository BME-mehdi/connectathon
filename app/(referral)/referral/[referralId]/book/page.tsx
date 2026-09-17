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

    // Either a plain reschedule (still request_sent) or a re-request after a
    // missed appointment (no_show -> request_sent) — the server tells which
    // one applies based on the referral's current status.
    const res = await fetch("/api/referral", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referral_id: referralId,
        status: "request_sent",
        scheduled_at: selected.toISOString(),
      }),
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
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="bg-card rounded-2xl border border-border shadow-soft p-6">
          <h1 className="text-xl">Choisir un créneau</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sélectionnez une date et heure pour votre test de confirmation au laboratoire médical partenaire.
          </p>
        </div>

        {Object.entries(byDay).map(([day, daySlots]) => (
          <div key={day} className="bg-card rounded-xl border border-border p-4 space-y-3">
            <p className="text-sm font-medium text-foreground capitalize">{day}</p>
            <div className="flex flex-wrap gap-2">
              {daySlots.map(slot => (
                <button
                  key={slot.toISOString()}
                  onClick={() => setSelected(slot)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    selected?.toISOString() === slot.toISOString()
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {slot.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </button>
              ))}
            </div>
          </div>
        ))}

        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">{error}</p>}

        <button
          onClick={handleBook}
          disabled={!selected || loading}
          className="w-full rounded-lg bg-primary text-primary-foreground py-3 text-sm font-medium hover:bg-primary/80 disabled:opacity-40 transition-colors"
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

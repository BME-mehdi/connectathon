export const STATUS_LABELS: Record<string, { fr: string; color: string }> = {
  request_sent:  { fr: "Demande envoyée",        color: "bg-blue-100 text-blue-800" },
  analyzing:     { fr: "Analyse en cours",        color: "bg-amber-100 text-amber-800" },
  no_show:       { fr: "Consultation manquée",    color: "bg-rose-100 text-rose-800" },
  results_ready: { fr: "Résultats disponibles",   color: "bg-emerald-100 text-emerald-800" },
};

export const RESULT_TIER_LABELS: Record<string, { fr: string; color: string }> = {
  normal:                 { fr: "Normal",                    color: "bg-emerald-100 text-emerald-800" },
  confirmed_prediabetes:  { fr: "Prédiabète confirmé",        color: "bg-amber-100 text-amber-800" },
  confirmed_diabetes:     { fr: "Diabète confirmé",           color: "bg-rose-100 text-rose-800" },
};

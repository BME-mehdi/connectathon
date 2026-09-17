/**
 * DIABSCORE Scoring Engine — authoritative TypeScript implementation
 *
 * Formula validated for the Tunisian population (Cap-Bon study, PLOS ONE).
 *   Score = Age + (waist_cm / height_cm × 100) + family_history(10) + GDM(25)
 *   Optional FINDRISC-lite add-ons: low_activity(+5) | poor_diet(+3) | bp_medication(+5)
 *
 * Tiers:  ≥ 90 → HIGH  |  80–89 → MODERATE  |  < 80 → LOW
 *
 * ⚠️  SYNC REQUIREMENT
 * The n8n scoring workflow (n8n-workflows/scoring-workflow.json) contains an
 * identical JS implementation. Any change here MUST be mirrored there AND
 * FORMULA_VERSION must be incremented in both locations.
 *
 * The AI SDK / any LLM must NEVER be used to compute or influence a risk tier.
 */

export const FORMULA_VERSION = "diabscore-v1.0" as const;

export type RiskTier = "low" | "moderate" | "high";

export interface DiabscoreInputs {
  /** Integer years, 18–120 */
  age: number;
  /** Centimetres */
  waist_cm: number;
  /** Centimetres */
  height_cm: number;
  family_history_t2d: boolean;
  /** null = not applicable (male / prefer_not_to_say) */
  gestational_diabetes_history: boolean | null;
  // ── FINDRISC-lite optional ──────────────────────────────────────────────────
  activity_level?: "high" | "moderate" | "low" | null;
  /** 1 (poor) – 5 (excellent) */
  diet_score?: number | null;
  bp_medication?: boolean | null;
}

export interface DiabscoreResult {
  score_value: number;
  tier: RiskTier;
  formula_version: typeof FORMULA_VERSION;
  breakdown: {
    age_points: number;
    whtr_points: number;
    family_history_points: number;
    gestational_diabetes_points: number;
    core_score: number;
    findrisc_bonus: number;
    total: number;
  };
}

/** Pure, deterministic, side-effect-free. No network calls, no randomness. */
export function computeDiabscore(inputs: DiabscoreInputs): DiabscoreResult {
  const {
    age,
    waist_cm,
    height_cm,
    family_history_t2d,
    gestational_diabetes_history,
    activity_level,
    diet_score,
    bp_medication,
  } = inputs;

  // ── Core DIABSCORE ──────────────────────────────────────────────────────────
  const age_points = age;
  const whtr_points = Math.round((waist_cm / height_cm) * 100 * 10) / 10;
  const family_history_points = family_history_t2d ? 10 : 0;
  const gestational_diabetes_points =
    gestational_diabetes_history === true ? 25 : 0;

  const core_score =
    age_points +
    whtr_points +
    family_history_points +
    gestational_diabetes_points;

  // ── FINDRISC-lite add-ons (clinically grounded defaults, flagged for review) ─
  let findrisc_bonus = 0;
  if (activity_level === "low") findrisc_bonus += 5;
  if (diet_score != null && diet_score <= 2) findrisc_bonus += 3;
  if (bp_medication === true) findrisc_bonus += 5;

  const total = core_score + findrisc_bonus;

  const tier: RiskTier = total >= 90 ? "high" : total >= 80 ? "moderate" : "low";

  return {
    score_value: total,
    tier,
    formula_version: FORMULA_VERSION,
    breakdown: {
      age_points,
      whtr_points,
      family_history_points,
      gestational_diabetes_points,
      core_score,
      findrisc_bonus,
      total,
    },
  };
}

/** Tier labels — single source of truth for UI and DB strings */
export const TIER_LABELS: Record<RiskTier, { fr: string; ar: string; en: string }> = {
  low:      { fr: "Faible risque",  ar: "خطر منخفض", en: "Low risk" },
  moderate: { fr: "Risque modéré",  ar: "خطر معتدل", en: "Moderate risk" },
  high:     { fr: "Risque élevé",   ar: "خطر مرتفع", en: "High risk" },
};

export const TIER_THRESHOLDS = { high: 90, moderate: 80 } as const;

import { z } from "zod";

/**
 * Shared Zod schemas — used by both the React form (react-hook-form)
 * and the API route for server-side validation. Single source of truth.
 */

// ── Household ──────────────────────────────────────────────────────────────────

export const HouseholdCreateSchema = z.object({
  name:   z.string().min(1, "Household name is required").max(100),
  region: z.string().min(1, "Region / governorate is required"),
});
export type HouseholdCreate = z.infer<typeof HouseholdCreateSchema>;

// ── Family member ──────────────────────────────────────────────────────────────

export const FamilyMemberSchema = z.object({
  household_id:   z.string().uuid().optional(),
  full_name:      z.string().min(1, "Name is required").max(100),
  relation:       z.enum(["self", "spouse", "child", "parent", "sibling", "other"]),
  is_minor:       z.boolean(),
  date_of_birth:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  biological_sex: z.enum(["male", "female", "prefer_not_to_say"]).optional(),
  email:          z.string().email("Invalid email"),
});
export type FamilyMember = z.infer<typeof FamilyMemberSchema>;

// ── Consent ───────────────────────────────────────────────────────────────────

export const ConsentSchema = z.object({
  family_member_id: z.string().uuid(),
  consent_type:     z.enum(["self", "guardian", "surface_family_history"]),
});
export type ConsentInput = z.infer<typeof ConsentSchema>;

// ── Screening — DIABSCORE core ────────────────────────────────────────────────

export const DiabscoreCoreSchema = z.object({
  family_member_id: z.string().uuid("Invalid member ID"),

  age: z
    .number({ error: "Age is required" })
    .int("Age must be a whole number")
    .min(18, "Age must be at least 18")
    .max(120, "Please check the age entered"),

  waist_cm: z
    .number({ error: "Waist measurement is required" })
    .positive()
    .min(40,  "Waist seems too low — please re-measure")
    .max(250, "Waist seems too high — please re-measure"),

  height_cm: z
    .number({ error: "Height is required" })
    .positive()
    .min(80,  "Height seems too low — please re-measure")
    .max(280, "Height seems too high — please re-measure"),

  family_history_t2d: z.boolean({
    error: "Please indicate family history of Type 2 Diabetes",
  }),

  gestational_diabetes_history: z.boolean().nullable().optional(),
});

// ── Screening — FINDRISC-lite optional extension ──────────────────────────────

export const FindriscLiteSchema = z.object({
  activity_level: z.enum(["high", "moderate", "low"]).nullable().optional(),
  diet_score:     z.number().int().min(1).max(5).nullable().optional(),
  bp_medication:  z.boolean().nullable().optional(),
});

// ── Full submission (core + optional FINDRISC) ────────────────────────────────

export const ScreeningSubmissionSchema = DiabscoreCoreSchema.merge(FindriscLiteSchema);
export type ScreeningSubmission = z.infer<typeof ScreeningSubmissionSchema>;
export type DiabscoreCore      = z.infer<typeof DiabscoreCoreSchema>;
export type FindriscLite       = z.infer<typeof FindriscLiteSchema>;

// ── Referral state transition ─────────────────────────────────────────────────
//
//   request_sent → analyzing   → results_ready   (lab marks attended, then enters results)
//               \→ no_show     → request_sent    (lab marks missed; household re-requests)
//
// A referral is created already at 'request_sent' — the server assigns the
// nearest lab and a default appointment slot as soon as a high risk score is
// computed, there is no separate "unassigned" state to book from.

export const REFERRAL_STATUSES = [
  "request_sent", "analyzing", "no_show", "results_ready",
] as const;

export type ReferralStatus = typeof REFERRAL_STATUSES[number];

export const RESULT_TIERS = ["normal", "confirmed_prediabetes", "confirmed_diabetes"] as const;
export type ResultTier = typeof RESULT_TIERS[number];

export const ReferralUpdateSchema = z.object({
  referral_id:  z.string().uuid(),
  status:       z.enum(REFERRAL_STATUSES),
  // Reschedule: provided when status is (or is being set back to) 'request_sent'
  scheduled_at: z.string().datetime().optional(),
  // Lab result entry: required when status is 'results_ready'
  result_tier:    z.enum(RESULT_TIERS).optional(),
  result_summary: z.string().max(2000).optional(),
});
export type ReferralUpdate = z.infer<typeof ReferralUpdateSchema>;

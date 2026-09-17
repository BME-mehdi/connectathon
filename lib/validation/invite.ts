import { z } from "zod";

/**
 * Adult invite flow — kept separate from lib/validation/screening.ts to avoid
 * touching a file that's actively being extended elsewhere.
 *
 * Consent note: an invited adult's own family_members row + `self` consent are
 * only ever written after THEY authenticate and confirm on /onboarding/accept —
 * never by the inviting household owner. See app/api/invite/accept/route.ts.
 */

export const InviteAdultSchema = z.object({
  email: z.string().email("Adresse email invalide"),
  relation: z.enum(["spouse", "parent", "sibling", "other"]),
});
export type InviteAdultInput = z.infer<typeof InviteAdultSchema>;

export const AcceptInviteSchema = z.object({
  full_name: z.string().min(1, "Le nom est requis").max(100),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  biological_sex: z.enum(["male", "female", "prefer_not_to_say"]).optional(),
});
export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;

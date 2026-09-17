/**
 * Referral State Machine
 *
 * Explicit allowed transitions — enforced here AND at the DB level via RLS
 * (see supabase/migrations/006_medical_labs_referral_flow.sql).
 *
 *   request_sent → analyzing     (lab marks the visit attended)
 *   request_sent → no_show       (lab marks the visit missed)
 *   analyzing    → results_ready (lab attaches the result)
 *   no_show      → request_sent  (household reschedules)
 *
 * request_sent is a terminal-looking state you can always return to from
 * no_show, but never anywhere else — only the lab can move a referral
 * forward past that point.
 */

import type { ReferralStatus } from "@/lib/validation/screening";

/** Allowed next states for each current state */
export const ALLOWED_TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  request_sent:  ["analyzing", "no_show"],
  analyzing:     ["results_ready"],
  no_show:       ["request_sent"],
  results_ready: [], // terminal
};

/** Roles permitted to trigger each transition. Absent = the household itself. */
export const TRANSITION_ROLES: Partial<Record<ReferralStatus, string[]>> = {
  analyzing:     ["lab"], // ONLY the lab may mark a visit attended
  no_show:       ["lab"], // ONLY the lab may mark a visit missed
  results_ready: ["lab"], // ONLY the lab may attach a result
  // request_sent has no role requirement — that's the household rescheduling
};

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

export function canTransition(
  from: ReferralStatus,
  to: ReferralStatus,
  actorRole?: string
): TransitionResult {
  const allowed = ALLOWED_TRANSITIONS[from];

  if (!allowed.includes(to)) {
    return {
      allowed: false,
      reason: `Transition from '${from}' to '${to}' is not permitted.`,
    };
  }

  // NOTE: actorRole may be undefined (no role claim on the session) — that
  // must NOT bypass the check. A missing role is treated the same as an
  // unauthorized one, otherwise any authenticated user without a role claim
  // could reach a role-gated status (e.g. results_ready).
  const requiredRoles = TRANSITION_ROLES[to];
  if (requiredRoles && !requiredRoles.includes(actorRole ?? "")) {
    return {
      allowed: false,
      reason: `Only roles [${requiredRoles.join(", ")}] may set status '${to}'.`,
    };
  }

  return { allowed: true };
}

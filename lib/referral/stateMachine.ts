/**
 * Referral State Machine
 *
 * Explicit allowed transitions — enforced here AND at the DB level via RLS.
 * The physician_confirmed state can ONLY be set by the pharmacist role.
 * No automated step may ever transition directly to physician_confirmed.
 *
 *   flagged → scheduled → completed   → physician_confirmed (manual only)
 *                       → no_show     → physician_confirmed (manual only)
 */

import type { ReferralStatus } from "@/lib/validation/screening";

/** Allowed next states for each current state */
export const ALLOWED_TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  flagged:              ["scheduled"],
  scheduled:            ["completed", "no_show"],
  completed:            ["physician_confirmed"],
  no_show:              ["scheduled", "physician_confirmed"],
  physician_confirmed:  [], // terminal state
};

/** Roles permitted to trigger each transition */
export const TRANSITION_ROLES: Partial<Record<ReferralStatus, string[]>> = {
  physician_confirmed: ["pharmacist"], // ONLY pharmacist may set this
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

  const requiredRoles = TRANSITION_ROLES[to];
  if (requiredRoles && actorRole && !requiredRoles.includes(actorRole)) {
    return {
      allowed: false,
      reason: `Only roles [${requiredRoles.join(", ")}] may set status '${to}'.`,
    };
  }

  return { allowed: true };
}

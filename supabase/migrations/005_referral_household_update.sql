-- ============================================================
-- 005_referral_household_update.sql
-- Fix: household owners had NO UPDATE policy on `referrals` at all.
--
-- 002_rls_policies.sql only defines "referrals_update_pharmacist", so the
-- normal booking flow (flagged -> scheduled, from
-- app/(referral)/referral/[referralId]/book/page.tsx via PATCH /api/referral)
-- was rejected by RLS for every household owner — the row-count would come
-- back 0 and the request would fail with a 500.
--
-- This grants household owners UPDATE on their own referrals, while the
-- WITH CHECK clause guarantees they can never reach 'physician_confirmed'
-- themselves — that remains exclusively reachable via
-- "referrals_update_pharmacist", matching the app-level state machine in
-- lib/referral/stateMachine.ts.
-- ============================================================

CREATE POLICY "referrals_update_household" ON referrals FOR UPDATE
  USING (family_member_id IN (
    SELECT id FROM family_members WHERE household_id = auth.user_household_id()
  ))
  WITH CHECK (
    status <> 'physician_confirmed'
    AND family_member_id IN (
      SELECT id FROM family_members WHERE household_id = auth.user_household_id()
    )
  );

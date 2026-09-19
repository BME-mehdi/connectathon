-- ============================================================
-- 006_medical_labs_referral_flow.sql
--
-- Two changes bundled together because they touch the same tables:
--
-- 1. Renames "pharmacy" -> "medical lab" everywhere in the schema.
--    The product now routes high-risk members to a partner medical
--    lab, not a pharmacy.
--
-- 2. Replaces the old referral status vocabulary
--      flagged -> scheduled -> completed/no_show -> physician_confirmed
--    with the one the product actually describes to patients:
--      request_sent -> analyzing -> results_ready
--                    \-> no_show -> request_sent (reschedule)
--    A referral is now created (by the server, immediately after a
--    high-risk score) already carrying its lab assignment and a
--    default appointment slot, i.e. it starts at 'request_sent' —
--    there is no more separate unassigned "flagged" state to book
--    from. The patient can change the appointment time while it's
--    still 'request_sent'. Only the lab can move it to 'analyzing'
--    (attended) or 'no_show' (missed), and only the lab can attach
--    results and move it to 'results_ready'.
-- ============================================================

-- ── 1. Rename pharmacy -> lab ─────────────────────────────────────────────────
ALTER TABLE partner_pharmacies RENAME TO partner_labs;
ALTER TABLE referrals    RENAME COLUMN pharmacy_id TO lab_id;
ALTER TABLE appointments RENAME COLUMN pharmacy_id TO lab_id;
ALTER TABLE appointments RENAME COLUMN confirmed_by_pharmacist_at TO attended_at;

-- ── 2. New referral status vocabulary ────────────────────────────────────────
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE referrals ALTER COLUMN status DROP DEFAULT;
UPDATE referrals SET status = CASE status
  WHEN 'flagged'              THEN 'request_sent'
  WHEN 'scheduled'            THEN 'request_sent'
  WHEN 'completed'            THEN 'analyzing'
  WHEN 'no_show'              THEN 'no_show'
  WHEN 'physician_confirmed'  THEN 'results_ready'
  ELSE status
END;
ALTER TABLE referrals ADD CONSTRAINT referrals_status_check
  CHECK (status IN ('request_sent', 'analyzing', 'no_show', 'results_ready'));
ALTER TABLE referrals ALTER COLUMN status SET DEFAULT 'request_sent';

-- Lab-entered result, attached when status -> 'results_ready'
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS result_tier TEXT
  CHECK (result_tier IN ('normal', 'confirmed_prediabetes', 'confirmed_diabetes'));
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS result_summary TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS results_entered_at TIMESTAMPTZ;

-- ── 3. RLS: drop the old pharmacist-only policies, replace with lab + household
--
-- NOTE on the role claim: `auth.jwt() ->> 'role'` is NOT the app-defined role
-- — Supabase always sets that top-level claim to 'authenticated' for any
-- signed-in user (it's the Postgres role, not ours), so a policy keyed on it
-- can never match and silently locks EVERYONE out, including real lab staff.
-- `user_metadata` is also wrong the other way: it's client-settable by any
-- signed-in user via the JS SDK, so keying on it would let anyone grant
-- themselves the lab role. `app_metadata` is the one place that's both (a)
-- present in the JWT by default and (b) settable only via the service-role
-- admin API — see the README section on granting the lab role.
DROP POLICY IF EXISTS "referrals_select_pharmacist"  ON referrals;
DROP POLICY IF EXISTS "referrals_update_pharmacist"   ON referrals;
DROP POLICY IF EXISTS "appointments_pharmacist"       ON appointments;
DROP POLICY IF EXISTS "referrals_update_household"    ON referrals; -- superseded below

CREATE POLICY "referrals_select_lab" ON referrals FOR SELECT
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'lab');

-- Lab can move a referral to analyzing / no_show / results_ready — never
-- back to request_sent (only the household can re-request after a no_show).
CREATE POLICY "referrals_update_lab" ON referrals FOR UPDATE
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'lab')
  WITH CHECK (
    status IN ('analyzing', 'no_show', 'results_ready')
    AND auth.jwt() -> 'app_metadata' ->> 'role' = 'lab'
  );

-- Household can only ever set status back to 'request_sent' (rescheduling
-- after a missed appointment) — it can never self-assign analyzing/no_show/
-- results_ready, those are exclusively the lab's to set above.
CREATE POLICY "referrals_update_household" ON referrals FOR UPDATE
  USING (family_member_id IN (
    SELECT id FROM family_members WHERE household_id = public.user_household_id()
  ))
  WITH CHECK (
    status = 'request_sent'
    AND family_member_id IN (
      SELECT id FROM family_members WHERE household_id = public.user_household_id()
    )
  );

CREATE POLICY "appointments_lab" ON appointments FOR ALL
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'lab');

-- Household can reschedule (update scheduled_at) only while the referral is
-- still in 'request_sent' — once the lab has started analyzing, or before a
-- lab visit, the appointment can't be silently moved by the patient anymore
-- except via the no_show -> request_sent path above.
CREATE POLICY "appointments_update_household" ON appointments FOR UPDATE
  USING (referral_id IN (
    SELECT r.id FROM referrals r
    JOIN family_members fm ON fm.id = r.family_member_id
    WHERE fm.household_id = public.user_household_id()
  ))
  WITH CHECK (referral_id IN (
    SELECT r.id FROM referrals r
    JOIN family_members fm ON fm.id = r.family_member_id
    WHERE fm.household_id = public.user_household_id() AND r.status = 'request_sent'
  ));

-- ── 4. aggregate_outcomes view referenced the old status values ─────────────
DROP MATERIALIZED VIEW IF EXISTS aggregate_outcomes;
CREATE MATERIALIZED VIEW aggregate_outcomes AS
  SELECT
    h.region,
    DATE_TRUNC('month', rs.computed_at)                                          AS period,
    COUNT(DISTINCT rs.family_member_id)                                          AS cohort_size,
    ROUND(100.0 * COUNT(*) FILTER (WHERE rs.tier = 'high')
          / NULLIF(COUNT(*), 0), 1)                                              AS pct_high_risk,
    ROUND(100.0 * COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('analyzing', 'results_ready'))
          / NULLIF(COUNT(DISTINCT r.id), 0), 1)                                  AS pct_referral_completed,
    ROUND(100.0 * COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'results_ready' AND r.result_tier = 'confirmed_prediabetes')
          / NULLIF(COUNT(DISTINCT r.id), 0), 1)                                  AS pct_confirmed_prediabetes
  FROM risk_scores rs
  JOIN family_members fm ON fm.id = rs.family_member_id
  JOIN households     h  ON h.id  = fm.household_id
  LEFT JOIN referrals r  ON r.family_member_id = rs.family_member_id
  GROUP BY h.region, DATE_TRUNC('month', rs.computed_at)
WITH DATA;

CREATE UNIQUE INDEX idx_aggregate_outcomes_pk ON aggregate_outcomes(region, period);
GRANT SELECT ON aggregate_outcomes TO payer_readonly;

-- ============================================================
-- 002_rls_policies.sql
-- Row-Level Security: household-scoped data isolation
-- ============================================================

-- Enable RLS on every individual-data table
ALTER TABLE households         ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_scores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;

-- Helper: resolve current user's household_id
-- Helper: resolve current user's household_id
CREATE OR REPLACE FUNCTION public.user_household_id()
RETURNS UUID LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT id FROM households WHERE owner_user_id = auth.uid()
  UNION
  SELECT household_id FROM family_members WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.user_household_id() TO authenticated, service_role;

-- ── HOUSEHOLDS ────────────────────────────────────────────────────────────────
CREATE POLICY "households_select" ON households FOR SELECT
  USING (owner_user_id = auth.uid());
CREATE POLICY "households_insert" ON households FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "households_update" ON households FOR UPDATE
  USING (owner_user_id = auth.uid());

-- ── FAMILY MEMBERS ────────────────────────────────────────────────────────────
CREATE POLICY "family_members_select" ON family_members FOR SELECT
  USING (household_id = public.user_household_id());
CREATE POLICY "family_members_insert" ON family_members FOR INSERT
  WITH CHECK (household_id IN (SELECT id FROM households WHERE owner_user_id = auth.uid()));
CREATE POLICY "family_members_update" ON family_members FOR UPDATE
  USING (household_id IN (SELECT id FROM households WHERE owner_user_id = auth.uid()));

-- ── CONSENTS — INSERT only; no UPDATE/DELETE ──────────────────────────────────
CREATE POLICY "consents_select" ON consents FOR SELECT
  USING (family_member_id IN (
    SELECT id FROM family_members WHERE household_id = public.user_household_id()
  ));
CREATE POLICY "consents_insert" ON consents FOR INSERT
  WITH CHECK (family_member_id IN (
    SELECT id FROM family_members WHERE household_id = public.user_household_id()
  ));
-- Intentionally NO update or delete policies — consent is append-only

-- ── SCREENING RESPONSES ───────────────────────────────────────────────────────
CREATE POLICY "screening_select" ON screening_responses FOR SELECT
  USING (family_member_id IN (
    SELECT id FROM family_members WHERE household_id = public.user_household_id()
  ));
CREATE POLICY "screening_insert" ON screening_responses FOR INSERT
  WITH CHECK (family_member_id IN (
    SELECT id FROM family_members WHERE household_id = public.user_household_id()
  ));

-- ── RISK SCORES — household read; n8n writes via service role ─────────────────
CREATE POLICY "risk_scores_select" ON risk_scores FOR SELECT
  USING (family_member_id IN (
    SELECT id FROM family_members WHERE household_id = public.user_household_id()
  ));

-- ── REFERRALS ─────────────────────────────────────────────────────────────────
CREATE POLICY "referrals_select_household" ON referrals FOR SELECT
  USING (family_member_id IN (
    SELECT id FROM family_members WHERE household_id = public.user_household_id()
  ));
CREATE POLICY "referrals_select_pharmacist" ON referrals FOR SELECT
  USING (auth.jwt() ->> 'role' = 'pharmacist');
-- Pharmacist can only flip status to physician_confirmed
CREATE POLICY "referrals_update_pharmacist" ON referrals FOR UPDATE
  USING  (auth.jwt() ->> 'role' = 'pharmacist')
  WITH CHECK (status = 'physician_confirmed' AND auth.jwt() ->> 'role' = 'pharmacist');

-- ── APPOINTMENTS ──────────────────────────────────────────────────────────────
CREATE POLICY "appointments_select_household" ON appointments FOR SELECT
  USING (referral_id IN (
    SELECT r.id FROM referrals r
    JOIN family_members fm ON fm.id = r.family_member_id
    WHERE fm.household_id = public.user_household_id()
  ));
CREATE POLICY "appointments_insert_household" ON appointments FOR INSERT
  WITH CHECK (referral_id IN (
    SELECT r.id FROM referrals r
    JOIN family_members fm ON fm.id = r.family_member_id
    WHERE fm.household_id = public.user_household_id()
  ));
CREATE POLICY "appointments_pharmacist" ON appointments FOR ALL
  USING (auth.jwt() ->> 'role' = 'pharmacist');

-- ── AUDIT LOG — INSERT only; no DELETE ───────────────────────────────────────
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT WITH CHECK (true);
CREATE POLICY "audit_log_select" ON audit_log FOR SELECT USING (actor = auth.uid());

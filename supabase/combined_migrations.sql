-- ============================================================
-- 001_initial_schema.sql
-- T2D Family Risk Screening Platform — Challenge 1.2
-- Future Health Connectathon 2026, Tunisia
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── HOUSEHOLDS ────────────────────────────────────────────────────────────────
CREATE TABLE households (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID REFERENCES auth.users(id) NOT NULL,
  name            TEXT NOT NULL,
  region          TEXT NOT NULL, -- Tunisian governorate
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_households_owner ON households(owner_user_id);

-- ── FAMILY MEMBERS ────────────────────────────────────────────────────────────
CREATE TABLE family_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  user_id         UUID REFERENCES auth.users(id),   -- NULL for minors
  full_name       TEXT NOT NULL,
  relation        TEXT NOT NULL
    CHECK (relation IN ('self','spouse','child','parent','sibling','other')),
  is_minor        BOOLEAN NOT NULL DEFAULT FALSE,
  date_of_birth   DATE NOT NULL,
  biological_sex  TEXT CHECK (biological_sex IN ('male','female','prefer_not_to_say')),
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_family_members_household ON family_members(household_id);
CREATE INDEX idx_family_members_user      ON family_members(user_id);

-- ── CONSENTS (append-only — no UPDATE/DELETE via RLS) ────────────────────────
CREATE TABLE consents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id  UUID REFERENCES family_members(id) NOT NULL,
  consent_type      TEXT NOT NULL
    CHECK (consent_type IN ('self','guardian','surface_family_history')),
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at        TIMESTAMPTZ,    -- NULL = active
  ip_address        INET,
  user_agent        TEXT
);
CREATE INDEX idx_consents_member ON consents(family_member_id);

-- ── SCREENING RESPONSES ───────────────────────────────────────────────────────
CREATE TABLE screening_responses (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id              UUID REFERENCES family_members(id) NOT NULL,
  -- DIABSCORE core (required)
  age                           INTEGER NOT NULL CHECK (age >= 18 AND age <= 120),
  waist_cm                      NUMERIC(5,1) NOT NULL CHECK (waist_cm > 0),
  height_cm                     NUMERIC(5,1) NOT NULL CHECK (height_cm > 0),
  family_history_t2d            BOOLEAN NOT NULL,
  gestational_diabetes_history  BOOLEAN,     -- NULL = not applicable
  -- FINDRISC-lite optional
  activity_level                TEXT CHECK (activity_level IN ('high','moderate','low')),
  diet_score                    INTEGER CHECK (diet_score >= 1 AND diet_score <= 5),
  bp_medication                 BOOLEAN,
  -- Metadata
  submitted_at                  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  form_version                  TEXT NOT NULL DEFAULT 'diabscore-v1.0'
);
CREATE INDEX idx_screening_member ON screening_responses(family_member_id);

-- ── RISK SCORES (written by n8n scoring workflow) ─────────────────────────────
CREATE TABLE risk_scores (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id      UUID REFERENCES family_members(id) NOT NULL,
  screening_response_id UUID REFERENCES screening_responses(id) NOT NULL,
  score_value           NUMERIC(6,2) NOT NULL,
  tier                  TEXT NOT NULL CHECK (tier IN ('low','moderate','high')),
  formula_version       TEXT NOT NULL,    -- e.g. 'diabscore-v1.0'
  findrisc_bonus        NUMERIC(4,1),     -- NULL if optional section not completed
  computed_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_risk_scores_member  ON risk_scores(family_member_id);
CREATE INDEX idx_risk_scores_tier    ON risk_scores(tier);
CREATE INDEX idx_risk_scores_version ON risk_scores(formula_version);

-- ── PARTNER PHARMACIES (public-readable metadata) ────────────────────────────
CREATE TABLE partner_pharmacies (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL,
  region                   TEXT NOT NULL,
  address                  TEXT,
  phone                    TEXT,
  calendar_integration_id  TEXT,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── REFERRALS ─────────────────────────────────────────────────────────────────
CREATE TABLE referrals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id  UUID REFERENCES family_members(id) NOT NULL,
  risk_score_id     UUID REFERENCES risk_scores(id) NOT NULL,
  pharmacy_id       UUID REFERENCES partner_pharmacies(id),
  status            TEXT NOT NULL DEFAULT 'flagged'
    CHECK (status IN ('flagged','scheduled','completed','no_show','physician_confirmed')),
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_referrals_member ON referrals(family_member_id);
CREATE INDEX idx_referrals_status ON referrals(status);

-- ── APPOINTMENTS ──────────────────────────────────────────────────────────────
CREATE TABLE appointments (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id                 UUID REFERENCES referrals(id) NOT NULL,
  pharmacy_id                 UUID REFERENCES partner_pharmacies(id) NOT NULL,
  scheduled_at                TIMESTAMPTZ NOT NULL,
  confirmed_by_pharmacist_at  TIMESTAMPTZ,   -- NULL until pharmacist acts
  created_at                  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_appointments_referral  ON appointments(referral_id);
CREATE INDEX idx_appointments_pharmacy  ON appointments(pharmacy_id);
CREATE INDEX idx_appointments_scheduled ON appointments(scheduled_at);

-- ── AUDIT LOG (append-only) ───────────────────────────────────────────────────
CREATE TABLE audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor      UUID REFERENCES auth.users(id),
  action     TEXT NOT NULL,   -- e.g. 'consent.granted', 'referral.physician_confirmed'
  entity     TEXT NOT NULL,   -- table name
  entity_id  UUID,
  metadata   JSONB,
  timestamp  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_audit_actor     ON audit_log(actor);
CREATE INDEX idx_audit_entity    ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);

-- ── AGGREGATE OUTCOMES — the ONLY view payer_readonly can see ─────────────────
CREATE MATERIALIZED VIEW aggregate_outcomes AS
  SELECT
    h.region,
    DATE_TRUNC('month', rs.computed_at)                                          AS period,
    COUNT(DISTINCT rs.family_member_id)                                          AS cohort_size,
    ROUND(100.0 * COUNT(*) FILTER (WHERE rs.tier = 'high')
          / NULLIF(COUNT(*), 0), 1)                                              AS pct_high_risk,
    ROUND(100.0 * COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('completed','physician_confirmed'))
          / NULLIF(COUNT(DISTINCT r.id), 0), 1)                                  AS pct_referral_completed,
    ROUND(100.0 * COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'physician_confirmed')
          / NULLIF(COUNT(DISTINCT r.id), 0), 1)                                  AS pct_confirmed_prediabetes
  FROM risk_scores rs
  JOIN family_members fm ON fm.id = rs.family_member_id
  JOIN households     h  ON h.id  = fm.household_id
  LEFT JOIN referrals r  ON r.family_member_id = rs.family_member_id
  GROUP BY h.region, DATE_TRUNC('month', rs.computed_at)
WITH DATA;

CREATE UNIQUE INDEX idx_aggregate_outcomes_pk ON aggregate_outcomes(region, period);

-- Refresh function called by scheduled job (nightly)
CREATE OR REPLACE FUNCTION refresh_aggregate_outcomes()
RETURNS VOID LANGUAGE SQL SECURITY DEFINER AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY aggregate_outcomes;
$$;
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
-- ============================================================
-- 003_data_firewall.sql
-- THE TECHNICAL DATA FIREWALL
--
-- Creates payer_readonly Postgres role with SELECT granted
-- EXCLUSIVELY on aggregate_outcomes.
--
-- A bug in dashboard code CANNOT leak individual records
-- because the role literally has no grant on those tables.
-- This is architectural enforcement, not convention.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'payer_readonly') THEN
    CREATE ROLE payer_readonly NOLOGIN NOINHERIT;
  END IF;
END $$;

-- ── GRANT: only the aggregated view ──────────────────────────────────────────
GRANT SELECT ON aggregate_outcomes         TO payer_readonly;
GRANT EXECUTE ON FUNCTION refresh_aggregate_outcomes() TO payer_readonly;

-- ── REVOKE: all individual-data tables ───────────────────────────────────────
-- Belt-and-suspenders: RLS is layer 1, role grants are layer 2.
REVOKE ALL PRIVILEGES ON households          FROM payer_readonly;
REVOKE ALL PRIVILEGES ON family_members      FROM payer_readonly;
REVOKE ALL PRIVILEGES ON consents            FROM payer_readonly;
REVOKE ALL PRIVILEGES ON screening_responses FROM payer_readonly;
REVOKE ALL PRIVILEGES ON risk_scores         FROM payer_readonly;
REVOKE ALL PRIVILEGES ON referrals           FROM payer_readonly;
REVOKE ALL PRIVILEGES ON appointments        FROM payer_readonly;
REVOKE ALL PRIVILEGES ON audit_log           FROM payer_readonly;
REVOKE ALL PRIVILEGES ON partner_pharmacies  FROM payer_readonly;

COMMENT ON ROLE payer_readonly IS
  'Payer dashboard role (CNAM / insurer). '
  'SELECT on aggregate_outcomes ONLY. '
  'Cannot reach any table containing individual household or member data. '
  'Enforced at role level — not just application logic.';

-- ── Verification (run as payer_readonly to confirm the firewall holds) ────────
-- SET ROLE payer_readonly;
-- SELECT * FROM risk_scores;         -- Must fail: permission denied
-- SELECT * FROM aggregate_outcomes;  -- Must succeed
-- ============================================================
-- 004_seed_pharmacies.sql
-- Real partner medical laboratories — one per major Tunisian governorate
-- ============================================================

INSERT INTO partner_pharmacies (name, region, address, phone, is_active) VALUES
  ('Laboratoire d''Analyses Médicales Farah Messai Mahjoub', 'Tunis',    'Centre Médical Hannibal, Cité des Pins, 1er étage, Les Berges du Lac 2, 1053 Tunis', '+216 71 267 322', TRUE),
  ('Laboratoire Riba Mahmoud',                               'Sousse',   'Immeuble Gloulou, 1er étage, Rue 22 Janvier 1952, Sousse 4000',                      '+216 73 227 878', TRUE),
  ('Laboratoire d''Analyses Médicales Kamel Zribi',          'Sfax',     'Route de Tunis Km 3, Complexe Dar Ettabib, 1er étage, Sfax 3000',                    '+216 70 030 519', TRUE),
  ('Laboratoire d''Analyses Médicales Fehmi Ben Moussa',     'Kairouan', 'Avenue Abi Zamâa El Balaoui, Galerie Errabi, 3100 Kairouan',                         '+216 77 227 292', TRUE),
  ('Laboratoire d''Analyses Médicales Mohamed Becha',        'Gabès',    '154 Boulevard Mohamed Ali, 6000 Gabès',                                              '+216 75 265 814', TRUE),
  ('Laboratoire Abir Belkhechine',                           'Ariana',   'Centre Médical Kamoun, Avenue de l''Ère Nouvelle, Ennasr 2, 2036 Ariana',            '+216 70 039 439', TRUE),
  ('Laboratoire Dr Mohamed Sellem',                          'Nabeul',   'Immeuble Gannar, 3ème étage, 13 Avenue Habib Thameur, 8000 Nabeul',                  '+216 72 270 777', TRUE),
  ('Centre d''Analyses Médicales Bio Dhaouadi',              'Bizerte',  '21 Avenue d''Algérie, 7000 Bizerte',                                                  '+216 72 430 648', TRUE),
  ('Laboratoire d''Analyses Médicales Bechir Hmissi',        'Béja',     '56 Rue de la République, Immeuble Kandil, Béja Nord, 9000 Béja',                     '+216 78 440 900', TRUE),
  ('Laboratoire BIO 24 Alliance',                            'Monastir', 'Centre Médical Ruspina, 1er étage, Avenue Combattant Suprême, 5000 Monastir',        '+216 73 462 717', TRUE);
-- ============================================================
-- 005_household_membership_access.sql
--
-- Bug fix: only the household OWNER could ever resolve "their"
-- household. An invited adult (spouse/parent/sibling) who accepted an
-- invite got a family_members row, but every page/RLS policy that
-- looked up "the household" filtered on owner_user_id = auth.uid() —
-- which is never true for a non-owner member. In practice this meant
-- an invited adult could never see the household (or family tree) they
-- had just joined, and got redirected into creating a brand new,
-- disconnected household instead.
--
-- 002_rls_policies.sql already defines public.user_household_id(), which
-- correctly resolves BOTH the owner case and the member case — but
-- "households_select", "family_members_insert" and "family_members_update"
-- were never updated to use it. This migration fixes that, and adds a
-- contact email per family member (including minors, for a guardian to
-- receive notifications on their behalf).
-- ============================================================

-- ── HOUSEHOLDS — any member (not just the owner) can read their own household
DROP POLICY IF EXISTS "households_select" ON households;
CREATE POLICY "households_select" ON households FOR SELECT
  USING (owner_user_id = auth.uid() OR id = public.user_household_id());

-- ── FAMILY MEMBERS — any adult already in the household can add/update
-- members (e.g. a non-owner spouse registering their own children),
-- not just the household owner.
DROP POLICY IF EXISTS "family_members_insert" ON family_members;
CREATE POLICY "family_members_insert" ON family_members FOR INSERT
  WITH CHECK (
    household_id IN (SELECT id FROM households WHERE owner_user_id = auth.uid())
    OR household_id = public.user_household_id()
  );

DROP POLICY IF EXISTS "family_members_update" ON family_members;
CREATE POLICY "family_members_update" ON family_members FOR UPDATE
  USING (
    household_id IN (SELECT id FROM households WHERE owner_user_id = auth.uid())
    OR household_id = public.user_household_id()
  );

-- ── Contact email per family member — including minors, whose guardian
-- receives lab/result notifications on their behalf.
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS email TEXT;
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
-- ============================================================
-- 007_payer_access.sql
--
-- Wires the payer_readonly role (003_data_firewall.sql) into an actual
-- login path. Until now nothing authenticated AS payer_readonly, so the
-- firewall was real but unused — this migration is what lets a payer
-- session's queries actually execute as that Postgres role, instead of
-- the default 'authenticated' role every other signed-in user gets.
--
-- How it works: Supabase's Custom Access Token Auth Hook lets a Postgres
-- function rewrite the JWT claims issued at login. For a user whose
-- app_metadata.role = 'payer', this hook overwrites the token's
-- top-level `role` claim to 'payer_readonly'. PostgREST reads that claim
-- on every request and does `SET ROLE payer_readonly` before running the
-- query — so a payer session literally cannot execute a query as
-- 'authenticated', and therefore cannot reach any table that role isn't
-- granted (i.e. every individual-data table; see 003_data_firewall.sql).
-- This is enforced by Postgres role privileges, not application code.
--
-- ── MANUAL STEP REQUIRED (cannot be done from SQL) ───────────────────────
-- In the Supabase Dashboard: Authentication → Hooks → Custom Access Token
-- → select "public.custom_access_token_hook" and enable it. Without that
-- one toggle, this migration has no effect: sessions keep the default
-- 'authenticated' role, and /payer will read zero rows (payer_readonly is
-- the only role granted SELECT on aggregate_outcomes).
-- ============================================================

-- PostgREST connects as `authenticator` and does `SET ROLE <jwt role>` per
-- request — it can only switch into a role it has been made a member of.
GRANT payer_readonly TO authenticator;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims  jsonb;
  app_role text;
BEGIN
  SELECT raw_app_meta_data ->> 'role' INTO app_role
  FROM auth.users
  WHERE id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  -- Only 'payer' is ever remapped. 'lab' and every other account keep the
  -- default 'authenticated' Postgres role, which is what every RLS policy
  -- in 002/005/006 is written against and which has zero grants on
  -- aggregate_outcomes — so this hook can only ever narrow what a session
  -- can see, never widen it.
  IF app_role = 'payer' THEN
    claims := jsonb_set(claims, '{role}', '"payer_readonly"');
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Only Supabase's auth service may ever invoke this — never a client session.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

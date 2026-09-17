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
CREATE OR REPLACE FUNCTION auth.user_household_id()
RETURNS UUID LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT id FROM households WHERE owner_user_id = auth.uid()
  UNION
  SELECT household_id FROM family_members WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- ── HOUSEHOLDS ────────────────────────────────────────────────────────────────
CREATE POLICY "households_select" ON households FOR SELECT
  USING (owner_user_id = auth.uid());
CREATE POLICY "households_insert" ON households FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "households_update" ON households FOR UPDATE
  USING (owner_user_id = auth.uid());

-- ── FAMILY MEMBERS ────────────────────────────────────────────────────────────
CREATE POLICY "family_members_select" ON family_members FOR SELECT
  USING (household_id = auth.user_household_id());
CREATE POLICY "family_members_insert" ON family_members FOR INSERT
  WITH CHECK (household_id IN (SELECT id FROM households WHERE owner_user_id = auth.uid()));
CREATE POLICY "family_members_update" ON family_members FOR UPDATE
  USING (household_id IN (SELECT id FROM households WHERE owner_user_id = auth.uid()));

-- ── CONSENTS — INSERT only; no UPDATE/DELETE ──────────────────────────────────
CREATE POLICY "consents_select" ON consents FOR SELECT
  USING (family_member_id IN (
    SELECT id FROM family_members WHERE household_id = auth.user_household_id()
  ));
CREATE POLICY "consents_insert" ON consents FOR INSERT
  WITH CHECK (family_member_id IN (
    SELECT id FROM family_members WHERE household_id = auth.user_household_id()
  ));
-- Intentionally NO update or delete policies — consent is append-only

-- ── SCREENING RESPONSES ───────────────────────────────────────────────────────
CREATE POLICY "screening_select" ON screening_responses FOR SELECT
  USING (family_member_id IN (
    SELECT id FROM family_members WHERE household_id = auth.user_household_id()
  ));
CREATE POLICY "screening_insert" ON screening_responses FOR INSERT
  WITH CHECK (family_member_id IN (
    SELECT id FROM family_members WHERE household_id = auth.user_household_id()
  ));

-- ── RISK SCORES — household read; n8n writes via service role ─────────────────
CREATE POLICY "risk_scores_select" ON risk_scores FOR SELECT
  USING (family_member_id IN (
    SELECT id FROM family_members WHERE household_id = auth.user_household_id()
  ));

-- ── REFERRALS ─────────────────────────────────────────────────────────────────
CREATE POLICY "referrals_select_household" ON referrals FOR SELECT
  USING (family_member_id IN (
    SELECT id FROM family_members WHERE household_id = auth.user_household_id()
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
    WHERE fm.household_id = auth.user_household_id()
  ));
CREATE POLICY "appointments_insert_household" ON appointments FOR INSERT
  WITH CHECK (referral_id IN (
    SELECT r.id FROM referrals r
    JOIN family_members fm ON fm.id = r.family_member_id
    WHERE fm.household_id = auth.user_household_id()
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
-- Demo partner pharmacies — one per major Tunisian governorate
-- ============================================================

INSERT INTO partner_pharmacies (name, region, address, phone, is_active) VALUES
  ('Pharmacie Ben Ali',             'Tunis',    '12 Avenue Habib Bourguiba, Tunis 1000',        '+216 71 000 001', TRUE),
  ('Pharmacie Centrale Sousse',     'Sousse',   '45 Rue de France, Sousse 4000',                '+216 73 000 002', TRUE),
  ('Pharmacie El Amal Sfax',        'Sfax',     '8 Avenue de la République, Sfax 3000',         '+216 74 000 003', TRUE),
  ('Pharmacie Ibn Khaldoun',        'Kairouan', '3 Rue Okba, Kairouan 3100',                    '+216 77 000 004', TRUE),
  ('Pharmacie du Peuple Gabès',     'Gabès',    '21 Avenue Farhat Hached, Gabès 6000',          '+216 75 000 005', TRUE),
  ('Pharmacie Sidi Bou Said',       'Ariana',   '5 Route de la Marsa, Ariana 2080',             '+216 71 000 006', TRUE),
  ('Pharmacie Nabeul Centre',       'Nabeul',   '67 Avenue Habib Thameur, Nabeul 8000',         '+216 72 000 007', TRUE),
  ('Pharmacie de la Santé Bizerte', 'Bizerte',  '14 Rue du 20 Mars, Bizerte 7000',              '+216 72 000 008', TRUE),
  ('Pharmacie Populaire Béja',      'Béja',     '2 Avenue de l''Indépendance, Béja 9000',       '+216 78 000 009', TRUE),
  ('Pharmacie Centrale Monastir',   'Monastir', '33 Avenue de la Corniche, Monastir 5000',      '+216 73 000 010', TRUE);

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

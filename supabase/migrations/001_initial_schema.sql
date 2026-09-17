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

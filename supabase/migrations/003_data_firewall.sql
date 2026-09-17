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

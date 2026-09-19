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

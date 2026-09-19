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

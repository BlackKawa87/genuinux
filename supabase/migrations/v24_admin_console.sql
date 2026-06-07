-- ============================================================
-- v24 — Admin Console schema additions
--
-- Adds:
--   profiles.is_platform_admin  — Genuinux internal admin flag
--   organizations.plan_source   — how the plan was assigned
--   organizations.suspended_at  — soft-suspend timestamp
--   organizations.suspended_by  — who suspended (auth user id)
--
-- Run in Supabase SQL Editor (one block is fine — all safe to run together).
-- After running, grant yourself platform admin:
--   UPDATE profiles SET is_platform_admin = true
--   WHERE email = 'cesar.mktdigital@gmail.com';
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan_source text NOT NULL DEFAULT 'stripe'
    CHECK (plan_source IN ('stripe', 'admin_grant', 'partner', 'internal', 'trial')),
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES auth.users(id);

-- Index to quickly find all platform admins
CREATE INDEX IF NOT EXISTS idx_profiles_platform_admin
  ON profiles (is_platform_admin) WHERE is_platform_admin = true;

-- Index for suspended orgs
CREATE INDEX IF NOT EXISTS idx_orgs_suspended
  ON organizations (suspended_at) WHERE suspended_at IS NOT NULL;

-- GRANT: run this after migration to make yourself platform admin
-- UPDATE profiles SET is_platform_admin = true WHERE email = 'cesar.mktdigital@gmail.com';

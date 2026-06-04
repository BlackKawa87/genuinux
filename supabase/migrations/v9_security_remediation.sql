-- ============================================================
-- Migration v9 — Security Remediation
-- Run each section separately in the Supabase SQL editor.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1: Privilege escalation fix
--
-- Problem: profiles_update_own has no WITH CHECK clause.
-- A user can execute: supabase.from('profiles').update({ role: 'owner' })
-- and self-escalate to any role, including 'owner'.
--
-- Fix A (primary): BEFORE UPDATE trigger that rejects role/org changes
--   when the caller is an authenticated client (auth.uid() IS NOT NULL).
--   service_role key always has auth.uid() = NULL → API endpoints unaffected.
--
-- Fix B (defense in depth): Replace profiles_update_own with a policy
--   that includes WITH CHECK preventing role modification.
-- ────────────────────────────────────────────────────────────

-- Fix A: trigger
CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- auth.uid() is NULL when called from service_role (all /api/* endpoints).
  -- auth.uid() is the user's UUID when called from anon key + JWT (client SDK).
  IF auth.uid() IS NOT NULL THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'role_change_forbidden'
        USING
          MESSAGE  = 'Role changes require administrator action',
          HINT     = 'Contact your organization owner to update your role',
          ERRCODE  = 'P0001';
    END IF;

    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'org_change_forbidden'
        USING
          MESSAGE = 'Organization membership changes require administrator action',
          ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_immutable_role
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_self_escalation();

-- Fix B: tighten RLS WITH CHECK (defense in depth)
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    -- new role must equal the currently stored role
    -- (subquery reads pre-UPDATE value via READ COMMITTED snapshot)
    AND role = (
      SELECT p.role FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1
    )
  );

-- ────────────────────────────────────────────────────────────
-- VALIDATION: After running, the following UPDATE must fail
-- with "role_change_forbidden" when executed from the client SDK:
--
--   supabase.from('profiles').update({ role: 'owner' })
--
-- When executed from service_role (API layer), it must succeed:
--   UPDATE profiles SET role = 'admin' WHERE user_id = '<id>'
-- ────────────────────────────────────────────────────────────

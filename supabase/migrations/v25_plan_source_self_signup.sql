-- v25: Add 'self_signup' to plan_source CHECK constraint
-- Required for self-service registration flow (VITE_INVITE_ONLY_MODE=false)

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_plan_source_check;

ALTER TABLE organizations ADD CONSTRAINT organizations_plan_source_check
  CHECK (plan_source IN ('stripe', 'admin_grant', 'partner', 'internal', 'trial', 'self_signup'));

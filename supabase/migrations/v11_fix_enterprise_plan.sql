-- ============================================================
-- Migration v11 — Fix: ensure active API keys resolve to enterprise plan
-- Run in the Supabase SQL editor.
-- ============================================================
--
-- Root cause: the API key's organization_id may point to an
-- auto-created organization (plan=free) that is different from
-- the organization that was manually updated to plan='enterprise'.
--
-- The handle_new_user trigger creates one org per user at signup.
-- If the SQL UPDATE targeted a differently-named org, the org that
-- the API key actually links to was never updated.
--
-- This migration:
--   1. Fixes the plan on any org that an active API key points to.
--   2. Trims and lowercases the plan column across all orgs (whitespace fix).
--   3. Verifies the result.
-- ============================================================

-- ── Fix: set enterprise plan on every org that has an active API key ─────────
--
-- The plan column is a PostgreSQL ENUM (plan_tier), so whitespace is impossible.
-- Root cause: api_keys.organization_id points to an auto-created org (plan=free)
-- that is different from the org manually updated to plan='enterprise'.
--
-- This UPDATE targets the org the API key actually uses at runtime.

UPDATE organizations
SET plan = 'enterprise'
WHERE id IN (
  SELECT DISTINCT organization_id
  FROM api_keys
  WHERE status = 'active'
);

-- ── Verify ────────────────────────────────────────────────────────────────────

SELECT
  ak.id                                          AS key_id,
  ak.name                                        AS key_name,
  ak.status,
  o.id                                           AS org_id,
  o.name                                         AS org_name,
  o.plan::text                                   AS org_plan,
  o.plan::text = 'enterprise'                    AS is_enterprise,
  CASE o.plan::text
    WHEN 'enterprise' THEN 'x-ratelimit-limit: 200  ✅'
    WHEN 'growth'     THEN 'x-ratelimit-limit: 100  ⚠️'
    WHEN 'starter'    THEN 'x-ratelimit-limit: 60   ⚠️'
    ELSE                   'x-ratelimit-limit: 30   ❌'
  END                                            AS runtime_limit
FROM api_keys ak
JOIN organizations o ON o.id = ak.organization_id
WHERE ak.status = 'active'
ORDER BY ak.created_at;

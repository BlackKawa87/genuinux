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

BEGIN;

-- ── Step 1: Sanitize plan column (removes whitespace, normalizes case) ────────

UPDATE organizations
SET plan = TRIM(LOWER(plan))
WHERE plan IS NOT NULL
  AND (plan != TRIM(plan) OR plan != LOWER(plan));

-- ── Step 2: Set enterprise plan on every org that has an active API key ───────
-- This is the definitive fix regardless of which org was updated previously.

UPDATE organizations
SET plan = 'enterprise'
WHERE id IN (
  SELECT DISTINCT organization_id
  FROM api_keys
  WHERE status = 'active'
);

-- ── Step 3: Verify ────────────────────────────────────────────────────────────

SELECT
  ak.id                                          AS key_id,
  ak.name                                        AS key_name,
  ak.status,
  o.id                                           AS org_id,
  o.name                                         AS org_name,
  o.plan                                         AS org_plan,
  o.plan = 'enterprise'                          AS is_enterprise,
  CASE
    WHEN o.plan = 'enterprise' THEN '✅ x-ratelimit-limit will be 200'
    WHEN o.plan = 'growth'     THEN '⚠️  x-ratelimit-limit will be 100'
    WHEN o.plan = 'starter'    THEN '⚠️  x-ratelimit-limit will be 60'
    ELSE                            '❌ x-ratelimit-limit will be 30 (free)'
  END                                            AS expected_runtime_limit
FROM api_keys ak
JOIN organizations o ON o.id = ak.organization_id
WHERE ak.status = 'active'
ORDER BY ak.created_at;

COMMIT;

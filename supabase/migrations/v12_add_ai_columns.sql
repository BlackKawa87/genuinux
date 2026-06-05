-- ============================================================
-- Migration v12 — Add AI budget columns to organizations table
-- Run in the Supabase SQL editor.
-- ============================================================
--
-- If these columns are already present (from a prior schema.sql run),
-- the IF NOT EXISTS clause makes this a safe no-op.
--
-- Root cause of enterprise rate-limit bug:
--   api/risk/check.ts SELECT on organizations includes these columns.
--   If they don't exist, the entire query fails (Supabase returns error,
--   data=null). This causes orgRow=null → currentPlan='free' → limit=30.
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ai_enabled       boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_monthly_limit integer     NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS ai_calls_used    integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_reset_at      timestamptz NOT NULL DEFAULT now();

-- Verify
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'organizations'
  AND column_name IN ('plan', 'shadow_mode', 'ai_enabled', 'ai_monthly_limit', 'ai_calls_used', 'ai_reset_at')
ORDER BY ordinal_position;

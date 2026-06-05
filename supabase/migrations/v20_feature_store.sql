-- ============================================================
-- Migration v20 — Feature Store Foundation (Phase 3.3)
-- ============================================================
--
-- Expands fraud_features table (created in v19 Section C) with:
--   1. feature_group  — velocity | reputation | behavior | risk | context
--   2. feature_version — enables schema evolution without breaking old data
--   3. source          — identifies extraction engine version
--
-- Adds SELECT RLS policy so dashboard members can query their org's features.
-- Adds additional indexes covering the new columns.
--
-- IMPORTANT: Run each section separately in the Supabase SQL editor.
-- fraud_features must already exist (v19 Section C must have been applied).
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION A — Add columns to fraud_features
-- ════════════════════════════════════════════════════════════

ALTER TABLE fraud_features
  ADD COLUMN IF NOT EXISTS feature_group    TEXT    NOT NULL DEFAULT 'risk',
  ADD COLUMN IF NOT EXISTS feature_version  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source           TEXT    NOT NULL DEFAULT 'risk-engine-v1';


-- ════════════════════════════════════════════════════════════
-- SECTION B — Additional indexes
-- ════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_fraud_features_org_group_created
  ON fraud_features (organization_id, feature_group, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_features_name_version
  ON fraud_features (feature_name, feature_version, created_at DESC);


-- ════════════════════════════════════════════════════════════
-- SECTION C — RLS SELECT policy for org members
--
-- Writes remain service-role-only (no INSERT policy — featureStore.ts
-- uses the admin client). SELECT is opened to org members so the
-- /api/admin/intelligence/features endpoint (user JWT) can query stats.
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "fraud_features_select" ON fraud_features;

CREATE POLICY "fraud_features_select" ON fraud_features
  FOR SELECT USING (organization_id = current_org_id());


-- ════════════════════════════════════════════════════════════
-- VALIDATION
-- ════════════════════════════════════════════════════════════

-- 1. Confirm new columns:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'fraud_features'
-- ORDER BY ordinal_position;

-- 2. Confirm indexes:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'fraud_features';

-- 3. Confirm RLS policy:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'fraud_features';

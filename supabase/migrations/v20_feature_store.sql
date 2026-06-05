-- ============================================================
-- Migration v20 — Feature Store Foundation (Phase 3.3)
-- ============================================================
--
-- This migration is self-contained: it creates fraud_features
-- if it does not exist yet (i.e. v19 Section C was skipped),
-- then adds the Phase 3.3 columns to whichever path was taken.
--
-- Safe to run regardless of whether v19 Section C was applied:
--   - Table missing  → CREATE TABLE with all columns
--   - Table exists   → CREATE TABLE IF NOT EXISTS is a no-op,
--                      then ALTER TABLE ADD COLUMN IF NOT EXISTS
--
-- IMPORTANT: Run each section separately in the Supabase SQL editor.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION A — Create fraud_features (full schema)
--
-- CREATE TABLE IF NOT EXISTS is a no-op if v19 Section C
-- already created the table. The columns added in Section B
-- handle the "v19 already applied" case idempotently.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fraud_features (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_event_id    TEXT        NOT NULL,
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_name     TEXT        NOT NULL,
  feature_value    REAL        NOT NULL,
  feature_group    TEXT        NOT NULL DEFAULT 'risk',
  feature_version  INTEGER     NOT NULL DEFAULT 1,
  source           TEXT        NOT NULL DEFAULT 'risk-engine-v1',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ════════════════════════════════════════════════════════════
-- SECTION B — Add Phase 3.3 columns if table already existed
--
-- If Section A created the table fresh, these are no-ops.
-- If the table came from v19 Section C (missing the new cols),
-- these ALTER statements add them safely.
-- ════════════════════════════════════════════════════════════

ALTER TABLE fraud_features
  ADD COLUMN IF NOT EXISTS feature_group    TEXT    NOT NULL DEFAULT 'risk',
  ADD COLUMN IF NOT EXISTS feature_version  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source           TEXT    NOT NULL DEFAULT 'risk-engine-v1';


-- ════════════════════════════════════════════════════════════
-- SECTION C — Indexes
-- ════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_fraud_features_event
  ON fraud_features (risk_event_id);

CREATE INDEX IF NOT EXISTS idx_fraud_features_org_feature
  ON fraud_features (organization_id, feature_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_features_org_group_created
  ON fraud_features (organization_id, feature_group, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_features_name_version
  ON fraud_features (feature_name, feature_version, created_at DESC);


-- ════════════════════════════════════════════════════════════
-- SECTION D — RLS
-- ════════════════════════════════════════════════════════════

ALTER TABLE fraud_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fraud_features_select" ON fraud_features;

CREATE POLICY "fraud_features_select" ON fraud_features
  FOR SELECT USING (organization_id = current_org_id());


-- ════════════════════════════════════════════════════════════
-- VALIDATION
-- ════════════════════════════════════════════════════════════

-- 1. Confirm all columns exist:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'fraud_features'
-- ORDER BY ordinal_position;

-- 2. Confirm indexes:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'fraud_features';

-- 3. Confirm RLS policy:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'fraud_features';

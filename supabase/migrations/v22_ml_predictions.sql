-- ============================================================
-- Migration v22 — ML Shadow Mode (Phase 3.7 redesign)
-- ============================================================
--
-- Creates:
--   1. ml_predictions  — shadow model output alongside live engine decision
--   2. feature_importance — model weight registry, seeded for shadow-v1
--
-- Safe to DROP+CREATE ml_predictions: ML_SHADOW_ENABLED was never
-- activated in production, so no real prediction data exists.
--
-- IMPORTANT: Run each section separately in the Supabase SQL editor.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION A — ml_predictions table
-- ════════════════════════════════════════════════════════════

-- Drop previous schema (incompatible column types — TEXT model_version → INTEGER)
DROP TABLE IF EXISTS ml_predictions CASCADE;

CREATE TABLE ml_predictions (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  risk_event_id     TEXT          NOT NULL,
  model_name        TEXT          NOT NULL DEFAULT 'shadow-v1',
  model_version     INTEGER       NOT NULL DEFAULT 1,
  prediction        TEXT          NOT NULL
    CHECK (prediction IN ('block', 'review', 'allow')),
  prediction_score  NUMERIC(5,4)
    CHECK (prediction_score BETWEEN 0 AND 1),
  actual_decision   TEXT
    CHECK (actual_decision IN ('block', 'review', 'allow')),
  agreement         BOOLEAN,
  feature_version   INTEGER       DEFAULT 1,
  dataset_version   INTEGER       DEFAULT 1,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_org_created
  ON ml_predictions (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_org_event
  ON ml_predictions (organization_id, risk_event_id);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_model
  ON ml_predictions (organization_id, model_name, model_version, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_agreement
  ON ml_predictions (organization_id, agreement, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_org_prediction
  ON ml_predictions (organization_id, prediction, created_at DESC);

ALTER TABLE ml_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ml_predictions_select" ON ml_predictions;

CREATE POLICY "ml_predictions_select" ON ml_predictions
  FOR SELECT USING (organization_id = current_org_id());


-- ════════════════════════════════════════════════════════════
-- SECTION B — feature_importance table + shadow-v1 seed
--
-- Stores model weight registry.
-- shadow-v1 weights match the WEIGHTS constant in shadowPredictor.ts.
-- Future real models will INSERT rows with their own model_version.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feature_importance (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version    TEXT          NOT NULL,
  feature_name     TEXT          NOT NULL,
  importance_score REAL          NOT NULL CHECK (importance_score BETWEEN 0 AND 1),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (model_version, feature_name)
);

CREATE INDEX IF NOT EXISTS idx_feature_importance_model
  ON feature_importance (model_version, importance_score DESC);

ALTER TABLE feature_importance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_importance_select" ON feature_importance;

CREATE POLICY "feature_importance_select" ON feature_importance
  FOR SELECT USING (true);

-- Seed shadow-v1 weights (must match WEIGHTS in api/_lib/shadowPredictor.ts)
INSERT INTO feature_importance (model_version, feature_name, importance_score) VALUES
  ('shadow-v1', 'fraud_score',       0.35),
  ('shadow-v1', 'trust_score',       0.20),
  ('shadow-v1', 'gnx_score',         0.15),
  ('shadow-v1', 'user_velocity',     0.08),
  ('shadow-v1', 'ip_velocity',       0.06),
  ('shadow-v1', 'device_reputation', 0.05),
  ('shadow-v1', 'ip_reputation',     0.04),
  ('shadow-v1', 'country_risk',      0.04),
  ('shadow-v1', 'event_type_risk',   0.03)
ON CONFLICT (model_version, feature_name) DO NOTHING;


-- ════════════════════════════════════════════════════════════
-- VALIDATION
-- ════════════════════════════════════════════════════════════

-- 1. Confirm tables exist:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name IN ('ml_predictions', 'feature_importance');

-- 2. Confirm schema:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'ml_predictions' ORDER BY ordinal_position;

-- 3. Confirm shadow-v1 seed:
-- SELECT feature_name, importance_score FROM feature_importance
-- WHERE model_version = 'shadow-v1' ORDER BY importance_score DESC;

-- 4. Confirm indexes:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'ml_predictions';

-- 5. Confirm RLS:
-- SELECT tablename, policyname FROM pg_policies
-- WHERE tablename IN ('ml_predictions', 'feature_importance');

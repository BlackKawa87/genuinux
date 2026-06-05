-- ============================================================
-- Migration v22 — ML Shadow Mode (Phase 3.7)
-- ============================================================
--
-- Creates:
--   1. ml_predictions  — one row per event × model version
--   2. feature_importance — model weight registry, seeded for shadow-v1
--
-- ml_predictions stores the shadow model output alongside the engine's
-- live decision so agreement can be computed without joins.
--
-- ML_SHADOW_ENABLED=true activates writes from mlShadowRunner.ts.
-- Predictions NEVER influence the live decision.
--
-- IMPORTANT: Run each section separately in the Supabase SQL editor.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION A — ml_predictions table
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ml_predictions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  risk_event_id     TEXT        NOT NULL,
  model_version     TEXT        NOT NULL DEFAULT 'shadow-v1',
  fraud_probability REAL        NOT NULL CHECK (fraud_probability BETWEEN 0 AND 1),
  predicted_label   TEXT        NOT NULL
    CHECK (predicted_label IN ('confirmed_fraud', 'suspected_fraud', 'legitimate')),
  confidence        REAL        NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  engine_decision   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_org_created
  ON ml_predictions (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_org_event
  ON ml_predictions (organization_id, risk_event_id);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_model_version
  ON ml_predictions (organization_id, model_version, created_at DESC);

ALTER TABLE ml_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ml_predictions_select" ON ml_predictions;

CREATE POLICY "ml_predictions_select" ON ml_predictions
  FOR SELECT USING (organization_id = current_org_id());


-- ════════════════════════════════════════════════════════════
-- SECTION B — feature_importance table + shadow-v1 seed
--
-- Stores model weight registry. For the mock shadow-v1 model,
-- weights are seeded from the mlShadowRunner formula.
-- Future real models will overwrite or add rows with their version.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feature_importance (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version    TEXT        NOT NULL,
  feature_name     TEXT        NOT NULL,
  importance_score REAL        NOT NULL CHECK (importance_score BETWEEN 0 AND 1),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (model_version, feature_name)
);

CREATE INDEX IF NOT EXISTS idx_feature_importance_model
  ON feature_importance (model_version, importance_score DESC);

ALTER TABLE feature_importance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_importance_select" ON feature_importance;

CREATE POLICY "feature_importance_select" ON feature_importance
  FOR SELECT USING (true);

-- Seed shadow-v1 weights (matches mlShadowRunner.ts WEIGHTS constant)
INSERT INTO feature_importance (model_version, feature_name, importance_score)
VALUES
  ('shadow-v1', 'fraud_score',          0.35),
  ('shadow-v1', 'trust_score',          0.20),
  ('shadow-v1', 'gnx_score',            0.15),
  ('shadow-v1', 'user_velocity',        0.08),
  ('shadow-v1', 'ip_velocity',          0.06),
  ('shadow-v1', 'device_reputation',    0.05),
  ('shadow-v1', 'ip_reputation',        0.04),
  ('shadow-v1', 'country_risk',         0.04),
  ('shadow-v1', 'event_type_risk',      0.03)
ON CONFLICT (model_version, feature_name) DO NOTHING;


-- ════════════════════════════════════════════════════════════
-- VALIDATION
-- ════════════════════════════════════════════════════════════

-- 1. Confirm tables:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name IN ('ml_predictions', 'feature_importance');

-- 2. Confirm feature_importance seed:
-- SELECT * FROM feature_importance ORDER BY importance_score DESC;

-- 3. Confirm RLS:
-- SELECT tablename, policyname FROM pg_policies
-- WHERE tablename IN ('ml_predictions', 'feature_importance');

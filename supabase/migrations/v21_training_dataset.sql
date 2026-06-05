-- ============================================================
-- Migration v21 — Training Dataset (Phase 3.6)
-- ============================================================
--
-- Creates the training_dataset table: one row per (event, label) pair,
-- enriched with risk scores and feature count at labeling time.
-- This is the primary ML training surface — Phase 3.7 (Shadow ML)
-- reads from this table when threshold is met.
--
-- Build trigger: every POST /api/risk/label appends a row here via
-- datasetBuilder.ts (fire-and-forget, gated by DATASET_BUILDER_ENABLED).
--
-- IMPORTANT: Run each section separately in the Supabase SQL editor.
-- Requires v19 (fraud_labels) to be applied first.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION A — training_dataset table
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS training_dataset (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  risk_event_id    TEXT        NOT NULL,
  label            TEXT        NOT NULL
    CHECK (label IN ('confirmed_fraud', 'suspected_fraud', 'false_positive', 'legitimate')),
  decision         TEXT,
  fraud_score      REAL,
  trust_score      REAL,
  gnx_score        SMALLINT,
  feature_count    INTEGER     NOT NULL DEFAULT 0,
  label_created_at TIMESTAMPTZ,
  event_created_at TIMESTAMPTZ,
  dataset_version  INTEGER     NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ════════════════════════════════════════════════════════════
-- SECTION B — Indexes
-- ════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_training_dataset_org_label
  ON training_dataset (organization_id, label, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_dataset_org_event
  ON training_dataset (organization_id, risk_event_id);

CREATE INDEX IF NOT EXISTS idx_training_dataset_org_created
  ON training_dataset (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_training_dataset_version
  ON training_dataset (organization_id, dataset_version);


-- ════════════════════════════════════════════════════════════
-- SECTION C — RLS
-- ════════════════════════════════════════════════════════════

ALTER TABLE training_dataset ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_dataset_select" ON training_dataset;
DROP POLICY IF EXISTS "training_dataset_insert" ON training_dataset;

CREATE POLICY "training_dataset_select" ON training_dataset
  FOR SELECT USING (organization_id = current_org_id());

-- INSERT is service-role-only (datasetBuilder.ts uses admin client).
-- No INSERT policy needed — RLS blocks anon inserts, service role bypasses.


-- ════════════════════════════════════════════════════════════
-- VALIDATION
-- ════════════════════════════════════════════════════════════

-- 1. Confirm table exists:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'training_dataset';

-- 2. Confirm indexes:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'training_dataset';

-- 3. Confirm RLS:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'training_dataset';

-- v23_fraud_labels_unique.sql
-- Fix: fraud_labels duplication bug
--
-- Root cause: fraud_labels had no UNIQUE constraint on (organization_id, risk_event_id).
-- Every POST /api/risk/label used INSERT instead of UPSERT, creating a new row on each
-- label submission. Duplicate rows caused label_coverage_rate to exceed 100%.
--
-- Run Sections A → D separately in the Supabase SQL editor.

-- ─────────────────────────────────────────────────────────────────────────────
-- Section A: Delete duplicate fraud_labels rows — keep only the latest per event
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM fraud_labels
WHERE id NOT IN (
  SELECT DISTINCT ON (organization_id, risk_event_id) id
  FROM fraud_labels
  ORDER BY organization_id, risk_event_id, created_at DESC
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Section B: Add UNIQUE constraint on (organization_id, risk_event_id)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE fraud_labels
  ADD CONSTRAINT fraud_labels_org_event_unique
  UNIQUE (organization_id, risk_event_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Section C: Delete duplicate training_dataset rows — keep latest per event
-- (skips gracefully if table does not exist)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'training_dataset'
  ) THEN
    DELETE FROM training_dataset
    WHERE id NOT IN (
      SELECT DISTINCT ON (organization_id, risk_event_id) id
      FROM training_dataset
      ORDER BY organization_id, risk_event_id, label_created_at DESC NULLS LAST
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Section D: Add UNIQUE constraint on training_dataset (if table exists)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'training_dataset'
  ) THEN
    IF NOT EXISTS (
      SELECT FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name   = 'training_dataset'
        AND constraint_name = 'training_dataset_org_event_unique'
    ) THEN
      ALTER TABLE training_dataset
        ADD CONSTRAINT training_dataset_org_event_unique
        UNIQUE (organization_id, risk_event_id);
    END IF;
  END IF;
END $$;

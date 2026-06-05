-- ============================================================
-- Migration v19 — Phase 3 Intelligence Layer
-- ============================================================
--
-- Modules implemented:
--   1. gnx_score + ML shadow columns on risk_events  (Module 10 + 8)
--   2. fraud_labels table                            (Module 1)
--   3. fraud_features table                          (Module 3)
--   4. entity_reputation table + helper function     (Module 5)
--
-- IMPORTANT: Run each section separately in the Supabase SQL editor.
-- ALTER TABLE on a RANGE-partitioned table propagates to all partitions.
--
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION A — Add intelligence columns to risk_events
--
-- gnx_score:   Genuinux Fraud Score™ (0–1000). NULL on old rows.
-- ml_score:    Future ML probability output (0.0–1.0). NULL until Module 7.
-- ml_decision: Future ML shadow decision. NULL until Module 7.
-- ml_version:  Future ML model version tag. NULL until Module 7.
--
-- ALTER TABLE on the partitioned parent propagates to all partitions.
-- ════════════════════════════════════════════════════════════

ALTER TABLE risk_events
  ADD COLUMN IF NOT EXISTS gnx_score    SMALLINT CHECK (gnx_score BETWEEN 0 AND 1000),
  ADD COLUMN IF NOT EXISTS ml_score     REAL     CHECK (ml_score BETWEEN 0.0 AND 1.0),
  ADD COLUMN IF NOT EXISTS ml_decision  TEXT     CHECK (ml_decision IN ('allow', 'review', 'block')),
  ADD COLUMN IF NOT EXISTS ml_version   TEXT;


-- ════════════════════════════════════════════════════════════
-- SECTION B — fraud_labels table
--
-- Client-API labels submitted programmatically via POST /api/risk/label.
-- Distinct from event_feedback (dashboard human review).
-- risk_event_id stored as TEXT — no FK because risk_events PK is
-- (id, created_at) after v18 partitioning.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fraud_labels (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  risk_event_id    TEXT        NOT NULL,
  label            TEXT        NOT NULL
    CHECK (label IN ('confirmed_fraud', 'suspected_fraud', 'false_positive', 'legitimate')),
  notes            TEXT,
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_labels_org_event
  ON fraud_labels (organization_id, risk_event_id);

CREATE INDEX IF NOT EXISTS idx_fraud_labels_org_label_created
  ON fraud_labels (organization_id, label, created_at DESC);

ALTER TABLE fraud_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fraud_labels_select" ON fraud_labels;
DROP POLICY IF EXISTS "fraud_labels_insert" ON fraud_labels;

CREATE POLICY "fraud_labels_select" ON fraud_labels
  FOR SELECT USING (organization_id = current_org_id());

CREATE POLICY "fraud_labels_insert" ON fraud_labels
  FOR INSERT WITH CHECK (organization_id = current_org_id());


-- ════════════════════════════════════════════════════════════
-- SECTION C — fraud_features table
--
-- Per-event feature rows for the ML Feature Store (Module 3).
-- One row per (event, feature_name). Populated fire-and-forget
-- by api/_lib/featureStore.ts when FEATURE_STORE_ENABLED=true.
-- Service-role-only write (no RLS write policy).
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fraud_features (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_event_id    TEXT        NOT NULL,
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_name     TEXT        NOT NULL,
  feature_value    REAL        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_features_event
  ON fraud_features (risk_event_id);

CREATE INDEX IF NOT EXISTS idx_fraud_features_org_feature
  ON fraud_features (organization_id, feature_name, created_at DESC);

-- No read policy = only service role can access
ALTER TABLE fraud_features ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════
-- SECTION D — entity_reputation table + helper function
--
-- Global cross-org reputation store (Module 5).
-- No organization_id — aggregates anonymous signal across all orgs.
-- entity_value stores only the entity (IP, device ID, email hash)
-- with no link to any organization.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS entity_reputation (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      TEXT        NOT NULL CHECK (entity_type IN ('ip', 'device', 'email')),
  entity_value     TEXT        NOT NULL,
  fraud_count      INTEGER     NOT NULL DEFAULT 0,
  legitimate_count INTEGER     NOT NULL DEFAULT 0,
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_value)
);

CREATE INDEX IF NOT EXISTS idx_entity_reputation_type_value
  ON entity_reputation (entity_type, entity_value);

CREATE INDEX IF NOT EXISTS idx_entity_reputation_fraud_count
  ON entity_reputation (entity_type, fraud_count DESC);

-- No read policy = only service role can access
ALTER TABLE entity_reputation ENABLE ROW LEVEL SECURITY;


-- Atomic upsert helper — avoids read-modify-write race conditions.
-- SECURITY DEFINER so it runs with service role privileges.

CREATE OR REPLACE FUNCTION increment_entity_reputation(
  p_type  TEXT,
  p_value TEXT,
  p_fraud INTEGER DEFAULT 0,
  p_legit INTEGER DEFAULT 0
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO entity_reputation (
    entity_type, entity_value, fraud_count, legitimate_count, last_seen_at, updated_at
  )
  VALUES (p_type, p_value, p_fraud, p_legit, NOW(), NOW())
  ON CONFLICT (entity_type, entity_value) DO UPDATE SET
    fraud_count      = entity_reputation.fraud_count      + EXCLUDED.fraud_count,
    legitimate_count = entity_reputation.legitimate_count + EXCLUDED.legitimate_count,
    last_seen_at     = NOW(),
    updated_at       = NOW();
$$;


-- ════════════════════════════════════════════════════════════
-- VALIDATION
-- ════════════════════════════════════════════════════════════

-- 1. Confirm columns added to risk_events:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'risk_events' AND column_name IN ('gnx_score','ml_score','ml_decision','ml_version');

-- 2. Confirm tables created:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name IN ('fraud_labels','fraud_features','entity_reputation');

-- 3. Test reputation upsert:
-- SELECT increment_entity_reputation('ip', '1.2.3.4', 1, 0);
-- SELECT * FROM entity_reputation WHERE entity_type='ip' AND entity_value='1.2.3.4';
-- SELECT increment_entity_reputation('ip', '1.2.3.4', 0, 1);
-- SELECT * FROM entity_reputation WHERE entity_type='ip' AND entity_value='1.2.3.4';
-- Expected: fraud_count=1, legitimate_count=1
-- ============================================================

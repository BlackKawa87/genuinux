-- ============================================================
-- v24 — GNX Fraud Score™ v2 — Phase 3.9
-- ============================================================
-- Adds two new columns to risk_events:
--   gnx_score_factors JSONB  — full factor breakdown (top_factors array)
--   gnx_version       TEXT   — score formula version ('v1', 'v2', ...)
--
-- gnx_score already exists (added in v19).
-- Run this section once in the Supabase SQL editor.
-- ============================================================

-- SECTION A: Add columns to risk_events
-- (IF NOT EXISTS guards make it safe to re-run)

ALTER TABLE risk_events
  ADD COLUMN IF NOT EXISTS gnx_score_factors JSONB,
  ADD COLUMN IF NOT EXISTS gnx_version       TEXT;

-- Index on gnx_version for version-specific distribution queries
CREATE INDEX IF NOT EXISTS idx_re_gnx_version
  ON risk_events (organization_id, gnx_version, created_at DESC);

-- Index for gnx_score range queries (distribution histogram)
CREATE INDEX IF NOT EXISTS idx_re_gnx_score_org
  ON risk_events (organization_id, gnx_score, created_at DESC)
  WHERE gnx_score IS NOT NULL;

-- ============================================================
-- SECTION B: Distribution helper view (optional, for analytics)
-- ============================================================
-- View to bucket gnx_scores into 10 bands (0-99, 100-199, ..., 900-1000)
-- Used by /api/admin/gnx/distribution endpoint.

CREATE OR REPLACE VIEW gnx_score_distribution AS
SELECT
  organization_id,
  gnx_version,
  CASE
    WHEN gnx_score BETWEEN    0 AND   99 THEN '0-99'
    WHEN gnx_score BETWEEN  100 AND  199 THEN '100-199'
    WHEN gnx_score BETWEEN  200 AND  299 THEN '200-299'
    WHEN gnx_score BETWEEN  300 AND  399 THEN '300-399'
    WHEN gnx_score BETWEEN  400 AND  499 THEN '400-499'
    WHEN gnx_score BETWEEN  500 AND  599 THEN '500-599'
    WHEN gnx_score BETWEEN  600 AND  699 THEN '600-699'
    WHEN gnx_score BETWEEN  700 AND  799 THEN '700-799'
    WHEN gnx_score BETWEEN  800 AND  899 THEN '800-899'
    WHEN gnx_score BETWEEN  900 AND 1000 THEN '900-1000'
  END AS score_band,
  COUNT(*)::INTEGER AS event_count
FROM risk_events
WHERE gnx_score IS NOT NULL
GROUP BY organization_id, gnx_version, score_band;

-- ============================================================
-- SECTION C: Verify
-- ============================================================
-- Run after applying sections A and B:
--
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'risk_events'
--   AND column_name IN ('gnx_score', 'gnx_score_factors', 'gnx_version');
--
-- Expected output:
--   gnx_score         | smallint
--   gnx_score_factors | jsonb
--   gnx_version       | text

-- ============================================================
-- Migration v17 — org_daily_stats table + aggregate function
--
-- Purpose:
--   Persistent daily aggregates per organization, populated nightly
--   by /api/cron/maintenance (Task 3).
--   Enables dashboard analytics without querying the growing
--   risk_events table at read time.
--
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_daily_stats (
  organization_id  UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date             DATE    NOT NULL,
  total_requests   INTEGER NOT NULL DEFAULT 0,
  approve_count    INTEGER NOT NULL DEFAULT 0,
  review_count     INTEGER NOT NULL DEFAULT 0,
  block_count      INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms   REAL,
  PRIMARY KEY (organization_id, date)
);

CREATE INDEX IF NOT EXISTS idx_org_daily_stats_org_date
  ON org_daily_stats (organization_id, date DESC);

ALTER TABLE org_daily_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_daily_stats_select" ON org_daily_stats;
DROP POLICY IF EXISTS "org_daily_stats_insert" ON org_daily_stats;
DROP POLICY IF EXISTS "org_daily_stats_update" ON org_daily_stats;

CREATE POLICY "org_daily_stats_select" ON org_daily_stats
  FOR SELECT USING (organization_id = current_org_id());

CREATE POLICY "org_daily_stats_insert" ON org_daily_stats
  FOR INSERT WITH CHECK (true);

CREATE POLICY "org_daily_stats_update" ON org_daily_stats
  FOR UPDATE USING (true);


-- ── Aggregate function ─────────────────────────────────────────────────────────
--
-- Called by /api/cron/maintenance at 03:00 UTC with target_date = yesterday.
-- Inserts one row per org that had events on target_date.
-- ON CONFLICT: re-aggregates (idempotent — safe to re-run for same date).
--
-- SECURITY DEFINER + SET search_path = public — required pattern for
-- functions that access tables; prevents relation-not-found errors.

CREATE OR REPLACE FUNCTION aggregate_daily_stats(target_date DATE)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO org_daily_stats (
    organization_id, date,
    total_requests, approve_count, review_count, block_count
  )
  SELECT
    organization_id,
    target_date,
    COUNT(*)::integer                                       AS total_requests,
    COUNT(*) FILTER (WHERE decision = 'allow')::integer    AS approve_count,
    COUNT(*) FILTER (WHERE decision = 'review')::integer   AS review_count,
    COUNT(*) FILTER (WHERE decision = 'block')::integer    AS block_count
  FROM risk_events
  WHERE created_at >= target_date::timestamptz
    AND created_at <  (target_date + INTERVAL '1 day')::timestamptz
  GROUP BY organization_id
  ON CONFLICT (organization_id, date) DO UPDATE SET
    total_requests = EXCLUDED.total_requests,
    approve_count  = EXCLUDED.approve_count,
    review_count   = EXCLUDED.review_count,
    block_count    = EXCLUDED.block_count;
$$;


-- ── Archival function ──────────────────────────────────────────────────────────
--
-- Deletes risk_events older than retention_days (default 365).
-- Called by /api/cron/maintenance Task 4.
-- Returns the number of rows deleted.

CREATE OR REPLACE FUNCTION purge_old_risk_events(retention_days INTEGER DEFAULT 365)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM risk_events
  WHERE created_at < (NOW() - (retention_days || ' days')::interval);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


-- ── Validation ─────────────────────────────────────────────────────────────────
-- Run manually to verify:
--
--   SELECT * FROM org_daily_stats LIMIT 5;
--   SELECT aggregate_daily_stats(CURRENT_DATE - 1);
--   SELECT * FROM org_daily_stats WHERE date = CURRENT_DATE - 1;
--   SELECT purge_old_risk_events(365);
--
-- Expected: aggregate inserts rows for yesterday's events; purge returns 0
-- during beta (no events older than 365 days yet).
-- ============================================================

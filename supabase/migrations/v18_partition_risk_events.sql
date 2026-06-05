-- ============================================================
-- Migration v18 — risk_events RANGE Partitioning (monthly)
-- ============================================================
--
-- WHY PARTITION?
--   risk_events is the largest table and grows unbounded.
--   All context queries (get_risk_context RPC) and dashboard
--   queries filter by created_at — monthly partitions let the
--   query planner skip irrelevant partitions entirely.
--   Archival becomes a DROP TABLE (instant) instead of DELETE.
--
-- FK CONSTRAINT NOTE:
--   review_queue.risk_event_id REFERENCES risk_events(id)
--   PostgreSQL 15 requires the PK of a RANGE-partitioned table
--   to include the partition key, so PK becomes (id, created_at).
--   A FK to just (id) is therefore invalid.
--   Solution: drop the FK constraint (keep the column), rely on
--   application-level integrity (insertRiskEvent always creates
--   the event before createReviewQueueItem reads it).
--
-- HOW TO RUN (Supabase SQL Editor):
--   ① Run SECTION A entirely (table + partitions + helper fn)
--   ② Run SECTION B entirely (copy data from old table)
--   ③ Run SECTION C entirely (indexes — safe, table not live yet)
--   ④ Run SECTION D entirely (RLS + atomic rename + cleanup)
--
-- Total time for beta data (< 10K rows): < 5 seconds.
-- Run during low-traffic window regardless.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION A — Create partitioned table + monthly partitions
--             + auto-partition helper function
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS risk_events_p (
  -- Core columns (match schema.sql base)
  id               UUID        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_user_id TEXT        NOT NULL,
  event_type       event_type  NOT NULL,
  ip_address       INET,
  device_id        TEXT,
  email            TEXT,
  user_agent       TEXT,
  country          CHAR(2),
  trust_score      SMALLINT    NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
  fraud_score      SMALLINT    NOT NULL CHECK (fraud_score BETWEEN 0 AND 100),
  risk_level       risk_level  NOT NULL,
  decision         decision    NOT NULL,
  signals_json     JSONB,
  ai_summary       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Added in v6 migration
  suggested_decision   TEXT,
  applied_rule_id      UUID REFERENCES rules(id) ON DELETE SET NULL,
  applied_rule_name    TEXT,
  risk_reasons_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence_level     TEXT,
  recommended_action   TEXT,
  shadow_mode          BOOLEAN     NOT NULL DEFAULT false,
  engine_version       TEXT        NOT NULL DEFAULT 'risk-engine-v1',
  processed_at         TIMESTAMPTZ,
  -- PK must include the partition key for RANGE partitioning
  -- (PostgreSQL 15 requirement — cannot be just (id) alone)
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- ── Monthly partitions: 2026-01 → 2027-06 ────────────────────
-- 18 months covers current data + 12 months runway.
-- Maintenance cron auto-creates more via create_risk_events_partition().

CREATE TABLE IF NOT EXISTS risk_events_2026_01 PARTITION OF risk_events_p
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE IF NOT EXISTS risk_events_2026_02 PARTITION OF risk_events_p
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE IF NOT EXISTS risk_events_2026_03 PARTITION OF risk_events_p
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE IF NOT EXISTS risk_events_2026_04 PARTITION OF risk_events_p
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE IF NOT EXISTS risk_events_2026_05 PARTITION OF risk_events_p
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE IF NOT EXISTS risk_events_2026_06 PARTITION OF risk_events_p
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE IF NOT EXISTS risk_events_2026_07 PARTITION OF risk_events_p
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE IF NOT EXISTS risk_events_2026_08 PARTITION OF risk_events_p
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE IF NOT EXISTS risk_events_2026_09 PARTITION OF risk_events_p
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE IF NOT EXISTS risk_events_2026_10 PARTITION OF risk_events_p
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE IF NOT EXISTS risk_events_2026_11 PARTITION OF risk_events_p
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE IF NOT EXISTS risk_events_2026_12 PARTITION OF risk_events_p
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS risk_events_2027_01 PARTITION OF risk_events_p
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE IF NOT EXISTS risk_events_2027_02 PARTITION OF risk_events_p
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE IF NOT EXISTS risk_events_2027_03 PARTITION OF risk_events_p
  FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

CREATE TABLE IF NOT EXISTS risk_events_2027_04 PARTITION OF risk_events_p
  FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');

CREATE TABLE IF NOT EXISTS risk_events_2027_05 PARTITION OF risk_events_p
  FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');

CREATE TABLE IF NOT EXISTS risk_events_2027_06 PARTITION OF risk_events_p
  FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');


-- ── Auto-partition helper ─────────────────────────────────────
-- Called by /api/cron/maintenance to pre-create next month's partition.
-- Idempotent — safe to call for months that already exist.

CREATE OR REPLACE FUNCTION create_risk_events_partition(target_month DATE)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date DATE;
  end_date   DATE;
  part_name  TEXT;
BEGIN
  start_date := date_trunc('month', target_month)::date;
  end_date   := (start_date + INTERVAL '1 month')::date;
  part_name  := 'risk_events_' || to_char(start_date, 'YYYY_MM');

  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = part_name
  ) THEN
    RETURN 'exists: ' || part_name;
  END IF;

  EXECUTE format(
    'CREATE TABLE %I PARTITION OF risk_events FOR VALUES FROM (%L::timestamptz) TO (%L::timestamptz)',
    part_name, start_date, end_date
  );

  RETURN 'created: ' || part_name;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- SECTION B — Copy data from existing risk_events table
--
-- Explicit column list avoids issues if column order differs.
-- Run after Section A completes successfully.
-- Verify row counts before proceeding to Section C.
-- ════════════════════════════════════════════════════════════

-- NOTE: v6 columns (suggested_decision, applied_rule_id, etc.) were not applied
-- to production at migration time — use NULL/defaults for those columns.
INSERT INTO risk_events_p (
  id, organization_id, external_user_id, event_type,
  ip_address, device_id, email, user_agent, country,
  trust_score, fraud_score, risk_level, decision,
  signals_json, ai_summary, created_at,
  suggested_decision, applied_rule_id, applied_rule_name,
  risk_reasons_json, confidence_level, recommended_action,
  shadow_mode, engine_version, processed_at
)
SELECT
  id, organization_id, external_user_id, event_type,
  ip_address, device_id, email, user_agent, country,
  trust_score, fraud_score, risk_level, decision,
  signals_json, ai_summary, created_at,
  NULL,             -- suggested_decision
  NULL,             -- applied_rule_id
  NULL,             -- applied_rule_name
  '[]'::jsonb,      -- risk_reasons_json
  NULL,             -- confidence_level
  NULL,             -- recommended_action
  false,            -- shadow_mode
  'risk-engine-v1', -- engine_version
  NULL              -- processed_at
FROM risk_events;

-- Verify row counts match before continuing:
-- SELECT
--   (SELECT COUNT(*) FROM risk_events)   AS old_count,
--   (SELECT COUNT(*) FROM risk_events_p) AS new_count;
-- Expected: old_count = new_count


-- ════════════════════════════════════════════════════════════
-- SECTION C — Create indexes on risk_events_p
--
-- Creating indexes before the table goes live (no CONCURRENTLY needed).
-- PostgreSQL automatically creates each index on every partition.
-- Run this entire section as one block.
-- ════════════════════════════════════════════════════════════

-- Primary access patterns (from schema.sql)
CREATE INDEX IF NOT EXISTS idx_rep_org_created
  ON risk_events_p (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rep_user
  ON risk_events_p (organization_id, external_user_id);

CREATE INDEX IF NOT EXISTS idx_rep_decision
  ON risk_events_p (organization_id, decision);

-- Context queries (from v6 — fetchContext / get_risk_context)
CREATE INDEX IF NOT EXISTS idx_rep_org_user_created
  ON risk_events_p (organization_id, external_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rep_org_device_created
  ON risk_events_p (organization_id, device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rep_org_device_decision
  ON risk_events_p (organization_id, device_id, decision, created_at DESC);

-- Dashboard filter queries (from v6)
CREATE INDEX IF NOT EXISTS idx_rep_org_risk_level
  ON risk_events_p (organization_id, risk_level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rep_org_event_type
  ON risk_events_p (organization_id, event_type, created_at DESC);

-- IP expression index — CRITICAL for get_risk_context (from v15)
-- ip_address is inet type; the RPC casts it with ::text
-- A plain inet index is NEVER used by ip_address::text = p_ip comparisons
CREATE INDEX IF NOT EXISTS idx_rep_org_ip_text_time
  ON risk_events_p (organization_id, (ip_address::text), created_at DESC);


-- ════════════════════════════════════════════════════════════
-- SECTION D — Atomic rename + RLS + cleanup
--
-- Drop the FK from review_queue (required — see header note).
-- Rename old table to _legacy (preserved for rollback).
-- Enable RLS on new table, recreate policies.
-- Run this entire section as one block.
-- ════════════════════════════════════════════════════════════

-- ── Step 1: Drop FK from review_queue → risk_events ──────────
-- The column stays; only the DB-enforced constraint is dropped.
-- Application logic (check.ts) guarantees event exists before
-- the queue item is created.
ALTER TABLE review_queue
  DROP CONSTRAINT IF EXISTS review_queue_risk_event_id_fkey;

-- ── Step 2: Atomic rename ─────────────────────────────────────
ALTER TABLE risk_events   RENAME TO risk_events_legacy;
ALTER TABLE risk_events_p RENAME TO risk_events;

-- ── Step 3: RLS on new table ──────────────────────────────────
ALTER TABLE risk_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "risk_events_select" ON risk_events
  FOR SELECT USING (organization_id = current_org_id());

CREATE POLICY "risk_events_insert" ON risk_events
  FOR INSERT WITH CHECK (organization_id = current_org_id());


-- ════════════════════════════════════════════════════════════
-- VALIDATION — Run after Section D
-- ════════════════════════════════════════════════════════════

-- 1. Confirm new table exists and has the right row count
-- SELECT COUNT(*) FROM risk_events;

-- 2. Confirm partition pruning works (check EXPLAIN output)
-- EXPLAIN SELECT COUNT(*) FROM risk_events
-- WHERE created_at >= '2026-06-01' AND created_at < '2026-07-01';
-- Expected: "Seq Scan on risk_events_2026_06" (only one partition scanned)

-- 3. Confirm RLS (run as anon key, not service role)
-- SELECT COUNT(*) FROM risk_events; -- should only return current org rows

-- 4. Confirm review_queue still works (FK gone, column remains)
-- SELECT * FROM review_queue LIMIT 5;

-- 5. Confirm maintenance functions still work
-- SELECT aggregate_daily_stats(CURRENT_DATE - 1);
-- SELECT create_risk_events_partition((CURRENT_DATE + INTERVAL '2 months')::date);

-- 6. After validating everything, drop the legacy table:
-- DROP TABLE risk_events_legacy;
-- (Wait 24-48h before dropping — allows rollback if issues surface)

-- ════════════════════════════════════════════════════════════
-- ROLLBACK PLAN (if issues are found before dropping legacy)
-- ════════════════════════════════════════════════════════════

-- ALTER TABLE risk_events        RENAME TO risk_events_p;
-- ALTER TABLE risk_events_legacy RENAME TO risk_events;
-- ALTER TABLE review_queue ADD CONSTRAINT review_queue_risk_event_id_fkey
--   FOREIGN KEY (risk_event_id) REFERENCES risk_events(id) ON DELETE CASCADE;
-- DROP TABLE IF EXISTS risk_events_p CASCADE;

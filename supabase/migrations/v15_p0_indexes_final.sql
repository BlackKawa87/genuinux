-- ============================================================
-- Migration v15 — P0 Indexes: Final & Canonical (Phase 2B)
-- ============================================================
--
-- CONTEXT
-- -------
-- schema.sql already contains indexes for most risk_events queries.
-- v14 accidentally duplicated several of them.
--
-- This migration:
--   1. Drops the 4 duplicate indexes created by v14.
--   2. Keeps the 2 indexes that v14 added correctly (net-new).
--   3. Adds the CONCURRENTLY-safe equivalents for any future fresh installs.
--
-- CRITICAL FINDING: ip_address is type inet in the DB schema.
-- The RPC (get_risk_context) casts it: ip_address::text = p_ip
-- A plain index on ip_address (inet) is NEVER used by this query.
-- schema.sql's idx_risk_events_org_ip_created is therefore ineffective
-- for the hot path. The expression index on (ip_address::text) is the
-- only correct solution.
--
-- HOW TO RUN IN SUPABASE SQL EDITOR
-- ----------------------------------
-- SECTION 1 (DROP) — paste and run all at once (safe, instant).
-- SECTION 2 (CREATE CONCURRENTLY) — run each statement INDIVIDUALLY.
--   CREATE INDEX CONCURRENTLY cannot run inside a transaction.
--   In the Supabase SQL Editor: paste ONE statement, click Run,
--   wait for completion, then paste the next one.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION 1 — Drop duplicate indexes created by v14
-- Run all at once. Each DROP is instant (no table lock on index drops).
-- ════════════════════════════════════════════════════════════

-- Duplicate of idx_risk_events_org_user_created (already in schema.sql)
DROP INDEX IF EXISTS idx_re_org_user_time;

-- Duplicate of idx_risk_events_org_device_created (already in schema.sql)
DROP INDEX IF EXISTS idx_re_org_device_time;

-- Subset of idx_risk_events_org_device_decision (schema.sql version has created_at too)
DROP INDEX IF EXISTS idx_re_org_device_decision;

-- Duplicate of idx_security_events_type_created (already in schema.sql)
DROP INDEX IF EXISTS idx_security_events_type_time;


-- ════════════════════════════════════════════════════════════
-- SECTION 2 — Create net-new indexes (run each statement INDIVIDUALLY)
-- ════════════════════════════════════════════════════════════

-- ─── INDEX B — IP expression index (THE critical missing index) ───────────────
--
-- WHY THIS INDEX EXISTS:
--   schema.sql has idx_risk_events_org_ip_created ON (organization_id, ip_address)
--   but ip_address is type inet. The RPC does: ip_address::text = p_ip
--   PostgreSQL will NOT use an inet index for a ::text cast comparison.
--   This expression index on (ip_address::text) is the only way to accelerate
--   the two IP subqueries inside get_risk_context().
--
-- QUERIES COVERED:
--   SELECT COUNT(DISTINCT external_user_id) FROM risk_events
--   WHERE organization_id = ? AND ip_address::text = ? AND created_at >= ?
--
--   SELECT COUNT(*) FROM risk_events
--   WHERE organization_id = ? AND ip_address::text = ? AND event_type = 'signup'
--   AND created_at >= ?
--
-- ESTIMATED IMPACT:
--   Without: full table scan on risk_events for every IP check (~500ms+ at 4M rows)
--   With:    index range scan (~5-20ms regardless of table size)
--   Net gain: ~100-400ms off the RPC for any request with ip_address provided
--
-- ⚠️  Run this statement alone. Do not batch with others.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_re_org_ip_text_time
  ON risk_events (organization_id, (ip_address::text), created_at DESC);


-- ─── INDEX E — API key partial index ─────────────────────────────────────────
--
-- WHY THIS INDEX EXISTS:
--   api_keys.key_hash has a UNIQUE constraint (implicit btree index on all rows).
--   This partial index covers only status = 'active', making it smaller and
--   faster specifically for the hot-path query: WHERE key_hash = ? AND status = 'active'.
--   When many keys are revoked, the partial index has fewer rows to scan.
--
-- QUERY COVERED:
--   SELECT id, organization_id, name, requests_count
--   FROM api_keys WHERE key_hash = ? AND status = 'active'   (cache miss path)
--
-- ESTIMATED IMPACT:
--   UNIQUE constraint already makes this O(log n). Partial index reduces index
--   size as revoked keys accumulate — relevant at 100+ orgs with key rotation.
--   Gain: minimal now, meaningful at scale (~5-15ms).
--
-- ⚠️  Run this statement alone. Do not batch with others.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_hash_active
  ON api_keys (key_hash)
  WHERE status = 'active';


-- ════════════════════════════════════════════════════════════
-- VALIDATION — Run after all statements above
-- Expected: exactly 2 rows (the 2 indexes this migration creates/keeps)
-- ════════════════════════════════════════════════════════════

SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_re_org_ip_text_time',
    'idx_api_keys_hash_active'
  )
ORDER BY tablename, indexname;
-- Expected output: 2 rows


-- ════════════════════════════════════════════════════════════
-- FULL P0 INDEX INVENTORY — Run to see complete index state
-- ════════════════════════════════════════════════════════════

SELECT
  tablename,
  indexname,
  LEFT(indexdef, 120) AS definition
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('risk_events', 'api_keys', 'security_events', 'rules')
ORDER BY tablename, indexname;

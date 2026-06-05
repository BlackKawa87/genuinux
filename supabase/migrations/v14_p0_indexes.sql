-- ============================================================
-- Migration v14 — P0 Indexes (Phase 2B Scale Readiness)
-- Run in the Supabase SQL editor.
-- ============================================================
--
-- These indexes cover every query inside /api/risk/check.
-- Without them, get_risk_context() does full table scans on risk_events
-- as the table grows — causing latency to degrade from ~500ms to 2-5s
-- at 25+ organizations.
--
-- All statements use IF NOT EXISTS — safe to run multiple times.
--
-- NOTE: If the risk_events table already has millions of rows, run each
-- CREATE INDEX statement individually (not as a batch) so Supabase can
-- handle them without timeout. For very large tables, use:
--   CREATE INDEX CONCURRENTLY ... (must be run OUTSIDE a transaction)
-- ============================================================

-- ─── A. User velocity ─────────────────────────────────────────────────────────
-- Covers: SELECT COUNT(*) FROM risk_events
--         WHERE organization_id = ? AND external_user_id = ? AND created_at >= ?
--
-- This is the most-hit index — every request with any user_id hits it.
CREATE INDEX IF NOT EXISTS idx_re_org_user_time
  ON risk_events (organization_id, external_user_id, created_at DESC);

-- ─── B. IP queries ────────────────────────────────────────────────────────────
-- ip_address is type inet. The RPC casts it: ip_address::text = p_ip.
-- A plain index on ip_address (inet) is NOT used by this cast — requires
-- an expression index on (ip_address::text).
--
-- Covers two subqueries:
--   • COUNT(DISTINCT external_user_id) WHERE ... AND ip_address::text = ?
--   • COUNT(*) WHERE ... AND ip_address::text = ? AND event_type = 'signup'
CREATE INDEX IF NOT EXISTS idx_re_org_ip_text_time
  ON risk_events (organization_id, (ip_address::text), created_at DESC);

-- ─── C. Device queries ────────────────────────────────────────────────────────
-- Covers: COUNT(DISTINCT external_user_id) WHERE organization_id = ? AND device_id = ?
--   AND created_at >= d90ago
CREATE INDEX IF NOT EXISTS idx_re_org_device_time
  ON risk_events (organization_id, device_id, created_at DESC);

-- ─── D. Device prior block ────────────────────────────────────────────────────
-- Covers: EXISTS (SELECT 1 FROM risk_events
--                  WHERE organization_id = ? AND device_id = ? AND decision = 'block')
-- Separate from C because this query does not filter on created_at —
-- it needs to find ANY historic block, not just within a time window.
CREATE INDEX IF NOT EXISTS idx_re_org_device_decision
  ON risk_events (organization_id, device_id, decision);

-- ─── E. API key lookup (cache miss path) ──────────────────────────────────────
-- Covers: SELECT ... FROM api_keys WHERE key_hash = ? AND status = 'active'
-- Partial index on status = 'active' keeps it small (revoked keys excluded).
CREATE INDEX IF NOT EXISTS idx_api_keys_hash_active
  ON api_keys (key_hash)
  WHERE status = 'active';

-- ─── F. Security events aggregation ──────────────────────────────────────────
-- Covers: SELECT ... FROM security_events
--         WHERE event_type = ? AND created_at >= ?
--         ORDER BY created_at DESC LIMIT 20
-- Called on every 401 / 429 response via createSecurityEvent().
CREATE INDEX IF NOT EXISTS idx_security_events_type_time
  ON security_events (event_type, created_at DESC);

-- ─── Validation ───────────────────────────────────────────────────────────────
-- After running, confirm all 6 indexes exist:
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_re_org_user_time',
    'idx_re_org_ip_text_time',
    'idx_re_org_device_time',
    'idx_re_org_device_decision',
    'idx_api_keys_hash_active',
    'idx_security_events_type_time'
  )
ORDER BY tablename, indexname;
-- Expected: 6 rows returned.

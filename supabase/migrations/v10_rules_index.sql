-- ============================================================
-- Migration v10 — Performance: Rules query index
-- Run in the Supabase SQL editor.
-- ============================================================
--
-- Problem: applyCustomRules() executes:
--   SELECT * FROM rules
--   WHERE organization_id = ? AND status = 'active'
--   ORDER BY priority DESC, created_at ASC
--
-- Without an index on (organization_id, status), this performs a full
-- table scan for every /api/risk/check request.
--
-- Fix: composite index covering the WHERE + ORDER BY clauses.
-- Safe to run multiple times (IF NOT EXISTS).
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_rules_org_status_priority
  ON rules (organization_id, status, priority DESC, created_at ASC);

-- ── Validation ────────────────────────────────────────────────────────────────
-- After running, confirm the index exists:
--
-- SELECT indexname, indexdef
-- FROM   pg_indexes
-- WHERE  tablename = 'rules'
--   AND  indexname = 'idx_rules_org_status_priority';
--
-- Expected output:
--   idx_rules_org_status_priority | CREATE INDEX idx_rules_org_status_priority
--                                   ON public.rules USING btree
--                                   (organization_id, status, priority DESC, created_at)
-- ============================================================

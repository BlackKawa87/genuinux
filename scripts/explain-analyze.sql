-- ============================================================
-- Genuinux — EXPLAIN ANALYZE for all risk context queries
-- ============================================================
-- Run each block in the Supabase SQL editor (Dashboard → SQL Editor).
-- Replace the two placeholder values before running:
--
--   YOUR_ORG_ID  → paste your organization UUID from the dashboard
--   Use Settings → Organization tab, or:
--     SELECT id FROM organizations LIMIT 5;
--
-- Reading output:
--   ✅ GOOD: "Index Scan using idx_risk_events_org_ip_created"
--   ❌ BAD:  "Seq Scan on risk_events"  ← index missing or not chosen
--
-- If you see a Seq Scan, check:
--   1. Did the v6 migration run? (CREATE INDEX IF NOT EXISTS ...)
--   2. Has ANALYZE been run? (ANALYZE risk_events;)
--   3. Is the table empty? (Postgres uses Seq Scan on tiny tables)
-- ============================================================

-- ── Shared placeholder ────────────────────────────────────────────────────────
-- Replace this UUID with your real organization ID before running any query.

DO $$
BEGIN
  RAISE NOTICE 'Replace YOUR_ORG_ID in each query below before running.';
END;
$$;

-- ============================================================
-- Q1 — User velocity (fetchContext query 1)
-- Index expected: idx_risk_events_org_user_created
--   (organization_id, external_user_id, created_at DESC)
-- ============================================================

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*)
FROM   risk_events
WHERE  organization_id  = 'YOUR_ORG_ID'::uuid
  AND  external_user_id = 'test_user_001'
  AND  created_at      >= NOW() - INTERVAL '10 minutes';

-- ============================================================
-- Q2 — IP distinct users last 24h (fetchContext query 2)
-- Index expected: idx_risk_events_org_ip_created
--   (organization_id, ip_address, created_at DESC)
-- ============================================================

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT external_user_id
FROM   risk_events
WHERE  organization_id = 'YOUR_ORG_ID'::uuid
  AND  ip_address      = '1.2.3.4'::inet
  AND  created_at     >= NOW() - INTERVAL '24 hours';

-- ============================================================
-- Q3 — IP signup count last 1h (fetchContext query 3)
-- Index expected: idx_risk_events_org_ip_type_created
--   (organization_id, ip_address, event_type, created_at DESC)
-- ============================================================

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*)
FROM   risk_events
WHERE  organization_id = 'YOUR_ORG_ID'::uuid
  AND  ip_address      = '1.2.3.4'::inet
  AND  event_type      = 'signup'
  AND  created_at     >= NOW() - INTERVAL '1 hour';

-- ============================================================
-- Q4 — Device distinct users (fetchContext query 4)
-- Index expected: idx_risk_events_org_device_created
--   (organization_id, device_id, created_at DESC)
-- ============================================================

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT external_user_id
FROM   risk_events
WHERE  organization_id = 'YOUR_ORG_ID'::uuid
  AND  device_id       = 'dev_abc123def456';

-- ============================================================
-- Q5 — Device prior block (fetchContext query 5)
-- Index expected: idx_risk_events_org_device_decision
--   (organization_id, device_id, decision, created_at DESC)
-- ============================================================

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*)
FROM   risk_events
WHERE  organization_id = 'YOUR_ORG_ID'::uuid
  AND  device_id       = 'dev_abc123def456'
  AND  decision        = 'block'
LIMIT  1;

-- ============================================================
-- Q6 — Email account count (fetchContext query 6)
-- Index expected: idx_users_checked_org_email
--   (organization_id, email)
-- ============================================================

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*)
FROM   users_checked
WHERE  organization_id = 'YOUR_ORG_ID'::uuid
  AND  email           = 'user@example.com';

-- ============================================================
-- Q7 — Active rules lookup (applyCustomRules)
-- Index expected: idx_rules_org_status_priority
--   (organization_id, status, priority DESC, created_at ASC)
-- ============================================================

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, name, condition_type, condition_value, condition_group, action, priority
FROM   rules
WHERE  organization_id = 'YOUR_ORG_ID'::uuid
  AND  status          = 'active'
ORDER  BY priority DESC, created_at ASC;

-- ============================================================
-- Q8 — Webhook retry queue (retry-due endpoint)
-- Index expected: idx_webhook_deliveries_retry
--   (delivery_status, next_retry_at) WHERE delivery_status = 'retrying'
-- ============================================================

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, webhook_id, organization_id, payload_json,
       attempt_count, max_attempts, event_type
FROM   webhook_deliveries
WHERE  delivery_status = 'retrying'
  AND  next_retry_at  <= NOW()
ORDER  BY next_retry_at ASC
LIMIT  50;

-- ============================================================
-- Bonus: Index inventory — confirm all v6 indexes exist
-- ============================================================

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM   pg_indexes
WHERE  schemaname = 'public'
  AND  tablename  IN ('risk_events', 'users_checked', 'webhook_deliveries',
                      'rules', 'ai_summary_cache')
ORDER  BY tablename, indexname;

-- ============================================================
-- Bonus: Table sizes — understand data volume at query time
-- ============================================================

SELECT
  relname                                              AS table_name,
  pg_size_pretty(pg_total_relation_size(oid))         AS total_size,
  pg_size_pretty(pg_relation_size(oid))               AS table_size,
  pg_size_pretty(pg_indexes_size(oid))                AS indexes_size,
  reltuples::bigint                                    AS estimated_rows
FROM   pg_class
WHERE  relkind   = 'r'
  AND  relname  IN ('risk_events', 'users_checked', 'webhook_deliveries',
                    'rules', 'ai_summary_cache', 'organizations')
ORDER  BY pg_total_relation_size(oid) DESC;

-- ============================================================
-- Expected index coverage summary (after v6 migration)
-- ============================================================
--
-- risk_events:
--   idx_risk_events_org_created          (org, created_at)
--   idx_risk_events_user                 (org, external_user_id)
--   idx_risk_events_decision             (org, decision)
--   idx_risk_events_org_ip_created       (org, ip_address, created_at)        ← Q2
--   idx_risk_events_org_ip_type_created  (org, ip_address, event_type, ca)    ← Q3
--   idx_risk_events_org_device_created   (org, device_id, created_at)         ← Q4
--   idx_risk_events_org_device_decision  (org, device_id, decision, ca)       ← Q5
--   idx_risk_events_org_user_created     (org, external_user_id, created_at)  ← Q1
--   idx_risk_events_org_risk_level       (org, risk_level, created_at)
--   idx_risk_events_org_event_type       (org, event_type, created_at)
--
-- users_checked:
--   idx_users_checked_org_email          (org, email)                         ← Q6
--   idx_users_checked_org_device
--   idx_users_checked_org_ip
--   idx_users_checked_org_user
--
-- rules:
--   idx_rules_org_status_priority        (org, status, priority DESC, ca)     ← Q7
--   idx_rules_org_created                (org, created_at)
--
-- webhook_deliveries:
--   idx_webhook_deliveries_webhook       (webhook_id, created_at)
--   idx_webhook_deliveries_org           (org, created_at)
--   idx_webhook_deliveries_retry         partial WHERE status='retrying'      ← Q8
--
-- ai_summary_cache:
--   idx_ai_cache_expires                 (expires_at)

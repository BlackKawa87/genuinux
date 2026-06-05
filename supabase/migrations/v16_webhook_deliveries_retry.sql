-- ============================================================
-- Migration v16 — Webhook retry columns + index
-- Run in the Supabase SQL editor (safe to re-run).
--
-- Context:
--   The base webhook_deliveries table (schema.sql) has only:
--   id, webhook_id, organization_id, event_type, response_status,
--   response_body, duration_ms, success, created_at.
--
--   The /api/webhooks/retry-due cron endpoint queries:
--     SELECT ... payload_json, attempt_count, max_attempts, event_type
--     FROM webhook_deliveries WHERE delivery_status = 'retrying' ...
--
--   Without these columns the SELECT fails → 500 on every cron tick.
--   This migration adds all missing columns + the retry index.
-- ============================================================

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS payload_json     jsonb,
  ADD COLUMN IF NOT EXISTS delivery_status  text NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS attempt_count    integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_attempts     integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_retry_at    timestamptz;

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
  ON webhook_deliveries (delivery_status, next_retry_at)
  WHERE delivery_status = 'retrying';

-- ── Validation ────────────────────────────────────────────────────────────────
-- Run after to confirm all 5 columns exist:
--
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM   information_schema.columns
-- WHERE  table_schema = 'public'
--   AND  table_name   = 'webhook_deliveries'
-- ORDER  BY ordinal_position;
--
-- Expected new columns: payload_json, delivery_status, attempt_count,
--                        max_attempts, next_retry_at
-- ============================================================

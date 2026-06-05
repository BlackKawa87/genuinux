-- ============================================================
-- Migration v16 — Create webhook_deliveries table (full schema)
-- Run in the Supabase SQL editor (safe to re-run).
--
-- Context:
--   webhook_deliveries was never created in production.
--   The /api/webhooks/retry-due cron fails with
--   "relation does not exist" on every invocation.
--
--   This migration creates the full table (base + retry columns)
--   in one shot so it matches what retry-due.ts expects.
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id       UUID        NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type       TEXT        NOT NULL DEFAULT 'risk.check.completed',
  response_status  SMALLINT,
  response_body    TEXT,
  duration_ms      INTEGER,
  success          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- retry columns (required by /api/webhooks/retry-due)
  payload_json     JSONB,
  delivery_status  TEXT        NOT NULL DEFAULT 'delivered',
  attempt_count    INTEGER     NOT NULL DEFAULT 1,
  max_attempts     INTEGER     NOT NULL DEFAULT 3,
  next_retry_at    TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook
  ON webhook_deliveries (webhook_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org
  ON webhook_deliveries (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
  ON webhook_deliveries (delivery_status, next_retry_at)
  WHERE delivery_status = 'retrying';

-- RLS
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_deliveries_select" ON webhook_deliveries
  FOR SELECT USING (organization_id = current_org_id());

-- ── Validation ────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type
-- FROM   information_schema.columns
-- WHERE  table_schema = 'public' AND table_name = 'webhook_deliveries'
-- ORDER  BY ordinal_position;
-- Expected: 14 columns including payload_json, delivery_status,
--           attempt_count, max_attempts, next_retry_at
-- ============================================================

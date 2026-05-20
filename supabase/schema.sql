-- ============================================================
-- Genuinux — Supabase Schema v1
-- ============================================================

-- Custom types
CREATE TYPE risk_level  AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE decision    AS ENUM ('allow', 'review', 'block');
CREATE TYPE event_type  AS ENUM (
  'signup', 'login', 'transaction', 'withdrawal',
  'referral', 'checkout', 'custom'
);
CREATE TYPE plan_tier   AS ENUM ('free', 'starter', 'pro', 'enterprise');
CREATE TYPE member_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE key_status  AS ENUM ('active', 'revoked');
CREATE TYPE rule_status AS ENUM ('active', 'paused');
CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE webhook_status AS ENUM ('active', 'disabled');

-- ============================================================
-- 1. organizations
-- ============================================================
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  website     TEXT,
  industry    TEXT,
  plan        plan_tier   NOT NULL DEFAULT 'free',
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. profiles
-- ============================================================
CREATE TABLE profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT,
  email           TEXT        NOT NULL,
  role            member_role NOT NULL DEFAULT 'member',
  organization_id UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on new user sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $func$
BEGIN
  INSERT INTO profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$func$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 3. api_keys
-- ============================================================
CREATE TABLE api_keys (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  key_hash        TEXT        NOT NULL UNIQUE,   -- bcrypt/sha256 of the full key
  key_prefix      TEXT        NOT NULL,           -- e.g. "gnx_live_K9x2m"
  status          key_status  NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ,
  requests_count  BIGINT      NOT NULL DEFAULT 0
);

-- ============================================================
-- 4. users_checked
--    End-users analyzed by client organizations
-- ============================================================
CREATE TABLE users_checked (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_user_id TEXT        NOT NULL,
  email            TEXT,
  phone            TEXT,
  ip_address       INET,
  country          CHAR(2),
  device_id        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, external_user_id)
);

-- ============================================================
-- 5. risk_events
-- ============================================================
CREATE TABLE risk_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
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
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risk_events_org_created ON risk_events (organization_id, created_at DESC);
CREATE INDEX idx_risk_events_user        ON risk_events (organization_id, external_user_id);
CREATE INDEX idx_risk_events_decision    ON risk_events (organization_id, decision);

-- ============================================================
-- 6. rules
--    Custom fraud rules per organization
-- ============================================================
CREATE TABLE rules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  condition_type   TEXT        NOT NULL,   -- e.g. "country_block", "velocity", "score_threshold"
  condition_value  TEXT        NOT NULL,   -- serialized condition config
  action           decision    NOT NULL,
  status           rule_status NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. review_queue
-- ============================================================
CREATE TABLE review_queue (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  risk_event_id    UUID          NOT NULL REFERENCES risk_events(id) ON DELETE CASCADE,
  status           review_status NOT NULL DEFAULT 'pending',
  assigned_to      UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_queue_org_status ON review_queue (organization_id, status);

-- ============================================================
-- 8. webhooks
-- ============================================================
CREATE TABLE webhooks (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  endpoint_url     TEXT           NOT NULL,
  secret           TEXT           NOT NULL,   -- HMAC signing secret
  status           webhook_status NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. audit_logs
-- ============================================================
CREATE TABLE audit_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action           TEXT        NOT NULL,   -- e.g. "api_key.created", "rule.updated"
  metadata_json    JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org_created ON audit_logs (organization_id, created_at DESC);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys       ENABLE ROW LEVEL SECURITY;
ALTER TABLE users_checked  ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_queue   ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     ENABLE ROW LEVEL SECURITY;

-- ── Helper: returns the organization_id of the current user ──
CREATE OR REPLACE FUNCTION current_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT organization_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ── Helper: returns the role of the current user ──
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS member_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ── organizations ──
-- Read: any member of the org
-- Write: owner only
CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (id = current_org_id());

CREATE POLICY "org_insert" ON organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "org_update" ON organizations
  FOR UPDATE USING (owner_id = auth.uid());

-- ── profiles ──
-- Users can read their own profile and others in the same org
CREATE POLICY "profiles_select_own_org" ON profiles
  FOR SELECT USING (
    user_id = auth.uid()
    OR organization_id = current_org_id()
  );

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (user_id = auth.uid());

-- ── api_keys ──
-- Read: all members of the org
-- Create/delete: owner only
CREATE POLICY "api_keys_select" ON api_keys
  FOR SELECT USING (organization_id = current_org_id());

CREATE POLICY "api_keys_insert_owner" ON api_keys
  FOR INSERT WITH CHECK (
    organization_id = current_org_id()
    AND current_user_role() = 'owner'
  );

CREATE POLICY "api_keys_delete_owner" ON api_keys
  FOR DELETE USING (
    organization_id = current_org_id()
    AND current_user_role() = 'owner'
  );

CREATE POLICY "api_keys_update_owner" ON api_keys
  FOR UPDATE USING (
    organization_id = current_org_id()
    AND current_user_role() = 'owner'
  );

-- ── users_checked ──
CREATE POLICY "users_checked_select" ON users_checked
  FOR SELECT USING (organization_id = current_org_id());

CREATE POLICY "users_checked_insert" ON users_checked
  FOR INSERT WITH CHECK (organization_id = current_org_id());

-- ── risk_events ──
CREATE POLICY "risk_events_select" ON risk_events
  FOR SELECT USING (organization_id = current_org_id());

CREATE POLICY "risk_events_insert" ON risk_events
  FOR INSERT WITH CHECK (organization_id = current_org_id());

-- ── rules ──
-- Read: all members
-- Write: admin or owner
CREATE POLICY "rules_select" ON rules
  FOR SELECT USING (organization_id = current_org_id());

CREATE POLICY "rules_write" ON rules
  FOR ALL USING (
    organization_id = current_org_id()
    AND current_user_role() IN ('owner', 'admin')
  );

-- ── review_queue ──
CREATE POLICY "review_queue_select" ON review_queue
  FOR SELECT USING (organization_id = current_org_id());

CREATE POLICY "review_queue_write" ON review_queue
  FOR ALL USING (
    organization_id = current_org_id()
    AND current_user_role() IN ('owner', 'admin')
  );

-- ── webhooks ──
-- Owner only
CREATE POLICY "webhooks_select" ON webhooks
  FOR SELECT USING (organization_id = current_org_id());

CREATE POLICY "webhooks_write_owner" ON webhooks
  FOR ALL USING (
    organization_id = current_org_id()
    AND current_user_role() = 'owner'
  );

-- ── audit_logs ──
-- Read: admin + owner; no one inserts via RLS (use SECURITY DEFINER functions)
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (
    organization_id = current_org_id()
    AND current_user_role() IN ('owner', 'admin')
  );

-- ============================================================
-- Schema v2 Migration — run separately after v1
-- ============================================================

-- 10. webhook_deliveries
--     One row per outbound webhook attempt (real + test).
--     Enables delivery history UI and future retry logic.
CREATE TABLE webhook_deliveries (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id       UUID           NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  organization_id  UUID           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type       TEXT           NOT NULL DEFAULT 'risk.check.completed',
  response_status  SMALLINT,
  response_body    TEXT,
  duration_ms      INTEGER,
  success          BOOLEAN        NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries (webhook_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_org     ON webhook_deliveries (organization_id, created_at DESC);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_deliveries_select" ON webhook_deliveries
  FOR SELECT USING (organization_id = current_org_id());

-- Service role inserts (from serverless functions bypass RLS automatically)

-- ============================================================
-- Schema v3 Migration — run separately after v2
-- ============================================================

-- Adds settings_json to organizations for persisting risk preferences
-- set from the Settings → Risk Preferences tab.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS settings_json JSONB NOT NULL DEFAULT '{}';

-- ============================================================
-- Schema v4 Migration — run separately after v3
-- ============================================================

-- 1. Auto-create organization on user sign-up.
--    Replaces the v1 trigger that only created a profile.
--    New users immediately have an org (owner role), so the
--    entire dashboard works without manual onboarding.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  new_org_id UUID;
  org_name   TEXT;
BEGIN
  -- Derive a friendly default name from the email local-part
  org_name := split_part(NEW.email, '@', 1) || '''s workspace';

  INSERT INTO organizations (name, owner_id)
  VALUES (org_name, NEW.id)
  RETURNING id INTO new_org_id;

  INSERT INTO profiles (user_id, email, organization_id, role)
  VALUES (NEW.id, NEW.email, new_org_id, 'owner');

  RETURN NEW;
END;
$func$;

-- Backfill: create orgs for existing users who have no organization yet.
-- Run once. Safe to re-run (DO block is idempotent via the WHERE check).
DO $$
DECLARE
  rec RECORD;
  new_org_id UUID;
BEGIN
  FOR rec IN
    SELECT user_id, email FROM profiles WHERE organization_id IS NULL
  LOOP
    INSERT INTO organizations (name, owner_id)
    VALUES (split_part(rec.email, '@', 1) || '''s workspace', rec.user_id)
    RETURNING id INTO new_org_id;

    UPDATE profiles
    SET organization_id = new_org_id, role = 'owner'
    WHERE user_id = rec.user_id;
  END LOOP;
END;
$$;

-- 2. Add 'escalated' value to review_status ENUM.
--    Queue.tsx uses this status but the DB schema was missing it.
--    ALTER TYPE ... ADD VALUE cannot run inside a transaction block,
--    so run this statement on its own in the Supabase SQL editor.
ALTER TYPE review_status ADD VALUE IF NOT EXISTS 'escalated';

-- 3. Allow org members to INSERT into audit_logs.
--    Previously audit_logs had no INSERT policy so all client-side
--    audit writes silently failed. Service-role inserts (API layer)
--    bypass RLS and still work regardless.
CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT WITH CHECK (organization_id = current_org_id());

-- ============================================================
-- Schema v5 Migration — run separately after v4
-- ============================================================

-- 1. Add 'growth' plan tier.
--    The UI shows "Growth" at £499/mo but the DB ENUM only had 'pro'.
--    ALTER TYPE ... ADD VALUE cannot run inside a transaction block —
--    run this statement alone in the Supabase SQL editor.
ALTER TYPE plan_tier ADD VALUE IF NOT EXISTS 'growth';

-- 2. Add stripe_customer_id to organizations.
--    Required by billing/checkout.ts and billing/webhook.ts.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- 3. pending_invites table.
--    Required by api/team/invite.ts and the /join page.
CREATE TABLE IF NOT EXISTS pending_invites (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  role            member_role NOT NULL DEFAULT 'member',
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_invites_org_email
  ON pending_invites (organization_id, email);

ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;

-- Owners and admins can read/manage invites for their org.
CREATE POLICY "pending_invites_select" ON pending_invites
  FOR SELECT USING (organization_id = current_org_id());

CREATE POLICY "pending_invites_write" ON pending_invites
  FOR ALL USING (
    organization_id = current_org_id()
    AND current_user_role() IN ('owner', 'admin')
  );

-- ============================================================
-- Schema v6 Migration — run after v5
-- ============================================================
-- Split into multiple Supabase SQL editor runs as noted below.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block.

-- ────────────────────────────────────────────────────────────
-- P1: Performance indexes
-- Run this block first — it is safe to run inside a transaction.
-- ────────────────────────────────────────────────────────────

-- risk_events: IP-based context queries (fetchContext queries 2 & 3 in check.ts)
CREATE INDEX IF NOT EXISTS idx_risk_events_org_ip_created
  ON risk_events (organization_id, ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_events_org_ip_type_created
  ON risk_events (organization_id, ip_address, event_type, created_at DESC);

-- risk_events: device-based context queries (fetchContext queries 4 & 5)
CREATE INDEX IF NOT EXISTS idx_risk_events_org_device_created
  ON risk_events (organization_id, device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_events_org_device_decision
  ON risk_events (organization_id, device_id, decision, created_at DESC);

-- risk_events: user velocity query (fetchContext query 1) — more specific composite
CREATE INDEX IF NOT EXISTS idx_risk_events_org_user_created
  ON risk_events (organization_id, external_user_id, created_at DESC);

-- risk_events: dashboard filter queries
CREATE INDEX IF NOT EXISTS idx_risk_events_org_risk_level
  ON risk_events (organization_id, risk_level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_events_org_event_type
  ON risk_events (organization_id, event_type, created_at DESC);

-- users_checked: email lookup (fetchContext query 6)
CREATE INDEX IF NOT EXISTS idx_users_checked_org_email
  ON users_checked (organization_id, email);

CREATE INDEX IF NOT EXISTS idx_users_checked_org_device
  ON users_checked (organization_id, device_id);

CREATE INDEX IF NOT EXISTS idx_users_checked_org_ip
  ON users_checked (organization_id, ip_address);

CREATE INDEX IF NOT EXISTS idx_users_checked_org_user
  ON users_checked (organization_id, external_user_id);

-- ai_summary_cache: expiry scan
CREATE INDEX IF NOT EXISTS idx_ai_cache_expires
  ON ai_summary_cache (expires_at);

-- ────────────────────────────────────────────────────────────
-- P2: Missing columns (schema consolidation)
-- Columns referenced by the API that are missing from base schema.
-- Safe to run in a transaction.
-- ────────────────────────────────────────────────────────────

-- risk_events: all columns used by insertRiskEvent() in check.ts
ALTER TABLE risk_events
  ADD COLUMN IF NOT EXISTS suggested_decision   text,
  ADD COLUMN IF NOT EXISTS applied_rule_id      uuid REFERENCES rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS applied_rule_name    text,
  ADD COLUMN IF NOT EXISTS risk_reasons_json    jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence_level     text,
  ADD COLUMN IF NOT EXISTS recommended_action   text,
  ADD COLUMN IF NOT EXISTS shadow_mode          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS engine_version       text NOT NULL DEFAULT 'risk-engine-v1',
  ADD COLUMN IF NOT EXISTS processed_at         timestamptz;

-- webhooks: columns written by dispatchWebhooks() and webhooks/test.ts
ALTER TABLE webhooks
  ADD COLUMN IF NOT EXISTS events_subscribed    text[] NOT NULL DEFAULT array['risk.check.completed'],
  ADD COLUMN IF NOT EXISTS last_delivery_status text,
  ADD COLUMN IF NOT EXISTS last_delivery_at     timestamptz;

-- webhook_deliveries: payload and status columns missing from base schema
ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS payload_json     jsonb,
  ADD COLUMN IF NOT EXISTS delivery_status  text NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS attempt_count    integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_attempts     integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_retry_at    timestamptz;

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
  ON webhook_deliveries (delivery_status, next_retry_at)
  WHERE delivery_status = 'retrying';

-- organizations: AI budget + shadow mode columns
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS shadow_mode      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_enabled       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_monthly_limit integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS ai_calls_used    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_reset_at      timestamptz NOT NULL DEFAULT now();

-- ────────────────────────────────────────────────────────────
-- P3: RBAC — analyst and viewer roles
-- Run each ALTER TYPE separately — cannot be inside a transaction.
-- ────────────────────────────────────────────────────────────

ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'analyst';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'viewer';

-- ────────────────────────────────────────────────────────────
-- P5: AI summary cache table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_summary_cache (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key  TEXT        NOT NULL UNIQUE,
  summary    TEXT        NOT NULL,
  hit_count  INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

-- ai_summary_cache is internal infrastructure — no RLS needed.
-- All access is via SUPABASE_SERVICE_ROLE_KEY from serverless functions.

-- ────────────────────────────────────────────────────────────
-- P5: Reset AI counters monthly (pg_cron — enable if available)
-- ────────────────────────────────────────────────────────────
-- Uncomment if Supabase pg_cron extension is enabled in your project:
-- SELECT cron.schedule(
--   'reset-ai-counters',
--   '0 0 1 * *',
--   $$UPDATE organizations SET ai_calls_used = 0, ai_reset_at = NOW()$$
-- );

-- ============================================================
-- Schema v7 Migration — run after v6
-- ============================================================
-- Fixes production blockers: rules schema gaps, RBAC analyst gap.
-- Sections marked [RUN ALONE] contain ALTER TYPE / DO blocks that
-- cannot be run inside a transaction — execute each in its own
-- Supabase SQL editor run.
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- P0a: Add missing columns to rules table
-- Safe to run inside a transaction.
-- ────────────────────────────────────────────────────────────

-- condition_group: group-based rule conditions (new format, optional)
--   Nullable — NULL means legacy single-condition format still applies.
--   applyCustomRules() checks condition_group first, falls back to
--   condition_type/condition_value if condition_group is NULL.
ALTER TABLE rules
  ADD COLUMN IF NOT EXISTS condition_group jsonb,
  ADD COLUMN IF NOT EXISTS priority        integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description     text,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();

-- Performance indexes for applyCustomRules() queries in check.ts
-- (selects active rules ordered by priority DESC then created_at ASC)
CREATE INDEX IF NOT EXISTS idx_rules_org_status_priority
  ON rules (organization_id, status, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_rules_org_created
  ON rules (organization_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- P0b: Migrate rules.action from decision ENUM → text
-- [RUN ALONE] — DO block cannot run inside a transaction.
--
-- Motivation: the decision ENUM only allows 'allow'|'review'|'block'.
-- The code (applyCustomRules) already supports 'require_verification'
-- as a valid rule action, mapping it to 'review' in the final decision.
-- Storing it requires a text column.
--
-- Strategy (idempotent — safe to re-run):
--   1. Only executes if rules.action is still a USER-DEFINED (enum) type.
--   2. Adds a staging text column.
--   3. Copies enum values as text strings.
--   4. Enforces NOT NULL + CHECK constraint.
--   5. Drops the old enum column.
--   6. Renames staging column to action.
--   7. Sets default to 'review' for new rules.
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'rules'
      AND  column_name  = 'action'
      AND  data_type    = 'USER-DEFINED'
  ) THEN
    -- Step 1: staging column
    ALTER TABLE rules ADD COLUMN action_new text;

    -- Step 2: copy existing enum values
    UPDATE rules SET action_new = action::text;

    -- Step 3: enforce NOT NULL
    ALTER TABLE rules ALTER COLUMN action_new SET NOT NULL;

    -- Step 4: add CHECK constraint
    ALTER TABLE rules
      ADD CONSTRAINT rules_action_check
      CHECK (action_new IN ('allow', 'review', 'block', 'require_verification'));

    -- Step 5: drop old ENUM column
    ALTER TABLE rules DROP COLUMN action;

    -- Step 6: rename staging column
    ALTER TABLE rules RENAME COLUMN action_new TO action;

    -- Step 7: set default for new rules
    ALTER TABLE rules ALTER COLUMN action SET DEFAULT 'review';
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- P1: Fix analyst RBAC on review_queue
-- [RUN ALONE] — DROP + CREATE policy pair should run outside a
-- transaction block to avoid lock contention.
--
-- Problem: review_queue_write only allowed 'owner' | 'admin'.
-- Analyst role has act_queue permission in permissions.ts but the
-- DB rejected UPDATE silently.
--
-- Fix: extend UPDATE policy to include 'analyst'.
-- SELECT remains open to all org members via review_queue_select.
-- INSERT is handled by the API (service role bypasses RLS).
-- Analyst still cannot manage billing, API keys, webhooks, or org settings.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "review_queue_write" ON review_queue;

CREATE POLICY "review_queue_write" ON review_queue
  FOR UPDATE
  USING (
    organization_id = current_org_id()
    AND current_user_role() IN ('owner', 'admin', 'analyst')
  )
  WITH CHECK (
    organization_id = current_org_id()
    AND current_user_role() IN ('owner', 'admin', 'analyst')
  );

-- ────────────────────────────────────────────────────────────
-- P2: AI summary cache purge
-- Handled by api/cron/maintenance.ts (POST /api/cron/maintenance)
-- which runs daily at 03:00 UTC via Vercel Cron.
-- No schema change required — ai_summary_cache and its expires_at
-- index were added in v6. The cron deletes rows where
-- expires_at < NOW() and logs the count via captureMessage.
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- Schema v8 — Operational hardening (beta launch)
-- ============================================================
-- Run each block separately in the Supabase SQL editor.
-- All statements are idempotent (IF NOT EXISTS / IF NOT EXISTS).

-- ── 1. shadow_mode audit timestamps on organizations ─────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS shadow_mode_enabled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS shadow_mode_disabled_at timestamptz;

-- ── 2. security_events — auth anomalies, suspicious API usage ─
CREATE TABLE IF NOT EXISTS security_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,  -- e.g. 'api_key.invalid', 'rate_limit.exceeded', 'auth.failed'
  severity        TEXT        NOT NULL DEFAULT 'info',  -- info | warning | critical
  actor_ip        INET,
  actor_user_id   UUID,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_org_created
  ON security_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_type_created
  ON security_events (event_type, created_at DESC);

-- RLS
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "security_events_read" ON security_events;
CREATE POLICY "security_events_read" ON security_events
  FOR SELECT USING (
    organization_id = current_org_id()
    AND current_user_role() IN ('owner', 'admin')
  );

-- ── 3. maintenance_logs — cron run history ────────────────────
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tasks    JSONB       NOT NULL DEFAULT '{}'
);

-- Retain only the last 90 days of logs (cron itself purges nothing older)
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_ran_at
  ON maintenance_logs (ran_at DESC);

-- No RLS needed — service role only, never exposed via anon key.

-- ── 4. feature_flags — per-org toggles (schema only, no UI yet) ─
CREATE TABLE IF NOT EXISTS feature_flags (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES organizations(id) ON DELETE CASCADE,
  flag_key        TEXT        NOT NULL,
  enabled         BOOLEAN     NOT NULL DEFAULT false,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, flag_key)
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags_read" ON feature_flags;
CREATE POLICY "feature_flags_read" ON feature_flags
  FOR SELECT USING (organization_id = current_org_id());

DROP POLICY IF EXISTS "feature_flags_write" ON feature_flags;
CREATE POLICY "feature_flags_write" ON feature_flags
  FOR ALL USING (
    organization_id = current_org_id()
    AND current_user_role() IN ('owner', 'admin')
  )
  WITH CHECK (
    organization_id = current_org_id()
    AND current_user_role() IN ('owner', 'admin')
  );

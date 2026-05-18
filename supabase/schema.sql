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

-- ============================================================
-- Migration v13 — get_risk_context RPC function
-- Run in the Supabase SQL editor.
-- ============================================================
--
-- Performance fix: replaces 6 parallel PostgREST HTTP calls in
-- /api/risk/check with a single supabase.rpc() call. All 6 context
-- queries run inside one PostgreSQL session — same DB work, 5 fewer
-- HTTP round-trips. Reduces fetchContext from ~400ms to ~80ms.
--
-- Requires: the risk_events and users_checked tables to exist.
-- ============================================================

CREATE OR REPLACE FUNCTION get_risk_context(
  p_org_id   uuid,
  p_user_id  text,
  p_ip       text       DEFAULT NULL,
  p_device   text       DEFAULT NULL,
  p_email    text       DEFAULT NULL,
  p_m10ago   timestamptz DEFAULT now() - interval '10 minutes',
  p_h1ago    timestamptz DEFAULT now() - interval '1 hour',
  p_h24ago   timestamptz DEFAULT now() - interval '24 hours',
  p_d90ago   timestamptz DEFAULT now() - interval '90 days'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'user_events_last_10min', (
      SELECT COUNT(*)
      FROM   risk_events
      WHERE  organization_id = p_org_id
        AND  external_user_id = p_user_id
        AND  created_at >= p_m10ago
    ),

    'ip_distinct_users_last_24h', CASE WHEN p_ip IS NULL THEN 0 ELSE (
      SELECT COUNT(DISTINCT external_user_id)
      FROM   risk_events
      WHERE  organization_id = p_org_id
        AND  ip_address = p_ip
        AND  created_at >= p_h24ago
    ) END,

    'ip_signup_count_last_1h', CASE WHEN p_ip IS NULL THEN 0 ELSE (
      SELECT COUNT(*)
      FROM   risk_events
      WHERE  organization_id = p_org_id
        AND  ip_address = p_ip
        AND  event_type = 'signup'
        AND  created_at >= p_h1ago
    ) END,

    'device_distinct_users', CASE WHEN p_device IS NULL THEN 0 ELSE (
      SELECT COUNT(DISTINCT external_user_id)
      FROM   risk_events
      WHERE  organization_id = p_org_id
        AND  device_id = p_device
        AND  created_at >= p_d90ago
    ) END,

    'device_has_prior_block', CASE WHEN p_device IS NULL THEN false ELSE (
      EXISTS (
        SELECT 1
        FROM   risk_events
        WHERE  organization_id = p_org_id
          AND  device_id = p_device
          AND  decision = 'block'
        LIMIT  1
      )
    ) END,

    'email_account_count', CASE WHEN p_email IS NULL THEN 0 ELSE (
      SELECT COUNT(*)
      FROM   users_checked
      WHERE  organization_id = p_org_id
        AND  email = p_email
    ) END
  )
$$;

-- Grant execute to authenticated and service roles
GRANT EXECUTE ON FUNCTION get_risk_context TO authenticated, service_role;

-- Verify
SELECT routine_name, routine_type
FROM   information_schema.routines
WHERE  routine_schema = 'public'
  AND  routine_name   = 'get_risk_context';

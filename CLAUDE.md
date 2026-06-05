# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # Install dependencies (first time)
npm run dev       # Start Vite dev server with HMR
npm run build     # TypeScript check + Vite production build
npm run lint      # Run ESLint
npm run preview   # Preview production build locally
```

No test framework is configured.

## Stack

- **React 18** + **TypeScript** + **Vite 6**
- **React Router DOM v7** for client-side routing
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin — no `tailwind.config.js`, all config lives in `vite.config.ts`
- **Supabase** for auth + PostgreSQL database (`@supabase/supabase-js`)
- **lucide-react** for all icons
- **Resend** (`resend`) for transactional email — beta invite delivery
- **Upstash Redis** (`@upstash/redis` + `@upstash/ratelimit`) — sliding window rate limiting + hot-path caching (API key, org plan, rules, monthly usage) + fraud velocity counters + per-org daily stats
- **Vercel** deployment — `vercel.json` rewrites non-API paths to `/index.html`

## Environment Variables

Copy `.env.example` → `.env.local`:
```
VITE_SUPABASE_URL=...           # exposed to browser (Vite prefix required)
VITE_SUPABASE_ANON_KEY=...      # exposed to browser
SUPABASE_SERVICE_ROLE_KEY=...   # server-side only — never expose to frontend
# SUPABASE_URL=...              # optional; API functions prefer this over VITE_SUPABASE_URL
# OPENAI_API_KEY=...            # optional; enables GPT-4o-mini AI summaries
# RESEND_API_KEY=re_...         # optional; enables beta invite email delivery
# RESEND_FROM_EMAIL=...         # sender shown in invite emails (must be verified in Resend)
# BETA_REPLY_TO_EMAIL=...       # reply-to for invite emails
# APP_URL=https://genuinux.com  # base URL used in invite email signup links
# UPSTASH_REDIS_REST_URL=...    # required for rate limiting + caching (Upstash console)
# UPSTASH_REDIS_REST_TOKEN=...  # required for rate limiting + caching (Upstash console)
# REDIS_COUNTERS_ENABLED=true   # enable Redis-first fraud context reads (set AFTER 24-48h dual-write warm-up)
```

`SUPABASE_SERVICE_ROLE_KEY` is required by Vercel serverless functions. It bypasses RLS — never expose it to the frontend.

`RESEND_API_KEY` is optional — invite creation still works without it, email is simply skipped (graceful degradation). Never expose it to the frontend.

`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` enable rate limiting (`api/_lib/rateLimit.ts`), all hot-path caching (`api/_lib/keyCache.ts`, `api/_lib/monthlyUsage.ts`), fraud velocity counters (`api/_lib/fraudCounters.ts`), and per-org daily stats (`api/_lib/orgStats.ts`). Without them all caches are bypassed and requests always pass through to Supabase.

`REDIS_COUNTERS_ENABLED=true` activates Redis-first fraud context reads in `/api/risk/check`. Deploy without it first — writes are always active; set this only after 24-48h of dual-write warm-up so counters are fully populated before being read.

API functions (`api/risk/check.ts`, `api/webhooks/test.ts`) resolve the Supabase URL via: `process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL`.

## Architecture

### Entry & Routing
`index.html` → `src/main.tsx` → `AuthProvider` → `App.tsx`

Routes:
- `/`                      → `Landing.tsx` (public)
- `/login`                 → `Login.tsx` (public)
- `/register`              → `Register.tsx` (public)
- `/dashboard`             → `ProtectedRoute` → `AppLayout` (sidebar) + nested:
  - `/dashboard`           → `Overview.tsx`
  - `/dashboard/events`    → `Events.tsx`
  - `/dashboard/users`     → `Users.tsx`
  - `/dashboard/queue`     → `Queue.tsx`
  - `/dashboard/rules`     → `Rules.tsx`
  - `/dashboard/api-keys`  → `ApiKeys.tsx`
  - `/dashboard/webhooks`  → `Webhooks.tsx`

### Auth (`src/contexts/AuthContext.tsx`)
`AuthProvider` wraps the full app in `main.tsx`. Exposes `useAuth()` with: `user`, `session`, `loading`, `signIn`, `signUp`, `signOut`. Backed by Supabase Auth.

`ProtectedRoute` guards `/dashboard/*` — redirects to `/login` if unauthenticated.

### Supabase (`src/lib/supabase.ts`)
Single exported `supabase` client. Credentials from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

### Database (`supabase/schema.sql`)
4 migration blocks — run each separately in the Supabase SQL editor:

| Table | Purpose |
|---|---|
| `organizations` | Tenant/company accounts |
| `profiles` | User profiles linked to auth.users |
| `api_keys` | Hashed API keys per organization |
| `users_checked` | End-users analyzed by clients |
| `risk_events` | Every risk analysis result |
| `rules` | Custom fraud rules per org |
| `review_queue` | Events needing manual review |
| `webhooks` | Outbound webhook endpoints |
| `audit_logs` | Action history for compliance |
| `webhook_deliveries` | One row per webhook attempt — v2 migration |

**v4 migration** (required): Updates `handle_new_user` trigger to auto-create an organization for every new registrant (fixes "No organization" error for new users). Also adds `'escalated'` to `review_status` ENUM, adds `audit_logs INSERT` policy, and backfills existing profileless users.

**v6 migration** (required): `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS shadow_mode boolean NOT NULL DEFAULT true;` — adds the shadow_mode flag shown in the sidebar and header. Also requires the `handle_new_user` trigger to have `SET search_path = public` in the function definition (SECURITY DEFINER functions don't inherit search path — omitting this causes `relation "organizations" does not exist` errors at registration time).

**v10 migration** (`supabase/migrations/v10_rules_index.sql`): Composite index on `rules(organization_id, status, priority DESC, created_at ASC)` — covers the WHERE + ORDER BY in `applyCustomRules()`. Without it, every `/api/risk/check` request does a full table scan on `rules`.

**v12 migration** (`supabase/migrations/v12_add_ai_columns.sql`): Adds AI budget columns to `organizations`:
```sql
ai_enabled boolean NOT NULL DEFAULT false,
ai_monthly_limit integer NOT NULL DEFAULT 1000,
ai_calls_used integer NOT NULL DEFAULT 0,
ai_reset_at timestamptz NOT NULL DEFAULT now()
```
**Critical**: without these columns, the `organizations` SELECT in `check.ts` fails silently (`orgRow = null`), causing `currentPlan = 'free'` and rate limit = 30 instead of the org's actual plan limit.

**v13 migration** (`supabase/migrations/v13_risk_context_rpc.sql`): Creates `get_risk_context()` PostgreSQL function (`STABLE SECURITY DEFINER SET search_path = public`). Replaces 6 parallel PostgREST HTTP round-trips in `fetchContext()` with a single `supabase.rpc()` call. All 6 subqueries run inside one PostgreSQL session. **Important**: `ip_address` column is `inet` type — comparisons must cast: `ip_address::text = p_ip` (not `ip_address = p_ip`).

**v14 migration** (`supabase/migrations/v14_p0_indexes.sql`): Initial P0 index pass — superseded by v15. Contains some duplicates of schema.sql indexes (harmless due to IF NOT EXISTS) plus the critical `idx_re_org_ip_text_time` expression index.

**v15 migration** (`supabase/migrations/v15_p0_indexes_final.sql`): Canonical P0 cleanup.
- **DROP** 4 duplicate indexes created by v14 that already existed in schema.sql (write overhead reduction).
- **CREATE CONCURRENTLY** `idx_re_org_ip_text_time` — expression index on `(ip_address::text, created_at DESC)`. This is the only truly missing P0 index. schema.sql had IP indexes on `ip_address` (inet type) which are **never used** by the RPC because `ip_address::text = p_ip` requires an expression index on the cast. Without this, all IP subqueries in `get_risk_context()` do full table scans as `risk_events` grows.
- **CREATE CONCURRENTLY** `idx_api_keys_hash_active` — partial index on active keys only; slightly more efficient than the UNIQUE constraint index as revoked keys accumulate.

**v17 migration** (`supabase/migrations/v17_org_daily_stats.sql`): Daily aggregate stats + archival.
- Table `org_daily_stats` — PK `(organization_id, date)`, columns: `total_requests`, `approve_count`, `review_count`, `block_count`, `avg_latency_ms`.
- `aggregate_daily_stats(target_date DATE) RETURNS void` — `INSERT ... SELECT GROUP BY` from `risk_events` with `ON CONFLICT DO UPDATE`. Called nightly by `/api/cron/maintenance` Task 3.
- `purge_old_risk_events(retention_days INTEGER DEFAULT 365) RETURNS integer` — deletes rows older than N days using `make_interval(days => retention_days)`. Called by maintenance Task 4.

**v18 migration** (`supabase/migrations/v18_partition_risk_events.sql`): Monthly RANGE partitioning on `risk_events`.
- `risk_events` converted to `PARTITION BY RANGE (created_at)` — 18 monthly partitions pre-created (2026-01 → 2027-06).
- PK changed to `(id, created_at)` — PostgreSQL 15 RANGE partition requirement. FK from `review_queue → risk_events(id)` dropped (column kept; application guarantees integrity).
- 9 indexes recreated on the partitioned table, including critical expression index `idx_rep_org_ip_text_time` on `(organization_id, (ip_address::text), created_at DESC)`.
- `create_risk_events_partition(target_month DATE) RETURNS TEXT` — idempotent helper called by maintenance Task 5 to pre-create partitions ~2 months ahead.
- Migration run in 4 sections (A: table+partitions, B: data copy, C: indexes, D: rename+RLS). `risk_events_legacy` preserved for 24-48h rollback window. **Drop `risk_events_legacy` after validating production.**

**Index inventory** (active on `risk_events` partitioned table after v18):
- `idx_rep_org_created` (org+date), `idx_rep_user` (org+user), `idx_rep_decision` (org+decision)
- `idx_rep_org_user_created` (org+user+date), `idx_rep_org_device_created` (org+device+date), `idx_rep_org_device_decision` (org+device+decision+date)
- `idx_rep_org_risk_level` (org+risk_level+date), `idx_rep_org_event_type` (org+event_type+date)
- `idx_rep_org_ip_text_time` — expression index on `(org, ip_address::text, date)` — critical for `get_risk_context()` IP subqueries
- `security_events`: `idx_security_events_type_created`, `idx_security_events_agg`
- `users_checked`: `idx_users_checked_org_email`, `idx_users_checked_org_device`, `idx_users_checked_org_ip`, `idx_users_checked_org_user`
- `api_keys`: UNIQUE on `key_hash` + `idx_api_keys_hash_active` (partial, active keys only — v15)
- `rules`: `idx_rules_org_status_priority` (v10)
- `org_daily_stats`: `idx_org_daily_stats_org_date` (v17)

RLS helpers: `current_org_id()` and `current_user_role()` (SECURITY DEFINER functions).

Role matrix: owner > admin > member. Only owners can manage API keys and webhooks.

Audit logs: Written by the frontend for key actions — `api_key.created`, `api_key.revoked`, `rule.created`, `rule.updated`, `rule.deleted`, `webhook.created`, `webhook.updated`, `webhook.deleted`, `org.updated`, `review.*`. Backend writes `beta_invite.created`, `beta_invite.email_sent`, `beta_invite.email_failed`, `beta_invite.resent`, `beta_invite.used`. Requires the v4 `audit_logs_insert` RLS policy to be in place.

### Types (`src/types/index.ts`)
Mirrors DB schema. Key types: `RiskEvent`, `ApiKey`, `Organization`, `Profile`, `Rule`, `ReviewQueueItem`, `Webhook`, `WebhookDelivery`, `AuditLog`, `DashboardMetrics`.
Shared enums: `RiskLevel`, `Decision`, `EventType`.

### Risk Engine (`src/lib/riskEngine.ts`)
Pure TypeScript function — no side effects, no DB calls. Takes `RiskEngineInput` + optional `RiskEngineContext` (pre-fetched historical counts), returns `RiskEngineOutput`.

Signal categories analyzed: **email** (disposable domain, format), **IP** (velocity, distinct users, signup surge), **device** (multi-user device, prior block), **velocity** (rapid repeated events), **behavioral** (headless UA, private browser hints).

Scoring: starts at `trust_score=100, fraud_score=0`. Each detected signal applies `fraud_impact` (+) and `trust_impact` (−). Multipliers apply for extreme cases (e.g. 20+ users on same IP).

Decision thresholds:
- `fraud_score ≥ 70` → `block`
- `fraud_score ≥ 40 && risk_level=medium` → `review`
- Otherwise → `allow`

The public API maps `allow` → `approve` in responses.

### Custom Rules (`src/lib/riskEngine.ts` + `api/risk/check.ts`)
Rules run **after** the base Risk Engine score. First matching active rule overrides the final decision.

Evaluated in `applyCustomRules()` inside `api/risk/check.ts` (step 4.5 in the handler). Rules are cached in Redis (60s TTL via `api/_lib/keyCache.ts`) — fetched from `rules` table only on cache miss, ordered by `priority DESC, created_at ASC`.

`condition_value` stored as `"operator:value"` string (e.g. `"gt:80"`, `"eq:BR"`).

Supported condition types: `fraud_score`, `trust_score`, `risk_level`, `event_type`, `country`, `ip_user_count_1h`, `ip_signup_count_1h`, `device_user_count`.

**Cache invalidation**: when rules are created/updated/deleted/toggled in the UI, `invalidateCachedRules(orgId)` from `api/_lib/keyCache.ts` must be called so the new rule takes effect immediately (not after the 60s TTL expires).

### API Endpoints (`api/`)

**`POST /api/risk/check`** — Production endpoint for client integrations.
- Auth: `Authorization: Bearer <api_key>` — key is SHA-256 hashed and matched against `api_keys.key_hash`
- **Hot path (optimized)**: module-level Supabase client singleton → Redis cache for API key (5min TTL) → Redis cache for org plan (60s TTL) → RPC `get_risk_context` (single DB round-trip for all 6 context queries) → Redis cache for rules (60s TTL)
- Runs `analyze()` from risk engine, then evaluates custom rules (`applyCustomRules`)
- **Early response**: `res.status(200).json(response)` is sent before DB writes — `upsertUserChecked` + `insertRiskEvent` run after the client receives the response
- `crypto.randomUUID()` is pre-generated before the early response so the event_id in the response matches the DB row
- Fire-and-forget after response: `review_queue` insert (if decision=review) + webhook dispatch + `incrementMonthlyUsage`
- Webhook dispatch: HMAC-SHA256 signature (`X-Genuinux-Signature: sha256=<sig>`), logs to `webhook_deliveries` (table optional)
- Response maps `allow` → `approve`

Webhook payload format:
```json
{
  "event": "risk.check.completed",
  "event_id": "...",
  "external_user_id": "...",
  "trust_score": 82,
  "fraud_score": 18,
  "risk_level": "low",
  "decision": "approve",
  "signals": [...],
  "summary": "...",
  "created_at": "..."
}
```

Valid `event_type` values: `signup`, `login`, `transaction`, `withdrawal`, `referral`, `checkout`, `custom`.

**`POST /api/webhooks/test`** — Dashboard test delivery.
- Auth: `Authorization: Bearer <supabase_access_token>` (user JWT, verified via `supabase.auth.getUser()`)
- Body: `{ webhook_id: string }`
- Sends signed test payload to the webhook URL, logs to `webhook_deliveries`, returns `{ success, status, duration_ms }`

**`POST /api/analyze`** — **DEPRECATED** — Returns HTTP 410 Gone with a migration message. Use `/api/risk/check` instead.

**`GET /api/admin/invites`** / **`POST /api/admin/invites`** / **`DELETE /api/admin/invites?id=`** — Beta invite CRUD. Owner-only. POST auto-generates a `BETA-XXXX-XXXX` code, optionally sends an email via Resend if `email` is provided, writes audit logs. Returns `{ invite, email_sent, warning? }`.

**`POST /api/admin/invite-resend`** — Resend the invite email for an existing active invite. Owner-only. Body: `{ invite_id }`. Rejects if invite is revoked, already used, or has no email. Writes `beta_invite.resent` audit log.

**`GET /api/beta/validate-invite?code=&email=`** — Pre-flight invite check (no auth). Validates: exists, not revoked, not used, not expired, email match if locked. Fires `beta_invite.email_mismatch` security event on mismatch.

**`POST /api/beta/use-invite`** — Authoritative invite gate called after signup. Requires user JWT + `{ code, email }`. Same validation as validate-invite plus marks `used_by`/`used_at`, writes audit log.

**`GET /api/admin/metrics/per-org?days=N`** — Owner-only. Returns daily stats for the org over last N days (default 30, max 90). Sources: `org_daily_stats` Postgres table (historical, cron-aggregated) + `getTodayStats()` Redis (today real-time). Requires v17 migration; returns `{ stats[], today, summary, notice? }`. Degrades gracefully if v17 not applied.

**`GET /api/admin/metrics/cache-stats`** — Owner-only. Returns Redis cache health: connection status, TTL remaining for `org` and `rules` caches, monthly event counter, today's real-time stats, and `fraud_counters_enabled` flag. Returns `status: 'unconfigured'` if Redis env vars are missing.

**`GET /api/admin/intelligence/summary?days=N`** — Any authenticated org member. Returns all Phase 3 intelligence metrics for the authenticated org. Accepts `days` (7–90, default 30). Runs 3 parallel Supabase queries + optional cross-partition ID lookup for labeled events. Gracefully returns zeroed response with `notice` if `fraud_labels` table doesn't exist (v19 not applied). Response shape:
- `feedback_loop` — decision quality metrics: `correct_approve`, `incorrect_approve`, `correct_block`, `incorrect_block`, `correct_review`, `incorrect_review`, `decision_accuracy`, `false_positive_rate`, `false_negative_rate`, `precision`, `recall`, `review_quality`, `label_coverage_rate`, `insight` (auto-generated string)
- `gnx_distribution` — counts bucketed by GNX score band: `low` (0–300), `review_zone` (301–700), `high` (701–1000)
- `fraud_trends` — daily buckets: `{ date, confirmed_fraud, suspected_fraud, false_positive, legitimate }`
- `label_counts` — period totals by label type
- `top_patterns` — top 5 per category among confirmed-fraud events: `countries`, `event_types`, `risk_levels`, `original_decisions`
- `training_readiness` — all-time label counts, `progress_pct` (to 10k), `status` (`not_ready`/`collecting`/`near_ready`/`ready`), `data_quality_warnings[]`
- Auth: user JWT (anon key + RLS scopes data to org automatically)

**`GET|POST /api/cron/maintenance`** — Scheduled at 03:00 UTC via Vercel Cron. Auth: `x-vercel-cron: 1` header (auto) or `Authorization: Bearer <CRON_SECRET>`. 6 tasks in order:
1. Purge expired `ai_summary_cache` rows
2. Purge `webhook_deliveries` older than 90 days
3. `aggregate_daily_stats(yesterday)` — writes to `org_daily_stats` (v17)
4. `purge_old_risk_events(365)` — deletes events older than 1 year (v17)
5. `create_risk_events_partition(+2 months)` — pre-creates next partition (v18)
6. Write run summary to `maintenance_logs`
Tasks 3-5 skip gracefully (`code === '42883'`) if migrations not yet applied.

### Performance Architecture (`api/risk/check.ts`)

The `/api/risk/check` hot path is optimized to minimize Supabase round-trips:

| Step | Technique | Latency saved |
|---|---|---|
| Supabase client init | Module-level singleton (lazy, reused across warm invocations) | 100–300ms |
| API key lookup | Redis cache — `gnx:key:{hash}` — 5min TTL | 1 round-trip |
| Org plan lookup | Redis cache — `gnx:org:{orgId}` — 60s TTL | 1 round-trip |
| 6 context queries | Redis fraud counters (when `REDIS_COUNTERS_ENABLED=true`) — else `supabase.rpc('get_risk_context')` | 5 round-trips |
| Rules fetch | Redis cache — `gnx:rules:{orgId}` — 60s TTL | 1 round-trip |
| DB writes | Fire-and-forget after early `res.status(200).json()` | Off critical path |
| Org stats + fraud counters write | Fire-and-forget after response — `incrementOrgStats` + `writeFraudCounters` | Off critical path |

Observed latency — Phase 2A baseline (Supabase RPC path):
- p50: ~565ms | p95: ~620ms | p99: ~890ms | error rate: 0%

Phase 2A gates: p95 < 800ms ✅ | p99 < 1500ms ✅ | max < 2000ms ✅ | error rate < 1% ✅

Phase 2B Redis counters (implemented, env-gated): `writeFraudCounters()` writes on every request. Set `REDIS_COUNTERS_ENABLED=true` after 24-48h warm-up to activate Redis-first reads — targets p50 ~80ms (vs ~565ms with RPC).

**Redis key namespaces** (all fail-open):

| Key pattern | Purpose | TTL |
|---|---|---|
| `gnx:key:{hash}` | API key cache | 5 min |
| `gnx:org:{orgId}` | Org plan/config cache | 60s |
| `gnx:rules:{orgId}` | Rules cache | 60s |
| `gnx:monthly_events:{orgId}:{YYYY-MM}` | Monthly usage counter | end-of-month +5d |
| `gnx:stats:{orgId}:{YYYY-MM-DD}` | Daily stats hash (total/approve/review/block/latency_sum) | 33d |
| `gnx:cnt:u:{orgId}:{userId}:{b10m}` | User velocity — 10min bucket | 20min |
| `gnx:cnt:ip:u:{orgId}:{ip}` | IP distinct users — 25h set | 25h |
| `gnx:cnt:ip:s:{orgId}:{ip}:{b1h}` | IP signup count — 1h bucket | 2h |
| `gnx:cnt:dev:u:{orgId}:{deviceId}` | Device distinct users — 91d set | 91d |
| `gnx:flag:dev:b:{orgId}:{deviceId}` | Device block flag | 180d |
| `gnx:cnt:email:u:{orgId}:{email}` | Email distinct users — 180d set | 180d |

### `api/_lib/` Modules

- `email.ts` — `sendInviteEmail({ to, inviteCode, expiresAt, note? })` — wraps Resend SDK. Returns `{ sent, error? }`, never throws. Gracefully skips if `RESEND_API_KEY` is not set.
- `emailTemplates.ts` — `betaInviteHtml()` + `betaInviteText()` — inline-styled HTML email + plain text fallback. Params: `{ to, inviteCode, expiresAt, signupUrl, note? }`.
- `keyCache.ts` — Redis cache for the `/api/risk/check` hot path. Three namespaces:
  - API key: `gnx:key:{hash}` → `{ id, organization_id, name, requests_count }` — TTL 5min
  - Org: `gnx:org:{orgId}` → `{ plan, shadow_mode, ai_enabled, … }` — TTL 60s
  - Rules: `gnx:rules:{orgId}` → `RuleRow[]` — TTL 60s; call `invalidateCachedRules(orgId)` on any rule mutation
  - All functions fail-open: cache misses and Redis errors fall back to Supabase transparently.
- `monthlyUsage.ts` — Redis-backed monthly event counter. Key: `gnx:monthly_events:{orgId}:{YYYY-MM}`. TTL expires 5 days after end of month. `getMonthlyUsage()` reads Redis (O(1)) or syncs from Supabase COUNT(*) on miss. `incrementMonthlyUsage()` is fire-and-forget via Redis `INCR`. Never throws.
- `orgStats.ts` — Redis Hash daily stats counter. Key: `gnx:stats:{orgId}:{YYYY-MM-DD}`, TTL 33 days. `incrementOrgStats(orgId, decision, latencyMs)` — pipeline of 4 commands (total, decision bucket, latency_sum, expire). `getTodayStats(orgId)` — reads hash + computes avg_latency. Written fire-and-forget after every `/api/risk/check` response.
- `fraudCounters.ts` — Redis fraud velocity counters (Phase 2B). 6 signals replacing `get_risk_context()` RPC subqueries. `writeFraudCounters(orgId, userId, ip, deviceId, email, decision, eventType)` — fire-and-forget dual-write. `readFraudCounters(orgId, userId, ip, deviceId, email)` — 8-slot fixed pipeline, returns `RiskEngineContext | null`. Activated in `fetchContext` when `REDIS_COUNTERS_ENABLED=true`. Uses `NOOP = 'gnx:noop'` key for optional pipeline slots (SCARD/GET on nonexistent → 0/null).
- `monitoring.ts` — `captureException` / `captureMessage` wrappers for error tracking.
- `rateLimit.ts` — Upstash sliding window rate limiter. Limits per API key by plan tier.
- `adminAuth.ts` — Owner-only auth guard for admin endpoints.
- `aiEnricher.ts` / `aiSummary.ts` — GPT-4o-mini AI signal enrichment and event summaries.
- `riskEngine.ts` — Server-side re-export of the risk engine for use in API functions.
- `securityEvents.ts` — `createSecurityEvent()` helper for writing internal security audit entries.

### Dashboard Pages

**`Analytics.tsx`** — Full analytics dashboard with range picker (7d/30d/90d). Sections:
1. **KPI row** — Total Events, Avg Fraud Score, Block Rate, Feedback Coverage (with previous-period deltas)
2. **Decisions Over Time** — stacked SVG bar chart (allow/review/block per day or week)
3. **Avg Fraud Score Trend** + **Feedback Breakdown** — 2-col grid
4. **Rule Performance** + **Top Risk Signals** — 2-col grid
5. **Feedback Loop** — decision quality vs submitted labels: Decision Accuracy, False Positive Rate, False Negative Rate, Label Coverage, Review Quality; Decision Quality Breakdown (6-bar chart); auto-generated insight; empty state if no labels
6. **Fraud Analytics** — 2-col grid: GNX Score Distribution (3 bands: Low/Review/High with progress bars + percentages) + Fraud Label Trends (stacked bar chart with 4 label types); full-width Top Fraud Patterns (4-col: countries, event types, risk levels, original decisions for confirmed-fraud events)
7. **Training Readiness** — all-time progress to 10k labels, status badge (Not Ready/Collecting/Near Ready/Ready), label count grid, Data Quality Warnings
8. **Intelligence Layer** — Avg GNX Score, Labels Submitted, Confirmed Fraud count, False Positive Rate from client-side computation; label distribution HBar chart
Data fetched in parallel `Promise.all`: risk_events (5k limit), event_feedback, fraud_labels (2k limit), plus `GET /api/admin/intelligence/summary` for server-side aggregations (Feedback Loop, GNX distribution, patterns, training readiness).

**`Overview.tsx`** — Real-time metrics for last 24h. Subscribes to `postgres_changes` on `risk_events`. Charts: events over time (area), decisions (donut), fraud score distribution (histogram), risk level bars, top signals, top countries. Recent events table.

**`Events.tsx`** — Full risk events table. Client-side filtering on up to 500 events: search (user/email/IP/device), risk level, decision, event type, date range. 480px slide-out detail panel with signals, AI summary, related events (same user / IP / device). `key={selected.id}` forces panel remount on selection change.

**`Queue.tsx`** — Manual review interface. Status tabs: pending / approved / rejected / escalated. 500px detail panel with action buttons (Approve / Block / Escalate / Reopen / Add Note). Each action writes to `audit_logs`. Optimistic state updates.

**`Rules.tsx`** — CRUD for custom fraud rules. Toggle active/paused (optimistic). Inline delete confirmation. `RuleModal` with condition builder (optgroup select), operator/value inputs, live rule sentence preview. `condition_value` stored as `"operator:value"`. Writes audit logs on create/update/delete/toggle.

**`ApiKeys.tsx`** — API key management. Generate keys (SHA-256 hash stored, full key shown once). Revoke with 2-click confirmation. Shows `requests_count` and `last_used_at`. Writes audit logs on create/revoke.

**`Webhooks.tsx`** — Webhook endpoint management. Writes audit logs on create/update/delete.
- Cards per webhook: status toggle (active/disabled, optimistic), masked secret with show/hide/copy, test delivery button
- Test calls `POST /api/webhooks/test` with Supabase session JWT
- Expandable delivery history (lazy-fetches `webhook_deliveries`; shows migration notice if table missing)
- Modal: auto-generated secret on create (`whsec_` + 32 random bytes hex), rotate button in edit mode
- Node.js signature verification snippet shown when webhooks exist

**`Users.tsx`** — End-user intelligence table.
- Loads up to 500 `users_checked` + 2000 `risk_events` (lightweight fields), merges client-side to compute per-user aggregates
- Table columns: User ID (with suspicious flag icon), email, country, total events, fraud peak (color-coded), latest decision badge, distinct IP count, distinct device count, first seen
- Suspicious flag: `has_block || highest_fraud_score > 60 || distinct_ips > 2 || distinct_devices > 2`
- Search: client-side across user ID, email, phone, IP address (including all historical IPs seen across events)
- "Suspicious only" toggle filter
- 520px slide-out detail panel (`key={user.id}` forces remount):
  - Stat bar: total events, fraud peak, IPs, devices
  - Red banner explaining the suspicion reason
  - **Profile** — user ID, email, phone, country, first/last seen
  - **Decision history** — allow/review/block with percentage bars
  - **Risk timeline** — last 30 events with badges and trust/fraud scores (lazy-loaded on panel open)
  - **IP addresses** — distinct IPs with per-IP event counts
  - **Devices** — distinct device IDs with event counts
  - **Recurring signals** — signals in 2+ events, sorted by frequency, with severity badge and `×N` count

**`Ops.tsx`** — Owner-only operations dashboard. Shows service health, DB metrics, cron schedule, load-test flags, API Test Sandbox, and beta invite management.
- **API Test Sandbox** — interactive form to send real risk events without a terminal. Includes 4 presets (Normal user, Suspicious, Bot/Headless, Withdrawal), editable fields (user ID, email, IP, event type, country, device ID, user agent), API key input (password-masked), and inline response showing trust score, fraud score, decision badge, and detected signals. Events sent here are real — they appear in Risk Events and Overview.
- Beta invites section: create form, active invite rows with copy-code / copy-invite-link / resend-email buttons and email-sent badge, used/expired/revoked archive.

**`Infrastructure.tsx`** — 11-tab owner-only control center. Tabs: Overview, Environment, Database, Rate Limits, Webhooks, AI, Cron, Security, Incidents, Readiness, **Performance**.
- **Performance tab**: Today real-time stats (approve/review/block/latency from Redis), last 7 days bar chart, 7-day summary, Redis cache health per namespace (org, rules TTL remaining, monthly counter, fraud counters mode). Fetches `/api/admin/metrics/per-org?days=7` + `/api/admin/metrics/cache-stats`.
- All 11 fetches run in `Promise.allSettled` — individual failures don't break the page.

### Components
- `src/components/layout/AppLayout.tsx` — fixed 220px sidebar + sticky 52px top header with breadcrumb and org/plan badge. NAV_ALL has 10 items: Overview, Risk Events, Users, Review Queue, Analytics, Rules, API Keys, Webhooks, Infrastructure, Beta Ops. Bottom section has Documentation + Settings links. Items are filtered by role permission — `owner_only` items (Infrastructure, Beta Ops) only show to owners.
- `src/components/ProtectedRoute.tsx` — auth guard, shows spinner while loading

### GitHub & Deployment
- **GitHub**: `https://github.com/BlackKawa87/genuinux`
- **Vercel**: `https://genuinux.vercel.app` (auto-deploys on push to `main`)
- **Auto-sync hook**: `.claude/settings.json` Stop hook runs `.claude/sync.sh` after every Claude session — commits staged changes, pushes to GitHub, deploys to Vercel production. `VERCEL_TOKEN` is stored in the gitignored `.claude/settings.local.json`.

### Public Pages
- `/demo` — `Demo.tsx` — Client-side risk engine demo with 5 presets. Runs `analyze()` in-browser, no auth required.
- `/docs` — `Docs.tsx` — Full API reference with 12 sections, code blocks, copy buttons. No auth required.

### Logo Assets (`public/`)
Four logo files served statically from `/public/`:
- `logo-horizontal.png` — G-icon + "GENUINUX" text, horizontal layout, transparent background. **Primary logo** — used in navbar, sidebar, auth pages, error boundary, 404. Updated 2026-05-21 with new branding (teal G-icon, dark GENUINUX wordmark).
- `logo-color.png` — colored variant, used in Landing page footer (light background, no filter needed).
- `logo-full.png` — circular icon + "GENUINUX" text (vertical/stacked layout). Used in Demo page and Docs sidebar.
- `logo-icon.png` — circular icon only. Reserved for icon-only contexts.

Usage pattern:
- **Light backgrounds**: `<img src="/logo-horizontal.png" style={{ height: 'Xpx' }} />` — no filter needed
- **Dark backgrounds**: `<img src="/logo-horizontal.png" style={{ height: 'Xpx', filter: 'brightness(0) invert(1)' }} />`
- **AppLayout sidebar**: filter applied conditionally via `S.logoFilter` (theme-aware)
- **Landing footer**: `<img src="/logo-color.png" style={{ height: '112px' }} />` — no filter

Current heights: Landing navbar **112px** (logo-horizontal), Login/Register **112px** (logo-horizontal), PrivacyPolicy/ToS/NotFound/ErrorBoundary **112px** (logo-horizontal), AppLayout sidebar **44px** (logo-horizontal), Demo 80px (logo-full), Docs sidebar 88px (logo-full), Landing footer 112px (logo-color).

### Landing Page (`src/pages/Landing.tsx`)
Full redesign — always light mode (`#F8FAFC` bg). Key sections with anchor IDs:
- `id="product"` — Product Modules (5 API module cards)
- `id="developers"` — How It Works (3-step integration with dark code cards)
- `id="pricing"` — 4 plans: Trial / Starter / Growth (featured) / Enterprise
- `id="blog"` — 3 real articles with dates and read times

Nav links use smooth scroll via `document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })`. Mobile hamburger menu included. Theme toggle (Sun/Moon) in desktop navbar via `useTheme()`.

Hero headline: `clamp(2.25rem, 5vw, 4rem)`, `font-bold`. Hero section has `pt-48` top padding (navbar is ~144px tall due to 112px logo).

No fake metrics — "Built for scale" strip uses only real product claims: `< 50ms` latency, `300+` signals, `7` event types, `1 API call`.

Footer uses **light background** (`#F8FAFC`), `logo-color.png` at 112px. CTA text sitewide is **"Start 7-Day Trial"** (not "Start for free").

### Login (`src/pages/Login.tsx`) & Register (`src/pages/Register.tsx`)
Both in **light mode** (`#F8FAFC` bg, `#FFFFFF` card with soft shadow). Include "← Back to home" link above the card. Logo: `logo-horizontal.png` at **112px** height.

Register adds **company name** and **website** fields. On successful sign-up, calls `supabase.auth.getUser()` to get the new user ID, then updates the org `name` (and `website` if provided) that was auto-created by the DB trigger.

### Auth Flows
- **Password reset**: `/forgot-password` → Supabase email → `/reset-password` (token auto-exchanged from URL fragment).
- **Team invite**: Settings → Team → "Invite member" modal → `POST /api/team/invite` → Supabase `inviteUserByEmail` → `/join?token=<uuid>`. Requires `pending_invites` table (SQL migration shown inline in the Team tab).

### Blog
3 real articles at `/blog/:slug`. Slugs: `detect-account-takeover`, `cost-of-false-positives`, `first-custom-fraud-rule`. Landing cards are clickable `<Link>` components with dates and read times.

### Billing (Stripe)
- `POST /api/billing/checkout` — creates Stripe checkout session → returns redirect URL. Body: `{ plan: 'starter' | 'pro' }`.
- `POST /api/billing/portal` — creates Stripe customer portal session. Requires existing `stripe_customer_id` on org.
- `POST /api/billing/webhook` — handles `customer.subscription.{created,updated,deleted}` → updates `organizations.plan`.
- Requires env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`.
- Requires DB column: `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id text;` (SQL shown inline in Billing tab).
- Without Stripe env vars, Upgrade buttons return 503 with a clear error message — the UI degrades gracefully.

### Pending / Not Yet Built

**Production activation (Phase 2C):**
- `DROP TABLE risk_events_legacy` — run after 24-48h of validating the partitioned table in production.
- Set `REDIS_COUNTERS_ENABLED=true` in Vercel — activate after 24-48h of dual-write warm-up.

**Intelligence Layer — Phase 3 activation:**
- Run `supabase/migrations/v19_intelligence_layer.sql` (4 sections A–D separately in SQL editor) — creates `fraud_labels`, `fraud_features`, `entity_reputation` tables and `increment_entity_reputation()` RPC.
- Set `FEATURE_STORE_ENABLED=true` in Vercel — activates `persistFeatures()` writes to `fraud_features` table.
- After 24–48h warm-up (labels accumulating), Analytics Intelligence section populates automatically.
- ML training (Phase 3.5): gated on 10,000 labels + 50+ confirmed_fraud labels — status shown in Training Readiness panel.
- `REPUTATION_ENRICHMENT_ENABLED=true` — phase 3.5 gate to read entity reputation in the `/api/risk/check` hot path.

**Phase 3 — Implemented (Modules 1, 2, 3, 5, 10):**
- `POST /api/risk/label` — client API for ground-truth fraud labels (Module 1 + 2)
- `api/_lib/gnxScore.ts` — `computeGnxScore()` — deterministic 0–1000 score, written to `risk_events.gnx_score` fire-and-forget (Module 10)
- `api/_lib/featureStore.ts` — `persistFeatures()` — 12 ML feature vectors written to `fraud_features` (Module 3), gated by `FEATURE_STORE_ENABLED`
- `api/_lib/reputationNetwork.ts` — `updateEntityReputation()` / `getEntityReputation()` — atomic cross-org reputation via PostgreSQL RPC (Module 5)
- `GET /api/admin/intelligence/summary` — aggregated Feedback Loop + GNX distribution + fraud trends + top patterns + training readiness
- Analytics.tsx — Intelligence Layer overview + Feedback Loop + Fraud Analytics + Training Readiness sections

**Deferred (Phase 3.5+):**
- `GET /api/risk/reputation` — client-facing entity reputation lookup endpoint
- `api/_lib/aiCopilot.ts` — richer AI Copilot per-event investigation summary
- ML training pipeline (Module 7) — gated on 100k events + 10k labels
- Hybrid Decision Engine (Module 9) — gated on ML shadow mode validation
- Shadow ML columns (`ml_score`, `ml_decision`, `ml_version`) added to `risk_events` in v19 migration but remain NULL until ML training activates

**Features:**
- Invite team members: works end-to-end but requires running the `pending_invites` SQL migration in Supabase first.
- Stripe billing: API endpoints ready — requires adding Stripe env vars to Vercel and running the `stripe_customer_id` migration.
- Password reset: fully functional via Supabase email.
- Blog: 3 real articles live at `/blog/:slug`.
- Invite flow to same org: currently new invited users are assigned to the invited org via the `/join` page, but the auto-created org from the DB trigger remains. A cleanup step (deleting the auto-created org) can be added later.
- Rules cache invalidation: `Rules.tsx` mutations (create/update/delete/toggle) should call `invalidateCachedRules(orgId)` via a new API endpoint so rule changes take effect immediately instead of after the 60s Redis TTL.

## TypeScript Config

Strict mode + `noUnusedLocals` + `noUnusedParameters` — unused imports cause build failures.

## ESM / API Function Import Rules

`package.json` has `"type": "module"` (ESM). Vercel's `@vercel/node` runtime compiles TypeScript to ESM JavaScript. Node.js ESM **requires explicit `.js` extensions on all relative imports** at runtime.

- Functions that import from `../../src/lib/` (e.g. `api/risk/check.ts`) get bundled by esbuild — extensions are resolved at build time, so missing `.js` is safe there.
- Functions with only `api/`-internal relative imports run as raw ESM and **will crash** with `ERR_MODULE_NOT_FOUND` if `.js` is missing.

**Rule**: always write `from '../_lib/foo.js'` (not `'../\_lib/foo'`) for any relative import inside `api/`. This applies to both top-level `api/*.ts` and `api/_lib/*.ts` files importing siblings.

## Theme System

### ThemeContext (`src/contexts/ThemeContext.tsx`)
Wraps the entire app in `main.tsx` (inside `<ThemeProvider>`). Exposes `useTheme()` returning `{ theme: 'light'|'dark', toggle: () => void }`. Persists to `localStorage` under key `gnx-theme`. Sets `data-theme` attribute on `<html>`.

**Default: light mode.** Dark mode is user-toggled. Toggle appears in the Landing navbar and the AppLayout header.

### Theme Tokens Hook (`src/lib/themeTokens.ts`)
`useT()` — call inside any component that needs theme-aware colors. Returns:

| Token | Light | Dark | Usage |
|---|---|---|---|
| `T.bg` | `#F8FAFC` | `#050B14` | Page background |
| `T.card` | `#FFFFFF` | `#0B1220` | Card background |
| `T.deep` | `#F1F5F9` | `#07111F` | Section/sidebar bg |
| `T.elevated` | `#F0F4F8` | `#0F1929` | Hover/elevated state |
| `T.border` | `#E2E8F0` | `#1E2D3D` | Standard borders |
| `T.borderLight` | `#CBD5E1` | `#243447` | Lighter borders |
| `T.text` | `#0F172A` | `#F1F5F9` | Primary text |
| `T.textSec` | `#64748B` | `#94A3B8` | Secondary text |
| `T.textDim` | `#94A3B8` | `#475569` | Dimmed/tertiary text |
| `T.trust` | `#16C784` | `#16C784` | Accent green |
| `T.codeBg` | `#0F172A` | `#050B14` | Code block bg (always dark) |
| `T.codeText` | `#F1F5F9` | `#F1F5F9` | Code block text (always light) |

All dashboard pages (`Overview`, `Events`, `Queue`, `Rules`, `ApiKeys`, `Webhooks`, `Users`, `Settings`, `Analytics`) use `useT()`.

### AppLayout (`src/components/layout/AppLayout.tsx`)
Sidebar and header use a theme-aware `S` object (computed from `useTheme()`). Sidebar: white in light / `#07111F` in dark. Header: `rgba(255,255,255,0.95)` in light / `rgba(7,17,31,0.95)` in dark. Sun/Moon toggle in header right.

### CSS (`src/index.css`)
`:root` defines **light-mode defaults** for CSS vars (`--c-bg: #F8FAFC`, etc.). `[data-theme="dark"]` block overrides them with dark values. Body `font-family: 'Inter'`. CSS utility classes (`.g-card`, `.btn-trust`, `.btn-outline`, `.nav-item`, `.g-input`, badges, etc.) use CSS vars so they adapt automatically.

### Public pages (light)
Landing, Login, Register use a light palette defined as the `C` constant in `Landing.tsx`. These pages are always light regardless of the global theme toggle.

CSS utility classes (defined in `index.css`): `.g-card`, `.g-card-hover`, `.btn-trust`, `.btn-outline`, `.trust-pill`, `.nav-item`, `.g-input`, `.badge-{low|medium|high|critical}`, `.badge-{allow|review|block}`, `.mono`, `.pulse-dot`, `.scan-anim`, `.anim-{0-5}`.

Fonts loaded from Google Fonts: **Inter** (UI/headings, all weights 300–800) + **IBM Plex Mono** (data, code, numbers). Applied via `font-family` in CSS or `.mono` class.

## Language

All UI text is in **English**. Data fields use English enum values matching the DB schema.

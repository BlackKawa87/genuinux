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
- **Resend** (`resend`) for transactional email — invite delivery
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
# ML_SHADOW_ENABLED=true        # enable ML shadow predictions (set AFTER applying v22_ml_predictions.sql)
# FEATURE_STORE_ENABLED=true    # enable feature vector writes to fraud_features (Phase 3.3)
# DATASET_BUILDER_ENABLED=true  # enable training dataset auto-build on label submit (Phase 3.6)
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
  - `/dashboard`                → `Overview.tsx`
  - `/dashboard/events`         → `Events.tsx`
  - `/dashboard/users`          → `Users.tsx`
  - `/dashboard/queue`          → `Queue.tsx`
  - `/dashboard/analytics`      → `Analytics.tsx`
  - `/dashboard/ml`             → `ML.tsx` (Machine Learning — Phase 3.7)
  - `/dashboard/rules`          → `Rules.tsx`
  - `/dashboard/api-keys`       → `ApiKeys.tsx`
  - `/dashboard/webhooks`       → `Webhooks.tsx`
  - `/dashboard/infrastructure` → `Infrastructure.tsx`
  - `/dashboard/ops`            → `Ops.tsx`

### Auth (`src/contexts/AuthContext.tsx`)
`AuthProvider` wraps the full app in `main.tsx`. Exposes `useAuth()` with: `user`, `session`, `profile`, `loading`, `profileLoading`, `signIn`, `signUp`, `signOut`. Backed by Supabase Auth.

**Two-phase loading**: `loading` becomes `false` after `getSession()` resolves. `profileLoading` starts `true` and becomes `false` only after the `profiles` row fetch completes (success or failure). Both must be `false` before auth-gated routes make a decision — using only `loading` causes a race condition where `profile` is still `null` while `user` is set, causing premature redirects.

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

**v22 migration** (`supabase/migrations/v22_ml_predictions.sql`): ML Shadow Mode tables (Phase 3.7).
- **Section A**: `ml_predictions` table — PK `id UUID`, `organization_id UUID FK`, `risk_event_id TEXT`, `model_name TEXT DEFAULT 'shadow-v1'`, `model_version INTEGER DEFAULT 1`, `prediction TEXT CHECK(block|review|allow)`, `prediction_score NUMERIC(5,4)`, `actual_decision TEXT`, `agreement BOOLEAN` (pre-computed at write time), `feature_version INTEGER`, `dataset_version INTEGER`. 5 indexes on org+created, org+event, org+model, org+agreement, org+prediction. RLS SELECT for org members.
- **Section B**: `feature_importance` table — `(model_version TEXT, feature_name TEXT)` UNIQUE PK. Seeded with 9 shadow-v1 weights matching `api/_lib/shadowPredictor.ts`. RLS SELECT = true (global).
- Safe to DROP+CREATE `ml_predictions` because `ML_SHADOW_ENABLED` was never true in production.
- Run Section A then Section B separately in the Supabase SQL editor.

**v23 migration** (`supabase/migrations/v23_fraud_labels_unique.sql`): UNIQUE constraints to prevent duplicate label rows (Feedback Coverage > 100% bug fix).
- **Section A**: Delete duplicate `fraud_labels` rows keeping only the latest per `(organization_id, risk_event_id)`, then add `UNIQUE (organization_id, risk_event_id)` constraint named `fraud_labels_org_event_unique`.
- **Section B**: Delete duplicate `training_dataset` rows, then add `UNIQUE (organization_id, risk_event_id)` constraint named `training_dataset_org_event_unique`.
- **Root cause**: before this migration, calling `POST /api/risk/label` multiple times for the same event (relabeling) inserted duplicate rows, inflating `label_coverage_rate` above 100%. The fix requires both the DB constraint and UPSERT in `api/risk/label.ts` + `api/_lib/datasetBuilder.ts`.
- Apply Section A before Section B, separately.

**v21 migration** (`supabase/migrations/v21_training_dataset.sql`): Training Dataset table (Phase 3.6).
- `training_dataset` table — PK `id UUID`, fields: `risk_event_id TEXT`, `label`, `decision`, `fraud_score`, `trust_score`, `gnx_score`, `feature_count`, `label_created_at`, `event_created_at`, `dataset_version INTEGER DEFAULT 1`.
- 4 indexes: `idx_training_dataset_org_label`, `idx_training_dataset_org_event`, `idx_training_dataset_org_created`, `idx_training_dataset_version`.
- RLS SELECT policy for org members. Service-role-only writes (no INSERT policy).
- Run Sections A→C separately. Requires v19 (fraud_labels) to exist first.

**v20 migration** (`supabase/migrations/v20_feature_store.sql`): Feature Store schema expansion (Phase 3.3).
- Adds `feature_group TEXT NOT NULL DEFAULT 'risk'`, `feature_version INTEGER NOT NULL DEFAULT 1`, `source TEXT NOT NULL DEFAULT 'risk-engine-v1'` to `fraud_features`.
- Adds indexes: `idx_fraud_features_org_group_created`, `idx_fraud_features_name_version`.
- Adds `fraud_features_select` RLS policy so dashboard members can query their org's features.
- Run Sections A→C separately. Must apply v19 first.

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

Audit logs: Written by the frontend for key actions — `api_key.created`, `api_key.revoked`, `rule.created`, `rule.updated`, `rule.deleted`, `webhook.created`, `webhook.updated`, `webhook.deleted`, `org.updated`, `review.*`. Backend writes `beta_invite.created`, `beta_invite.email_sent`, `beta_invite.email_failed`, `beta_invite.resent`, `beta_invite.used`. Backend also writes `risk.check.slow` fire-and-forget from `/api/risk/check` when `total_ms > 1000` — queryable by the Go Live Monitor slow-requests endpoint. Requires the v4 `audit_logs_insert` RLS policy to be in place.

### Types (`src/types/index.ts`)
Mirrors DB schema. Key types: `RiskEvent`, `ApiKey`, `Organization`, `Profile`, `Rule`, `ReviewQueueItem`, `Webhook`, `WebhookDelivery`, `AuditLog`, `DashboardMetrics`.
Shared enums: `RiskLevel`, `Decision`, `EventType`.

### Risk Engine (`src/lib/riskEngine.ts`)
Pure TypeScript function — no side effects, no DB calls. Takes `RiskEngineInput` + optional `RiskEngineContext` (pre-fetched historical counts), returns `RiskEngineOutput`.

Signal categories analyzed: **email** (disposable domain, format), **IP** (velocity, distinct users, signup surge), **device** (multi-user device, prior block), **velocity** (rapid repeated events), **behavioral** (headless UA, private browser hints).

Scoring: starts at `trust_score=100, fraud_score=0`. Each detected signal applies `fraud_impact` (+) and `trust_impact` (−). Multipliers apply for extreme cases (e.g. 20+ users on same IP).

Decision thresholds (risk band on `fraud_score`: low 0-25 / medium 26-55 / high 56-80 / critical 81-100):
- `risk_level='critical'` (i.e. `fraud_score ≥ 81`) → `block`
- `risk_level='high'`, or `risk_level='medium' && fraud_score ≥ 40` → `review`
- Otherwise → `allow`

**Correction (2026-07-28):** an earlier version of this doc stated the block threshold as `fraud_score ≥ 70` — the actual gate is `risk_level==='critical'`, which only triggers at `fraud_score ≥ 81`; `70` falls in the `high` band, which maps to `review`, not `block`. See `docs/mps/04-risk-cloud.md` Sec. 3.6 / `docs/mps/architecture-backlog.md` TD-0014.

The public API maps `allow` → `approve` in responses.

### Custom Rules (`src/lib/riskEngine.ts` + `api/risk/check.ts`)
Rules run **after** the base Risk Engine score. First matching active rule overrides the final decision.

Evaluated in `applyCustomRules()` inside `api/risk/check.ts` (step 4.5 in the handler). Rules are cached in Redis (60s TTL via `api/_lib/keyCache.ts`) — fetched from `rules` table only on cache miss, ordered by `priority DESC, created_at ASC`.

`condition_value` stored as `"operator:value"` string (e.g. `"gt:80"`, `"eq:BR"`).

Supported condition types: `fraud_score`, `trust_score`, `risk_level`, `event_type`, `country`, `email_domain`, `ip_user_count_1h`, `ip_signup_count_1h`, `device_account_count` (plus legacy aliases `ip_user_count`/`device_user_count`, and dynamic `metadata.*` fields).

**Cache invalidation**: `invalidateCachedRules(orgId)` (`api/_lib/keyCache.ts`) exists but is **not called anywhere** — `Rules.tsx` writes directly to Supabase with no API layer in between. Rule changes therefore take up to 60s (cache TTL) to take effect. This is a known, tracked gap — see `docs/mps/architecture-backlog.md` TD-0002 — not yet fixed.

### API Endpoints (`api/`)

**`POST /api/risk/check`** — Production endpoint for client integrations.
- Auth: `Authorization: Bearer <api_key>` — key is SHA-256 hashed and matched against `api_keys.key_hash`
- **Hot path (optimized)**: module-level Supabase client singleton → Redis cache for API key (5min TTL) → Redis cache for org plan (60s TTL) → RPC `get_risk_context` (single DB round-trip for all 6 context queries) → Redis cache for rules (60s TTL)
- Runs `analyze()` from risk engine, then evaluates custom rules (`applyCustomRules`)
- **Early response**: `res.status(200).json(response)` is sent before DB writes — `upsertUserChecked` + `insertRiskEvent` run after the client receives the response
- `crypto.randomUUID()` is pre-generated before the early response so the event_id in the response matches the DB row
- **Cold start detection**: `const coldStart = _supabase === null` is captured before `adminClient()` — detects first Vercel function invocation where the module-level singleton is uninitialized. Logged in `captureMessage` and slow-request audit entries.
- **Per-step instrumentation**: `step(label)` helper records timestamps for key_ms, org_ms, rate_ms, monthly_ms, context_ms, engine_ms, gnx_ms. `context_path` logged as `'redis'` or `'rpc'`.
- **Slow-request sink**: when `total_ms > 1000`, a `captureMessage('risk.check.slow', 'warning', {...})` is emitted AND a fire-and-forget `audit_logs.insert` with `event_type: 'risk.check.slow'` is written — queryable by `/api/admin/monitoring/slow-requests`.
- **Post-response persist timing**: `persist_ms` measures the `await Promise.all([upsertUserChecked, insertRiskEvent])` duration; emits `risk.check.slow_persist` warning if > 800ms.
- **Fire-and-forget critical invariant**: any unhandled exception thrown between `res.json()` and `await Promise.all([upsertUserChecked, insertRiskEvent])` (line ~1079) will kill the handler before any writes execute. All code in that gap must be free of `ReferenceError`, import errors, or uncaught throws. This was the root cause of zero events being persisted — `captureMessage` was called but not imported, causing `ReferenceError` on every request (fixed 2026-06-06, commit `ab401ef`).
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
- **Dedup invariant**: both `periodLabels` and `allLabels` are deduplicated by `risk_event_id` (Map keyed on event ID, keep latest) before any metric calculation. `label_coverage_rate` and all counts therefore reflect distinct labeled events — never inflated by duplicate rows.

**Critical — profiles table lookup in API endpoints:** The `profiles` table has two distinct UUID columns: `id` (own PK, `gen_random_uuid()`) and `user_id` (FK → `auth.users.id`). When resolving `organization_id` from a user JWT, always use `.eq('user_id', user.id)` — **never** `.eq('id', user.id)`. Using the wrong column returns 0 rows → `profile = null` → 403 "No organization". Reference: `schema.sql:191` uses `WHERE user_id = auth.uid()`. All intelligence and ML endpoints (`features.ts`, `dataset/stats.ts`, `ml/summary.ts`, `ml/disagreements.ts`) use the correct `user_id` column.

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
| GNX v2 score | `computeGnxScore()` pure function — measured as `gnx_ms` step | <1ms |
| DB writes | Fire-and-forget after early `res.status(200).json()` | Off critical path |
| Org stats + fraud counters write | Fire-and-forget after response — `incrementOrgStats` + `writeFraudCounters` | Off critical path |
| Cold start detection | `const coldStart = _supabase === null` before `adminClient()` — logged in slow-request audit | Detection only |

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
- `monitoring.ts` — exports `captureException` AND `captureMessage` for error tracking. **Both must be explicitly imported** wherever used — esbuild does not catch missing references at build time, causing `ReferenceError` at runtime. Any `ReferenceError` thrown between `res.status(200).json()` and the `await Promise.all([...])` writes will kill the handler and silently discard ALL post-response DB writes.
- `rateLimit.ts` — Upstash sliding window rate limiter. Limits per API key by plan tier.
- `adminAuth.ts` — Owner-only auth guard for admin endpoints.
- `aiEnricher.ts` / `aiSummary.ts` — GPT-4o-mini AI signal enrichment and event summaries.
- `riskEngine.ts` — **Manually duplicated copy** of `src/lib/riskEngine.ts` (not a re-export — differs only by import extension). Nothing keeps the two files in sync; see `docs/mps/architecture-backlog.md` TD-0004.
- `securityEvents.ts` — `createSecurityEvent()` helper for writing internal security audit entries.
- `shadowPredictor.ts` — `predictShadow(features[])` pure function. shadow-v1 deterministic model: 9-feature weighted linear combination, maps fraud probability to `block/review/allow` (thresholds 0.70/0.35). Weights match `feature_importance` DB seed. No randomness. (Phase 3.7)
- `mlPredictionStore.ts` — `savePrediction()` writes to `ml_predictions` with pre-computed `agreement BOOLEAN`; `runShadowPrediction()` orchestrates extractFeatures→predictShadow→save fire-and-forget; `getPredictions()`, `getAgreementStats()`, `getModelStats()` for API endpoints. Gated by `ML_SHADOW_ENABLED=true`. (Phase 3.7)

### Dashboard Pages

**`ML.tsx`** — Machine Learning dashboard at `/dashboard/ml`. Fetches 3 endpoints in parallel: `/api/admin/ml/summary`, `/api/admin/ml/disagreements`, `/api/admin/ml/features`. 6 sections: **ML Readiness** (coverage + agreement + readiness score bar), **Shadow Performance** (accuracy/precision/recall/F1 — null until labels exist; agreement rate always available), **Agreement Analysis** (disagreement breakdown + recent disagreements table with official_decision vs shadow_prediction), **Prediction Coverage** (coverage/agreement/event count grid), **Feature Importance** (bar chart of shadow-v1 weights from DB), **Dataset Health** (link to Analytics + training readiness). Shows activation notice with step-by-step instructions if `ML_SHADOW_ENABLED` not set. (Phase 3.7)

**`Analytics.tsx`** — Full analytics dashboard with range picker (7d/30d/90d). Sections:
1. **KPI row** — Total Events, Avg Fraud Score, Block Rate, Feedback Coverage (with previous-period deltas)
2. **Decisions Over Time** — stacked SVG bar chart (allow/review/block per day or week)
3. **Avg Fraud Score Trend** + **Feedback Breakdown** — 2-col grid
4. **Rule Performance** + **Top Risk Signals** — 2-col grid
5. **Feedback Loop** — decision quality vs submitted labels: Decision Accuracy, False Positive Rate, False Negative Rate, Label Coverage, Review Quality; Decision Quality Breakdown (6-bar chart); auto-generated insight; empty state if no labels
6. **Fraud Analytics** — 2-col grid: GNX Score Distribution (3 bands: Low/Review/High with progress bars + percentages) + Fraud Label Trends (stacked bar chart with 4 label types); full-width Top Fraud Patterns (4-col: countries, event types, risk levels, original decisions for confirmed-fraud events)
7. **Training Readiness** — all-time progress to 10k labels, status badge (Not Ready/Collecting/Near Ready/Ready), label count grid, Data Quality Warnings
8. **Intelligence Layer** — Avg GNX Score, Labels Submitted, Confirmed Fraud count, False Positive Rate from client-side computation; label distribution HBar chart
Data fetched in parallel `Promise.all`: risk_events (5k limit, fields: `fraud_score, decision, signals_json, applied_rule_name, gnx_score, created_at`), fraud_labels (2k limit, fields: `risk_event_id, label, created_at`, used for Feedback Coverage KPI and Feedback Breakdown), plus `GET /api/admin/intelligence/summary` for server-side aggregations (Feedback Loop, GNX distribution, patterns, training readiness).
`FbLite` and `LabelLite` interfaces include `risk_event_id: string`. The `currFb`, `prevFb`, and `currLabels` memos deduplicate by `risk_event_id` (keeping latest `created_at`) before computing Feedback Coverage — prevents Coverage > 100% when multiple label rows exist for the same event.

**Important — columns and tables that do NOT exist:** `risk_events.feedback_status` was never created (not in schema or any migration) — do not add it to any SELECT. The `event_feedback` table was never created — Feedback Coverage uses `fraud_labels` as the data source. `fraud_labels.label` values: `confirmed_fraud`, `suspected_fraud`, `false_positive`, `legitimate`.

**`Overview.tsx`** — Real-time metrics for last 24h. Subscribes to `postgres_changes` on `risk_events`. Charts: events over time (area), decisions (donut), fraud score distribution (histogram), risk level bars, top signals, top countries. Recent events table.

**`Events.tsx`** — Full risk events table. Client-side filtering on up to 500 events: search (user/email/IP/device), risk level, decision, event type, date range. 480px slide-out detail panel with signals, AI summary, related events (same user / IP / device). `key={selected.id}` forces panel remount on selection change.
- **Label column**: each table row has a `LabelCell` — native `<select>` styled as a colored badge. `fetchLabels(evs)` queries `fraud_labels` on load and deduplicates client-side by `risk_event_id`. `submitLabel(eventId, label)` POSTs to `/api/risk/label` with the Supabase session JWT.
- **"Outcome Label" section** in `EventDetailPanel` — 4 pill buttons (Confirmed Fraud / Suspected / False Positive / Legitimate) that call the same `submitLabel()`.
- **Filter bar fix**: all 5 filter controls use `height: 36, paddingTop: 0, paddingBottom: 0`. Zero vertical padding is required because `.g-input` sets `padding: 10px` and `box-sizing: border-box` makes `height` the total — a 36px box with 20px of vertical padding leaves only 16px content area, clipping 14px text. Zeroing vertical padding lets the browser center text natively within the full 36px.

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

**`Infrastructure.tsx`** — 12-tab owner-only control center. Tabs: Overview, Environment, Database, Rate Limits, Webhooks, AI, Cron, Security, Incidents, Readiness, Performance, **Go Live**.
- **Performance tab**: Today real-time stats (approve/review/block/latency from Redis), last 7 days bar chart, 7-day summary, Redis cache health per namespace (org, rules TTL remaining, monthly counter, fraud counters mode). Fetches `/api/admin/metrics/per-org?days=7` + `/api/admin/metrics/cache-stats`.
- **Go Live tab**: Post-launch operational health overview. 8 sections: Go Live Status badge (Healthy/Warning/Critical + reasons list), API Health (24h totals + decision breakdown + today Redis stats), Latency (avg today + 7-day trend bar chart), Slow Requests table (last 20 requests >1000ms with per-step breakdown, cold_start, context_path), Redis Health (connected/fraud_counters_enabled/context_path), Sentry Health (DSN configured flag), Data Pipeline (5-table status cards from last 24h counts), GNX Health (v2 coverage, null rate, score band distribution). Fetches `/api/admin/monitoring/go-live`, `/api/admin/monitoring/slow-requests?limit=20`, `/api/admin/monitoring/pipeline-health`.
- All 14 fetches run in `Promise.allSettled` — individual failures don't break the page.

### Admin Console (`/admin`)
Completely separate section from `/dashboard`. Guarded by `AdminRoute` — only users with `profiles.is_platform_admin = true` can access it. All others are hard-redirected to `/dashboard`. Requires v24 migration.

**Route tree**: `/admin` → `AdminLayout` (orange sidebar, "ADMIN CONSOLE" badge) + nested:
- `/admin` → `AdminDashboard.tsx` — platform KPIs: total orgs, users, API keys, events today/month, labels, ML predictions, slow requests. Plan breakdown bar + system health.
- `/admin/organizations` → `AdminOrganizations.tsx` — all orgs table. Inline plan dropdown (changes take effect immediately). MoreHorizontal menu: suspend/reactivate, plan_source selector. Filters: search, plan, status.
- `/admin/users` → `AdminUsers.tsx` — all users table. **Grant Admin / Revoke Admin** button toggles `is_platform_admin`. Role change via inline dropdown. **Delete user**: trash icon opens 2-step confirmation modal (requires clicking "Yes, delete permanently" — prevents accidental deletion). Backend: `DELETE /api/admin/platform/users` deletes profile row + auth user via service role, writes `user.deleted` audit log. Cannot delete own account.
- `/admin/system` → `AdminSystemHealth.tsx` — 6 service cards + env checklist.
- `/admin/audit` → `AdminAuditLogs.tsx` — platform-wide audit log, expandable metadata.
- `/admin/go-live` → `AdminGoLive.tsx` — reuses monitoring endpoints.
- Stub pages: `AdminBilling`, `AdminUsage`, `AdminCustomers`, `AdminSecurity`, `AdminFeatureFlags`.

**Platform API endpoints** (`api/admin/platform/`):
- `GET /api/admin/platform/metrics` — platform-wide KPIs
- `GET /api/admin/platform/orgs` + `PATCH` — org list + update plan/plan_source/suspend/reactivate
- `GET /api/admin/platform/users` + `PATCH` + `DELETE` — user list + update role/is_platform_admin + delete user
- `GET /api/admin/platform/audit?limit=N` — audit logs across all orgs

**Auth**: all platform endpoints verify `is_platform_admin` via user JWT + service-role profile lookup. Returns 403 if not a platform admin.

**v24 migration** (`supabase/migrations/v24_admin_console.sql`): adds `is_platform_admin boolean DEFAULT false` to `profiles`; adds `plan_source`, `suspended_at`, `suspended_by` to `organizations`. After running: `UPDATE profiles SET is_platform_admin = true WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your@email.com')`.

### UI Primitives (`src/components/ui/`)

**Import from the barrel (`../../components/ui`), never from the individual files.** Before hand-rolling a card, badge, button, table or empty state in a screen, check here first — the whole point is that a fix propagates.

| Module | Exports |
|---|---|
| `primitives.tsx` | `Button` `Spinner` `Card` `Well` `Section` `PageHeader` `Badge` `StatusDot` `Notice` `Divider` |
| `data.tsx` | `Metric` `MetricRow` `Meter` `EmptyState` `Skeleton` `SkeletonMetrics` `TableWrap` `Table` `Segmented` |
| `forms.tsx` | `Field` `Input` `Textarea` `Select` `Switch` `Toolbar` |
| `tone.ts` | `Tone` type + `useTone()` — kept separate so the component files stay component-only for Fast Refresh |

Four rules these encode:
1. **Surfaces** — `Card` or `Well` or nothing. **Never a card inside a card**; use `Section` to group with type and space instead of drawing another box.
2. **Hierarchy** — `Metric` takes `tier="primary|secondary|tertiary"`. Only a handful of numbers per screen may be `primary`. This is what stops every dashboard number competing at the same size.
3. **Colour** — `tone` names an operational meaning (`brand|success|warning|danger|info|accent|neutral`), never a hue, so the palette can be retuned in `themeTokens.ts` without touching call sites.
4. **Empty states** — `EmptyState` is compact and explains *what will appear here and what makes it appear*. Never a large blank box saying "No data".

`Overview.tsx` and `ML.tsx` are the reference implementations. **Still pending:** 18 old-style empty states across `Webhooks`, `Users`, `Analytics`, `Rules`, `ApiKeys`, `Infrastructure`, `Queue`, `Events` have not been converted to `EmptyState`.

### Components
- `src/components/layout/AppLayout.tsx` — fixed 216px sidebar + sticky 52px top header with breadcrumb and org/plan badge. NAV_ALL has 10 items: Overview, Risk Events, Users, Review Queue, Analytics, Rules, API Keys, Webhooks, Infrastructure, Beta Ops. Bottom section has Documentation + Settings links. Items are filtered by role permission — `owner_only` items (Infrastructure, Beta Ops) only show to owners. **Mobile**: sidebar collapses behind hamburger (Menu icon), slides in as overlay with dark backdrop, auto-closes on route change. **Admin Console button**: shown in header only for users with `is_platform_admin = true` — orange shield badge linking to `/admin`.
- `src/components/AdminRoute.tsx` — platform admin guard. Waits for both `loading` and `profileLoading` from AuthContext before deciding. Unauthenticated → `/login`. Authenticated without `is_platform_admin` → `/dashboard` (hard redirect, no info leak). Only `is_platform_admin = true` reaches the Admin Console.
- `src/components/ProtectedRoute.tsx` — auth guard, shows spinner while loading
- `src/hooks/useWindowSize.ts` — returns `{ width, isMobile, isTablet, isDesktop }` (breakpoints: 640px / 1024px). Used across all pages for responsive inline styles.

### Responsive / Mobile-First
All pages and layouts are mobile-first as of commit `8ab79b4`. Breakpoints: mobile < 640px, tablet 640–1024px, desktop > 1024px.
- **Sidebar** (AppLayout + AdminLayout): hidden on mobile, toggles as full-height overlay via `translateX` transition
- **Grids**: 1-col mobile → 2-col tablet → 3–4-col desktop
- **Detail panels** (Events, Queue, Users): `width: 100%` full-screen overlay on mobile, 480–520px slide-out on desktop
- **Tables**: `overflow-x: auto` wrapper with `minWidth` so data scrolls horizontally on small screens
- **Docs sidebar**: hidden on mobile, accessible via toggle button in sticky header

### GitHub & Deployment
- **GitHub**: `https://github.com/BlackKawa87/genuinux`
- **Vercel**: `https://genuinux.com` (auto-deploys on push to `main`)
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

Current heights: Landing navbar **112px** (logo-horizontal), Login/Register **112px** (logo-horizontal), PrivacyPolicy/ToS/NotFound/ErrorBoundary **112px** (logo-horizontal), AppLayout sidebar **26px** (logo-horizontal), Demo 80px (logo-full), Docs sidebar 88px (logo-full), Landing footer 112px (logo-color).

### Landing Page (`src/pages/Landing.tsx`)
Full redesign — always light mode (`#F8FAFC` bg). Key sections with anchor IDs:
- `id="product"` — Product Modules (5 API module cards)
- `id="developers"` — How It Works (3-step integration with dark code cards)
- `id="pricing"` — 4 plans: Trial / Starter / Growth (featured) / Enterprise
- `id="blog"` — 3 real articles with dates and read times

Nav links use smooth scroll via `document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })`. Mobile hamburger menu included. Theme toggle (Sun/Moon) in desktop navbar via `useTheme()`.

Hero headline: `clamp(2.25rem, 5vw, 4rem)`, `font-bold`. Hero section has `pt-48` top padding (navbar is ~144px tall due to 112px logo).

"Built for scale" strip claims: `< 50ms` latency, `20` signals, `7` event types, `1 API call`. **Corrected 2026-08-08 — TD-0017 and TD-0056 are now `Resolved` in the backlog.** The hero stat, the "Built for scale" strip and the RiskScore copy now say `20`; the DeviceID descriptor describes device linking rather than fingerprinting; and the Fintech vertical no longer claims AML/KYC. **Do not re-introduce any of these claims** — the underlying capability gaps (TD-0009 IP Intelligence, TD-0010 Device Fingerprinting, TD-0042 Compliance Cloud) are still open. Historical note (2026-07-28): the `300+` signals figure (and the DeviceID module's "persistent fingerprinting, detects emulators/rooted devices" copy) is **not accurate** — the real risk engine implements 17 signal codes (20 including feature-store-only ones), and `device_id` is an opaque client-supplied string with no fingerprinting logic anywhere in the codebase. Tracked as `docs/mps/architecture-backlog.md` TD-0017 (Risk Cloud) — copy should be corrected or the underlying capability (IP Intelligence/Device Fingerprinting, TD-0009/TD-0010) built out before repeating these claims.

Footer uses **light background** (`#F8FAFC`), `logo-color.png` at 112px. CTA text sitewide is **"Start 7-Day Trial"** (not "Start for free").

All CTAs previously labelled "Request Beta Access" are now **"Start Free Trial"** linking to `/register`. Badge "Controlled Beta" replaced with "Production Ready".

### Login (`src/pages/Login.tsx`) & Register (`src/pages/Register.tsx`)
Both in **light mode** (`#F8FAFC` bg, `#FFFFFF` card with soft shadow). Include "← Back to home" link above the card. Logo: `logo-horizontal.png` at **112px** height.

Register adds **company name**, **website**, **use case** (industry), and **estimated events/month** fields. On successful sign-up, calls `supabase.auth.getUser()` to get the new user ID, then updates the org `name` (and `website` if provided) that was auto-created by the DB trigger.

**USE_CASES** (industry dropdown): Startup, Marketplace, Fintech / Payments, SaaS Platform, Crypto / Web3, Ticketing / Events, Community / Social, Affiliate / Referrals, Digital Products, AI SaaS, Other.

**Invite-only gate**: controlled by `VITE_INVITE_ONLY_MODE` env var (default: `false`). When `false`, invite code field is hidden and signup proceeds without a code, setting `plan_source = 'self_signup'`. When `true`, invite code is required and validated via `/api/beta/validate-invite`. Flag exported from `src/lib/featureFlags.ts`.

**v25 migration** (`supabase/migrations/v25_plan_source_self_signup.sql`): adds `'self_signup'` to the `plan_source` CHECK constraint on `organizations`.

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
- Set `REDIS_COUNTERS_ENABLED=true` in Vercel — **primary remaining gate**. Activates Redis-first `fetchContext()` reads (~5-15ms vs ~400-600ms RPC). Controls ONLY the read path (line ~263 of check.ts). Redis writes (writeFraudCounters, keyCache, orgStats, rateLimit) are always active when UPSTASH env vars are set. Activate after 24-48h of dual-write warm-up. Absence of this env var is the root cause of max latency spikes (cold start + RPC = 1500-2200ms total).

**Go Live Monitor (Phase 4.0 observability — implemented):**
- `GET /api/admin/monitoring/go-live` — operational health snapshot ✅
- `GET /api/admin/monitoring/slow-requests` — slow request audit table ✅
- `GET /api/admin/monitoring/pipeline-health` — derived table health ✅
- Infrastructure.tsx Go Live tab ✅

**Intelligence Layer — Phase 3 activation:**
- Run `supabase/migrations/v19_intelligence_layer.sql` (4 sections A–D separately in SQL editor) — creates `fraud_labels`, `fraud_features`, `entity_reputation` tables and `increment_entity_reputation()` RPC.
- Set `FEATURE_STORE_ENABLED=true` in Vercel — activates `persistFeatures()` writes to `fraud_features` table.
- After 24–48h warm-up (labels accumulating), Analytics Intelligence section populates automatically.
- ML training (Phase 3.5): gated on 10,000 labels + 50+ confirmed_fraud labels — status shown in Training Readiness panel.
- `REPUTATION_ENRICHMENT_ENABLED=true` — phase 3.5 gate to read entity reputation in the `/api/risk/check` hot path.

**Phase 3 — Implemented:**
- `POST /api/risk/label` — ground-truth fraud label submission (Phase 3.1/3.2). **Dual auth**: detects JWT vs API key by counting dots in the token (`(token.match(/\./g) ?? []).length === 2` → JWT). JWT path resolves `organization_id` via `profiles.user_id`; API key path unchanged. Uses `.upsert({ ... }, { onConflict: 'organization_id,risk_event_id' })` so relabeling the same event updates in place rather than inserting a duplicate. Returns HTTP 200 (not 201).
- `api/_lib/gnxScore.ts` — `computeGnxScore()` — deterministic 0–1000 score, written to `risk_events.gnx_score` + `gnx_score_factors` JSONB + `gnx_version TEXT` fire-and-forget (Phase 3.0, v2 upgraded, columns added by `v24_gnx_score_v2.sql` — not v19). GNX v2 uses a **13-feature weighted linear model** (`GNX_VERSION = 'v2'`): `fraud_score_base` (0.30), `user_velocity` (0.07), `ip_velocity` (0.07), `device_velocity` (0.05), `email_reputation` (0.09, inverted), `ip_reputation` (0.06, inverted), `device_reputation` (0.06, binary), `signup_rate` (0.06), `repeated_device` (0.04), `repeated_email` (0.03), `critical_signal` (0.07), `high_signal` (0.06), `medium_signal` (0.04) — weights sum to 1.00, followed by a **post-sum, non-weighted** `trust_factor` (1.2×, up to −120pts at `trust_score=100`). Returns `GnxResult { score, top_factors[], version }`. Stores per-factor breakdown in `gnx_score_factors` JSONB for explainability. Clamped to [0, 1000]. **Correction (2026-07-28):** an earlier version of this doc described a different, non-matching feature set (`trust_score_base`, `critical_signals`, `device_prior_block`, etc.) — none of those names/weights exist in the shipped code; see `docs/mps/04-risk-cloud.md` Sec. 7–8 / TD-0012.
- `api/_lib/featureExtractor.ts` — `extractFeatures()` — derives **20 features** across 5 groups (velocity: 3, reputation: 3, behavior: 7, risk: 3, context: 4) with `feature_group`, `feature_version`, `source` (Phase 3.3). **Correction (2026-07-28):** previously stated as "17 features" — recounted at 20; see TD-0013.
- `api/_lib/featureStore.ts` — `persistFeatures()` — writes extracted feature vectors to `fraud_features` fire-and-forget (Phase 3.3), gated by `FEATURE_STORE_ENABLED`. All errors caught and forwarded to `captureException` (never silent-swallowed).
- `api/_lib/datasetBuilder.ts` — `buildTrainingDataset()` — joins risk_events + fraud_features into `training_dataset` fire-and-forget (Phase 3.6), gated by `DATASET_BUILDER_ENABLED`. Uses `.upsert({ ... }, { onConflict: 'organization_id,risk_event_id' })` so relabeling an event updates the training row rather than inserting a duplicate. All errors caught and forwarded to `captureException`.
- `api/_lib/reputationNetwork.ts` — `updateEntityReputation()` / `getEntityReputation()` — atomic cross-org reputation via PostgreSQL RPC (Phase 3.5). Both catch blocks use `captureException` (previously silent).
- `api/_lib/shadowPredictor.ts` — `predictShadow(features[])` — pure function, deterministic heuristic model shadow-v1, returns `{ prediction: block|review|allow, prediction_score, confidence, model_name, model_version }` (Phase 3.7)
- `api/_lib/mlPredictionStore.ts` — `savePrediction()`, `getPredictions()`, `getAgreementStats()`, `getModelStats()`, `runShadowPrediction()` — all persistence for ML shadow pipeline; `agreement` computed at write time as `prediction === engineDecision` (Phase 3.7)
- `GET /api/admin/intelligence/summary` — aggregated Feedback Loop + GNX distribution + fraud trends + top patterns + training readiness
- `GET /api/admin/intelligence/features?days=N&feature_name=&feature_group=` — Feature Store audit (Phase 3.3)
- `GET /api/admin/intelligence/dataset/stats` — Training Dataset stats, readiness score 0–100 (Phase 3.6)
- `GET /api/admin/intelligence/dataset/export?format=json|csv` — Training dataset export, max 50k rows (Phase 3.6)
- `GET /api/admin/ml/summary?days=N` — ML Shadow summary: total_predictions, agreement_rate, coverage_rate, accuracy/precision/recall/f1_score (null until labels exist), model_name, model_version (Phase 3.7)
- `GET /api/admin/ml/disagreements?page=N&limit=N&days=N` — Paginated disagreements: official_decision, shadow_prediction, confidence (Phase 3.7)
- `GET /api/admin/ml/features?model=shadow-v1` — Feature weights from feature_importance table: `[{ feature, weight }]` (Phase 3.7)
- `api/admin/intelligence/ml/stats.ts` — **DELETED** (stale Phase 3.7 endpoint from first iteration; not referenced by any route). **Note (2026-07-28):** the endpoint was deleted, but `api/_lib/mlShadowRunner.ts` — the library it depended on — was **not** removed and remains orphaned dead code, writing to the incompatible `v22_ml_shadow.sql` schema (superseded by `v22_ml_predictions.sql`/`mlPredictionStore.ts`, which is what's actually live). See TD-0003.
- `GET /api/admin/monitoring/go-live` — Owner-only. Post-Go Live operational health snapshot. Aggregates: `api_health` (24h event totals, decision breakdown, today Redis stats), `latency` (avg today + 7-day trend from `org_daily_stats`), `gnx_health` (v2 coverage, null rate, score band distribution), `redis_health` (connected, fraud_counters_enabled, context_path), `sentry_enabled` (SENTRY_DSN flag), `slow_count_24h` (audit_logs count), `go_live_status` (healthy/warning/critical with reasons[]). Status escalation: critical gates = Redis down, gnx_null_rate > 5%, avg_latency ≥ 1500ms; warning gates = gnx_null_rate > 0%, REDIS_COUNTERS_ENABLED off, avg_latency ≥ 800ms, slow_count > 10.
- `GET /api/admin/monitoring/slow-requests?limit=20` — Owner-only. Last N requests where total_ms > 1000ms. Reads `audit_logs` WHERE `event_type = 'risk.check.slow'` (written fire-and-forget by check.ts). Returns per-request step breakdown: key_ms, org_ms, rate_ms, monthly_ms, context_ms, engine_ms, gnx_ms, persist_ms, plus cold_start, context_path.
- `GET /api/admin/monitoring/pipeline-health` — Owner-only. Row counts for all 5 derived pipeline tables in last 24h: risk_events, fraud_labels, fraud_features, training_dataset, ml_predictions. Returns `status: 'migration_pending'` (error code `42P01`) for tables not yet created — never crashes on missing tables.
- Analytics.tsx — Intelligence Layer overview + Feedback Loop + Fraud Analytics + Training Readiness + Feature Store (Phase 3.3) + Training Dataset (Phase 3.6) sections
- `src/pages/dashboard/ML.tsx` — Machine Learning dashboard at `/dashboard/ml`: ML Readiness, Shadow Performance, Agreement Analysis, Prediction Coverage, Feature Importance, Dataset Health (Phase 3.7)

**ML Shadow Mode — activation steps (Phase 3.7):**
1. Apply `supabase/migrations/v22_ml_predictions.sql` Section A, then Section B in Supabase SQL editor
2. Set `ML_SHADOW_ENABLED=true` in Vercel environment variables
3. Every `/api/risk/check` call now generates a shadow prediction fire-and-forget
4. `/dashboard/ml` populates in real time

**engineDecision vs liveDecision note:** In shadow mode, `liveDecision = 'allow'` always. `runShadowPrediction()` receives `suggestedDecision` (engine's true intent before shadow override) as `engineDecision` so agreement calculation is meaningful even in shadow mode.

**Deferred (Phase 3.8+):**
- Hybrid Decision Engine — gated on ML shadow mode agreement ≥ 80% + coverage ≥ 95%
- Real ML model training pipeline — gated on 100k events + 10k labels
- `GET /api/risk/reputation` — client-facing entity reputation lookup
- `api/_lib/aiCopilot.ts` — richer AI Copilot per-event investigation summary

**Features:**
- Invite team members: works end-to-end but requires running the `pending_invites` SQL migration in Supabase first.
- Stripe billing: API endpoints ready — requires adding Stripe env vars to Vercel and running the `stripe_customer_id` migration.
- Password reset: fully functional via Supabase email.
- Blog: 3 real articles live at `/blog/:slug`.
- Invite flow to same org: currently new invited users are assigned to the invited org via the `/join` page, but the auto-created org from the DB trigger remains. A cleanup step (deleting the auto-created org) can be added later.
- Rules cache invalidation: `Rules.tsx` mutations (create/update/delete/toggle) should call `invalidateCachedRules(orgId)` via a new API endpoint so rule changes take effect immediately instead of after the 60s Redis TTL.

### Maintenance Scripts (`supabase/maintenance/`)

Local operational scripts for controlled database resets and validation. Never run in automated production pipelines.

- **`reset.mjs`** — Node.js controlled reset. Reads `.env.local` directly for credentials. Three phases: 1) Audit — row counts, duplicate detection per `(org_id, risk_event_id)`, live coverage calculation; 2) Cleanup — `DELETE` all rows from `fraud_labels`, `training_dataset`, `entity_reputation`, `ml_predictions`, writes `system.cleanup.controlled_reset` to `audit_logs`; 3) Validate — confirms tables are empty, runs 3-insert UPSERT idempotency test, confirms protected tables untouched. Run: `node supabase/maintenance/reset.mjs`.
- **`cleanup_reset.sql`** — SQL equivalent of Phase 2. Uses `TRUNCATE` on derived tables. Writes `system.cleanup.pre_reset` and `system.cleanup.post_reset` entries to `audit_logs`. Protected tables verified in STEP 6. Run each STEP block separately in the Supabase SQL editor.
- **`validate_constraints.sql`** — Post-cleanup integrity checks. V1: tables zeroed. V2: `fraud_labels_org_event_unique` UNIQUE active. V3: `training_dataset_org_event_unique` UNIQUE active. V4: `entity_reputation` UNIQUE active. V5: UPSERT idempotency via PL/pgSQL DO block (3 inserts → 1 row). V6: `fraud_labels` empty after test. V7: coverage = 0% baseline. V8: `ml_predictions` empty or non-existent.
- **`validate_after_tests.sql`** — Post-test verification after controlled sandbox runs. T1: coverage ≤ 100%. T2: 1 row per event in `fraud_labels`. T3: multi-event coverage correctness. T4: `training_dataset` dedup check. T5: `entity_reputation` counter plausibility. T6: full consolidated state summary.
- **`audit_contamination.sql`** — Pre-cleanup audit: duplicate detection, raw vs distinct-event coverage comparison, per-event label history.

**Protected tables** (never touched by maintenance scripts): `risk_events`, `users_checked`, `fraud_features`, `organizations`, `profiles`, `api_keys`, `rules`, `review_queue`, `webhooks`, `audit_logs`.

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

`useT()` is the runtime mirror of the CSS custom properties in `index.css` — **keep the two in lockstep.** Surfaces read canvas < recessed < surface < raised.

| Token | Light | Dark | Usage |
|---|---|---|---|
| `T.bg` | `#F4F6FA` | `#07080C` | Page canvas |
| `T.card` | `#FFFFFF` | `#0C0F16` | Primary surface |
| `T.deep` | `#EDF0F6` | `#090B10` | Recessed well inside a surface |
| `T.elevated` | `#E7EBF3` | `#141A26` | Hover / pressed fill |
| `T.raised` | `#FFFFFF` | `#111621` | Floating layer (menu, modal) |
| `T.border` | `#DEE3ED` | `#1B2230` | Standard hairline |
| `T.borderLight` | `#E8EBF3` | `#151B27` | Whisper divider |
| `T.borderStrong` | `#C7CEDD` | `#2A3346` | Emphasised edge |
| `T.text` | `#080B12` | `#ECF0FA` | Primary ink |
| `T.textSec` | `#59627A` | `#94A0B8` | Secondary ink |
| `T.textDim` | `#8B94AA` | `#626D85` | Tertiary / metadata |
| `T.trust` | `#16C784` | `#16C784` | Brand **fill** — charts, dots, meters |
| `T.trustText` | `#0A8F5D` | `#2DD79A` | Brand as **text** |
| `T.codeBg` | `#0A0D14` | `#07080C` | Code block bg (always dark) |

**Critical — brand green as text:** `T.trust` (`#16C784`) on white is ~2.1:1 and **fails WCAG AA**. Use `T.trustText` for any green *text*; keep `T.trust` for fills, icons and chart marks. The same split exists for every semantic tone: `success`/`successText`, `warning`/`warningText`, `danger`/`dangerText`, `info`/`infoText`, `accent`/`accentText` (accent = ML domain), plus the risk ladder `riskLow|riskMed|riskHigh|riskCrit` each with a `…T` text variant.

Also exported: `shSm|shMd|shLg` (elevation), `rXs…rFull` (radius), `dFast|dBase|dSlow` + `ease` (motion), `fDisplay|fBody|fMono` (type families), `hoverBg`, `overlay`.

Helper functions in the same module map domain values to colours so screens stop inventing thresholds: `riskFill()`, `riskInk()`, `decisionFill()`, `decisionInk()`, `trustInk()`, `fraudInk()`.

All dashboard and admin pages use `useT()`.

### AppLayout (`src/components/layout/AppLayout.tsx`)
Sidebar and header read `useT()` directly — the old local `S` token object was removed (it was a fourth competing source of truth). Sidebar sits on `T.card`, header on `T.headerBg` with a 12px backdrop blur. Header groups are: breadcrumb (left) — then environment badge, admin link, theme toggle (right), separated by a single divider.

### CSS (`src/index.css`)
`:root` defines **light-mode defaults** for CSS vars (`--c-bg: #F4F6FA`, etc.); `[data-theme="dark"]` overrides them. An `@theme` block binds Tailwind's radius scale to the design system (`rounded-lg` = 8px, `rounded-xl` = 10px = card radius) so utilities and tokens cannot drift apart.

**Fonts:** body is **DM Sans** (`--f-body`), headings and metrics are **Inter Tight** (`--f-display`), data and code are **IBM Plex Mono** (`--f-mono`) — all three loaded in `index.html`. **Inter (plain) is NOT loaded** — never write `fontFamily: 'Inter, sans-serif'`; it silently falls back to generic sans-serif.

Utility classes: surfaces `.g-card` `.g-well` `.g-raised` `.g-panel`; buttons `.btn` + `.btn-{primary|secondary|ghost|danger}` + `.btn-{sm|lg|icon|block}` (legacy `.btn-trust` / `.btn-outline` still work); type scale `.t-{display|title|section|subhead|body|meta|caption|label}` and `.t-metric{|-sm|-lg}`; also `.g-table`, `.g-empty`, `.g-meter`, `.g-code`, `.g-scroll`, `.seg`, `.skeleton`, `.badge-*`, `.mono`, `.num`, `.sr-only`.

A global `:focus-visible` ring and a `prefers-reduced-motion` block are defined once here and apply product-wide.

### Public pages (light)
Landing, Login, Register use a light palette defined as the `C` constant in `Landing.tsx`. These pages are always light regardless of the global theme toggle.

CSS utility classes (defined in `index.css`): `.g-card`, `.g-card-hover`, `.btn-trust`, `.btn-outline`, `.trust-pill`, `.nav-item`, `.g-input`, `.badge-{low|medium|high|critical}`, `.badge-{allow|review|block}`, `.mono`, `.pulse-dot`, `.scan-anim`, `.anim-{0-5}`.

Fonts loaded from Google Fonts: **Inter** (UI/headings, all weights 300–800) + **IBM Plex Mono** (data, code, numbers). Applied via `font-family` in CSS or `.mono` class.

## Language

All UI text is in **English**. Data fields use English enum values matching the DB schema.

## Master Product Specification (MPS)

`docs/mps/` contains the Genuinux Master Product Specification — a living **architecture documentation suite**, separate from this file. It is documentation only: no code, no migrations. Read the relevant volume before making cross-domain architectural decisions; **prefer it over this file** wherever the two disagree on architecture-level facts (this file documents implementation details; the MPS volumes document audited architecture and are updated to correct drift when found).

| File | Content |
|---|---|
| `01-vision-product-strategy.md` | Mission, positioning, ICP, personas, competitive analysis, strategic roadmap |
| `02-platform-architecture.md` | Domain map, Unified Entity Graph, Event Bus, modular-monolith-vs-microservices decision, multi-tenancy |
| `03-identity-cloud.md` | Identity Cloud target design (KYC-adjacent identity verification, OCR, biometrics, wallet) — **not yet built** |
| `04-risk-cloud.md` | Risk Cloud — includes a full source-code audit of what's actually in production, correcting several inaccuracies this file used to state (see the "Correction (2026-07-28)" notes above) |
| `05-compliance-cloud.md` | Compliance Cloud target design (KYC/KYB/AML/sanctions/PEP/case management as a jurisdiction-agnostic "Compliance Operating System") — **not yet built** |
| `architecture-backlog.md` | Canonical technical debt register (67 items as of 2026-07-28) — every known gap, bug, and inconsistency across the platform, prioritized P0–P3 |
| `pre-volume-06-review.md` | Cross-volume consistency audit performed before starting Volume 6 |

**Volume 6 (Trust Cloud) is pending** — not yet written. Volumes 7–12 (Developer Platform, Data & ML, Security, Administration, Commercial, Master Roadmap) are not yet started.

**If you fix any of the corrections noted above** (GNX v2 formula, feature count, block threshold, `riskEngine.ts` duplication, `mlShadowRunner.ts` dead code, rules cache invalidation, marketing copy), update the corresponding item's `Status` in `architecture-backlog.md` to `Resolved` — don't just delete the row.

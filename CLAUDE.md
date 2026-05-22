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
- **Upstash Redis** (`@upstash/redis` + `@upstash/ratelimit`) — per-API-key sliding window rate limiting
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
# UPSTASH_REDIS_REST_URL=...    # required for rate limiting (Upstash console)
# UPSTASH_REDIS_REST_TOKEN=...  # required for rate limiting (Upstash console)
```

`SUPABASE_SERVICE_ROLE_KEY` is required by Vercel serverless functions. It bypasses RLS — never expose it to the frontend.

`RESEND_API_KEY` is optional — invite creation still works without it, email is simply skipped (graceful degradation). Never expose it to the frontend.

`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are required for rate limiting in `api/_lib/rateLimit.ts`. Without them the rate limiter is bypassed (requests always pass through).

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

Evaluated in `applyCustomRules()` inside `api/risk/check.ts` (step 4.5 in the handler). Rules fetched from `rules` table ordered by `created_at ASC` — oldest first.

`condition_value` stored as `"operator:value"` string (e.g. `"gt:80"`, `"eq:BR"`).

Supported condition types: `fraud_score`, `trust_score`, `risk_level`, `event_type`, `country`, `ip_user_count_1h`, `ip_signup_count_1h`, `device_user_count`.

### API Endpoints (`api/`)

**`POST /api/risk/check`** — Production endpoint for client integrations.
- Auth: `Authorization: Bearer <api_key>` — key is SHA-256 hashed and matched against `api_keys.key_hash`
- Fetches 6 parallel historical context queries from Supabase
- Runs `analyze()` from risk engine, then evaluates custom rules (`applyCustomRules`)
- Upserts `users_checked`, inserts `risk_events`
- Fire-and-forget: `review_queue` (if decision=review) + webhook dispatch with HMAC-SHA256 signature (`X-Genuinux-Signature: sha256=<sig>`)
- Webhook dispatch logs to `webhook_deliveries` (fire-and-forget, table optional)
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

### Dashboard Pages

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

**`Ops.tsx`** — Owner-only operations dashboard. Shows service health, DB metrics, cron schedule, load-test flags, and beta invite management. Beta invites section: create form, active invite rows with copy-code / copy-invite-link / resend-email buttons and email-sent badge, used/expired/revoked archive.

### Email (`api/_lib/`)
- `email.ts` — `sendInviteEmail({ to, inviteCode, expiresAt, note? })` — wraps Resend SDK. Returns `{ sent, error? }`, never throws. Gracefully skips if `RESEND_API_KEY` is not set.
- `emailTemplates.ts` — `betaInviteHtml()` + `betaInviteText()` — inline-styled HTML email + plain text fallback. Params: `{ to, inviteCode, expiresAt, signupUrl, note? }`.

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
- Invite team members: works end-to-end but requires running the `pending_invites` SQL migration in Supabase first.
- Stripe billing: API endpoints ready — requires adding Stripe env vars to Vercel and running the `stripe_customer_id` migration.
- Password reset: fully functional via Supabase email.
- Blog: 3 real articles live at `/blog/:slug`.
- Invite flow to same org: currently new invited users are assigned to the invited org via the `/join` page, but the auto-created org from the DB trigger remains. A cleanup step (deleting the auto-created org) can be added later.
- Stripe billing: "Contact us" button on Enterprise plan (links to `billing@genuinux.io`).
- Blog: more posts, search/filter, RSS feed.

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

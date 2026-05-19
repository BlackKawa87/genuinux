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
- **Vercel** deployment — `vercel.json` rewrites non-API paths to `/index.html`

## Environment Variables

Copy `.env.example` → `.env.local`:
```
VITE_SUPABASE_URL=...          # exposed to browser (Vite prefix required)
VITE_SUPABASE_ANON_KEY=...     # exposed to browser
SUPABASE_SERVICE_ROLE_KEY=...  # server-side only — never expose to frontend
# SUPABASE_URL=...             # optional; API functions prefer this over VITE_SUPABASE_URL
# OPENAI_API_KEY=...           # optional; enables GPT-4o-mini AI summaries
```

`SUPABASE_SERVICE_ROLE_KEY` is required by Vercel serverless functions. It bypasses RLS — never expose it to the frontend.

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

RLS helpers: `current_org_id()` and `current_user_role()` (SECURITY DEFINER functions).

Role matrix: owner > admin > member. Only owners can manage API keys and webhooks.

Audit logs: Written by the frontend for key actions — `api_key.created`, `api_key.revoked`, `rule.created`, `rule.updated`, `rule.deleted`, `webhook.created`, `webhook.updated`, `webhook.deleted`, `org.updated`, `review.*`. Requires the v4 `audit_logs_insert` RLS policy to be in place.

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

### Components
- `src/components/layout/AppLayout.tsx` — fixed 220px sidebar + sticky 52px top header with breadcrumb and org/plan badge. NAV_TOP has 7 items: Overview, Risk Events, Users, Review Queue, Rules, API Keys, Webhooks.
- `src/components/ProtectedRoute.tsx` — auth guard, shows spinner while loading

### GitHub & Deployment
- **GitHub**: `https://github.com/BlackKawa87/genuinux`
- **Vercel**: `https://genuinux.vercel.app` (auto-deploys on push to `main`)
- **Auto-sync hook**: `.claude/settings.json` Stop hook runs `.claude/sync.sh` after every Claude session — commits staged changes, pushes to GitHub, deploys to Vercel production. `VERCEL_TOKEN` is stored in the gitignored `.claude/settings.local.json`.

### Public Pages
- `/demo` — `Demo.tsx` — Client-side risk engine demo with 5 presets. Runs `analyze()` in-browser, no auth required.
- `/docs` — `Docs.tsx` — Full API reference with 12 sections, code blocks, copy buttons. No auth required.

### Logo Assets (`public/`)
Two logo files served statically from `/public/`:
- `logo-full.png` — circular icon + "GENUINUX" text (vertical/stacked layout). Used everywhere the logo+name appears.
- `logo-icon.png` — circular icon only. Reserved for icon-only contexts.

Usage pattern:
- **Light backgrounds** (Landing navbar, Login, Register): `<img src="/logo-full.png" style={{ height: 'Xpx' }} />`
- **Dark backgrounds** (AppLayout sidebar, Demo, Docs, Landing footer): `<img src="/logo-full.png" style={{ height: 'Xpx', filter: 'brightness(0) invert(1)' }} />`

Current heights: navbar 88px, footer 96px, Login/Register 140px, Demo 80px, Docs sidebar 88px, AppLayout sidebar 88px.

### Landing Page (`src/pages/Landing.tsx`)
Full redesign — light mode (`#F8FAFC` bg). Key sections with anchor IDs:
- `id="product"` — Platform Overview (mock dashboard + module list)
- `id="developers"` — How It Works (3-step integration with dark code cards)
- `id="pricing"` — 3 plans: Free / Growth / Enterprise (no prices, "Contact us" CTAs)
- `id="blog"` — 3 placeholder cards with "Coming soon" badges

Nav links use smooth scroll via `document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })`. Mobile hamburger menu included.

No fake metrics — "Built for scale" strip uses only real product claims: `< 50ms` latency, `300+` signals, `7` event types, `1 API call`.

Removed: fake testimonials (Sarah Chen / Marcus Reyes / Anya Patel), fake client counts (500+, $2B+, 99.7%, 99.9% uptime). Replaced with "Built for the teams who own trust" role cards.

### Login (`src/pages/Login.tsx`) & Register (`src/pages/Register.tsx`)
Both in **light mode** (`#F8FAFC` bg, `#FFFFFF` card with soft shadow). No dark grid.

Register adds **company name** and **website** fields. On successful sign-up, calls `supabase.auth.getUser()` to get the new user ID, then updates the org `name` (and `website` if provided) that was auto-created by the DB trigger.

### Pending / Not Yet Built
- Invite team members flow in Settings → Team (shows "Coming Soon" banner).
- Stripe billing integration in Settings → Billing (placeholder).
- Password reset flow (Login has "Forgot?" link with `href="#"`).
- Blog posts (3 placeholder cards live at `#blog`).

## TypeScript Config

Strict mode + `noUnusedLocals` + `noUnusedParameters` — unused imports cause build failures.

## Design System

### Dashboard (dark)
Colors as **inline `style` props**:

| Token | Value | Usage |
|---|---|---|
| `--c-bg` | `#050B14` | Page background |
| `--c-card` | `#0B1220` | Cards |
| `--c-deep` | `#07111F` | Sidebar |
| `--c-elevated` | `#0F1929` | Card hover state |
| `--c-border` | `#1E2D3D` | All borders |
| `--c-trust` | `#16C784` | Primary accent (green) |
| `--c-muted` | `#94A3B8` | Secondary text |
| `--c-dimmed` | `#475569` | Disabled/tertiary |

### Public pages (light)
Landing, Login, Register use a light palette defined as the `C` constant in `Landing.tsx`:

| Token | Value | Usage |
|---|---|---|
| `C.bg` | `#F8FAFC` | Page background |
| `C.surface` | `#FFFFFF` | Cards |
| `C.border` | `#E2E8F0` | Borders |
| `C.text` | `#0F172A` | Primary text |
| `C.textSec` | `#64748B` | Secondary text |
| `C.trust` | `#16C784` | Accent green |
| `C.dark` | `#0F172A` | Dark CTA sections |

CSS utility classes (defined in `index.css`): `.g-card`, `.g-card-hover`, `.btn-trust`, `.btn-outline`, `.trust-pill`, `.nav-item`, `.g-input`, `.badge-{low|medium|high|critical}`, `.badge-{allow|review|block}`, `.mono`, `.pulse-dot`, `.scan-anim`, `.anim-{0-5}`.

Fonts loaded from Google Fonts: **Syne** (UI/headings) + **IBM Plex Mono** (data, code, numbers). Applied via `font-family` in CSS or `.mono` class.

## Language

All UI text is in **English**. Data fields use English enum values matching the DB schema.

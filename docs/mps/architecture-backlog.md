# GENUINUX — ARCHITECTURE BACKLOG & TECHNICAL DEBT REGISTER

**Status:** Living document — updated continuously, not a versioned MPS volume.
**Owner:** Principal Software Architect function.
**Scope:** Consolidates every technical debt item, architectural risk, structural bug, and improvement opportunity identified across architecture audits, code review, MPS volume elaboration, and (once performed) load testing and production operation.
**Rules governing this document:**
1. Never remove history — resolved items are marked `Resolved`, never deleted.
2. Never delete a resolved item; keep it visible with its resolution date.
3. Every item is cross-referenced to an ADR when one exists.
4. Every item references the MPS Volume where it was identified.
5. This document is updated at the end of every new MPS Volume.
6. Temporary development bugs are **not** recorded here — only architectural or structural issues.
7. Technical debt is explicitly distinguished from planned evolution (see note in Executive Summary).

---

## Table of Contents

1. Executive Summary
2. Architecture Debt Register (canonical source — TD-0001 to TD-0055)
3. Production Risks
4. Security Backlog
5. Performance Backlog
6. Scalability Backlog
7. Product Gaps
8. Documentation Gaps
9. Architectural Decisions Pending
10. Go Live Improvements (30 / 90 / 180 / 365 days)
11. Roadmap by Priority (P0–P3)
12. Changelog

> **Sections 3–9 are curated views, not a second source of truth.** Every item in those sections references a `TD-####` ID defined once, in full, in Section 2. This avoids duplicating the same debt under multiple descriptions as the document grows.

---

## 1. Executive Summary

**Source material:** audit of Volumes 1–4 of the Genuinux Master Product Specification, including the direct source-code audit performed for Volume 4 (Risk Cloud) and the operational fix applied to `.claude/settings.json`/`sync.sh` during this session.

**Total items registered:** 67 (TD-0001–TD-0067)

| Severity | Count | % of total |
|---|---|---|
| Critical | 4 | 6% |
| High | 18 | 27% |
| Medium | 28 | 42% |
| Low | 17 | 25% |

**Trend:** Stable/growing as expected — the register grew from 55 (post-Volume 4) to 59 (post-Volume 5) to 67 (post pre-Volume-6 consolidation review). The consolidation pass surfaced 8 new items, two of them High-priority and directly load-bearing for Volume 6: TD-0061 (undefined Trust Cloud module naming boundaries) and TD-0064 (an unresolved contradiction between Volume 2 and Volume 4 on whether Risk Cloud consumes Trust Cloud events). No items have moved to `Resolved` yet, since no remediation work has been executed between volumes. Trend tracking continues with each subsequent Changelog entry (Section 12).

**Important distinction (Rule 7):** of the 55 items, roughly a third (`TD-0009` through `TD-0011`, `TD-0021`–`TD-0024`, `TD-0034`–`TD-0044`, and others marked "gated"/"by design" below) are **planned evolution**, not technical debt in the strict sense — they are capabilities the MPS volumes deliberately deferred with an explicit trigger condition (e.g. ADR-004/ADR-006 of Volume 2's anti-speculation principle). They are included here because they are real gaps a reader of the codebase would otherwise have to rediscover, but they should not be read with the same urgency as a genuine defect like `TD-0001`.

**Principal risks (top 5, see Section 11 for full P0 list):**
1. **TD-0001** — a confirmed runtime bug (`persistMs` used before declaration in `api/risk/check.ts`) silently breaks the platform's own slow-request observability.
2. **TD-0018** — no durable delivery guarantee for the two most critical fire-and-forget writes (`insertRiskEvent`, `review_queue` insert) — a serverless function termination between response and persistence silently loses a risk event.
3. **TD-0017** — public marketing claims (device fingerprinting, "300+ signals", proxy/VPN detection) materially exceed real capability — credibility and potential regulatory exposure.
4. **TD-0041/TD-0042** — Identity Cloud and Compliance Cloud are entirely unbuilt, blocking two of the four Clouds promised in the Volume 1 positioning.
5. **TD-0045** — absence of SOC 2 / ISO 27001 certification blocks the Enterprise ICP defined in Volume 1.

---

## 2. Architecture Debt Register

> Canonical register. Every subsequent section in this document points back here by ID. Complexity: Low / Medium / High. Effort is a rough order-of-magnitude estimate, not a committed estimate.

| ID | Title | Domain | Vol. | Evidence | Description | Impact | Risk | Priority | Complexity | Effort | Dependencies | Proposed Solution | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TD-0001 | `persistMs` used before declaration (TDZ bug) | Risk Cloud | 4 | `api/risk/check.ts`, slow-request block | `const persistMs` is read 18 lines before its declaration inside the `total_ms > 1000` block | Slow-request diagnostics (`risk.check.slow` audit log + Sentry warning) silently never fire | Blind spot in the platform's own performance observability | **P0** | Low | <1h | None | Move the `const persistMs` declaration before its first use | Open |
| TD-0002 | `invalidateCachedRules` never called | Risk Cloud | 4 | `api/_lib/keyCache.ts:120`, `src/pages/dashboard/Rules.tsx` | Function exists but has zero callers; `Rules.tsx` writes directly to Supabase | Rule changes take up to 60s (cache TTL) to take effect | Perceived unreliability of a core product feature | P0 | Low-Medium | Few hours | None | Call `invalidateCachedRules(orgId)` from every rule create/update/toggle/delete path | Open |
| TD-0003 | `api/_lib/mlShadowRunner.ts` orphaned dead code | Risk Cloud | 4 | Zero references repo-wide; writes to `v22_ml_shadow.sql` schema | Earlier shadow-mode implementation superseded by `mlPredictionStore.ts`, never removed | Maintenance surface, confusion for new contributors | Low | P2 | Low | <1h | Confirm zero references before deletion | Delete file + retire `v22_ml_shadow.sql` in next migration cleanup | Open |
| TD-0004 | `riskEngine.ts` manually duplicated | Risk Cloud / Platform Architecture | 2, 4 | `src/lib/riskEngine.ts` vs `api/_lib/riskEngine.ts` | Byte-identical hand copy, not a re-export | Silent drift risk on future edits to either file | Medium | P1 | Medium | Few hours | ESM import rules (CLAUDE.md) for bundled vs. non-bundled `api/` functions | Single source of truth, imported (not copied) by both consumers | Open |
| TD-0005 | Duplicate migration version numbers (`v22`, `v24`) | Risk Cloud | 4 | `v22_ml_predictions.sql` vs `v22_ml_shadow.sql`; `v24_admin_console.sql` vs `v24_gnx_score_v2.sql` | Two files each share a version number, one pair with conflicting DDL | Operational confusion during schema review | Low | P3 | Low | <1h | TD-0003 resolved first | Renumber to next free version numbers | Open |
| TD-0006 | `api/` has zero TypeScript build-time checking | Platform Architecture | 2, 4 | `tsconfig.json` `include: ["src"]` only | All Vercel serverless functions are type-erased by esbuild with no `tsc --noEmit` gate | Structural root cause of reference bugs (incl. TD-0001's class of error) | High | P0 | Medium | 1–2 days (may surface latent errors) | None | Extend `tsconfig` (or add a second config) to cover `api/`, add to build/CI gate | Open |
| TD-0007 | `entity_reputation` has no `organization_id` / RLS | Risk Cloud | 2, 4 | `entity_reputation` table (v19) | Deliberate exception to RN-A02 (Vol. 2) — table is global by design | Cross-tenant reputation influence possible; blocks safe activation of TD-0008 | High | P1 | High | Design + migration | ADR-024 (confidence-weighting mechanism) | Formal security review in Volume 9; either scope by org or introduce confidence-weighted global model | Open |
| TD-0008 | Entity Reputation read path not wired to hot path | Risk Cloud | 4 | `getEntityReputation()` unused; `REPUTATION_ENRICHMENT_ENABLED` only in a code comment | Reputation is written on every label but never read back into `fetchContext()` | Paid-for infrastructure sits unused; GNX Score misses a reputation signal | High | P1 | Medium | Days | **Blocked by TD-0007** (ADR-024) | Implement real `process.env` gate, wire into `fetchContext()` once TD-0007 mitigated | Open |
| TD-0009 | IP Intelligence / Proxy / VPN / Tor / ASN not implemented | Risk Cloud | 4 | `metadata.proxy/vpn/tor` trusted as client-declared; static 6-country list | System has no independent network intelligence | Trivially evadable; largest credibility gap found in audit | High | **P0** (business credibility) | Medium | Vendor integration | Vendor selection (open question) | Async, cached integration with a third-party IP intelligence provider | Planned |
| TD-0010 | Device Fingerprinting not implemented | Risk Cloud | 4 | `device_id` is an opaque client-supplied string | No independent device identification | `device_id` trivially spoofable | Medium | P1 | Medium-High | SDK work | Volume 7 SDK | Build-vs-buy decision, client-side SDK integration | Planned |
| TD-0011 | Behavioural Biometrics not implemented | Risk Cloud | 4 | No keystroke/mouse/touch capture anywhere in repo | Only UA-string heuristics exist | Low | P3 | Medium-High | SDK work | TD-0010, Volume 7 | Evaluate only if high-risk vertical demand materializes | Planned |
| TD-0012 | CLAUDE.md documents an incorrect GNX v2 formula | Documentation | 4 | CLAUDE.md line ~535 vs. `api/_lib/gnxScore.ts` | Feature names/weights described do not exist in code at all | Medium | P1 | Low | <1h | None | Correct CLAUDE.md GNX v2 section (real formula now in MPS Vol. 4 Sec. 8) | Open |
| TD-0013 | CLAUDE.md states Feature Store has "17 features" | Documentation | 4 | `extractFeatures()` produces 20 | Undercounts by 3 | Low | P3 | Low | <1h | None | Correct CLAUDE.md | Open |
| TD-0014 | CLAUDE.md states block threshold is `fraud_score ≥ 70` | Documentation | 4 | Actual gate is `risk_level==='critical'` (`fraud_score ≥ 81`) | Could mislead integration decisions made from old docs | Medium | P1 | Low | <1h | None | Correct CLAUDE.md | Open |
| TD-0015 | CLAUDE.md calls `api/_lib/riskEngine.ts` a "re-export" | Documentation | 4 | It is a manual duplicate (see TD-0004) | Low | P3 | Low | <1h | TD-0004 | Correct wording once TD-0004 resolved, or immediately for accuracy | Open |
| TD-0016 | CLAUDE.md's dead-code cleanup claim is incomplete | Documentation | 4 | Claims `ml/stats.ts` deletion cleaned up Phase 3.7 stale code; `mlShadowRunner.ts` (TD-0003) was left behind | Low | P3 | Low | <1h | TD-0003 | Correct CLAUDE.md once TD-0003 resolved | Open |
| TD-0017 | Marketing claims exceed real capability | Documentation / Product / Legal | 4 | `src/pages/Landing.tsx` — "300+ signals", persistent cross-browser fingerprinting, emulator/rooted-device detection | Real signal count is 17 (engine) / 20 (feature store); no fingerprinting exists at all | High — potential misleading-advertising exposure | **P0** | Low (copy) or High (build) | Copy: hours. Build: see TD-0009/0010 | None | Either adjust marketing copy now, or accelerate TD-0009/TD-0010 first | Open |
| TD-0018 | No durable queue for critical fire-and-forget writes | Risk Cloud / Platform Architecture | 2, 4 | `insertRiskEvent`, `review_queue` insert both run fire-and-forget after `res.json()` | Function termination between response and write silently loses the event | **Data loss on the platform's core audit record** | **Critical** | **P0** | High | New infra | Broker choice (open question, Vol. 2/4) | Adopt durable queue (ADR-017) for these two writes specifically, before generalizing | Open |
| TD-0019 | No formal Disaster Recovery / multi-region strategy | Platform Architecture | 2 | Vol. 2 Sec. 17/26 | Single-region Supabase Postgres, no documented RPO/RTO | Blocks Enterprise ICP (Vol. 1) | High | P1 | High | Weeks | Vol. 9 certifications | Define DR strategy and RPO/RTO targets before any regulated Enterprise contract | Planned |
| TD-0020 | No circuit breaking for external synchronous integrations | Platform Architecture | 2 | Vol. 2 Sec. 17/26, reinforced by Vol. 3/4 | No formal pattern exists yet for any third-party call | Medium | P1 | Medium | Days | None | Standard circuit-breaker library/pattern before TD-0009/TD-0010 vendors go live | Planned |
| TD-0021 | Rules Engine lacks versioning/rollback/simulation/approval | Risk Cloud | 4 | Vol. 4 Sec. 10 | `UPDATE` overwrites without history; no dry-run endpoint | Medium | P2 | Medium | Days | `risk_rule_versions` table (Vol. 4 Sec. 15) | Add versioning table, `POST /v1/risk/simulate`, publish/approve workflow | Planned |
| TD-0022 | No GNX Score versioning/rollback mechanism | Risk Cloud | 4 | Vol. 4 Sec. 8.1, ADR-020 | Only `gnx_version='v2'` exists; no rollback path | Medium | P2 | Medium | Days | `risk_score_versions` table | Introduce shared version table for GNX + future ML model versions | Planned |
| TD-0023 | ML Shadow model lacks explainability | Risk Cloud | 4 | Vol. 4 Sec. 19 | Unlike GNX Score, shadow predictions don't persist per-factor breakdown | Medium | P2 | Medium | Days | Volume 8 | Persist factor breakdown analogous to `gnx_score_factors` | Planned |
| TD-0024 | No drift monitoring for ML shadow predictions | Risk Cloud | 4 | Vol. 4 Sec. 19/21 | No feature-distribution drift detection over time | Low | P2 | Medium | Days | Volume 8 | Define drift signal and threshold | Planned |
| TD-0025 | No p99 latency exposed in dashboards | Platform Architecture / Risk Cloud | 4 | Vol. 4 Sec. 13 — only p50/p95 shown | Raw data exists in `org_daily_stats`, just not surfaced | Low | P3 | Low | Hours | None | Add p99 to Performance tab | Planned |
| TD-0026 | No error budget tracking | Platform Architecture | 4 | Vol. 4 Sec. 13 | No formal SLO error-budget computation | Low | P3 | Low | Hours | TD-0025 | Compute and surface monthly error budget consumption | Planned |
| TD-0027 | No replay protection on `/risk/check` payloads | Security / Risk Cloud | 4 | Vol. 4 Sec. 20 | No nonce/timestamp expiry on payload | Medium | P2 | Medium | Days | Evaluate necessity first | Assess real-world exploitability before adding complexity | Open |
| TD-0028 | Audit log immutability not confirmed | Security | 4 | Vol. 4 Sec. 20 | No write-once/append-only protection confirmed on `audit_logs` | Medium | P1 | Medium | Days | Volume 9 | Evaluate append-only enforcement (DB-level or WORM storage) | Planned |
| TD-0029 | No model-extraction mitigation for fixed GNX weights | Security / Risk Cloud | 4 | Vol. 4 Sec. 8.1/20 | Deterministic fixed weights are reverse-engineerable via probing | Low | P2 | Medium | — | GNX v3 (TD-0022) | Dynamic calibration in GNX v3 reduces exposure | Planned |
| TD-0030 | No rule approval/publishing workflow (insider risk) | Security / Risk Cloud | 4 | Vol. 4 Sec. 10/20 | A malicious org member could create an always-approve rule | Medium | P2 | Medium | Days | Volume 9 RBAC, TD-0021 | Approval step before rule activation | Planned |
| TD-0031 | No real Event Bus (still fire-and-forget in-process platform-wide) | Platform Architecture | 2 | Vol. 2 Sec. 8.1 | No physical broker exists; every domain event is an implicit function call | High | P1 | High | Weeks | Broker choice | Adopt durable queue platform-wide (Vol. 2 Fase 2), building on TD-0018's narrower fix | Planned |
| TD-0032 | Public API is not versioned | Developer Platform / Risk Cloud | 4 | Vol. 4 Sec. 16 — real endpoint is `/api/risk/check`, target is `/v1/risk/check` | No version prefix or migration strategy exists | Medium | P1 | Medium | Days | Volume 7 | Introduce `/v1/` prefix with deprecation policy for `/api/` | Planned |
| TD-0033 | No standardized error format / request ID / correlation ID | Developer Platform | 4 | Vol. 4 Sec. 16 | Errors are ad-hoc per endpoint | Medium | P2 | Medium | Days | Volume 7 | Standard `{error:{code,message,request_id}}` contract | Planned |
| TD-0034 | No native graph database (by design) | Platform Architecture | 2 | ADR-007 | Entity Graph is relational + Redis; gate defined for deep-traversal trigger | Low | P3 | High | — | Volume 6 Trust Graph | Revisit only when traversal depth trigger (Vol. 2 Sec. 7.2) is met | Planned (conditional, by design) |
| TD-0035 | Merchant Risk module absent | Risk Cloud | 4 | Vol. 4 Sec. 7.20 | No sub-tenant "merchant" concept in schema | Relevant to Volume 1's marketplace ICP | Medium | P2 | Medium | Weeks | Real marketplace customer demand | Build only when a marketplace client requires it (anti-speculation, ADR-004) | Planned |
| TD-0036 | Account Takeover Detection not a dedicated module | Risk Cloud | 4 | Vol. 4 Sec. 7.18 | ATO is informally composed from device+velocity signals, no explicit logic | Medium | P1 | Medium | Days | None | Dedicated module over `event_type='login'` | Planned |
| TD-0037 | Bot Detection is trivially evadable | Risk Cloud | 4 | Vol. 4 Sec. 7.19 — `UA_AUTOMATION` substring match | Any bot changing its User-Agent bypasses detection | Medium | P2 | Medium | Days | TD-0010/TD-0011 | Behavioural challenge or fingerprinting-based detection | Planned |
| TD-0038 | Transaction Risk lacks a value-based risk curve | Risk Cloud | 4 | Vol. 4 Sec. 7.17 — binary `METADATA_HIGH_VALUE` only | No gradual risk scaling by transaction amount | Medium | P2 | Medium | Days | None | Parametrizable risk curve per organization/vertical | Planned |
| TD-0039 | Continuous Risk Score not implemented (gated) | Risk Cloud / Trust Cloud | 4 | ADR-013 | Boundary defined with Trust Cloud but neither side implements it yet | Low | P3 | High | — | Volume 6 | Implement once Trust Cloud (Vol. 6) exists | Planned (by design) |
| TD-0040 | Risk Evidence Store absent (gated) | Risk Cloud | 4 | Vol. 4 Sec. 7.23, ADR-019 | No dedicated evidence table; `signals_json` covers current need | Low | P3 | Medium | — | TD-0009 (external providers) | Build only once external providers produce payloads worth retaining | Planned (by design) |
| TD-0041 | Identity Cloud entirely unbuilt | Identity Cloud | 3 | Volume 3 — all 12 modules "a construir" | Zero of the 12 Identity Cloud modules exist in production | Blocks the "unified 4 Clouds" positioning of Volume 1 | **Critical** (product) | P0/P1 | Very High | Months | Vendor selection (ADR-008) | Execute Volume 3 roadmap starting with orchestrator + OCR + Face Match | Planned |
| TD-0042 | Compliance Cloud entirely unbuilt | Compliance Cloud | 1 | Volume 1 Sec. 12 — referenced, Volume 5 not yet written | No KYC/KYB/AML/sanctions capability exists | Blocks regulated verticals of the Volume 1 ICP | **Critical** (product) | P1 | Very High | Months | Data partnership decisions | Execute once Volume 5 is specified | Planned |
| TD-0043 | Trust Cloud entirely unbuilt | Trust Cloud | 1, 2, 4 | Only `entity_reputation` exists as an embryonic building block | No Trust Score, Trust Graph, or continuous monitoring product exists | High (product) | P2 | High | Months | Volume 6, TD-0007/0008 | Execute once Volume 6 is specified | Planned |
| TD-0044 | Identity Wallet deferred (by design) | Identity Cloud | 3 | ADR-011 | Deliberately not built until legal/consent design + critical mass of orgs exist | Low | P3 | High | — | Legal review (Vol. 1 Q3) | Revisit once legal design for cross-org consent exists | Planned (by design) |
| TD-0045 | SOC 2 / ISO 27001 certifications absent | Security / Business | 1 | Vol. 1 Sec. 19 | No formal security certification exists | Blocks Enterprise ICP entirely | High | P1 | High | Months | Volume 9 | Begin SOC 2 Type I process per Vol. 1 roadmap (12–24 months) | Planned |
| TD-0046 | Cold start latency detected, not eliminated | Platform Architecture | 2, 4 | `coldStart` flag logged, no mitigation beyond detection | Adds tail latency to first invocation after idle | Medium | P2 | Medium | — | Fase 3 service extraction (Vol. 2) | Mitigated naturally once long-running services replace pure serverless (Vol. 2 roadmap) | Planned |
| TD-0047 | Vendor/platform lock-in (Vercel + Supabase + Upstash) | Platform Architecture | 2 | No abstraction layer over any of the three | Migration cost if any vendor must be replaced | Low (near-term), Medium (10-year vision) | P3 | High | — | Vol. 1 10-year vision (Sec. 4) | Acceptable trade-off for velocity today; revisit only if a vendor becomes a blocker | Open |
| TD-0048 | Secrets stored in local Claude Code settings file | Security / DevOps | — (session observation) | `.claude/settings.local.json` holds `VERCEL_TOKEN` and other live tokens, gitignored | No centralized secrets manager; relies entirely on gitignore discipline | Medium | P1 | Medium | Days | None | Move to a proper secrets manager (Vercel env vars are already used for prod; this affects only the local automation token) | Open |
| TD-0049 | Object Storage encryption-at-rest not yet implemented (gated) | Identity Cloud / Security | 3 | ADR-010 — target design only, nothing built yet (TD-0041) | No documents exist yet to encrypt | Low | P3 | Medium | — | TD-0041 | Implement as part of Identity Cloud build, not before | Planned (by design) |
| TD-0050 | RBAC/IAM lacks a formal least-privilege audit | Security | 2 | `owner>admin>member` + `is_platform_admin` exist functionally, never formally audited | Medium | P2 | Medium | Days | Volume 9 | Formal least-privilege review as part of Volume 9 | Planned |
| TD-0051 | No formal data retention/deletion policy implemented | Security / Compliance | 3 | Vol. 3 Sec. 26 mentions "configurable retention" as a target RNF, not implemented | Medium | P2 | Medium | Weeks | TD-0041 (Identity Cloud) | Implement alongside Identity Cloud build | Planned |
| TD-0052 | No formal OWASP Top 10 audit performed | Security | 4 | Vol. 4 Sec. 20 — threat model drafted, not independently audited | High | P1 | Medium | Days | Volume 9 | Commission formal OWASP-aligned audit | Planned |
| TD-0053 | No dependency vulnerability scanning / SBOM process | Security | — (observation) | No documented `npm audit`/SBOM process in CI | Medium | P2 | Low | Hours | None | Add automated dependency scanning to CI | Open |
| TD-0054 | No documented load testing against the hot-path SLO | Platform Architecture / Risk Cloud | 4 | Vol. 4 Sec. 13 — p95 targets stated, never validated under realistic concurrent multi-tenant load | High | P1 | Medium | Days | None | Run and document a load test validating p95 < 200ms under target concurrency | Open |
| TD-0055 | Data residency strategy for regulated markets undefined | Platform Architecture | 1, 2 | Vol. 1 Sec. 19 Q4, Vol. 2 Fase 5 | No decision on per-region data storage for markets requiring local residency | Medium | P2 | High | — | Expansion timing (Vol. 1 roadmap) | Decide before any non-Brazil regulated-market contract | Open |
| TD-0056 | Marketing claims "AML, KYC" capability with zero implementation | Documentation | 5 | `src/pages/Landing.tsx:355` — Fintech & Banking vertical descriptor | Same overclaim pattern as TD-0017, now confirmed for the Compliance Cloud domain | High — credibility/legal exposure | High | **P0** | Low (copy) | Hours | None | Adjust marketing copy or accelerate Compliance Cloud Phase 1 (Vol. 5 Sec. 25) | Open |
| TD-0057 | GDPR/LGPD right-to-erasure conflicts with mandatory AML retention | Compliance Cloud | 5 | Vol. 5 Sec. 16, 8.25 | No architectural or legal resolution exists for this well-known tension | Non-compliance risk in either direction without a decision | High | P1 | High (legal, not just technical) | Weeks (legal review) | Formal legal opinion | Document AML retention as a lawful-basis exception to erasure requests, jurisdiction by jurisdiction | Open |
| TD-0058 | No regulatory data vendor selected (sanctions/PEP/adverse media/business registry) | Compliance Cloud | 5 | Vol. 5 Sec. 8.22 | Blocks all of Compliance Cloud Phase 1 | Blocks first regulated customer | High | P1 | Medium | Weeks (vendor evaluation) | Business decision | Commercial evaluation of regulatory data providers, mirroring TD-0009's IP Intelligence vendor process | Open |
| TD-0059 | Anti-tipping-off access control (SAR/investigation confidentiality) not designed | Compliance Cloud / Security | 5 | Vol. 5 Sec. 16 | No RLS/RBAC model yet prevents a case subject or unauthorized org member from learning of an investigation | Direct legal risk — tipping off is itself a criminal offense in many AML regimes | High | P1 | High | Design + Volume 9 RBAC | Volume 9 formal RBAC | Design case-assignment-scoped access control before any real case exists | Open |

| TD-0060 | Retention policy centralization (Compliance) not reconciled with hardcoded 365-day default already in production | Compliance Cloud / Risk Cloud | 2, 5 | `purge_old_risk_events(retention_days INTEGER DEFAULT 365)` (v17) vs. Vol. 5 Sec. 8.25 | Compliance's target retention policy has no mechanism yet to parameterize Risk Cloud's existing hardcoded purge default | Not a contradiction (target vs. production reality), but an unreconciled future integration point | Medium | P2 | Medium | Days, once Compliance Phase 2 begins | Compliance Cloud Phase 2 | Parameterize `purge_old_risk_events()` from Compliance-defined policy instead of a hardcoded constant | Open |
| TD-0061 | Trust Cloud module naming overlaps with existing Risk/Identity/Compliance modules, no boundary defined | Trust Cloud / Risk Cloud | 1, 4, 5 | Vol. 1 Sec. 12 ("Reputation Engine," "Trusted Devices/Businesses/Merchants/Users") vs. Vol. 4 7.16/7.20/7.6, Vol. 5 8.2 | No volume states how Trust Cloud's "Reputation Engine" differs from Risk Cloud's "Entity Reputation," or "Trusted Merchants" from "Merchant Risk," etc. | Volume 6 risks duplicating logic/data three other domains already own | High | **P0** | Medium | Design work, blocks Volume 6 scoping | None — must be resolved as Volume 6's opening decision | Volume 6 opens with an explicit boundary section for each of the four name-pairs, following the ADR-013 (Vol. 4) precedent | Open |
| TD-0062 | Event naming drift: Volume 2's anticipated canonical event names don't match what Volumes 4/5 actually shipped | Platform Architecture | 2, 4, 5 | `risk.event.evaluated` (Vol.2) vs. `risk.decision.created`+`risk.score.calculated` (Vol.4); `compliance.case.opened/resolved` (Vol.2) vs. `compliance.case.created`/`case.closed` (Vol.5) | A reader trusting Vol. 2 alone would build against non-existent event names | Medium — no functional conflict, later volumes are correct and authoritative | Medium | P2 | Low | Hours (doc note) | None | Mark Vol. 2 Sec. 8.2's table as superseded/illustrative in a future maintenance pass | Open |
| TD-0063 | 6 of Compliance Cloud's 13 events lack the `compliance.` namespace prefix used by the other 7 | Compliance Cloud | 5 | Vol. 5 Sec. 15 — `case.assigned`, `case.closed`, `policy.updated`, `report.generated`, `monitoring.triggered`, `evidence.attached` | Inconsistent with Identity's and Risk Cloud's fully-prefixed event convention; complicates domain-based event routing | Medium | P2 | Low | Hours (doc note, real rename when Event Bus is built) | Vol. 2 Fase 2 Event Bus | Harmonize to `compliance.case.assigned`, `compliance.policy.updated`, etc. when the Event Bus is formalized | Open |
| TD-0064 | Direct contradiction: Vol. 2 anticipates Risk Domain consuming `trust.score.recalculated` from Trust Domain; Vol. 4 explicitly states Risk Cloud never consumes from Trust Cloud ("evita ciclo") | Risk Cloud / Trust Cloud / Platform Architecture | 2, 4 | Vol. 2 Sec. 8.2 event table vs. Vol. 4 Sec. 4 Bounded Context statement | Two documents describe incompatible architectures for the same data flow | Volume 6 cannot be scoped correctly until resolved — risk of building Trust Cloud on the wrong assumption | High | **P0** | Medium | Design decision, blocks Volume 6 | None — must be resolved as Volume 6's opening decision | Volume 6 must explicitly decide: reaffirm the no-cycle rule (mark Vol. 2's entry superseded) or introduce an async/batch (not hot-path) channel for Trust→Risk influence | Open |
| TD-0065 | `/v1/entities/{id}/*` API namespace ownership ambiguous across domains | Risk Cloud / Developer Platform | 4 | Vol. 4 Sec. 16 — `/v1/entities/{id}/risk`, `/v1/entities/{id}/reputation` | Volume 6 will plausibly want `/v1/entities/{id}/trust`; no decision on Gateway-facade vs. single-domain ownership | Medium — ambiguity surfaces the moment Volume 6 needs its own entity-scoped endpoint | Medium | P2 | Medium | Design work | Volume 7 | Volume 7 decides `/v1/entities/{id}/*` is a Gateway facade routing to whichever domain owns each sub-resource | Open |
| TD-0066 | "Billing" drawn as its own bounded-context box in one diagram, while data ownership sits under Developer Platform Domain elsewhere | Platform Architecture | 2, 4 | Vol. 2 Sec. 6 vs. Vol. 4 Sec. 4 diagram | Not a data-ownership conflict, just an unclear label | Low | P3 | Low | Hours (doc note) | Volume 11 | Volume 11 states explicitly that Billing is a Developer Platform Domain capability, not a separate bounded context | Open |
| TD-0067 | Identity Cloud's target API contracts are not version-prefixed, unlike Risk Cloud and Compliance Cloud | Identity Cloud / Developer Platform | 3, 4, 5 | Vol. 3 Sec. 21 (`/identity/verify`, unprefixed) vs. Vol. 4/5 (`/v1/risk/...`, `/v1/compliance/...`) | Inconsistent contract convention across the three domain APIs | Medium | P2 | Low | Hours (doc note, real work when Vol. 7 builds Gateway) | Volume 7 | Harmonize Identity Cloud's target contracts to `/v1/identity/...` when Volume 7 formalizes the Gateway | Open |

**Note:** "Compliance Cloud entirely unbuilt" is tracked once as **TD-0042** (registered during the Volume 4 pass); Volume 5 provides its full 25-module architectural detail without duplicating that ID. TD-0060 through TD-0067 above were surfaced by the pre-Volume-6 consolidation review (`docs/mps/pre-volume-06-review.md`), not by a specific MPS volume's own elaboration.

---

## 3. Production Risks

Real operational risks, not feature gaps.

| Risk | Related TD(s) | Current mitigation |
|---|---|---|
| Silent event loss on serverless termination | TD-0018 | None — accepted consciously per ADR-006 (Vol. 2), now flagged as the top production risk |
| Cache inconsistency (stale rules) | TD-0002 | None — 60s TTL is the only bound |
| Critical external dependency (Supabase single-region) | TD-0019 | Provider-managed backups only, no DR runbook |
| Cold starts | TD-0046 | Detection only (`coldStart` flag), no elimination |
| Vendor lock-in | TD-0047 | Accepted trade-off, not mitigated |
| Observability blind spot | TD-0001 | None until fixed |
| Secrets management gap (local automation token) | TD-0048 | Gitignore only |

---

## 4. Security Backlog

| Subcategory | Items |
|---|---|
| **Autenticação** | TD-0027 (replay protection) |
| **Autorização** | TD-0007, TD-0030 (rule approval / insider risk), TD-0050 (RBAC audit) |
| **Criptografia** | TD-0049 (encryption-at-rest, gated on Identity Cloud) |
| **Auditoria** | TD-0028 (audit log immutability) |
| **IAM** | TD-0050 |
| **Segredos** | TD-0048 |
| **LGPD/GDPR** | TD-0051 (retention/deletion policy) |
| **OWASP** | TD-0052 |
| **Supply chain** | TD-0053 |

---

## 5. Performance Backlog

| Item | Related TD |
|---|---|
| Fix broken slow-request diagnostics | TD-0001 |
| Expose p99 latency | TD-0025 |
| Track error budget | TD-0026 |
| Durable writes for critical persistence | TD-0018 |
| Rules cache invalidation (reduces stale-cache latency perception) | TD-0002 |
| Validate hot-path SLO under load | TD-0054 |
| Cold start mitigation | TD-0046 |

---

## 6. Scalability Backlog

| Item | Related TD |
|---|---|
| Durable queue / real Event Bus | TD-0018, TD-0031 |
| Disaster Recovery / multi-region | TD-0019 |
| Data residency per region | TD-0055 |
| Native graph database (conditional) | TD-0034 |
| Merchant sub-tenant model | TD-0035 |
| Microservice extraction (Identity Domain first per Vol. 2/3 ADR-009) | Tracked in Vol. 2 roadmap, not a debt item — planned evolution |

---

## 7. Product Gaps

| Gap | Commercial impact | Technical impact | Priority | Related TD |
|---|---|---|---|---|
| Device Fingerprinting | High — directly claimed in marketing (TD-0017) | Medium — requires SDK (Vol. 7) | P1 | TD-0010 |
| Behavioural Biometrics | Low — niche high-risk verticals only | Medium-High | P3 | TD-0011 |
| IP Intelligence / Proxy / VPN Detection | **High** — largest credibility gap found | Medium — vendor integration | **P0** | TD-0009 |
| ASN Intelligence | Medium — bundled with IP Intelligence | Low (same vendor) | P1 | TD-0009 |
| Identity Wallet | Low today, high long-term (network effect, Vol. 1) | High — legal + technical | P3 | TD-0044 |
| Compliance Engine (KYC/KYB/AML) | **Critical** — blocks regulated verticals | Very High | P1 | TD-0042 |
| Identity Cloud (all modules) | **Critical** — blocks 1 of 4 promised Clouds | Very High | P0/P1 | TD-0041 |
| Trust Cloud | High — long-term differentiation (Vol. 1) | High | P2 | TD-0043 |
| Merchant Risk | Medium — marketplace ICP only | Medium | P2 | TD-0035 |

---

## 8. Documentation Gaps

| Gap | Between | Related TD |
|---|---|---|
| GNX v2 formula | CLAUDE.md vs. code | TD-0012 |
| Feature Store count (17 vs. 20) | CLAUDE.md vs. code | TD-0013 |
| Block threshold (70 vs. 81/critical) | CLAUDE.md vs. code | TD-0014 |
| `riskEngine.ts` "re-export" claim | CLAUDE.md vs. code | TD-0015 |
| Dead-code cleanup claim incomplete | CLAUDE.md vs. code | TD-0016 |
| Marketing capability overclaims | Landing.tsx vs. code | TD-0017 |
| Marketing claims AML/KYC capability (Compliance Cloud) | Landing.tsx vs. code | TD-0056 |

**Recommendation (not executed in this document, per its own no-code-change rule):** all six items above should be corrected in CLAUDE.md in a single maintenance pass, cross-referencing MPS Volume 4 Sections 3.6/7/8 as the corrected source of truth.

---

## 9. Architectural Decisions Pending

| Decision | Context | Related TD | Referenced in |
|---|---|---|---|
| Definitive event broker choice | Fila leve (Fase 2) vs. broker robusto (Fase 3) | TD-0018, TD-0031 | Vol. 2 Sec. 8.2, Vol. 4 Q3 |
| Multi-cloud strategy | Currently single-vendor (Vercel/Supabase/Upstash) | TD-0047 | Vol. 1 Sec. 4 (10-year vision) |
| Data retention policy (concrete values, not just "configurable") | Vol. 3 defines the RNF, not the values | TD-0051 | Vol. 3 Sec. 26 |
| Data residency for regulated markets outside Brazil | No decision yet | TD-0055 | Vol. 1 Sec. 19 Q4 |
| API versioning strategy (`/v1/` rollout, deprecation policy for `/api/`) | Vol. 4 defines the target contract, not the migration mechanics | TD-0032 | Vol. 4 Sec. 16, owned by Vol. 7 |
| `entity_reputation` organization scoping vs. intentionally global | Trade-off between cross-org network effect (Vol. 1 Sec. 11.6) and isolation | TD-0007 | Vol. 4 Sec. 7.16, ADR-024 |

---

## 10. Go Live Improvements

### 30 days
- TD-0001 (critical bug fix)
- TD-0002 (rules cache invalidation)
- TD-0048 (secrets management review)
- TD-0012–TD-0016 (documentation corrections)

### 90 days
- TD-0006 (type safety for `api/`)
- TD-0018 (durable queue for the two most critical writes)
- TD-0028 (audit log immutability)
- TD-0052 (OWASP audit)
- TD-0054 (load testing)
- TD-0053 (dependency scanning)

### 180 days
- TD-0009 (IP Intelligence)
- TD-0019 (Disaster Recovery strategy)
- TD-0031 (platform-wide Event Bus)
- TD-0032 (API versioning)
- TD-0020 (circuit breaking)
- TD-0036 (ATO Detection)

### 12 months
- TD-0010 (Device Fingerprinting)
- TD-0041 (Identity Cloud)
- TD-0042 (Compliance Cloud)
- TD-0045 (SOC 2 Type I)
- TD-0043 (Trust Cloud, if roadmap allows)

---

## 11. Roadmap by Priority

### P0 — Fix or decide immediately
| ID | Why P0 |
|---|---|
| TD-0001 | Confirmed production bug, breaks core observability, trivial fix |
| TD-0002 | Confirmed dead wiring, directly affects customer-perceived reliability |
| TD-0009 | Largest gap between marketing claim and reality — credibility/legal exposure |
| TD-0017 | Same root cause as TD-0009, requires an immediate business decision (fix copy or accelerate build) |
| TD-0018 | Real data-loss risk on the platform's core audit record |
| TD-0006 | Structural root cause of an entire class of bugs (including TD-0001) |
| TD-0041 | Blocks a quarter of the Volume 1 product positioning |
| TD-0056 | Same marketing-overclaim pattern as TD-0017, now confirmed for Compliance Cloud (AML/KYC) |
| TD-0061 | Undefined Trust Cloud module naming boundaries — must be Volume 6's opening decision |
| TD-0064 | Unresolved Risk↔Trust event-flow contradiction between Vol. 2 and Vol. 4 — must be Volume 6's opening decision |

### P1 — Plan for the next 1–2 quarters
TD-0004, TD-0007, TD-0008, TD-0010, TD-0012, TD-0014, TD-0019, TD-0020, TD-0028, TD-0031, TD-0032, TD-0036, TD-0042, TD-0043, TD-0045, TD-0048, TD-0052, TD-0054, TD-0057, TD-0058, TD-0059.
*Justification:* either they block a Volume 1 business goal (Enterprise ICP, regulated verticals), or they are prerequisites for a P0 item to be safely resolved (e.g. TD-0007 must precede activating TD-0008; TD-0057/TD-0059 must be resolved before Compliance Cloud can safely handle real regulated data).

### P2 — Plan opportunistically
TD-0003, TD-0021, TD-0022, TD-0023, TD-0024, TD-0027, TD-0029, TD-0030, TD-0033, TD-0035, TD-0037, TD-0038, TD-0046, TD-0050, TD-0051, TD-0053, TD-0055, TD-0060, TD-0062, TD-0063, TD-0065, TD-0067.
*Justification:* real gaps with moderate impact, no hard business deadline forcing them yet.

### P3 — Revisit when triggered
TD-0005, TD-0011, TD-0013, TD-0015, TD-0016, TD-0025, TD-0026, TD-0034, TD-0039, TD-0040, TD-0044, TD-0047, TD-0049, TD-0066.
*Justification:* either low impact, or deliberately gated on a future trigger condition per the anti-speculation principle established in Volume 2 (ADR-004) — building them now would be premature complexity, not diligence.

---

## 12. Changelog

### 2026-07-28 — Initial creation
- **Origin:** consolidation of MPS Volumes 1–4 plus the direct source-code audit performed for Volume 4 (Risk Cloud), plus one operational observation made during this session (secrets storage in `.claude/settings.local.json`).
- **Items added:** TD-0001 through TD-0055 (55 total).
- **Items resolved:** none — this is the baseline.
- **Items removed:** none.

### 2026-07-28 — Volume 5 (Compliance Cloud) review
- **Origin:** MPS Volume 5 elaboration, including a repository grep audit confirming zero Compliance Cloud implementation exists beyond a marketing reference.
- **Items added:** TD-0056 (marketing overclaim, AML/KYC), TD-0057 (GDPR/LGPD erasure vs. AML retention conflict), TD-0058 (no regulatory data vendor selected), TD-0059 (anti-tipping-off access control not designed). 4 total, bringing the register to 59.
- **Items resolved:** none.
- **Items removed:** none.
- **Existing items referenced, not duplicated:** TD-0042 (Compliance Cloud unbuilt) — now cross-referenced with Volume 5's full 25-module detail.

### 2026-07-28 — Pre-Volume-6 consolidation review
- **Origin:** `docs/mps/pre-volume-06-review.md` — a full cross-volume consistency audit of Volumes 1–5 performed before starting Volume 6 (Trust Cloud), per explicit instruction not to begin Volume 6 until the existing architecture was verified consistent.
- **Items added:** TD-0060 (retention policy not reconciled with production default), TD-0061 (Trust Cloud module naming boundaries undefined), TD-0062 (event naming drift, Vol. 2 vs. Vol. 4/5), TD-0063 (inconsistent event namespace prefixing in Compliance Cloud), TD-0064 (direct contradiction: Vol. 2 vs. Vol. 4 on Risk↔Trust event flow), TD-0065 (`/v1/entities/{id}/*` namespace ownership ambiguous), TD-0066 (Billing bounded-context labeling unclear), TD-0067 (Identity Cloud API contracts not version-prefixed). 8 total, bringing the register to 67.
- **Items resolved:** none.
- **Items removed:** none.
- **Flagged as blocking:** TD-0061 and TD-0064 are marked **P0** and must be resolved as Volume 6's own opening architectural decisions before any Trust Cloud module is specified.

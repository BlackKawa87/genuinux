# GENUINUX MPS — PRE-VOLUME 6 CONSOLIDATION REVIEW

**Status:** One-time consolidation audit, not an MPS volume.
**Purpose:** Verify that Volumes 1–5 and the Architecture Backlog are internally consistent before Volume 6 (Trust Cloud) is written. **Volume 6 is not started in this document.**
**Method:** Direct cross-reading of the five volumes already produced this session (`01`–`05`) plus `architecture-backlog.md`. No code, migration, or implementation was touched.

---

## Table of Contents

1. Consistency Review
2. ADR Review
3. Domain Map Review
4. Event Review
5. API Review
6. Data Model Review
7. Architecture Backlog Review
8. Prerequisites for Volume 6
9. Final Confirmation

---

## 1. Consistency Review

| Issue | Document(s) | Impact | Recommendation | Priority |
|---|---|---|---|---|
| **Direct contradiction on Risk↔Trust event flow.** Volume 2's domain-event table (Sec. 8.2) lists `trust.score.recalculated` as published by Trust Domain **and consumed by Risk Domain** — implying a feedback loop. Volume 4's Bounded Context section (Sec. 4) explicitly states *"Risk Cloud não consome nada do Trust Cloud de volta (evita ciclo)"* — a one-way flow only. These two documents describe incompatible architectures. | Vol. 2 (Sec. 8.2), Vol. 4 (Sec. 4) | **High** — Volume 6 cannot be scoped correctly until this is resolved; building Trust Cloud on the wrong assumption could require rework | Volume 6 must explicitly decide: either (a) reaffirm Vol. 4's no-cycle rule and mark Vol. 2's table entry as superseded, or (b) introduce an async/batch channel (not a hot-path query) through which Trust tier informs Risk policy without creating a synchronous cycle. Register as TD-0064. | **P0** |
| **Trust Cloud module names collide with existing Risk/Identity/Compliance modules without a boundary decision.** Volume 1's original Trust Cloud scope lists "Reputation Engine," "Trusted Devices," "Trusted Businesses," "Trusted Merchants," "Trusted Users." Volume 4 already has a real module named "Entity Reputation" (7.16) and a planned "Merchant Risk" (7.20) and "Device Intelligence" (7.6); Volume 5 has KYB (8.2). No volume yet states how e.g. "Reputation Engine" (Trust) differs from "Entity Reputation" (Risk), or "Trusted Merchants" (Trust) from "Merchant Risk" (Risk). | Vol. 1 (Sec. 12), Vol. 4 (7.16/7.20/7.6), Vol. 5 (8.2) | **High** — without this boundary, Volume 6 risks duplicating logic/data that Risk/Identity/Compliance already own | Volume 6 must open with an explicit boundary section (same pattern as Vol. 4's ADR-013 for Continuous Risk) for each of these four name-pairs before specifying any module. Register as TD-0061. | **P0** |
| Event naming drift between Volume 2's anticipated canonical names and the actual names later specified in Volumes 4 and 5. `risk.event.evaluated` (Vol. 2) never appears in Vol. 4's final event matrix — it was decomposed into `risk.decision.created` + `risk.score.calculated` + `risk.signals.collected`. `compliance.case.opened`/`compliance.case.resolved` (Vol. 2) do not match Vol. 5's actual `compliance.case.created`/`case.closed`. | Vol. 2 (Sec. 8.2), Vol. 4 (Sec. 17), Vol. 5 (Sec. 15) | Medium — no functional conflict (the later, more detailed volumes are correct), but the drift is undocumented, so a reader trusting Vol. 2 alone would build against non-existent event names | Treat Vol. 4/5's names as authoritative; add a one-line note to Vol. 2 Sec. 8.2 (in a future maintenance pass, not this session) marking the table as superseded/illustrative. Register as TD-0062. | P2 |
| Six of Compliance Cloud's 13 domain events lack the `compliance.` namespace prefix used by the rest (`case.assigned`, `case.closed`, `policy.updated`, `report.generated`, `monitoring.triggered`, `evidence.attached` — vs. `compliance.case.created`, `aml.screening.completed`, etc.). Identity Cloud (13 events, all `identity.*`) and Risk Cloud (13 events, all `risk.*`) are internally consistent; Compliance Cloud is the only domain with mixed prefixing. | Vol. 5 (Sec. 15) | Medium — complicates domain-based event routing/filtering once a real Event Bus exists | Harmonize to `compliance.case.assigned`, `compliance.case.closed`, `compliance.policy.updated`, `compliance.report.generated`, `compliance.monitoring.triggered`, `compliance.evidence.attached` when the Event Bus is formalized (Vol. 2 Fase 2). Register as TD-0063. | P2 |
| Identity Cloud's target API contracts (`/identity/verify`, `/identity/timeline/{id}`, etc., Vol. 3 Sec. 21) are **not** version-prefixed, while Risk Cloud (`/v1/risk/...`) and Compliance Cloud (`/v1/compliance/...`) both adopt `/v1/` from the start. Volume 3 was written before the `/v1/` convention was established in Volume 4. | Vol. 3 (Sec. 21), Vol. 4 (Sec. 16), Vol. 5 (Sec. 14) | Medium — inconsistent contract convention across the three domain APIs | Harmonize Identity Cloud's target contracts to `/v1/identity/...` when Volume 7 formalizes the Gateway. Register as TD-0067. | P2 |
| `/v1/entities/{id}/risk` and `/v1/entities/{id}/reputation` (Vol. 4, Sec. 16) use a generic `/v1/entities/` namespace that is not explicitly owned by one domain — Volume 6 will plausibly want `/v1/entities/{id}/trust`. No decision exists on whether this is a Gateway-level facade aggregating sub-resources from multiple domains, or a namespace Risk Cloud alone owns. | Vol. 4 (Sec. 16) | Medium — ambiguity will surface the moment Volume 6 needs its own entity-scoped endpoint | Volume 7 (Developer Platform) should decide: `/v1/entities/{id}/*` is a Gateway facade routing to whichever domain owns each sub-resource. Register as TD-0065. | P2 |
| Volume 4's Bounded Context diagram (Sec. 4) lists "Billing (Vol. 11)" as its own boundary box, while Volume 2's canonical domain table (Sec. 6) assigns billing data ownership to the Developer Platform Domain (`organizations` table) — no separate "Billing Domain" is defined anywhere. | Vol. 2 (Sec. 6), Vol. 4 (Sec. 4) | Low — not a data-ownership conflict, just an unclear label in one diagram | Volume 11 should state explicitly that Billing is a capability of Developer Platform Domain's `organizations` table, not a separate bounded context. Register as TD-0066. | P3 |
| Volume 5's `retention_jobs`/Retention Policies design (centralized policy, per-domain execution) is not yet reconciled with the real, already-in-production `purge_old_risk_events(retention_days INTEGER DEFAULT 365)` function (Vol. 2, v17 migration), which hardcodes 365 days independent of any jurisdiction-aware policy. | Vol. 2 (Sec. 11), Vol. 5 (8.25) | Medium — not a contradiction (Vol. 5 is target-state, Vol. 2 describes production reality), but a concrete future reconciliation point | When Compliance Cloud Phase 2 is built, Risk Cloud's purge function must be parameterized from Compliance's policy rather than left at its current hardcoded default. Register as TD-0060. | P2 |

**No other conflicting decisions, duplicated ADRs, overlapping bounded-context responsibilities, duplicated entities, or contradictory data models were found.** In particular:
- RN-A01 (Vol. 2 — no domain writes into another domain's tables) is applied **without exception** across Volumes 3, 4, and 5 — verified explicitly in each volume's own Bounded Context section.
- The `external_user_id` field is used identically as the canonical cross-domain person identifier in Identity (Vol. 3), Risk (Vol. 4), and Compliance (Vol. 5) — a genuine positive consistency finding, since it is exactly what lets the Unified Entity Graph (Vol. 2) function in practice even before any physical graph layer exists.
- `TRUST_PROFILE` (placeholder entity in Vol. 2's ER diagram, Sec. 7) has not been prematurely created by any of Volumes 3–5 — Volume 6 is free to define it without conflict.
- Both `/risk/check` and `/compliance/check` converge independently on the same `/domain/check` verb pattern — a positive convention, not an inconsistency, worth preserving explicitly in Volume 7.

---

## 2. ADR Review

### 2.1 Complete list (34 ADRs, sequential, no duplicates found)

| Range | Volume | Topics |
|---|---|---|
| ADR-001 – ADR-003 | Vol. 1 | Unified Entity Graph as shared substrate; rules over black-box ML; latency as first-class requirement |
| ADR-004 – ADR-007 | Vol. 2 | Modular monolith over microservices by default; Redis never source of truth; durable queue deferred to Fase 2; relational Entity Graph over native graph DB |
| ADR-008 – ADR-011 | Vol. 3 | Buy biometrics/OCR, build orchestration; Identity Domain as first extraction candidate; documents never in relational columns; Identity Wallet deferred to Fase 3 |
| ADR-012 – ADR-024 | Vol. 4 | Audit-before-design methodology; Continuous Risk vs. Continuous Monitoring boundary; IP Intelligence before Device Fingerprinting; score/decision/action separation; rules-never-silently-overridden-by-ML; durable queue prioritization; signal schema additive; evidence store gated; score versioning; tenant customisation limits; fail-closed for critical writes; human override always audited; cross-tenant learning blocked pending confidence mechanism |
| ADR-025 – ADR-034 | Vol. 5 | Reuse `audit_logs`, no `audit_records`; Policy Engine generalizes Rules Engine; Case Management generalizes Review Queue; Compliance APIs versioned from day one; Evidence Management built now (not gated); retention centralized/execution distributed; jurisdiction as configuration; Watchlist taxonomy preserved; Transaction Monitoring consumes not duplicates; regulatory report is a rendering layer |

**Verification performed:** numbering checked sequentially 001→034 across all five volumes — no duplicate ADR numbers found, no gaps found.

### 2.2 Dependencies (lineage between ADRs)

- ADR-006 (Vol. 2, durable queue deferred) → **specialized by** ADR-017 (Vol. 4, prioritizes `insertRiskEvent`/`review_queue` specifically) — not a conflict, a concrete application.
- ADR-004 (Vol. 2, extraction criteria) → **applied by** ADR-009 (Vol. 3, Identity Domain qualifies early) and referenced again in Vol. 4 Sec. 9's criteria table.
- ADR-007 (Vol. 2, no native graph DB) → **reaffirmed without reopening** by Vol. 3 Sec. 17 (Identity Graph) and Vol. 4 Sec. 7 (Entity Graph gate).
- ADR-013 (Vol. 4, Continuous Risk vs. Trust boundary) → **directly load-bearing for Volume 6**; this is the precedent pattern the new "Prerequisites for Volume 6" boundary work (Sec. 1 above, TD-0061/TD-0064) must follow.
- ADR-002 (Vol. 1, explainability) → threads through every later volume (`gnx_score_factors`, `decision_factors`, versioned policies) without exception.

### 2.3 Conflicts found
Only the one substantive conflict identified in Section 1 (Vol. 2's event table vs. Vol. 4's ADR-013/no-cycle bounded-context statement) — not two ADRs contradicting each other by number, but a descriptive table in Volume 2 that a later ADR-backed decision (Vol. 4) implicitly overturned without an explicit cross-reference. No ADR explicitly contradicts another ADR's stated decision.

### 2.4 Obsolete ADRs
None. All 34 remain valid as written. Volume 2's event table entry for `trust.score.recalculated` is the one piece of **non-ADR** content that should be treated as superseded pending Volume 6's resolution (see TD-0064).

### 2.5 ADRs Volume 6 must explicitly cite
- **ADR-002** (Vol. 1) — explainability requirement applies to Trust Score exactly as it does to GNX Score.
- **ADR-004/ADR-007** (Vol. 2) — Trust Graph must justify any departure from modular-monolith/relational-storage defaults against the same objective criteria, not by exception.
- **ADR-013** (Vol. 4) — the Continuous Risk boundary Trust Cloud must respect and build against.
- **ADR-024** (Vol. 4) — the confidence-weighting mechanism gating `entity_reputation` cross-tenant reads, which Trust Score will likely consume.
- **ADR-032** (Vol. 5) — Watchlist taxonomy Trust Cloud must not re-collapse into a single "trust list."

---

## 3. Domain Map Review

Confirmed separation across all volumes for: Identity, Risk, Compliance, Trust (not yet built), Developer Platform, Shared Kernel, Unified Entity Graph, Billing, Administration.

| Domain | Ownership confirmed consistent across volumes? | Note |
|---|---|---|
| Identity | Yes | Vol. 2 Sec. 6 and Vol. 3 Sec. 1–4 agree exactly |
| Risk | Yes | Vol. 2 Sec. 6 and Vol. 4 Sec. 4 agree exactly |
| Compliance | Yes | Vol. 2 Sec. 6 and Vol. 5 Sec. 4 agree exactly |
| Trust | N/A yet | Only a placeholder row in Vol. 2 Sec. 6 ("embrionário") — nothing to contradict yet, but see Sec. 1 findings above on naming overlap |
| Developer Platform | Yes | Consistent across Vol. 2, 4, 5 as the sole owner of API Keys/webhooks/organizations |
| Shared Kernel (Entity Graph, Event Bus, ML Platform) | Yes | Consistently described as infrastructure, not a domain, in Vol. 2's own diagram legend and repeated correctly in Vol. 3/4/5 |
| Billing | **Minor clarity gap** | See Sec. 1 finding (TD-0066) — Vol. 4 draws it as a separate box; Vol. 2 assigns it to Developer Platform Domain |
| Administration | Yes | Consistent across Vol. 2 and referenced correctly in Vol. 4/5 as read-only consumer of all domains |

**No responsibility leakage found.** Every volume's own Bounded Context section independently re-verifies RN-A01 (no cross-domain writes) and all three (Identity, Risk, Compliance) pass.

---

## 4. Event Review

### 4.1 Consolidated count
- Identity Cloud (Vol. 3): 13 events, all `identity.*` — internally consistent.
- Risk Cloud (Vol. 4): 13 events, all `risk.*` — internally consistent.
- Compliance Cloud (Vol. 5): 14 events, **6 of 14 missing the `compliance.*` prefix** (Sec. 1 finding, TD-0063).
- Volume 2's forward-looking table (Sec. 8.2): 7 anticipated events, of which 2 are naming-drifted from what actually shipped (TD-0062) and 1 (`trust.score.recalculated`) is the subject of the direct contradiction (TD-0064).

**Total distinct events consolidated across all volumes: ~40** (13 + 13 + 14, plus the still-open `trust.score.recalculated` and `org.plan.changed` from Vol. 2 that no later volume has yet superseded or built).

### 4.2 Duplicates
None found — no two volumes define the same event name for different purposes.

### 4.3 Versioning
No event carries an explicit schema version field in any volume yet (`v1`, `v2`, etc.) — this is consistent across all three domain volumes (none is ahead of the others), so not a cross-volume inconsistency, but a gap all three share, worth flagging once the Event Bus is formalized (Vol. 2 Fase 2).

### 4.4 Ownership
Every event has exactly one declared producer across all volumes — no event is claimed by two domains as producer.

### 4.5 PII
Consistently classified (Alto/Médio/Baixo or High/Medium/Low) in every event matrix — no volume skips this column.

### 4.6 Ordering
Not formally addressed by any volume yet (no sequence/ordering guarantee specified for any event) — consistent gap across Identity, Risk, and Compliance; not a contradiction, but should be resolved once for all domains in Volume 2's Fase 2 broker decision rather than three times.

---

## 5. API Review

### 5.1 Consolidated count
- Identity Cloud (Vol. 3): 8 target endpoints, **not version-prefixed** (TD-0067).
- Risk Cloud (Vol. 4): 10 target endpoints (`/v1/risk/...`, `/v1/rules/...`, `/v1/reviews/...`, `/v1/entities/...`), reconciled explicitly against the real unversioned production endpoint (`/api/risk/check`).
- Compliance Cloud (Vol. 5): 10 target endpoints (`/v1/compliance/...`), versioned from inception (ADR-028).

**Total: 28 target API endpoints consolidated** across the three domain volumes.

### 5.2 Versioning
Inconsistent as a set (Identity unprefixed, Risk and Compliance both `/v1/`) — see TD-0067. Risk and Compliance are mutually consistent with each other.

### 5.3 Idempotency
Documented per-endpoint in all three volumes. One deliberate, correct semantic difference verified (not an inconsistency): `/v1/risk/check` is intentionally **non-idempotent** (each call is a fresh risk evaluation), while `/v1/compliance/check` is intentionally **idempotent** (re-verifying an already-verified KYC profile should not re-trigger unnecessarily). This difference is architecturally sound and should not be "fixed" for consistency's sake.

### 5.4 Schemas / Errors / Authentication
All three volumes defer the concrete error format, request-ID/correlation-ID contract, and versioning mechanics to Volume 7 — consistent, no volume attempts to define its own competing standard.

### 5.5 Nomenclature
The `/domain/check` verb pattern is used consistently and independently by both Risk and Compliance — a positive convention worth codifying explicitly in Volume 7, not an accident to fix.

---

## 6. Data Model Review

### 6.1 Consolidated entity count
- Identity Cloud (Vol. 3): 6 tables (`identity_verifications`, `identity_documents`, `email_verifications`, `phone_verifications`, `identity_watchlist_screenings`, `identity_wallet_credentials`).
- Risk Cloud (Vol. 4): 6 tables in its own diagram (`risk_events`, `fraud_labels`, `ml_predictions`, `fraud_features`, `training_dataset`, `rules`) plus 7 additional real, pre-existing tables catalogued in its audit (`users_checked`, `entity_reputation`, `review_queue`, `webhook_deliveries`, `audit_logs`, `feature_importance`, `org_daily_stats`).
- Compliance Cloud (Vol. 5): 15 tables of the 16 requested (`audit_records` deliberately **not** created — reuses `audit_logs`, ADR-025).

**Total: ~34 concrete tables reviewed**, plus the 5 conceptual Unified Entity Graph node types (Organization, User, Device, Email, IP Address) that are not tables themselves but the relational pattern every domain's real tables implement.

### 6.2 Duplications
None found. No two volumes define a table with the same name for different purposes. The one deliberate near-duplicate (`audit_records` requested by the master prompt for Compliance, `audit_logs` already existing) was correctly resolved by **not** creating the second table (ADR-025) — the opposite of a duplication problem.

### 6.3 Field consistency
`external_user_id` and `organization_id` are used with identical meaning and naming across Identity, Risk, and Compliance schemas — confirmed positive consistency (see Sec. 1).

### 6.4 Relationships
No conflicting foreign-key implications found between volumes. Volume 2's placeholder ER diagram (`IDENTITY_DOCUMENT`, `COMPLIANCE_CASE`, `TRUST_PROFILE` as singular conceptual nodes) is correctly realized by Volume 3/5's actual plural table names (`identity_documents`, `compliance_cases`) — standard conceptual-to-physical naming convention, not an inconsistency.

### 6.5 Ownership / PII / Retention
Consistently documented per table in every volume. The one open reconciliation point is the retention-policy centralization gap already noted in Sec. 1 (TD-0060).

---

## 7. Architecture Backlog Review

`docs/mps/architecture-backlog.md` has been updated (see file) with 8 new items (TD-0060–TD-0067) surfaced by this consolidation pass, bringing the register from 59 to **67 items**. No duplicated items were found in the existing register; no item was incorrectly marked `Resolved` (none has been remediated yet, so all remain `Open`/`Planned`, which is correct).

### 7.1 Executive summary (post-update)

| Severity | Count |
|---|---|
| Critical | 4 |
| High | 18 |
| Medium | 28 |
| Low | 17 |
| **Total** | **67** |

### 7.2 Top 20 debts (by priority, Critical/High first)

1. TD-0001 — `persistMs` TDZ bug (Risk Cloud)
2. TD-0018 — No durable queue for critical writes (Risk Cloud/Platform)
3. TD-0041 — Identity Cloud entirely unbuilt
4. TD-0042 — Compliance Cloud entirely unbuilt
5. TD-0002 — Rules cache never invalidated (Risk Cloud)
6. TD-0006 — `api/` has zero TypeScript checking (Platform)
7. TD-0009 — IP Intelligence/Proxy/VPN/Tor not implemented (Risk Cloud)
8. TD-0017 — Marketing overclaims vs. real capability (Risk Cloud)
9. TD-0056 — Marketing overclaims vs. real capability (Compliance Cloud)
10. TD-0061 — Trust Cloud module naming overlaps undefined (this review)
11. TD-0064 — Risk↔Trust event-flow contradiction unresolved (this review)
12. TD-0007 — `entity_reputation` lacks org isolation (Risk Cloud)
13. TD-0008 — Entity Reputation read path unwired (Risk Cloud)
14. TD-0019 — No Disaster Recovery / multi-region strategy (Platform)
15. TD-0028 — Audit log immutability unconfirmed (Security)
16. TD-0031 — No real platform-wide Event Bus (Platform)
17. TD-0032 — Public API not versioned (Risk Cloud/Developer Platform)
18. TD-0045 — SOC 2 / ISO 27001 absent (Security/Business)
19. TD-0052 — No formal OWASP Top 10 audit (Security)
20. TD-0054 — No documented load testing against hot-path SLO (Platform/Risk Cloud)

### 7.3 Top 10 risks (synthesized, not a straight ID list)

1. Silent loss of the platform's core audit record (`insertRiskEvent`/`review_queue`, TD-0018) — the single highest-severity production risk.
2. Public marketing materially exceeds real capability in **two** domains now (Risk Cloud TD-0017, Compliance Cloud TD-0056) — a pattern, not an isolated incident.
3. The platform's own slow-request observability is silently broken (TD-0001).
4. Two of the four promised Clouds (Identity, Compliance) do not exist in production (TD-0041/TD-0042) — this is the largest gap between Volume 1's positioning and reality.
5. Absence of SOC 2/ISO 27001 blocks the entire Enterprise ICP defined in Volume 1 (TD-0045).
6. `entity_reputation`'s lack of organizational isolation creates a real cross-tenant poisoning vector before its read path is even wired up (TD-0007/TD-0008).
7. The legal tension between GDPR/LGPD erasure rights and mandatory AML retention has no resolution and blocks Compliance Cloud Phase 2 (TD-0057).
8. Anti-tipping-off access control for investigations/SARs is undesigned — a direct legal exposure the moment a real case exists (TD-0059).
9. **The unresolved Risk↔Trust event-flow contradiction (TD-0064) and the undefined Trust module naming boundaries (TD-0061) are, together, the single greatest risk to Volume 6 itself** — proceeding to write Trust Cloud without resolving these first risks building an entire volume on an ambiguous foundation.
10. No formal load testing has ever validated the hot-path p95 target under realistic concurrent multi-tenant load (TD-0054) — every latency claim in Volumes 2 and 4 is currently unverified at scale.

---

## 8. Prerequisites for Volume 6

> This section lists what is **not yet defined** and will be **required** before Trust Cloud can be specified correctly. Per instruction, this section lists dependencies, concepts, interfaces, events, and data only — **no solutions are proposed here.**

### 8.1 Dependencies
- Resolution of the Risk↔Trust event-flow contradiction (TD-0064) — a decision, not a design, is required before any Trust Cloud data flow can be drawn.
- A boundary decision for each of the four Trust/Risk name-pairs (TD-0061): Reputation Engine vs. Entity Reputation; Trusted Devices vs. Device Intelligence; Trusted Merchants vs. Merchant Risk; Trusted Businesses vs. KYB.
- A definition of what "Trusted Users" (Vol. 1's Trust Cloud scope) synthesizes from — Identity verification status, Risk history, and Compliance case history all plausibly contribute, but no volume has stated the composition rule.
- ADR-024's confidence-weighting mechanism (Vol. 4) — Trust Score will very likely consume `entity_reputation`, and that consumption is currently gated on a mechanism that does not yet exist.
- Compliance Cloud's `regulatory_requests`/`consent_records` (Vol. 5) as inputs Trust Cloud is expected to consume, per Vol. 5 Sec. 4's stated Bounded Context — but no volume has yet defined the transformation from "a closed compliance case" to "a trust signal."

### 8.2 Concepts not yet defined
- What "Trust Score" numerically represents, and how (if at all) it relates to `fraud_score`/`gnx_score` (Risk) and `kyc_profiles` risk classification (Compliance) — three different numeric risk/trust representations already exist; Trust Cloud introduces a fourth without a stated relationship to the other three.
- What "Continuous Monitoring" (Trust) means operationally, distinct from "Ongoing Monitoring" (Compliance, Vol. 5 Sec. 8.11) and "Continuous Risk Score" (Risk, Vol. 4 Sec. 14, ADR-013) — three modules across three volumes now use near-synonymous names for what may or may not be three different things.
- What "Trust Graph" adds beyond the Unified Entity Graph (Vol. 2 Sec. 7) and the Identity Graph (Vol. 3 Sec. 17) — both already exist as the relational+Redis pattern per ADR-007; Trust Graph must state whether it is a third parallel structure or a view over the same substrate.
- What "Trust Timeline" adds beyond Identity Timeline (Vol. 3 Sec. 16) — same class of question as above, applied to timelines instead of graphs.

### 8.3 Interfaces not yet defined
- Whether `/v1/entities/{id}/trust` extends the ambiguous `/v1/entities/{id}/*` namespace already opened by Risk Cloud (TD-0065), or Trust Cloud introduces its own namespace.
- Whether Trust Score is exposed as a read-only derived value (analogous to `/v1/entities/{id}/reputation`) or as a first-class resource with its own write/update semantics (e.g., manual trust overrides, analogous to Manual Review Queue).

### 8.4 Events not yet defined
- The actual (not merely anticipated) schema for `trust.score.recalculated` — contingent on resolving TD-0064 first.
- Whether Trust Cloud publishes one canonical "trust changed" event or several granular ones (mirroring the Risk Cloud precedent of `risk.score.calculated` + `risk.decision.created` as separate events rather than one).
- Whether Trust Cloud consumes `case.closed`/`sanctions.hit.detected` (Compliance, Vol. 5) and `identity.graph.duplicate_detected` (Identity, Vol. 3) directly, or only through some intermediate aggregation step not yet named.

### 8.5 Data not yet defined
- The `TRUST_PROFILE` entity itself (placeholder only in Vol. 2's ER diagram) — no fields, no versioning strategy, no relationship to `kyc_profiles`/`entity_reputation` has been specified.
- Whether Trust Cloud requires its own tables per "Trusted X" category (devices/businesses/merchants/users) or a single polymorphic trust-subject model — no volume has taken a position.
- Retention/PII classification for whatever Trust Cloud stores — by precedent (Vol. 3/4/5), this must be defined in Volume 6 itself, not deferred.

---

## 9. Final Confirmation

- **Consistency Review:** completed — 8 issues found (1 High-priority direct contradiction, 1 High-priority undefined boundary, 6 Medium/Low harmonization items), 0 hidden/undetected duplications in ADRs, events, APIs, or data models.
- **The platform's architecture is internally consistent enough to proceed**, with the explicit condition that **TD-0064 (Risk↔Trust event contradiction) and TD-0061 (Trust module naming boundaries) must be resolved as the opening act of Volume 6 itself** — not before it, since resolving them requires the very domain analysis Volume 6 exists to produce. Every other finding in this review is a documentation-harmonization item that does not block starting Volume 6.
- No code, migration, or implementation was modified during this review.

**This document does not start Volume 6.** Volume 6 — Trust Cloud remains to be written, and should open by directly citing TD-0061 and TD-0064 as its first architectural decisions.

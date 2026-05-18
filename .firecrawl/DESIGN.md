# DESIGN.md: Legitimuz → Genuinux

## Source
- URL: https://novo.legitimuz.com/
- Capture date: 2026-05-18
- Evidence: WebFetch markdown scrape

## Design Summary
Light-mode enterprise SaaS. Legitimuz uses a clean white/light-gray base with orange accent,
bold headlines, product-card grids, and a strong stats bar. The page is long-form and covers
trust via certifications, platform screenshot, per-product modules, KPIs, verticals, and
journey stages. Genuinux inherits this structure with green accent (#16C784) and dark (#0F172A)
instead of orange.

## Design Tokens

### Colors
- bg: #F8FAFC (light page background)
- surface: #FFFFFF (cards, nav)
- border: #E2E8F0
- borderL: #F1F5F9
- text: #0F172A (headings)
- textSec: #64748B (body)
- textMut: #94A3B8 (labels)
- accent: #16C784 (green — Genuinux trust color)
- accentT: #0D9068 (darker green for text on light bg)
- accentBg: rgba(22,199,132,0.08)
- accentBd: rgba(22,199,132,0.2)
- dark: #0F172A (CTA sections, footer)
- dark2: #1E293B
- red: #EF4444
- redBg: rgba(239,68,68,0.08)

### Typography
- Display: Syne (loaded via Google Fonts) — bold, tight tracking
- Mono: IBM Plex Mono — used for scores, code, stats
- Heading scale: clamp(2.5rem, 5vw, 4rem) for hero; 2.25rem for section heads
- Body: 1rem/1.625 line-height, color textSec

### Spacing And Layout
- Max-width: 1200px (mx-auto)
- Section padding: py-24 (desktop), px-6
- Card gap: gap-6
- Border radius: rounded-2xl cards, rounded-xl small cards, rounded-full badges
- Shadow: 0 1px 3px rgba(15,23,42,0.04) default; 0 4px 20px rgba(15,23,42,0.07) hover

## Page Sections (Legitimuz → Genuinux mapping)

1. **Navbar** — Logo + nav links + "Sign in" + "Get started" CTA
2. **Hero** — Bold headline, ALLOW/BLOCK cards, CTAs
3. **Trust badges** — SOC 2, ISO 27001, GDPR (certification row)
4. **Platform overview** — Dashboard screenshot mock + one-stop platform description
5. **Product modules grid** — 5 API modules with icon, name, description
6. **Technology section** — ML/AI technology description + "How it works" steps
7. **Stats bar** — 8 KPI numbers
8. **Solutions by vertical** — 6 industry verticals
9. **Journey coverage** — 5 touchpoints across user lifecycle
10. **Dark CTA** — Final conversion section
11. **Footer** — Logo, links, legal

## Agent Build Instructions
- Keep existing AllowCard / BlockCard in hero
- Add certifications row (SOC 2, ISO 27001, GDPR, PCI DSS) after hero
- Add platform overview section with mock dashboard card
- Add 5-product module grid: RiskScore, DeviceID, BehaviorAI, DocVerify, SessionGuard
- Expand stats from 4 to 8 KPIs
- Add verticals list (Fintech, E-commerce, iGaming, Banking, Crypto, SaaS)
- Add journey touchpoints row (Signup, Login, Transaction, Withdrawal, Checkout)
- Keep dark CTA and footer as-is

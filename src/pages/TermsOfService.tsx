import { Link } from 'react-router-dom'

const C = {
  bg:      '#F8FAFC',
  card:    '#FFFFFF',
  border:  '#E2E8F0',
  text:    '#0F172A',
  textSec: '#64748B',
  trust:   '#16C784',
}

const LAST_UPDATED = 'May 20, 2026'

export default function TermsOfService() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'Inter, sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: `1px solid ${C.border}`, background: C.card, padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/">
            <img src="/logo-horizontal.png" alt="Genuinux" style={{ height: 40 }} />
          </Link>
          <Link to="/" style={{ fontSize: '0.875rem', color: C.textSec, textDecoration: 'none' }}>← Back to home</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>
        <p style={{ fontSize: '0.8125rem', color: C.trust, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Legal</p>
        <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 700, color: C.text, margin: '0 0 0.5rem' }}>Terms of Service</h1>
        <p style={{ color: C.textSec, fontSize: '0.9375rem', marginBottom: '3rem' }}>Last updated: {LAST_UPDATED}</p>

        <Section title="1. Acceptance">
          <p>By creating an account or using the Genuinux API, you agree to these Terms. If you are agreeing on behalf of a company, you represent that you have authority to bind that company.</p>
        </Section>

        <Section title="2. The Service">
          <p>Genuinux provides a fraud detection and trust scoring API. We grant you a limited, non-exclusive, non-transferable right to access the API in accordance with your plan's limits.</p>
          <p>We may update, modify, or deprecate features of the service at any time. We will provide 30 days' notice for breaking API changes.</p>
        </Section>

        <Section title="3. Your Responsibilities">
          <ul>
            <li>You must not use the service to discriminate against users on the basis of protected characteristics.</li>
            <li>You must have a lawful basis to submit your end-users' personal data to us for processing.</li>
            <li>You must keep your API keys confidential and not share them publicly.</li>
            <li>You must not attempt to reverse-engineer or abuse the scoring system.</li>
            <li>You must comply with applicable data protection laws (UK GDPR, GDPR, CCPA, etc.) for data you submit.</li>
          </ul>
        </Section>

        <Section title="4. Prohibited Uses">
          <p>You may not use Genuinux to:</p>
          <ul>
            <li>Build a competing fraud detection product without written permission</li>
            <li>Attempt to infer or reconstruct another organisation's risk data</li>
            <li>Conduct automated testing that exceeds 1,000 requests per minute without prior written approval</li>
            <li>Process data of individuals under the age of 13</li>
          </ul>
        </Section>

        <Section title="5. Plans, Payment, and Limits">
          <p>Plans are billed monthly in advance via Stripe. Prices are in GBP and exclusive of VAT. You may cancel at any time; no refunds are issued for the current billing period.</p>
          <p>Each plan includes a monthly event limit. Requests exceeding the limit return HTTP 429. Upgrading your plan takes effect immediately.</p>
          <p>We reserve the right to suspend accounts that materially exceed their plan limits or abuse the free tier.</p>
        </Section>

        <Section title="6. Data Processing">
          <p>We are a data processor for your end-users' personal data. A Data Processing Agreement (DPA) is available on request at <a href="mailto:legal@genuinux.io" style={{ color: C.trust }}>legal@genuinux.io</a>. By using the service you accept the terms of that DPA.</p>
        </Section>

        <Section title="7. Uptime and SLA">
          <p>We target 99.9% monthly API availability. For Enterprise plans, an SLA with financial remedies is available upon request. The free tier is provided as-is with no uptime guarantee.</p>
        </Section>

        <Section title="8. Limitation of Liability">
          <p>To the maximum extent permitted by law, Genuinux's total liability for any claim arising from these Terms or the service is limited to the fees you paid in the 3 months preceding the claim. We are not liable for indirect, consequential, or punitive damages.</p>
          <p>The service is provided as a decision-support tool. You remain solely responsible for any decisions made on the basis of Genuinux risk scores.</p>
        </Section>

        <Section title="9. Intellectual Property">
          <p>The Genuinux name, logo, and all service components are owned by Genuinux Ltd. You retain ownership of all data you submit. We may use anonymised, aggregated data to improve our models.</p>
        </Section>

        <Section title="10. Termination">
          <p>Either party may terminate with 30 days' written notice. We may suspend or terminate immediately for breach of these Terms, non-payment, or abuse of the service. Upon termination, your data will be deleted within 90 days.</p>
        </Section>

        <Section title="11. Governing Law">
          <p>These Terms are governed by the laws of England and Wales. Disputes shall be resolved in the courts of England and Wales.</p>
        </Section>

        <Section title="12. Contact">
          <p>Legal enquiries: <a href="mailto:legal@genuinux.io" style={{ color: C.trust }}>legal@genuinux.io</a></p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0F172A', marginBottom: '0.75rem' }}>{title}</h2>
      <div style={{ color: '#475569', lineHeight: 1.7, fontSize: '0.9375rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {children}
      </div>
    </div>
  )
}

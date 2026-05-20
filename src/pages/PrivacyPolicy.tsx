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

export default function PrivacyPolicy() {
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
        <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 700, color: C.text, margin: '0 0 0.5rem' }}>Privacy Policy</h1>
        <p style={{ color: C.textSec, fontSize: '0.9375rem', marginBottom: '3rem' }}>Last updated: {LAST_UPDATED}</p>

        <Section title="1. Who We Are">
          <p>Genuinux ("<b>we</b>", "<b>us</b>", "<b>our</b>") is an AI-powered fraud detection and trust infrastructure service operated by Genuinux Ltd. Our registered office is in the United Kingdom. We can be reached at <a href="mailto:privacy@genuinux.io" style={{ color: C.trust }}>privacy@genuinux.io</a>.</p>
        </Section>

        <Section title="2. What Data We Collect">
          <p><b>Account data:</b> When you create an account we collect your name, email address, company name, and website. This is used to provision your organisation and manage your subscription.</p>
          <p><b>End-user risk data (on your behalf):</b> When you call our API, you submit attributes about your own users — such as email address, IP address, device ID, user agent, and country. We process this data as a data processor on your behalf. You are the data controller for your end-users' data.</p>
          <p><b>Usage data:</b> We collect API request counts, response times, and error rates to operate the service and enforce plan limits.</p>
          <p><b>Payment data:</b> Billing is handled by Stripe. We store your Stripe customer ID but never your card details.</p>
        </Section>

        <Section title="3. How We Use Your Data">
          <ul>
            <li>To provide the fraud detection service</li>
            <li>To send transactional emails (account confirmation, password reset, invoices)</li>
            <li>To enforce plan limits and detect abuse of the service</li>
            <li>To comply with legal obligations</li>
          </ul>
          <p>We do not sell your data or your end-users' data to third parties.</p>
        </Section>

        <Section title="4. Data Retention">
          <p>Risk events are retained for 12 months from the date of creation. Account data is retained for the duration of your subscription plus 90 days after cancellation. You may request deletion at any time at <a href="mailto:privacy@genuinux.io" style={{ color: C.trust }}>privacy@genuinux.io</a>.</p>
        </Section>

        <Section title="5. Data Sharing">
          <p>We share data with the following sub-processors:</p>
          <ul>
            <li><b>Supabase</b> — hosted PostgreSQL database (EU region)</li>
            <li><b>Vercel</b> — serverless compute and CDN</li>
            <li><b>Stripe</b> — payment processing</li>
            <li><b>OpenAI</b> — optional AI summary generation (only when enabled; no data is retained for training)</li>
          </ul>
        </Section>

        <Section title="6. Your Rights">
          <p>If you are based in the UK or EEA, you have the right to access, rectify, erase, restrict, or port your personal data. You also have the right to object to processing and to lodge a complaint with your supervisory authority.</p>
          <p>To exercise these rights, email <a href="mailto:privacy@genuinux.io" style={{ color: C.trust }}>privacy@genuinux.io</a>. We will respond within 30 days.</p>
        </Section>

        <Section title="7. Security">
          <p>API keys are stored as SHA-256 hashes — we never store raw keys. All data in transit is encrypted with TLS 1.2+. Webhook payloads are signed with HMAC-SHA256. Row-level security (RLS) is enforced at the database layer so each organisation can only access its own data.</p>
        </Section>

        <Section title="8. Cookies">
          <p>We use a single session cookie managed by Supabase Auth for authenticated dashboard sessions. We do not use tracking cookies or third-party advertising cookies.</p>
        </Section>

        <Section title="9. Changes to This Policy">
          <p>We may update this policy from time to time. We will notify account holders of material changes by email at least 14 days before they take effect.</p>
        </Section>

        <Section title="10. Contact">
          <p>Questions? Email <a href="mailto:privacy@genuinux.io" style={{ color: C.trust }}>privacy@genuinux.io</a> or write to Genuinux Ltd, United Kingdom.</p>
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

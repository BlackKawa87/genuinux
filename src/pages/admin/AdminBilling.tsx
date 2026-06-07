import { CreditCard, ExternalLink } from 'lucide-react'
import { useT } from '../../lib/themeTokens'
const ACCENT = '#F59E0B'
const PLANS = [
  { name: 'Starter',    price: '$49/mo',   color: ACCENT },
  { name: 'Pro',        price: '$199/mo',  color: '#16C784' },
  { name: 'Enterprise', price: 'Custom',   color: '#8B5CF6' },
]
export default function AdminBilling() {
  const T = useT()
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>Billing</h1>
        <p style={{ fontSize: 12, color: T.textDim, margin: '4px 0 0' }}>Revenue, subscriptions, and plan management</p>
      </div>
      <div style={{ background: `${ACCENT}10`, border: `1px solid ${ACCENT}30`, borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <CreditCard size={14} color={ACCENT} />
          <span style={{ fontSize: 13, fontWeight: 600, color: ACCENT }}>Stripe Integration Required</span>
        </div>
        <p style={{ fontSize: 12, color: T.textSec, margin: 0 }}>
          Add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO to Vercel to enable full billing management.
        </p>
        <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: 12, color: ACCENT, textDecoration: 'none' }}>
          Open Stripe Dashboard <ExternalLink size={11} />
        </a>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {PLANS.map(p => (
          <div key={p.name} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '20px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: p.color, marginBottom: 4 }}>{p.name}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: T.text, fontFamily: 'IBM Plex Mono, monospace' }}>{p.price}</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 8 }}>Configure in Stripe Dashboard</div>
          </div>
        ))}
      </div>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: T.textDim }}>Full billing table (MRR, ARR, subscription status, failed payments) available after Stripe configuration.</div>
      </div>
    </div>
  )
}

import { Flag, CheckCircle, XCircle } from 'lucide-react'
import { useT } from '../../lib/themeTokens'
const GLOBAL_FLAGS = [
  { key: 'REDIS_COUNTERS_ENABLED',  label: 'Redis Counters',     desc: 'Redis-first context reads (~5ms vs ~400ms RPC)' },
  { key: 'ML_SHADOW_ENABLED',       label: 'ML Shadow Mode',     desc: 'Shadow predictions fire-and-forget on every request' },
  { key: 'FEATURE_STORE_ENABLED',   label: 'Feature Store',      desc: 'Write feature vectors to fraud_features table' },
  { key: 'DATASET_BUILDER_ENABLED', label: 'Dataset Builder',    desc: 'Auto-build training_dataset on label submit' },
  { key: 'OPENAI_API_KEY',          label: 'AI Summaries',       desc: 'GPT-4o-mini event enrichment summaries' },
  { key: 'SENTRY_DSN',              label: 'Sentry Monitoring',  desc: 'Error tracking and performance monitoring' },
  { key: 'RESEND_API_KEY',          label: 'Email (Resend)',     desc: 'Beta invite email delivery' },
  { key: 'STRIPE_SECRET_KEY',       label: 'Stripe Billing',     desc: 'Subscription and payment management' },
]
export default function AdminFeatureFlags() {
  const T = useT()
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="t-title" style={{ color: T.text, margin: 0 }}>Feature Flags</h1>
        <p style={{ fontSize: 12, color: T.textDim, margin: '4px 0 0' }}>Global platform feature gates — managed via Vercel environment variables</p>
      </div>
      <div style={{ background: '#F59E0B10', border: '1px solid #F59E0B30', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: '#F59E0B' }}>
        Feature flags are controlled via Vercel Environment Variables. Changes require a redeploy. Per-org feature flags are in development.
      </div>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
        {GLOBAL_FLAGS.map((f, i) => {
          const active = !!import.meta.env[`VITE_${f.key}`]
          return (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i < GLOBAL_FLAGS.length - 1 ? `1px solid ${T.border}` : 'none' }}>
              {active ? <CheckCircle size={15} color="#16C784" /> : <XCircle size={15} color="#64748B" />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: 'IBM Plex Mono, monospace' }}>{f.key}</div>
                <div style={{ fontSize: 11, color: T.textDim }}>{f.desc}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: active ? '#16C784' : '#64748B' }}>{active ? 'ACTIVE' : 'INACTIVE'}</span>
            </div>
          )
        })}
      </div>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '24px', marginTop: 14, textAlign: 'center' }}>
        <Flag size={24} color={T.textDim} style={{ margin: '0 auto 8px', display: 'block' }} />
        <div style={{ fontSize: 13, color: T.textDim }}>Per-org feature flag control (enable ML Shadow for specific customer) — coming in a future release.</div>
      </div>
    </div>
  )
}

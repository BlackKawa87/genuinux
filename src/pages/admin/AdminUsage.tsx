import { BarChart2 } from 'lucide-react'
import { useT } from '../../lib/themeTokens'
export default function AdminUsage() {
  const T = useT()
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>Usage & Limits</h1>
        <p style={{ fontSize: 12, color: T.textDim, margin: '4px 0 0' }}>Per-org request quotas, event usage, and limit alerts</p>
      </div>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '40px', textAlign: 'center' }}>
        <BarChart2 size={32} color={T.textDim} style={{ margin: '0 auto 12px', display: 'block' }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6 }}>Usage Analytics — Coming Soon</div>
        <div style={{ fontSize: 12, color: T.textDim, maxWidth: 420, margin: '0 auto' }}>
          Per-org breakdown of requests, events, labels, ML predictions, and webhook usage with 24h/7d/30d/90d ranges.
          Alerts at 80%/90%/100% of plan limits. Data sourced from org_daily_stats + Redis counters.
        </div>
      </div>
    </div>
  )
}

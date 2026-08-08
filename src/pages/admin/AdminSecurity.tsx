import { Shield } from 'lucide-react'
import { useT } from '../../lib/themeTokens'
export default function AdminSecurity() {
  const T = useT()
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="t-title" style={{ color: T.text, margin: 0 }}>Security Center</h1>
        <p style={{ fontSize: 12, color: T.textDim, margin: '4px 0 0' }}>API abuse, rate limit triggers, and access anomalies</p>
      </div>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '40px', textAlign: 'center' }}>
        <Shield size={32} color={T.textDim} style={{ margin: '0 auto 12px', display: 'block' }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6 }}>Security Dashboard — Coming Soon</div>
        <div style={{ fontSize: 12, color: T.textDim, maxWidth: 420, margin: '0 auto' }}>
          Failed auth attempts, rate limit triggers per org, API abuse patterns, suspended orgs, and revoked API key history. Sourced from audit_logs + risk_events security signals.
        </div>
      </div>
    </div>
  )
}

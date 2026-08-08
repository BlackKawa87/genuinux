import { Heart, AlertTriangle } from 'lucide-react'
import { useT } from '../../lib/themeTokens'
export default function AdminCustomers() {
  const T = useT()
  const signals = [
    { label: 'No activity in 7 days',       color: '#EF4444', icon: AlertTriangle },
    { label: 'Feedback Coverage < 10%',     color: '#F59E0B', icon: AlertTriangle },
    { label: 'No labels submitted',          color: '#F59E0B', icon: AlertTriangle },
    { label: 'Zero API calls this month',    color: '#EF4444', icon: AlertTriangle },
    { label: 'Integration errors detected',  color: '#EF4444', icon: AlertTriangle },
  ]
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="t-title" style={{ color: T.text, margin: 0 }}>Customer Success</h1>
        <p style={{ fontSize: 12, color: T.textDim, margin: '4px 0 0' }}>Early churn signals and engagement health</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {signals.map(s => (
          <div key={s.label} style={{ background: T.card, border: `1px solid ${s.color}30`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <s.icon size={14} color={s.color} />
            <span style={{ fontSize: 12, color: T.text }}>{s.label}</span>
          </div>
        ))}
      </div>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '40px', textAlign: 'center' }}>
        <Heart size={32} color={T.textDim} style={{ margin: '0 auto 12px', display: 'block' }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6 }}>CS Dashboard — Coming Soon</div>
        <div style={{ fontSize: 12, color: T.textDim, maxWidth: 420, margin: '0 auto' }}>
          Automated churn risk scoring based on activity, feedback coverage, API error rate, and time since last integration call.
        </div>
      </div>
    </div>
  )
}

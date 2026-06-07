import { useState, useEffect } from 'react'
import { RefreshCw, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useT } from '../../lib/themeTokens'

const API = import.meta.env.VITE_API_URL ?? ''

type GoLiveData   = Record<string, unknown>
type SlowReqData  = Record<string, unknown>
type PipelineData = Record<string, unknown>

export default function AdminGoLive() {
  const T = useT()
  const { session } = useAuth()
  const [glData,   setGlData]   = useState<GoLiveData | null>(null)
  const [slowData, setSlowData] = useState<SlowReqData | null>(null)
  const [pipeData, setPipeData] = useState<PipelineData | null>(null)
  const [loading,  setLoading]  = useState(true)

  const load = async () => {
    setLoading(true)
    const h = { Authorization: `Bearer ${session?.access_token}` }
    const [a, b, c] = await Promise.allSettled([
      fetch(`${API}/api/admin/monitoring/go-live`,            { headers: h }).then(r => r.json()),
      fetch(`${API}/api/admin/monitoring/slow-requests?limit=20`, { headers: h }).then(r => r.json()),
      fetch(`${API}/api/admin/monitoring/pipeline-health`,    { headers: h }).then(r => r.json()),
    ])
    if (a.status === 'fulfilled') setGlData(a.value as GoLiveData)
    if (b.status === 'fulfilled') setSlowData(b.value as SlowReqData)
    if (c.status === 'fulfilled') setPipeData(c.value as PipelineData)
    setLoading(false)
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  type StatusLevel = 'healthy' | 'warning' | 'critical'
  const statusColor = (s: StatusLevel | string | undefined) =>
    s === 'healthy' ? '#16C784' : s === 'warning' ? '#F59E0B' : s === 'critical' ? '#EF4444' : '#64748B'
  const StatusIcon = ({ s }: { s: string | undefined }) =>
    s === 'healthy' ? <CheckCircle size={14} color="#16C784" /> :
    s === 'warning'  ? <AlertTriangle size={14} color="#F59E0B" /> :
    <XCircle size={14} color="#EF4444" />

  const glStatus = glData?.go_live_status as { status: string; reasons: string[] } | undefined
  const apiHealth = glData?.api_health as Record<string, number | null> | undefined
  const latency   = glData?.latency   as { avg_ms_today: number | null } | undefined
  const gnx       = glData?.gnx_health as Record<string, unknown> | undefined
  const redis     = glData?.redis_health as Record<string, unknown> | undefined
  const pipes     = pipeData?.tables  as Record<string, { count: number | null; status: string }> | undefined
  const slowReqs  = slowData?.slow_requests as Record<string, unknown>[] | undefined

  const msColor = (ms: number | null, warn = 800, crit = 1500) =>
    ms === null ? T.textDim : ms >= crit ? '#EF4444' : ms >= warn ? '#F59E0B' : '#16C784'

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94A3B8', padding: 40 }}><RefreshCw size={14} />Loading Go Live data…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>Go Live Monitor</h1>
          <p style={{ fontSize: 12, color: T.textDim, margin: '4px 0 0' }}>Operational health · live API status</p>
        </div>
        <button onClick={() => void load()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 7, color: T.textSec, fontSize: 12, cursor: 'pointer' }}>
          <RefreshCw size={12} />Refresh
        </button>
      </div>

      {/* Status Badge */}
      {glStatus && (
        <div style={{ background: `${statusColor(glStatus.status)}15`, border: `1px solid ${statusColor(glStatus.status)}40`, borderRadius: 10, padding: '16px 20px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <StatusIcon s={glStatus.status} />
            <span style={{ fontSize: 16, fontWeight: 700, color: statusColor(glStatus.status), textTransform: 'uppercase', letterSpacing: '0.04em' }}>{glStatus.status}</span>
          </div>
          {glStatus.reasons.map((r, i) => <div key={i} style={{ fontSize: 12, color: T.textSec, marginLeft: 24 }}>• {r}</div>)}
        </div>
      )}

      {/* API Health + Latency */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>API Health (24h)</div>
          {apiHealth && [
            ['Total Events', apiHealth.total_24h],
            ['Approved',     apiHealth.approve],
            ['Review',       apiHealth.review],
            ['Blocked',      apiHealth.block],
          ].map(([label, val]) => (
            <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 12, color: T.textSec }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: 'IBM Plex Mono, monospace' }}>{val?.toLocaleString() ?? '—'}</span>
            </div>
          ))}
        </div>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Latency</div>
          <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'IBM Plex Mono, monospace', color: msColor(latency?.avg_ms_today ?? null) }}>
            {latency?.avg_ms_today != null ? `${Math.round(latency.avg_ms_today)}ms` : '—'}
          </div>
          <div style={{ fontSize: 11, color: T.textDim }}>avg today</div>
          {redis && (
            <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 11, color: redis.connected ? '#16C784' : '#EF4444' }}>Redis {redis.connected ? 'connected' : 'disconnected'}</span>
              <span style={{ fontSize: 11, color: T.textDim }}>·</span>
              <span style={{ fontSize: 11, color: T.textSec }}>context: {String(redis.context_path)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Pipeline Health */}
      {pipes && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Data Pipeline (last 24h)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {Object.entries(pipes).map(([table, info]) => (
              <div key={table} style={{ background: T.elevated, borderRadius: 8, padding: '10px 12px', border: `1px solid ${info.status === 'ok' ? '#16C78430' : info.status === 'migration_pending' ? '#64748B30' : T.border}` }}>
                <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4, textTransform: 'replace' }}>{table.replace(/_/g, '_​')}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: info.status === 'ok' ? '#16C784' : '#64748B', fontFamily: 'IBM Plex Mono, monospace' }}>{info.count ?? '—'}</div>
                <div style={{ fontSize: 9, color: info.status === 'ok' ? '#16C784' : '#64748B', marginTop: 2 }}>{info.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GNX Health */}
      {gnx && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>GNX Health</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {[
              ['v2 Coverage', `${gnx.v2_rate_pct ?? '—'}%`, '#16C784'],
              ['Null Rate',   `${gnx.null_rate_pct ?? '—'}%`, Number(gnx.null_rate_pct) > 5 ? '#EF4444' : '#16C784'],
              ['Total 24h',   String(gnx.total_24h ?? '—'), T.text],
            ].map(([label, val, color]) => (
              <div key={String(label)}>
                <div style={{ fontSize: 11, color: T.textDim, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: color as string, fontFamily: 'IBM Plex Mono, monospace' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Slow Requests */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Slow Requests (&gt;1000ms) — last 20
        </div>
        {!slowReqs || slowReqs.length === 0 ? (
          <div style={{ fontSize: 12, color: T.textDim }}>No slow requests. 🎉</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {['Time', 'Total', 'Key', 'Org', 'Context', 'Engine', 'GNX', 'Cold', 'Path'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'right', color: T.textDim, fontWeight: 600, fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slowReqs.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '6px 10px', color: T.textDim, fontSize: 10 }}>{new Date(String(r.created_at)).toLocaleTimeString()}</td>
                    {[r.total_ms, r.key_ms, r.org_ms, r.context_ms, r.engine_ms, r.gnx_ms].map((ms, j) => (
                      <td key={j} style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', color: msColor(ms as number | null, 200, 800) }}>
                        {ms != null ? `${ms}ms` : '—'}
                      </td>
                    ))}
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: r.cold_start ? '#F59E0B' : T.textDim }}>{r.cold_start ? 'yes' : 'no'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: T.textSec }}>{String(r.context_path ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Trust Graph — related risk entity discovery.
 *
 * Given an event context (user + ip + device + email), runs parallel
 * Supabase queries to surface shared infrastructure, connected accounts,
 * and suspicious clustering patterns.
 *
 * All queries go through RLS (anon client) — results are always
 * scoped to the caller's organization.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Public types ─────────────────────────────────────────────────────────────

export type TGSeverity = 'low' | 'medium' | 'high' | 'critical'

export const SEV_COLORS: Record<TGSeverity, { text: string; bg: string; border: string }> = {
  low:      { text: '#16C784', bg: 'rgba(22,199,132,0.08)',  border: 'rgba(22,199,132,0.2)'  },
  medium:   { text: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)'  },
  high:     { text: '#F97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)'  },
  critical: { text: '#EF4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)'   },
}

export interface RelatedUser {
  external_user_id: string
  /** How this user is connected to the queried event's user */
  connection_type: 'shared_ip' | 'shared_device' | 'shared_email'
  shared_value: string
  event_count: number
  highest_fraud_score: number
  has_block: boolean
  latest_at: string | null
  severity: TGSeverity
}

export interface IPNode {
  ip_address: string
  distinct_user_count: number
  total_events_24h: number
  signup_count_24h: number
  block_count_24h: number
  severity: TGSeverity
}

export interface DeviceNode {
  device_id: string
  distinct_user_count: number
  total_events: number
  has_prior_block: boolean
  severity: TGSeverity
}

export interface SuspiciousCluster {
  cluster_type: 'ip_ring' | 'device_sharing' | 'signup_surge' | 'country_anomaly' | 'blocked_network'
  severity: TGSeverity
  title: string
  description: string
  evidence: string[]
}

export interface TrustGraphResult {
  related_users: RelatedUser[]
  shared_ips: IPNode[]
  shared_devices: DeviceNode[]
  suspicious_clusters: SuspiciousCluster[]
  countries_seen: string[]
  summary: {
    total_connections: number
    highest_severity: TGSeverity | null
    network_risk_score: number
  }
}

export interface TrustGraphInput {
  organization_id: string
  external_user_id: string
  ip_address: string | null
  device_id: string | null
  email: string | null
  country: string | null
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

function ipSeverity(distinctUsers: number, blockCount: number, signupCount: number): TGSeverity {
  if (distinctUsers >= 10 || blockCount >= 5) return 'critical'
  if (distinctUsers >= 5  || blockCount >= 2 || signupCount >= 20) return 'high'
  if (distinctUsers >= 3  || signupCount >= 10) return 'medium'
  return 'low'
}

function deviceSeverity(distinctUsers: number, hasPriorBlock: boolean): TGSeverity {
  if (distinctUsers >= 5 || (hasPriorBlock && distinctUsers >= 3)) return 'critical'
  if (distinctUsers >= 3 || hasPriorBlock) return 'high'
  if (distinctUsers >= 2) return 'medium'
  return 'low'
}

function userSeverity(hasBlock: boolean, highestFraud: number): TGSeverity {
  if (hasBlock || highestFraud >= 80) return 'critical'
  if (highestFraud >= 60) return 'high'
  if (highestFraud >= 40) return 'medium'
  return 'low'
}

function maxSeverity(severities: TGSeverity[]): TGSeverity | null {
  if (severities.length === 0) return null
  if (severities.includes('critical')) return 'critical'
  if (severities.includes('high'))     return 'high'
  if (severities.includes('medium'))   return 'medium'
  return 'low'
}

const SEV_ORDER: Record<TGSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

function calcNetworkRiskScore(
  clusters: SuspiciousCluster[],
  relatedUsers: RelatedUser[],
  sharedIPs: IPNode[],
  sharedDevices: DeviceNode[],
): number {
  let score = 0
  for (const c of clusters) {
    score += c.severity === 'critical' ? 30 : c.severity === 'high' ? 20 : c.severity === 'medium' ? 10 : 5
  }
  score += Math.min(relatedUsers.length * 3, 20)
  if (sharedDevices.some(d => d.has_prior_block)) score += 15
  if (sharedIPs.some(ip => ip.block_count_24h > 0)) score += 10
  return Math.min(score, 100)
}

// ─── Row types (internal) ─────────────────────────────────────────────────────

interface EventRow {
  external_user_id: string
  fraud_score: number
  decision: string
  created_at: string
}

interface HistoryRow {
  country: string | null
}

interface IPStatRow {
  event_type: string
  decision: string
  external_user_id: string
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function getRelatedRiskEntities(
  input: TrustGraphInput,
  supabaseClient: SupabaseClient,
): Promise<TrustGraphResult> {
  const { organization_id: orgId, external_user_id: userId, ip_address: ip, device_id: deviceId, email } = input

  const h24ago = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const d30ago = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString()

  const [ipUsersRes, deviceUsersRes, emailEventsRes, userHistoryRes, ipStatsRes] = await Promise.all([
    ip
      ? supabaseClient
          .from('risk_events')
          .select('external_user_id, fraud_score, decision, created_at')
          .eq('organization_id', orgId)
          .eq('ip_address', ip)
          .neq('external_user_id', userId)
          .gte('created_at', d30ago)
          .order('created_at', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as EventRow[] }),

    deviceId
      ? supabaseClient
          .from('risk_events')
          .select('external_user_id, fraud_score, decision, created_at')
          .eq('organization_id', orgId)
          .eq('device_id', deviceId)
          .neq('external_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as EventRow[] }),

    email
      ? supabaseClient
          .from('risk_events')
          .select('external_user_id, fraud_score, decision, created_at')
          .eq('organization_id', orgId)
          .eq('email', email)
          .neq('external_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as EventRow[] }),

    supabaseClient
      .from('risk_events')
      .select('country')
      .eq('organization_id', orgId)
      .eq('external_user_id', userId)
      .not('country', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200),

    ip
      ? supabaseClient
          .from('risk_events')
          .select('event_type, decision, external_user_id')
          .eq('organization_id', orgId)
          .eq('ip_address', ip)
          .gte('created_at', h24ago)
          .limit(500)
      : Promise.resolve({ data: [] as IPStatRow[] }),
  ])

  const ipUserRows     = (ipUsersRes.data     ?? []) as EventRow[]
  const deviceUserRows = (deviceUsersRes.data  ?? []) as EventRow[]
  const emailEventRows = (emailEventsRes.data  ?? []) as EventRow[]
  const userHistory    = (userHistoryRes.data  ?? []) as HistoryRow[]
  const ipStats        = (ipStatsRes.data      ?? []) as IPStatRow[]

  // ── Related users ──────────────────────────────────────────────────────────

  const relatedUserMap = new Map<string, RelatedUser>()

  function absorb(rows: EventRow[], connType: RelatedUser['connection_type'], sharedValue: string) {
    const byUser = new Map<string, EventRow[]>()
    for (const r of rows) {
      ;(byUser.get(r.external_user_id) ?? (byUser.set(r.external_user_id, []), byUser.get(r.external_user_id)!)).push(r)
    }
    byUser.forEach((evs, uid) => {
      if (relatedUserMap.has(uid)) return
      const highest  = evs.reduce((m, e) => Math.max(m, e.fraud_score), 0)
      const hasBlock = evs.some(e => e.decision === 'block')
      relatedUserMap.set(uid, {
        external_user_id: uid,
        connection_type:  connType,
        shared_value:     sharedValue,
        event_count:      evs.length,
        highest_fraud_score: highest,
        has_block:        hasBlock,
        latest_at:        evs[0]?.created_at ?? null,
        severity:         userSeverity(hasBlock, highest),
      })
    })
  }

  if (ip)       absorb(ipUserRows,     'shared_ip',     ip)
  if (deviceId) absorb(deviceUserRows, 'shared_device', deviceId)
  if (email)    absorb(emailEventRows, 'shared_email',  email)

  const related_users = [...relatedUserMap.values()]
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
    .slice(0, 20)

  // ── IP node ────────────────────────────────────────────────────────────────

  const shared_ips: IPNode[] = []
  if (ip) {
    const distinctIpUsers = new Set([userId, ...ipStats.map(r => r.external_user_id)]).size
    const ipSignups = ipStats.filter(r => r.event_type === 'signup').length
    const ipBlocks  = ipStats.filter(r => r.decision === 'block').length
    const ipTotal   = ipStats.length
    if (distinctIpUsers > 1 || ipSignups > 3 || ipBlocks > 0) {
      shared_ips.push({
        ip_address:         ip,
        distinct_user_count: distinctIpUsers,
        total_events_24h:   ipTotal,
        signup_count_24h:   ipSignups,
        block_count_24h:    ipBlocks,
        severity:           ipSeverity(distinctIpUsers, ipBlocks, ipSignups),
      })
    }
  }

  // ── Device node ────────────────────────────────────────────────────────────

  const shared_devices: DeviceNode[] = []
  if (deviceId && deviceUserRows.length > 0) {
    const distinctDevUsers = new Set([userId, ...deviceUserRows.map(r => r.external_user_id)]).size
    const hasPriorBlock    = deviceUserRows.some(r => r.decision === 'block')
    shared_devices.push({
      device_id:           deviceId,
      distinct_user_count: distinctDevUsers,
      total_events:        deviceUserRows.length,
      has_prior_block:     hasPriorBlock,
      severity:            deviceSeverity(distinctDevUsers, hasPriorBlock),
    })
  }

  // ── Country history ────────────────────────────────────────────────────────

  const countries_seen = [...new Set(userHistory.map(r => r.country).filter(Boolean) as string[])]

  // ── Suspicious clusters ────────────────────────────────────────────────────

  const suspicious_clusters: SuspiciousCluster[] = []

  const ipNode  = shared_ips[0]
  const devNode = shared_devices[0]

  if (ipNode && ipNode.distinct_user_count >= 3) {
    suspicious_clusters.push({
      cluster_type: 'ip_ring',
      severity:     ipNode.severity,
      title:        'IP address shared across multiple accounts',
      description:  `${ipNode.distinct_user_count} distinct users were seen from IP ${ipNode.ip_address} in the last 30 days.`,
      evidence: [
        `${ipNode.distinct_user_count} distinct user IDs from ${ipNode.ip_address}`,
        ipNode.signup_count_24h > 0 ? `${ipNode.signup_count_24h} signup events in the last 24h` : '',
        ipNode.block_count_24h  > 0 ? `${ipNode.block_count_24h} blocked events from this IP`    : '',
      ].filter(Boolean),
    })
  }

  if (devNode && devNode.distinct_user_count >= 2) {
    suspicious_clusters.push({
      cluster_type: 'device_sharing',
      severity:     devNode.severity,
      title:        'Device linked to multiple accounts',
      description:  `${devNode.distinct_user_count} different user accounts have been seen on this device.`,
      evidence: [
        `${devNode.distinct_user_count} distinct users on device ${deviceId!.slice(0, 14)}…`,
        devNode.has_prior_block ? 'This device has prior blocked events' : '',
      ].filter(Boolean),
    })
  }

  if (ipNode && ipNode.signup_count_24h >= 5) {
    const sev: TGSeverity = ipNode.signup_count_24h >= 20 ? 'critical' : ipNode.signup_count_24h >= 10 ? 'high' : 'medium'
    suspicious_clusters.push({
      cluster_type: 'signup_surge',
      severity:     sev,
      title:        'Signup surge from this IP',
      description:  `${ipNode.signup_count_24h} signup events detected from the same IP in the last 24 hours.`,
      evidence: [
        `${ipNode.signup_count_24h} signups in 24h from ${ipNode.ip_address}`,
        `${ipNode.distinct_user_count} distinct accounts`,
      ],
    })
  }

  if (countries_seen.length >= 3) {
    const sev: TGSeverity = countries_seen.length >= 5 ? 'critical' : countries_seen.length >= 4 ? 'high' : 'medium'
    suspicious_clusters.push({
      cluster_type: 'country_anomaly',
      severity:     sev,
      title:        'Activity from multiple countries',
      description:  `This user's events originate from ${countries_seen.length} different countries.`,
      evidence: [
        `Countries detected: ${countries_seen.slice(0, 8).join(', ')}${countries_seen.length > 8 ? ` +${countries_seen.length - 8} more` : ''}`,
      ],
    })
  }

  const networkHasBlocks = (devNode?.has_prior_block) || (ipNode?.block_count_24h ?? 0) > 0
  if (networkHasBlocks && !suspicious_clusters.some(c => c.cluster_type === 'device_sharing')) {
    suspicious_clusters.push({
      cluster_type: 'blocked_network',
      severity:     'high',
      title:        'Overlap with previously blocked events',
      description:  'This event shares infrastructure (IP or device) with events that were blocked.',
      evidence: [
        devNode?.has_prior_block            ? 'Device ID linked to prior blocks'                           : '',
        (ipNode?.block_count_24h ?? 0) > 0  ? `${ipNode!.block_count_24h} IP-level blocks in last 24h`   : '',
      ].filter(Boolean),
    })
  }

  suspicious_clusters.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])

  // ── Summary ────────────────────────────────────────────────────────────────

  const allSeverities: TGSeverity[] = [
    ...related_users.map(u => u.severity),
    ...shared_ips.map(n => n.severity),
    ...shared_devices.map(n => n.severity),
    ...suspicious_clusters.map(c => c.severity),
  ]

  return {
    related_users,
    shared_ips,
    shared_devices,
    suspicious_clusters,
    countries_seen,
    summary: {
      total_connections:  related_users.length + shared_ips.length + shared_devices.length,
      highest_severity:   maxSeverity(allSeverities),
      network_risk_score: calcNetworkRiskScore(suspicious_clusters, related_users, shared_ips, shared_devices),
    },
  }
}

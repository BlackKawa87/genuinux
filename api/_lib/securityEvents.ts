/**
 * Centralized security event writer with 1-hour aggregation.
 *
 * Deduplicates by (event_type, actor_ip, organization_id) within a rolling hour.
 * On repeat: increments occurrence_count, updates last_seen_at, escalates severity.
 * At 50 occurrences: auto-creates a critical incident if none is already open.
 * Never throws — swallows all errors to avoid breaking request handlers.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical'

export interface SecurityEventInput {
  event_type:       string
  actor_ip?:        string | null
  actor_user_id?:   string | null
  organization_id?: string | null
  metadata?:        Record<string, unknown>
}

const SEV_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 }
const SEV_NAMES = ['low', 'medium', 'high', 'critical'] as const

function escalate(base: string, count: number): string {
  if (count >= 50) return 'critical'
  let rank = SEV_RANK[base] ?? 0
  if (count >= 10) rank = Math.max(rank, 2)        // force at least 'high'
  else if (count >= 3) rank = Math.min(rank + 1, 3) // one level up
  return SEV_NAMES[rank]
}

export async function createSecurityEvent(
  supabase: SupabaseClient,
  input: SecurityEventInput,
  baseSeverity: SecuritySeverity = 'low',
): Promise<void> {
  try {
    const windowStart = new Date(Date.now() - 3_600_000).toISOString()

    // Fetch candidates from last hour; filter in JS to avoid dynamic query builder complexity
    const { data: candidates } = await supabase
      .from('security_events')
      .select('id, occurrence_count, severity, actor_ip, organization_id')
      .eq('event_type', input.event_type)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(20)

    type Candidate = {
      id: string
      occurrence_count: number
      severity: string
      actor_ip: string | null
      organization_id: string | null
    }

    const existing = (candidates as Candidate[] | null ?? []).find(m => {
      const ipMatch  = input.actor_ip        ? m.actor_ip        === input.actor_ip        : !m.actor_ip
      const orgMatch = input.organization_id ? m.organization_id === input.organization_id : !m.organization_id
      return ipMatch && orgMatch
    })

    if (existing) {
      const newCount = (existing.occurrence_count ?? 1) + 1
      const newSev   = escalate(baseSeverity, newCount)

      await supabase
        .from('security_events')
        .update({
          occurrence_count: newCount,
          last_seen_at:     new Date().toISOString(),
          severity:         newSev,
          metadata:         input.metadata ?? null,
        })
        .eq('id', existing.id)

      if (newCount >= 50) void autoIncident(supabase, input, newCount)

    } else {
      const now = new Date().toISOString()
      await supabase.from('security_events').insert({
        event_type:       input.event_type,
        severity:         baseSeverity,
        actor_ip:         input.actor_ip        ?? null,
        actor_user_id:    input.actor_user_id   ?? null,
        organization_id:  input.organization_id ?? null,
        metadata:         input.metadata        ?? null,
        occurrence_count: 1,
        first_seen_at:    now,
        last_seen_at:     now,
      })
    }
  } catch {
    // Non-critical path — never throw
  }
}

async function autoIncident(
  supabase: SupabaseClient,
  input: SecurityEventInput,
  occurrences: number,
): Promise<void> {
  try {
    const { data: open } = await supabase
      .from('incidents')
      .select('id')
      .eq('affected_system', input.event_type)
      .in('status', ['open', 'investigating'])
      .limit(1)
      .maybeSingle()

    if (open) return

    await supabase.from('incidents').insert({
      severity:        'critical',
      status:          'open',
      title:           `Repeated security event: ${input.event_type}`,
      description:     `Auto-created: ${occurrences} occurrences of '${input.event_type}' detected within 1 hour.`,
      affected_system: input.event_type,
      organization_id: input.organization_id ?? null,
      metadata_json:   { occurrences, actor_ip: input.actor_ip ?? null, ...input.metadata },
    })
  } catch {
    // Best-effort
  }
}

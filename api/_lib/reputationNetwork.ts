/**
 * Reputation Network — Phase 3 Module 5.
 *
 * Global cross-org entity reputation store.
 * When a fraud_label is submitted, the IP, device, and email associated
 * with the event have their reputation counters updated atomically.
 *
 * entity_reputation is GLOBAL — no organization_id is stored.
 * Reputation scores represent anonymous cross-org signal.
 * No org-identifying data is ever written to this table.
 *
 * Reads (getEntityReputation) are currently unused on the hot path.
 * Integration into fetchContext is gated by REPUTATION_ENRICHMENT_ENABLED=true
 * and will be implemented in Phase 3.5 once baseline data is collected.
 *
 * Fail-open: errors are always swallowed, never break label creation.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type LabelValue = 'confirmed_fraud' | 'suspected_fraud' | 'false_positive' | 'legitimate'

export interface ReputationEntry {
  entity_type:      'ip' | 'device' | 'email'
  entity_value:     string
  fraud_count:      number
  legitimate_count: number
  reputation_score: number  // fraud_count / (fraud_count + legitimate_count), 0.0–1.0
  last_seen_at:     string | null
}

/** Determines how a label maps to fraud/legitimate increments */
function labelToIncrements(label: LabelValue): { fraud: number; legit: number } {
  switch (label) {
    case 'confirmed_fraud':  return { fraud: 1, legit: 0 }
    case 'suspected_fraud':  return { fraud: 1, legit: 0 }
    case 'false_positive':   return { fraud: 0, legit: 1 }
    case 'legitimate':       return { fraud: 0, legit: 1 }
  }
}

/**
 * Updates reputation counters for every entity associated with an event.
 * Uses an atomic PostgreSQL upsert (increment_entity_reputation RPC).
 * Fire-and-forget — wrap with void at call sites.
 */
export async function updateEntityReputation(
  supabase: SupabaseClient,
  entities: { ip?: string | null; device?: string | null; email?: string | null },
  label:    LabelValue,
): Promise<void> {
  try {
    const { fraud, legit } = labelToIncrements(label)
    const ops: Promise<unknown>[] = []

    if (entities.ip) {
      ops.push(
        supabase.rpc('increment_entity_reputation', {
          p_type:  'ip',
          p_value: entities.ip,
          p_fraud: fraud,
          p_legit: legit,
        }),
      )
    }

    if (entities.device) {
      ops.push(
        supabase.rpc('increment_entity_reputation', {
          p_type:  'device',
          p_value: entities.device,
          p_fraud: fraud,
          p_legit: legit,
        }),
      )
    }

    if (entities.email) {
      ops.push(
        supabase.rpc('increment_entity_reputation', {
          p_type:  'email',
          p_value: entities.email,
          p_fraud: fraud,
          p_legit: legit,
        }),
      )
    }

    if (ops.length > 0) await Promise.allSettled(ops)
  } catch {
    // Never rethrow — reputation updates are non-critical
  }
}

/**
 * Reads current reputation for a set of entities.
 * Returns an array of ReputationEntry (one per entity that has reputation data).
 * Missing entities are silently omitted.
 */
export async function getEntityReputation(
  supabase:  SupabaseClient,
  entities:  { ip?: string | null; device?: string | null; email?: string | null },
): Promise<ReputationEntry[]> {
  try {
    const filters: Array<{ type: string; value: string }> = []
    if (entities.ip)     filters.push({ type: 'ip',     value: entities.ip })
    if (entities.device) filters.push({ type: 'device', value: entities.device })
    if (entities.email)  filters.push({ type: 'email',  value: entities.email })

    if (filters.length === 0) return []

    const results: ReputationEntry[] = []

    // Query each entity individually — avoids complex OR filters on a global table
    await Promise.allSettled(
      filters.map(async ({ type, value }) => {
        const { data } = await supabase
          .from('entity_reputation')
          .select('entity_type, entity_value, fraud_count, legitimate_count, last_seen_at')
          .eq('entity_type', type)
          .eq('entity_value', value)
          .maybeSingle()

        if (data) {
          const row = data as {
            entity_type: string; entity_value: string
            fraud_count: number; legitimate_count: number; last_seen_at: string
          }
          const total = row.fraud_count + row.legitimate_count
          results.push({
            entity_type:      row.entity_type as 'ip' | 'device' | 'email',
            entity_value:     row.entity_value,
            fraud_count:      row.fraud_count,
            legitimate_count: row.legitimate_count,
            reputation_score: total > 0 ? row.fraud_count / total : 0,
            last_seen_at:     row.last_seen_at ?? null,
          })
        }
      }),
    )

    return results
  } catch {
    return []
  }
}

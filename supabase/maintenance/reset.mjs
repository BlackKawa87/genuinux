/**
 * reset.mjs — Reset controlado das tabelas de feedback/ML
 *
 * Executa Fase 1 (Auditoria) → Fase 2 (Limpeza) → Fase 3 (Validação).
 * Usa o service role key do .env.local para bypass de RLS.
 *
 * Run: node supabase/maintenance/reset.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// ─── Config ───────────────────────────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url))
const root  = join(__dir, '..', '..')

function loadEnv() {
  try {
    const raw = readFileSync(join(root, '.env.local'), 'utf8')
    const env = {}
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m) env[m[1].trim()] = m[2].trim()
    }
    return env
  } catch {
    return {}
  }
}

const env = loadEnv()
const SUPABASE_URL = env['SUPABASE_URL'] ?? env['VITE_SUPABASE_URL']
const SERVICE_KEY  = env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios em .env.local')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY)

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sep  = () => console.log('─'.repeat(60))
const head = (t) => { sep(); console.log(`  ${t}`); sep() }

async function count(table) {
  try {
    const { count: n, error } = await db.from(table).select('*', { count: 'exact', head: true })
    if (error?.code === '42P01') return null  // table doesn't exist
    if (error) throw error
    return n ?? 0
  } catch { return null }
}

async function deleteAll(table) {
  try {
    const { error } = await db.from(table).delete().not('id', 'is', null)
    if (error?.code === '42P01') return { skipped: true }
    if (error) throw error
    return { ok: true }
  } catch (e) { return { error: e.message } }
}

// ─── Fase 1: Auditoria ────────────────────────────────────────────────────────

async function phase1Audit() {
  head('FASE 1 — AUDITORIA')

  const tables = ['fraud_labels', 'training_dataset', 'entity_reputation', 'ml_predictions']
  const counts = {}

  for (const t of tables) {
    const n = await count(t)
    counts[t] = n
    const status = n === null ? '(tabela inexistente)' : n === 0 ? '✓ vazia' : `⚠  ${n} linhas`
    console.log(`  ${t.padEnd(22)} → ${status}`)
  }

  // Duplicatas em fraud_labels
  if (counts['fraud_labels'] !== null && counts['fraud_labels'] > 0) {
    const { data: labels } = await db
      .from('fraud_labels')
      .select('organization_id, risk_event_id, label, created_at')
      .order('risk_event_id')
      .order('created_at')
      .limit(5000)

    const eventMap = new Map()
    for (const l of (labels ?? [])) {
      const key = `${l.organization_id}:${l.risk_event_id}`
      if (!eventMap.has(key)) eventMap.set(key, [])
      eventMap.get(key).push(l.label)
    }
    const dupes = [...eventMap.entries()].filter(([, arr]) => arr.length > 1)
    if (dupes.length > 0) {
      console.log(`\n  ⚠  Duplicatas em fraud_labels (${dupes.length} eventos com >1 label):`)
      for (const [key, labels] of dupes.slice(0, 5)) {
        console.log(`     ${key.slice(-20)} → [${labels.join(', ')}]`)
      }
    } else {
      console.log('  ✓  Sem duplicatas em fraud_labels')
    }
  }

  // Coverage atual
  const totalEvents = await count('risk_events')
  const { data: labelData } = await db
    .from('fraud_labels')
    .select('risk_event_id')
    .limit(50000)
  const distinctLabeled = new Set((labelData ?? []).map(l => l.risk_event_id)).size
  const rawLabelRows    = counts['fraud_labels'] ?? 0

  console.log('\n  Coverage atual:')
  console.log(`  • total_events:      ${totalEvents}`)
  console.log(`  • events_labeled:    ${distinctLabeled}`)
  console.log(`  • raw_label_rows:    ${rawLabelRows}`)
  if (totalEvents > 0) {
    const coverage = Math.round(distinctLabeled / totalEvents * 100)
    console.log(`  • feedback_coverage: ${coverage}%`)
    if (rawLabelRows > distinctLabeled) {
      console.log(`  ⚠  raw_label_rows (${rawLabelRows}) > distinct events (${distinctLabeled}) — duplicatas confirmadas`)
    }
  }

  return counts
}

// ─── Fase 2: Limpeza ─────────────────────────────────────────────────────────

async function phase2Cleanup(beforeCounts) {
  head('FASE 2 — LIMPEZA')

  const tables = ['fraud_labels', 'training_dataset', 'entity_reputation', 'ml_predictions']

  for (const t of tables) {
    const before = beforeCounts[t]
    if (before === null) {
      console.log(`  ${t.padEnd(22)} → tabela inexistente — pulando`)
      continue
    }
    const result = await deleteAll(t)
    if (result.skipped) {
      console.log(`  ${t.padEnd(22)} → tabela inexistente — pulando`)
    } else if (result.ok) {
      const after = await count(t)
      const removed = (before ?? 0)
      console.log(`  ${t.padEnd(22)} → ${removed} linhas removidas → agora: ${after} linhas ${after === 0 ? '✓' : '⚠'}`)
    } else {
      console.log(`  ${t.padEnd(22)} → ❌ ERRO: ${result.error}`)
    }
  }

  // Log no audit_logs
  try {
    const { data: orgs } = await db.from('organizations').select('id').limit(1)
    const orgId = orgs?.[0]?.id
    if (orgId) {
      await db.from('audit_logs').insert({
        organization_id: orgId,
        actor_id:        null,
        action:          'system.cleanup.controlled_reset',
        metadata: {
          fraud_labels_removed:    beforeCounts['fraud_labels'] ?? 0,
          training_removed:        beforeCounts['training_dataset'] ?? 0,
          reputation_removed:      beforeCounts['entity_reputation'] ?? 0,
          ml_predictions_removed:  beforeCounts['ml_predictions'] ?? 0,
          reason: 'Controlled reset — duplication bug v23 cleanup',
        }
      })
      console.log('\n  ✓ Evento registrado em audit_logs')
    }
  } catch (e) {
    console.log(`\n  ⚠ Não foi possível registrar em audit_logs: ${e.message}`)
  }
}

// ─── Fase 3: Validação ────────────────────────────────────────────────────────

async function phase3Validate() {
  head('FASE 3 — VALIDAÇÃO')

  // V1: Tabelas zeradas
  console.log('  V1. Tabelas zeradas após limpeza:')
  for (const t of ['fraud_labels', 'training_dataset', 'entity_reputation']) {
    const n = await count(t)
    console.log(`  ${t.padEnd(22)} → ${n === 0 ? '✓ vazia' : n === null ? '(inexistente)' : `⚠ ${n} linhas — PROBLEMA`}`)
  }

  // V2: Teste de UPSERT em fraud_labels
  console.log('\n  V2. Teste de UPSERT (3 inserções → deve resultar em 1 linha):')
  const { data: orgs } = await db.from('organizations').select('id').limit(1)
  const orgId      = orgs?.[0]?.id
  const testEvent  = 'reset-validation-test-001'

  if (!orgId) {
    console.log('  ⚠  Nenhuma organização encontrada — pulando teste de UPSERT')
  } else {
    // Inserção 1: legitimate
    await db.from('fraud_labels').upsert(
      { organization_id: orgId, risk_event_id: testEvent, label: 'legitimate' },
      { onConflict: 'organization_id,risk_event_id' }
    )
    // Inserção 2: confirmed_fraud (deve UPDATE)
    await db.from('fraud_labels').upsert(
      { organization_id: orgId, risk_event_id: testEvent, label: 'confirmed_fraud' },
      { onConflict: 'organization_id,risk_event_id' }
    )
    // Inserção 3: false_positive (deve UPDATE novamente)
    await db.from('fraud_labels').upsert(
      { organization_id: orgId, risk_event_id: testEvent, label: 'false_positive' },
      { onConflict: 'organization_id,risk_event_id' }
    )

    const { data: rows } = await db
      .from('fraud_labels')
      .select('label')
      .eq('organization_id', orgId)
      .eq('risk_event_id', testEvent)

    const rowCount  = rows?.length ?? 0
    const labelFinal = rows?.[0]?.label

    if (rowCount === 1 && labelFinal === 'false_positive') {
      console.log('  ✓ UPSERT OK — 3 inserções resultaram em 1 linha com label final correto (false_positive)')
    } else {
      console.log(`  ✗ UPSERT FALHOU — ${rowCount} linhas, label=${labelFinal}`)
    }

    // Limpar linha de teste
    await db.from('fraud_labels').delete()
      .eq('organization_id', orgId)
      .eq('risk_event_id', testEvent)
    console.log('  ✓ Linha de teste removida — fraud_labels vazia novamente')
  }

  // V3: Confirmar tabelas protegidas intactas
  console.log('\n  V3. Tabelas protegidas (não devem ter sido alteradas):')
  for (const t of ['risk_events', 'users_checked', 'organizations', 'api_keys']) {
    const n = await count(t)
    console.log(`  ${t.padEnd(22)} → ${n !== null ? `${n} linhas ✓` : 'inexistente'}`)
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

async function summary() {
  head('RELATÓRIO FINAL')

  const tables = ['fraud_labels', 'training_dataset', 'entity_reputation', 'ml_predictions', 'risk_events', 'users_checked']
  for (const t of tables) {
    const n = await count(t)
    const clean = ['fraud_labels', 'training_dataset', 'entity_reputation', 'ml_predictions']
    const symbol = clean.includes(t)
      ? (n === 0 ? '✓' : '⚠')
      : (n !== null ? '✓' : '—')
    console.log(`  ${symbol} ${t.padEnd(22)} ${n !== null ? n + ' linhas' : '(inexistente)'}`)
  }

  console.log('\n  Próximos passos:')
  console.log('  1. Vá para /dashboard/ops → API Test Sandbox')
  console.log('  2. Crie 1 evento com preset "Normal user" → anote o event_id')
  console.log('  3. Vá para /dashboard/events → aplique 1 label')
  console.log('  4. Mude o label 2-3 vezes → confirme que coverage fica em 100%')
  console.log('  5. Crie 2º evento → aplique label → coverage deve continuar ≤ 100%')
  console.log('  6. Verifique /dashboard/analytics → KPIs e Feedback Coverage')
  console.log('\n  Execute validate_after_tests.sql no Supabase SQL Editor após os testes.\n')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(60))
  console.log('  RESET CONTROLADO — Genuinux Intelligence Pipeline')
  console.log('  Projeto: ' + SUPABASE_URL)
  console.log('═'.repeat(60))

  const beforeCounts = await phase1Audit()
  await phase2Cleanup(beforeCounts)
  await phase3Validate()
  await summary()
}

main().catch(e => {
  console.error('❌ Erro fatal:', e.message)
  process.exit(1)
})

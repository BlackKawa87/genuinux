/**
 * redis_reset.mjs — Limpa todas as chaves gnx:* do Upstash Redis
 *
 * SEGURO: apaga apenas chaves com prefixo gnx: (counters, cache, stats).
 * NÃO apaga configuração global do Redis nem chaves de outros projetos.
 *
 * Run: node supabase/maintenance/redis_reset.mjs
 *
 * Requer .env.local com:
 *   UPSTASH_REDIS_REST_URL=...
 *   UPSTASH_REDIS_REST_TOKEN=...
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

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
  } catch { return {} }
}

const env   = loadEnv()
const URL   = env.UPSTASH_REDIS_REST_URL
const TOKEN = env.UPSTASH_REDIS_REST_TOKEN

if (!URL || !TOKEN) {
  console.error('❌ UPSTASH_REDIS_REST_URL ou UPSTASH_REDIS_REST_TOKEN não encontrados em .env.local')
  process.exit(1)
}

async function redisCmd(...args) {
  const r = await fetch(`${URL}/${args.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  return r.json()
}

async function scanAll(pattern) {
  const keys = []
  let cursor = '0'
  do {
    const res = await redisCmd('scan', cursor, 'match', pattern, 'count', '100')
    cursor = res.result[0]
    keys.push(...res.result[1])
  } while (cursor !== '0')
  return keys
}

async function main() {
  console.log('🔍 Escaneando chaves gnx:* ...')
  const keys = await scanAll('gnx:*')
  console.log(`   Encontradas: ${keys.length} chaves`)

  if (keys.length === 0) {
    console.log('✅ Redis já está limpo — nenhuma chave gnx:* encontrada.')
    return
  }

  // Mostrar breakdown por namespace
  const namespaces = {}
  for (const k of keys) {
    const ns = k.split(':').slice(0, 3).join(':')
    namespaces[ns] = (namespaces[ns] ?? 0) + 1
  }
  console.log('\n📊 Breakdown por namespace:')
  for (const [ns, count] of Object.entries(namespaces).sort()) {
    console.log(`   ${ns.padEnd(40)} ${count}`)
  }

  // Confirmar
  console.log(`\n⚠️  Prestes a deletar ${keys.length} chaves. Ctrl+C para cancelar. Continuando em 3s...`)
  await new Promise(r => setTimeout(r, 3000))

  // Deletar em batches de 10
  let deleted = 0
  for (let i = 0; i < keys.length; i += 10) {
    const batch = keys.slice(i, i + 10)
    await redisCmd('del', ...batch)
    deleted += batch.length
    process.stdout.write(`\r   Deletadas: ${deleted}/${keys.length}`)
  }

  console.log('\n\n✅ Redis limpo. Verificando...')
  const remaining = await scanAll('gnx:*')
  if (remaining.length === 0) {
    console.log('✅ Confirmado: 0 chaves gnx:* restantes.')
  } else {
    console.warn(`⚠️  Ainda restam ${remaining.length} chaves. Execute novamente.`)
  }
}

main().catch(err => {
  console.error('❌ Erro:', err.message)
  process.exit(1)
})

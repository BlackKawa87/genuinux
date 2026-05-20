#!/usr/bin/env node
/**
 * Genuinux — /api/risk/check load test
 *
 * Requires Node 20+ (uses fetch, parseArgs, performance).
 * Does NOT require npm install — zero dependencies.
 *
 * Usage:
 *   node scripts/load-test.mjs --url https://genuinux.vercel.app --key gnx_live_...
 *
 * Flags:
 *   --url       Base URL of the deployment    (default: http://localhost:3000)
 *   --key       API key from the dashboard    (required)
 *   --rps       Target requests per second    (default: 10)
 *   --duration  Measurement window, seconds  (default: 30)
 *   --warm      Warmup duration, seconds      (default: 5)
 *
 * Exit codes:
 *   0 — all beta gates passed
 *   1 — one or more gates failed
 *
 * Beta gates (printed at the end):
 *   p95 latency  < 800 ms
 *   Error rate   < 1 %
 *   Max latency  < 5000 ms
 */

import { parseArgs } from 'node:util'

// ── Args ──────────────────────────────────────────────────────────────────────

const { values: flags } = parseArgs({
  options: {
    url:      { type: 'string', default: 'http://localhost:3000' },
    key:      { type: 'string', default: '' },
    rps:      { type: 'string', default: '10' },
    duration: { type: 'string', default: '30' },
    warm:     { type: 'string', default: '5' },
  },
  allowPositionals: false,
})

const BASE_URL  = flags.url.replace(/\/$/, '')
const API_KEY   = flags.key
const RPS       = Math.max(1, parseInt(flags.rps,      10))
const DURATION  = Math.max(5, parseInt(flags.duration, 10))
const WARM_SECS = Math.max(0, parseInt(flags.warm,     10))

if (!API_KEY) {
  console.error('\n  Error: --key is required.')
  console.error('  Get an API key from the Genuinux dashboard → API Keys.\n')
  process.exit(1)
}

// ── Payload factory ───────────────────────────────────────────────────────────

const EVENT_TYPES  = ['signup', 'login', 'transaction', 'checkout', 'withdrawal']
const COUNTRIES    = ['US', 'GB', 'BR', 'DE', 'FR', 'NG', 'RU', 'CN', 'IN', 'AU', 'CA', 'MX']
const EMAIL_HOSTS  = ['gmail.com', 'yahoo.com', 'hotmail.com', 'protonmail.com']
const RISKY_HOSTS  = ['mailinator.com', 'temp.sh', 'guerrillamail.com', '10minutemail.com']
const USER_AGENTS  = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
]

function rnd(n)     { return Math.floor(Math.random() * n) }
function pick(arr)  { return arr[rnd(arr.length)] }
function hex(n)     { return [...Array(n)].map(() => rnd(16).toString(16)).join('') }
function randIP()   { return `${rnd(254)+1}.${rnd(254)+1}.${rnd(254)+1}.${rnd(254)+1}` }

function makePayload() {
  const userId   = `beta_${rnd(500).toString().padStart(3, '0')}`  // 500 distinct users → velocity signals
  const isRisky  = Math.random() < 0.15                            // 15% get risky signals
  const sameIP   = Math.random() < 0.1                             // 10% share a pool of 5 IPs

  return {
    external_user_id: userId,
    event_type:       pick(EVENT_TYPES),
    email:            `${userId}@${isRisky ? pick(RISKY_HOSTS) : pick(EMAIL_HOSTS)}`,
    ip_address:       sameIP ? `10.0.0.${rnd(5) + 1}` : randIP(),
    device_id:        `dev_${hex(8)}`,
    user_agent:       isRisky ? 'python-requests/2.31.0' : pick(USER_AGENTS),
    country:          pick(COUNTRIES),
    metadata:         isRisky ? { vpn: true, proxy: 'residential' } : undefined,
  }
}

// ── HTTP request ──────────────────────────────────────────────────────────────

async function fireRequest() {
  const t0 = performance.now()
  let status = 0
  let rateLimitHit = false

  try {
    const res = await fetch(`${BASE_URL}/api/risk/check`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body:   JSON.stringify(makePayload()),
      signal: AbortSignal.timeout(12_000),
    })
    status = res.status
    rateLimitHit = status === 429
    await res.text()  // drain body to free the connection
  } catch {
    status = 0  // timeout or network error
  }

  return { latencyMs: performance.now() - t0, status, rateLimitHit }
}

// ── Statistics ────────────────────────────────────────────────────────────────

function ptile(sorted, p) {
  if (sorted.length === 0) return 0
  return sorted[Math.max(0, Math.ceil(p / 100 * sorted.length) - 1)]
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function bar(ratio, width = 20) {
  const filled = Math.round(ratio * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function runPhase(label, durationSec, onResult) {
  const intervalMs = 1000 / RPS
  const endAt      = Date.now() + durationSec * 1000
  const inflight   = new Set()

  while (Date.now() < endAt) {
    const p = fireRequest().then(result => {
      inflight.delete(p)
      if (onResult) onResult(result)
    })
    inflight.add(p)
    await sleep(intervalMs)
  }

  // Wait for all in-flight requests to settle
  await Promise.allSettled([...inflight])
}

// ── Main ──────────────────────────────────────────────────────────────────────

const W = 56

console.log('\n' + '━'.repeat(W))
console.log('  Genuinux load test — /api/risk/check')
console.log('━'.repeat(W))
console.log(`  URL      : ${BASE_URL}`)
console.log(`  Target   : ${RPS} req/s × ${DURATION}s  (+${WARM_SECS}s warmup)`)
console.log(`  Payloads : varied (${RPS * DURATION} total requests planned)`)
console.log('━'.repeat(W) + '\n')

// Warmup
if (WARM_SECS > 0) {
  process.stdout.write(`  Warming up (${WARM_SECS}s, results discarded)...`)
  await runPhase('warmup', WARM_SECS, null)
  process.stdout.write(' done\n\n')
}

// Measurement phase
const latencies    = []
const statusCounts = {}
let   rl429Count   = 0
let   progressTick = 0
const targetReqs   = RPS * DURATION
const measureStart = Date.now()

await runPhase('measure', DURATION, ({ latencyMs, status, rateLimitHit }) => {
  latencies.push(latencyMs)
  const key = status === 0 ? 'TIMEOUT' : String(status)
  statusCounts[key] = (statusCounts[key] ?? 0) + 1
  if (rateLimitHit) rl429Count++

  progressTick++
  if (progressTick % Math.max(1, Math.floor(targetReqs / 40)) === 0) {
    const pct = Math.min(1, latencies.length / targetReqs)
    process.stdout.write(`\r  Measuring  [${bar(pct)}] ${(pct * 100).toFixed(0).padStart(3)}%`)
  }
})

const elapsedSec = (Date.now() - measureStart) / 1000
process.stdout.write('\r' + ' '.repeat(W) + '\r')

// ── Report ────────────────────────────────────────────────────────────────────

const sorted     = [...latencies].sort((a, b) => a - b)
const n          = sorted.length
const errCount   = Object.entries(statusCounts)
                     .filter(([s]) => s !== '200')
                     .reduce((a, [, v]) => a + v, 0)
const errRate    = n > 0 ? errCount / n : 1
const throughput = n / elapsedSec

const p50  = ptile(sorted, 50)
const p75  = ptile(sorted, 75)
const p95  = ptile(sorted, 95)
const p99  = ptile(sorted, 99)
const pMax = sorted[sorted.length - 1] ?? 0

console.log('━'.repeat(W))
console.log('  Results')
console.log('━'.repeat(W))
console.log(`  Requests completed : ${n}`)
console.log(`  Elapsed            : ${elapsedSec.toFixed(1)}s`)
console.log(`  Actual throughput  : ${throughput.toFixed(1)} req/s  (target: ${RPS})`)
console.log(`  Error rate         : ${(errRate * 100).toFixed(2)}%  (${errCount}/${n})`)
if (rl429Count > 0) {
  console.log(`  Rate-limited (429) : ${rl429Count}  ← reduce --rps or add Upstash`)
}
console.log('')
console.log('  Latency (ms):')
console.log(`    p50  : ${p50.toFixed(0).padStart(6)}`)
console.log(`    p75  : ${p75.toFixed(0).padStart(6)}`)
console.log(`    p95  : ${p95.toFixed(0).padStart(6)}`)
console.log(`    p99  : ${p99.toFixed(0).padStart(6)}`)
console.log(`    max  : ${pMax.toFixed(0).padStart(6)}`)
console.log('')
console.log('  HTTP status breakdown:')
for (const [s, c] of Object.entries(statusCounts).sort()) {
  const pct   = (c / n * 100).toFixed(1)
  const label = s === '200' ? ' ✓' : s === '429' ? ' ⚠ rate-limited' : ' ✗'
  console.log(`    ${s.padEnd(8)}: ${c.toString().padStart(5)}  (${pct}%)${label}`)
}

// ── Beta gates ────────────────────────────────────────────────────────────────

const gate_p95   = p95  < 800
const gate_err   = errRate < 0.01
const gate_max   = pMax < 5000
const allPass    = gate_p95 && gate_err && gate_max

console.log('')
console.log('━'.repeat(W))
console.log('  Beta launch gates')
console.log('━'.repeat(W))
console.log(`  ${gate_p95 ? '✅' : '❌'} p95 < 800ms        ${gate_p95 ? 'PASS' : 'FAIL'} (${p95.toFixed(0)}ms)`)
console.log(`  ${gate_err ? '✅' : '❌'} Error rate < 1%    ${gate_err ? 'PASS' : 'FAIL'} (${(errRate*100).toFixed(2)}%)`)
console.log(`  ${gate_max ? '✅' : '❌'} Max latency < 5s   ${gate_max ? 'PASS' : 'FAIL'} (${pMax.toFixed(0)}ms)`)
console.log('')
console.log(`  Overall: ${allPass ? '✅ READY FOR BETA' : '❌ NOT READY — fix failing gates first'}`)
console.log('━'.repeat(W) + '\n')

process.exit(allPass ? 0 : 1)

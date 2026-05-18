/**
 * Genuinux Risk Engine — v1
 *
 * Função pura: recebe dados de evento + contexto histórico → retorna avaliação completa.
 * Sem efeitos colaterais. Sem chamadas de banco. O contexto histórico (velocidade,
 * duplicatas) deve ser buscado pelo chamador antes de invocar `analyze()`.
 *
 * Para evoluir:
 *  - Adicione novos analisadores seguindo o padrão `analyze*()` abaixo.
 *  - Registre-os no array `allSignals` dentro de `analyze()`.
 *  - Adicione os pesos correspondentes em `WEIGHTS`.
 *  - Expanda `RiskEngineContext` com os campos históricos necessários.
 */

import type { RiskLevel, Decision, EventType } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

/** Dados brutos do evento enviados pelo cliente. */
export interface RiskEngineInput {
  external_user_id: string
  event_type: EventType
  email?: string
  phone?: string
  ip_address?: string
  user_agent?: string
  device_id?: string
  /** ISO 3166-1 alpha-2: "BR", "US", "RU" */
  country?: string
  /** Dados extras livres — usados para sinais comportamentais customizados */
  metadata?: Record<string, unknown>
  /** Contexto histórico pré-buscado do banco pelo chamador */
  context?: RiskEngineContext
}

/**
 * Métricas históricas que o chamador (Edge Function / API route) deve buscar
 * no banco antes de chamar `analyze()`. Todos os campos são opcionais:
 * ausente = desconhecido, o que pode aumentar levemente o risco.
 */
export interface RiskEngineContext {
  /** Eventos enviados por este user_id nos últimos 10 minutos */
  user_events_last_10min?: number
  /** Total de eventos originados deste IP na última hora */
  ip_event_count_last_1h?: number
  /** Usuários distintos vistos neste IP nas últimas 24h */
  ip_distinct_users_last_24h?: number
  /** Eventos de signup originados deste IP na última hora */
  ip_signup_count_last_1h?: number
  /** Usuários distintos vinculados a este device_id */
  device_distinct_users?: number
  /** Se este device_id já foi associado a uma decisão BLOCK */
  device_has_prior_block?: boolean
  /** Quantas contas estão vinculadas a este endereço de e-mail */
  email_account_count?: number
}

/** Um sinal de risco detectado durante a análise. */
export interface DetectedSignal {
  /** Identificador legível por máquina (snake_case) */
  code: string
  /** Descrição legível por humano */
  label: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  /** Quanto este sinal adiciona ao fraud_score */
  fraud_impact: number
  /** Quanto este sinal subtrai do trust_score */
  trust_impact: number
}

/** Resultado completo da avaliação de risco. */
export interface RiskEngineOutput {
  trust_score: number
  fraud_score: number
  risk_level: RiskLevel
  decision: Decision
  signals: DetectedSignal[]
  ai_summary: string
  processing_time_ms: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes e configuração
// ─────────────────────────────────────────────────────────────────────────────

/** Eventos que envolvem risco financeiro elevado — recebem penalidade base extra. */
const SENSITIVE_EVENTS: ReadonlySet<EventType> = new Set(['withdrawal', 'transaction'])

/**
 * Provedores de e-mail descartável conhecidos.
 * Expanda esta lista ou substitua por uma API externa (e.g. Kickbox, NeverBounce).
 */
const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'grr.la', 'guerrillamail.info',
  'spam4.me', 'trashmail.com', 'dispostable.com', 'maildrop.cc',
  'getairmail.com', 'fakeinbox.com', 'spamgourmet.com', 'temp-mail.org',
  'discard.email', 'mailnull.com', '10minutemail.com', 'tempinbox.com',
  'fakemail.net', 'mailnesia.com', 'trashmail.me', 'throwam.com',
  'burnermail.io', 'inboxbear.com', 'mailnull.com', 'spamcannon.com',
])

/**
 * Padrões de user agent associados a automação / headless browsers.
 * Extend conforme novas ferramentas surgirem.
 */
const AUTOMATION_UA_PATTERNS = [
  'headlesschrome', 'headless', 'phantomjs', 'selenium', 'webdriver',
  'puppeteer', 'playwright', 'python-requests', 'python-urllib',
  'curl/', 'wget/', 'go-http-client', 'java/', 'libwww-perl',
]

/**
 * Pesos de impacto por tipo de sinal.
 * Ajuste estes valores para calibrar a sensibilidade do engine sem tocar na lógica.
 * fraud_impact: quanto sobe o fraud_score | trust_impact: quanto cai o trust_score
 */
const WEIGHTS = {
  // Sinais de e-mail
  EMAIL_ABSENT:          { fraud: 20, trust: 20 },
  EMAIL_DISPOSABLE:      { fraud: 25, trust: 20 },
  EMAIL_DUPLICATE:       { fraud: 30, trust: 25 },

  // Sinais de IP
  IP_ABSENT:             { fraud: 15, trust: 15 },
  IP_MULTI_USER:         { fraud: 20, trust: 18 },
  IP_HIGH_RISK_COUNTRY:  { fraud: 15, trust: 12 },

  // Sinais de device
  DEVICE_ABSENT:         { fraud: 15, trust: 12 },
  DEVICE_MULTI_ACCOUNT:  { fraud: 25, trust: 20 },
  DEVICE_PRIOR_BLOCK:    { fraud: 45, trust: 40 },

  // Sinais de velocidade
  VELOCITY_USER:         { fraud: 30, trust: 25 },
  VELOCITY_SIGNUP_IP:    { fraud: 35, trust: 30 },
  VELOCITY_DEVICE:       { fraud: 30, trust: 25 },

  // Sinais comportamentais
  EVENT_SENSITIVE:       { fraud: 10, trust:  5 },
  UA_ABSENT:             { fraud: 12, trust: 10 },
  UA_AUTOMATION:         { fraud: 35, trust: 30 },
  METADATA_SUSPICIOUS:   { fraud: 20, trust: 15 },
} as const

/** Limiares que definem cada nível de risco (baseados no fraud_score). */
const RISK_THRESHOLDS = {
  low:      [0,  25],
  medium:   [26, 55],
  high:     [56, 80],
  critical: [81, 100],
} as const

/**
 * Dentro do nível "medium", fraud_score >= este valor → decisão REVIEW ao invés de ALLOW.
 * Permite aprovar automaticamente casos médios de baixo impacto.
 */
const MEDIUM_REVIEW_CUTOFF = 40

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários internos
// ─────────────────────────────────────────────────────────────────────────────

/** Garante que score fique entre 0 e 100. */
function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)))
}

function emailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? ''
}

/**
 * Cria um DetectedSignal com multiplicador opcional de impacto.
 * Multiplicadores escalam um sinal quando a gravidade é maior (ex: 20 contas no mesmo IP).
 */
function mkSignal(
  code: string,
  label: string,
  severity: DetectedSignal['severity'],
  weights: { fraud: number; trust: number },
  multiplier = 1,
): DetectedSignal {
  return {
    code,
    label,
    severity,
    fraud_impact: Math.round(weights.fraud * multiplier),
    trust_impact: Math.round(weights.trust * multiplier),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Analisadores de sinal — um por categoria
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1. Sinais de e-mail
 * Verifica ausência, domínio descartável e duplicidade de contas.
 */
function analyzeEmail(
  email: string | undefined,
  ctx: RiskEngineContext,
): DetectedSignal[] {
  if (!email) {
    return [mkSignal('EMAIL_ABSENT', 'Email address not provided', 'medium', WEIGHTS.EMAIL_ABSENT)]
  }

  const signals: DetectedSignal[] = []
  const domain = emailDomain(email)

  if (DISPOSABLE_DOMAINS.has(domain)) {
    signals.push(mkSignal(
      'EMAIL_DISPOSABLE',
      `Disposable email domain detected (${domain})`,
      'high',
      WEIGHTS.EMAIL_DISPOSABLE,
    ))
  }

  const dupeCount = ctx.email_account_count ?? 0
  if (dupeCount > 1) {
    // Escala com o número de duplicatas — >5 contas no mesmo e-mail é crítico
    const multiplier = dupeCount > 5 ? 1.3 : 1
    const severity: DetectedSignal['severity'] = dupeCount > 5 ? 'critical' : dupeCount > 2 ? 'high' : 'medium'
    signals.push(mkSignal(
      'EMAIL_DUPLICATE',
      `Email linked to ${dupeCount} accounts`,
      severity,
      WEIGHTS.EMAIL_DUPLICATE,
      multiplier,
    ))
  }

  return signals
}

/**
 * 2. Sinais de IP
 * Verifica ausência, múltiplos usuários no mesmo IP e país de alto risco.
 * Hook para proxy/VPN: adicione aqui a chamada a uma API de enriquecimento de IP
 * (ex: ipapi.co, MaxMind GeoIP2) quando disponível.
 */
function analyzeIP(
  ip: string | undefined,
  country: string | undefined,
  ctx: RiskEngineContext,
): DetectedSignal[] {
  if (!ip) {
    return [mkSignal('IP_ABSENT', 'IP address not provided', 'medium', WEIGHTS.IP_ABSENT)]
  }

  const signals: DetectedSignal[] = []
  const distinctUsers = ctx.ip_distinct_users_last_24h ?? 0

  // Muitos usuários distintos no mesmo IP = possível data center, VPN compartilhada ou bot farm
  if (distinctUsers > 5) {
    const multiplier = distinctUsers > 20 ? 1.4 : distinctUsers > 10 ? 1.2 : 1
    const severity: DetectedSignal['severity'] = distinctUsers > 20 ? 'critical' : distinctUsers > 10 ? 'high' : 'medium'
    signals.push(mkSignal(
      'IP_MULTI_USER',
      `${distinctUsers} distinct users from this IP in the last 24h`,
      severity,
      WEIGHTS.IP_MULTI_USER,
      multiplier,
    ))
  }

  // Países com alto índice de fraude documentada — expanda ou integre via API
  const HIGH_RISK_COUNTRIES = new Set(['RU', 'KP', 'IR', 'NG', 'PK', 'BY'])
  if (country && HIGH_RISK_COUNTRIES.has(country.toUpperCase())) {
    signals.push(mkSignal(
      'IP_HIGH_RISK_COUNTRY',
      `Event originated from high-risk country (${country.toUpperCase()})`,
      'medium',
      WEIGHTS.IP_HIGH_RISK_COUNTRY,
    ))
  }

  return signals
}

/**
 * 3. Sinais de device
 * Verifica ausência do fingerprint, múltiplas contas no mesmo device e histórico de bloqueios.
 */
function analyzeDevice(
  deviceId: string | undefined,
  ctx: RiskEngineContext,
): DetectedSignal[] {
  if (!deviceId) {
    return [mkSignal('DEVICE_ABSENT', 'Device fingerprint not provided', 'medium', WEIGHTS.DEVICE_ABSENT)]
  }

  const signals: DetectedSignal[] = []

  // Device previamente bloqueado — maior sinal de alerta individual
  if (ctx.device_has_prior_block) {
    signals.push(mkSignal(
      'DEVICE_PRIOR_BLOCK',
      'Device previously associated with a blocked event',
      'critical',
      WEIGHTS.DEVICE_PRIOR_BLOCK,
    ))
  }

  const userCount = ctx.device_distinct_users ?? 0
  if (userCount > 3) {
    const multiplier = userCount > 10 ? 1.5 : userCount > 5 ? 1.2 : 1
    const severity: DetectedSignal['severity'] = userCount > 10 ? 'critical' : userCount > 5 ? 'high' : 'medium'
    signals.push(mkSignal(
      'DEVICE_MULTI_ACCOUNT',
      `Device shared across ${userCount} user accounts`,
      severity,
      WEIGHTS.DEVICE_MULTI_ACCOUNT,
      multiplier,
    ))
  }

  return signals
}

/**
 * 4. Sinais de velocidade
 * Detecta rajadas de eventos que indicam automação ou campanhas de fraude em massa.
 */
function analyzeVelocity(
  eventType: EventType,
  ctx: RiskEngineContext,
): DetectedSignal[] {
  const signals: DetectedSignal[] = []

  // Velocidade do usuário: muitos eventos em janela curta
  const userEvents = ctx.user_events_last_10min ?? 0
  if (userEvents > 10) {
    signals.push(mkSignal(
      'VELOCITY_USER',
      `${userEvents} events from this user in the last 10 minutes`,
      userEvents > 20 ? 'critical' : 'high',
      WEIGHTS.VELOCITY_USER,
      userEvents > 20 ? 1.3 : 1,
    ))
  }

  // Velocidade de signup por IP: campanha de criação de contas falsas
  const signupCount = ctx.ip_signup_count_last_1h ?? 0
  if (eventType === 'signup' && signupCount > 5) {
    signals.push(mkSignal(
      'VELOCITY_SIGNUP_IP',
      `${signupCount} signup attempts from this IP in the last hour`,
      signupCount > 15 ? 'critical' : 'high',
      WEIGHTS.VELOCITY_SIGNUP_IP,
      signupCount > 15 ? 1.4 : 1,
    ))
  }

  // Velocidade de troca de usuário por device — device rotacionando contas rapidamente
  const deviceUsers = ctx.device_distinct_users ?? 0
  if (deviceUsers > 10) {
    signals.push(mkSignal(
      'VELOCITY_DEVICE',
      `High account-switching velocity on this device (${deviceUsers} users)`,
      'critical',
      WEIGHTS.VELOCITY_DEVICE,
      1.2,
    ))
  }

  return signals
}

/**
 * 5. Sinais comportamentais e contextuais
 * Analisa event_type, user_agent e metadata livre do cliente.
 */
function analyzeBehavioral(
  eventType: EventType,
  userAgent: string | undefined,
  metadata: Record<string, unknown> | undefined,
): DetectedSignal[] {
  const signals: DetectedSignal[] = []

  // Tipo de evento de alto impacto financeiro
  if (SENSITIVE_EVENTS.has(eventType)) {
    signals.push(mkSignal(
      'EVENT_SENSITIVE',
      `Event type "${eventType}" carries elevated financial risk`,
      'medium',
      WEIGHTS.EVENT_SENSITIVE,
    ))
  }

  // User agent ausente ou curto demais — padrão de bots simples
  if (!userAgent || userAgent.trim().length < 10) {
    signals.push(mkSignal(
      'UA_ABSENT',
      'User agent is missing or suspiciously short — likely automation',
      'medium',
      WEIGHTS.UA_ABSENT,
    ))
  } else {
    // User agent com assinatura de ferramenta de automação
    const ua = userAgent.toLowerCase()
    const isAutomation = AUTOMATION_UA_PATTERNS.some(pattern => ua.includes(pattern))
    if (isAutomation) {
      signals.push(mkSignal(
        'UA_AUTOMATION',
        'Automation tool signature detected in user agent',
        'high',
        WEIGHTS.UA_AUTOMATION,
      ))
    }
  }

  // Sinais explícitos passados via metadata pelo cliente
  // Exemplo: { bot: true }, { proxy: true }, { tor: true }, { amount_usd: 50000 }
  if (metadata) {
    const suspiciousFlags = ['bot', 'proxy', 'tor', 'vpn', 'emulator']
    const foundFlags = suspiciousFlags.filter(flag => metadata[flag] === true)
    if (foundFlags.length > 0) {
      signals.push(mkSignal(
        'METADATA_SUSPICIOUS',
        `Suspicious flags in metadata: ${foundFlags.join(', ')}`,
        foundFlags.length > 1 ? 'high' : 'medium',
        WEIGHTS.METADATA_SUSPICIOUS,
        foundFlags.length > 1 ? 1.2 : 1,
      ))
    }

    // Transação de valor muito alto aumenta risco contextual
    const amount = typeof metadata['amount_usd'] === 'number' ? metadata['amount_usd'] : null
    if (amount !== null && amount > 10_000 && SENSITIVE_EVENTS.has(eventType)) {
      signals.push(mkSignal(
        'METADATA_HIGH_VALUE',
        `High-value ${eventType}: $${amount.toLocaleString()} USD`,
        amount > 50_000 ? 'high' : 'medium',
        { fraud: amount > 50_000 ? 20 : 10, trust: amount > 50_000 ? 15 : 8 },
      ))
    }
  }

  return signals
}

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo de scores
// ─────────────────────────────────────────────────────────────────────────────

function calculateScores(signals: DetectedSignal[]): {
  trust_score: number
  fraud_score: number
} {
  let trust = 100
  let fraud = 0

  for (const s of signals) {
    trust -= s.trust_impact
    fraud += s.fraud_impact
  }

  return { trust_score: clamp(trust), fraud_score: clamp(fraud) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk level e decisão
// ─────────────────────────────────────────────────────────────────────────────

function getRiskLevel(fraudScore: number): RiskLevel {
  if (fraudScore <= RISK_THRESHOLDS.low[1])      return 'low'
  if (fraudScore <= RISK_THRESHOLDS.medium[1])   return 'medium'
  if (fraudScore <= RISK_THRESHOLDS.high[1])     return 'high'
  return 'critical'
}

function getDecision(riskLevel: RiskLevel, fraudScore: number): Decision {
  if (riskLevel === 'low')                                          return 'allow'
  if (riskLevel === 'medium' && fraudScore < MEDIUM_REVIEW_CUTOFF) return 'allow'
  if (riskLevel === 'medium')                                        return 'review'
  if (riskLevel === 'high')                                          return 'review'
  return 'block'
}

// ─────────────────────────────────────────────────────────────────────────────
// Resumo em linguagem natural
// ─────────────────────────────────────────────────────────────────────────────

function buildSummary(
  input: RiskEngineInput,
  scores: { trust_score: number; fraud_score: number },
  riskLevel: RiskLevel,
  decision: Decision,
  signals: DetectedSignal[],
): string {
  const { external_user_id, event_type, country } = input
  const { trust_score, fraud_score } = scores

  const origin     = country ? ` from ${country.toUpperCase()}` : ''
  const decisionTx = { allow: 'ALLOWED', review: 'FLAGGED FOR REVIEW', block: 'BLOCKED' }[decision]

  const intro = [
    `User ${external_user_id} attempted a ${event_type}${origin}.`,
    `Trust score: ${trust_score}/100 — fraud score: ${fraud_score}/100 (${riskLevel} risk).`,
    `Decision: ${decisionTx}.`,
  ].join(' ')

  if (signals.length === 0) {
    return `${intro} No suspicious signals detected.`
  }

  const high     = signals.filter(s => s.severity === 'critical' || s.severity === 'high')
  const moderate = signals.filter(s => s.severity === 'low' || s.severity === 'medium')
  const parts: string[] = []

  if (high.length > 0) {
    parts.push(`High-severity signals: ${high.map(s => s.label).join('; ')}.`)
  }
  if (moderate.length > 0) {
    parts.push(`Additional signals: ${moderate.map(s => s.label).join('; ')}.`)
  }

  return `${intro} ${parts.join(' ')}`.trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// Ponto de entrada público
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analisa um evento de usuário e retorna avaliação completa de risco.
 *
 * @param input - Dados brutos do evento (campos opcionais aumentam incerteza/risco)
 * @returns     - Scores, decision, lista de sinais e resumo em linguagem natural
 *
 * @example
 * ```ts
 * const result = analyze({
 *   external_user_id: 'usr_k9x2m',
 *   event_type: 'checkout',
 *   ip_address: '1.2.3.4',
 *   country: 'US',
 *   email: 'user@gmail.com',
 *   context: {
 *     ip_distinct_users_last_24h: 2,
 *     email_account_count: 1,
 *   },
 * })
 * // result.trust_score  → 90
 * // result.fraud_score  → 10
 * // result.risk_level   → 'low'
 * // result.decision     → 'allow'
 * ```
 */
export function analyze(input: RiskEngineInput): RiskEngineOutput {
  const start = Date.now()
  const ctx   = input.context ?? {}

  // Executa todos os analisadores e junta os sinais
  const rawSignals: DetectedSignal[] = [
    ...analyzeEmail(input.email, ctx),
    ...analyzeIP(input.ip_address, input.country, ctx),
    ...analyzeDevice(input.device_id, ctx),
    ...analyzeVelocity(input.event_type, ctx),
    ...analyzeBehavioral(input.event_type, input.user_agent, input.metadata),
  ]

  // Remove duplicatas — mesmo código não deve contar duas vezes
  const seen = new Set<string>()
  const signals = rawSignals.filter(s => !seen.has(s.code) && seen.add(s.code))

  const { trust_score, fraud_score } = calculateScores(signals)
  const risk_level = getRiskLevel(fraud_score)
  const decision   = getDecision(risk_level, fraud_score)
  const ai_summary = buildSummary(input, { trust_score, fraud_score }, risk_level, decision, signals)

  return {
    trust_score,
    fraud_score,
    risk_level,
    decision,
    signals,
    ai_summary,
    processing_time_ms: Date.now() - start,
  }
}

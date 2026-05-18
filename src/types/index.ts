export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type Decision = 'allow' | 'review' | 'block'
export type EventType =
  | 'signup'
  | 'login'
  | 'transaction'
  | 'withdrawal'
  | 'referral'
  | 'checkout'
  | 'custom'

export type Plan = 'free' | 'starter' | 'pro' | 'enterprise'
export type ApiKeyStatus = 'active' | 'revoked'
export type RuleStatus = 'active' | 'paused'
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'escalated'

export interface Organization {
  id: string
  name: string
  website: string | null
  industry: string | null
  plan: Plan
  owner_id: string
  created_at: string
}

export interface Profile {
  id: string
  user_id: string
  full_name: string | null
  email: string
  role: 'owner' | 'admin' | 'member'
  organization_id: string
  created_at: string
}

export interface ApiKey {
  id: string
  organization_id: string
  name: string
  key_hash: string
  key_prefix: string
  status: ApiKeyStatus
  created_at: string
  last_used_at: string | null
  requests_count?: number
}

export interface UserChecked {
  id: string
  organization_id: string
  external_user_id: string
  email: string | null
  phone: string | null
  ip_address: string | null
  country: string | null
  device_id: string | null
  created_at: string
}

export interface RiskEvent {
  id: string
  organization_id: string
  external_user_id: string
  event_type: EventType
  ip_address: string | null
  device_id: string | null
  email: string | null
  user_agent: string | null
  country: string | null
  trust_score: number
  fraud_score: number
  risk_level: RiskLevel
  decision: Decision
  signals_json: Record<string, unknown> | null
  ai_summary: string | null
  created_at: string
}

export interface Rule {
  id: string
  organization_id: string
  name: string
  condition_type: string
  condition_value: string
  action: Decision
  status: RuleStatus
  created_at: string
}

export interface ReviewQueueItem {
  id: string
  organization_id: string
  risk_event_id: string
  status: ReviewStatus
  assigned_to: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Webhook {
  id: string
  organization_id: string
  endpoint_url: string
  secret: string
  status: 'active' | 'disabled'
  created_at: string
}

export interface AuditLog {
  id: string
  organization_id: string
  user_id: string | null
  action: string
  metadata_json: Record<string, unknown> | null
  created_at: string
}

export interface DashboardMetrics {
  total_requests_24h: number
  blocked_24h: number
  avg_trust_score: number
  api_uptime: number
  block_rate: number
}

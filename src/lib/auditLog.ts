import { supabase } from './supabase'

interface WriteAuditLogParams {
  organization_id: string
  user_id?: string | null
  action: string
  target_type?: string | null
  target_id?: string | null
  metadata_json?: Record<string, unknown> | null
}

export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  await supabase.from('audit_logs').insert({
    organization_id: params.organization_id,
    user_id: params.user_id ?? null,
    action: params.action,
    target_type: params.target_type ?? null,
    target_id: params.target_id ?? null,
    ip_address: null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    metadata_json: params.metadata_json ?? null,
  })
}

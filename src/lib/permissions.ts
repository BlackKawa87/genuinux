export type Role = 'owner' | 'admin' | 'analyst' | 'viewer'

// Numerical level — higher = more access. 'member' kept for DB backward compat.
const ROLE_LEVEL: Record<string, number> = {
  owner:   4,
  admin:   3,
  analyst: 2,
  viewer:  1,
  member:  1,
}

export type Permission =
  | 'manage_billing'
  | 'manage_api_keys'
  | 'manage_members'
  | 'manage_settings'
  | 'manage_rules'
  | 'manage_webhooks'
  | 'review_events'
  | 'view_dashboard'
  | 'act_queue'
  | 'submit_feedback'
  | 'view_events'

const PERM_LEVEL: Record<Permission, number> = {
  manage_billing:   4,
  manage_api_keys:  4,
  manage_members:   4,
  manage_settings:  4,
  manage_rules:     3,
  manage_webhooks:  3,
  review_events:    3,
  view_dashboard:   1,
  act_queue:        2,
  submit_feedback:  2,
  view_events:      1,
}

export function can(role: string | null | undefined, permission: Permission): boolean {
  return (ROLE_LEVEL[role ?? ''] ?? 0) >= PERM_LEVEL[permission]
}

export const ROLE_META: Record<string, {
  label: string
  color: string
  bg: string
  border: string
  desc: string
}> = {
  owner: {
    label:  'Owner',
    color:  '#16C784',
    bg:     'rgba(22,199,132,0.1)',
    border: 'rgba(22,199,132,0.25)',
    desc:   'Full access — billing, API keys, team, and all settings.',
  },
  admin: {
    label:  'Admin',
    color:  '#818CF8',
    bg:     'rgba(129,140,248,0.1)',
    border: 'rgba(129,140,248,0.25)',
    desc:   'Manage rules, webhooks, review queue, and events.',
  },
  analyst: {
    label:  'Analyst',
    color:  '#38BDF8',
    bg:     'rgba(56,189,248,0.1)',
    border: 'rgba(56,189,248,0.25)',
    desc:   'View events, act on review queue, add notes and feedback.',
  },
  viewer: {
    label:  'Viewer',
    color:  '#94A3B8',
    bg:     'rgba(148,163,184,0.08)',
    border: 'rgba(148,163,184,0.2)',
    desc:   'Read-only access to dashboard and risk events.',
  },
  member: {
    label:  'Member',
    color:  '#94A3B8',
    bg:     'rgba(148,163,184,0.08)',
    border: 'rgba(148,163,184,0.2)',
    desc:   'Legacy read-only role — equivalent to Viewer.',
  },
}

// Roles an owner/admin can assign (no self-service owner transfer in v1)
export const ASSIGNABLE_ROLES: Role[] = ['admin', 'analyst', 'viewer']
export const ADMIN_ASSIGNABLE_ROLES: Role[] = ['analyst', 'viewer']

export const ROLE_ORDER: Record<string, number> = {
  owner:   0,
  admin:   1,
  analyst: 2,
  viewer:  3,
  member:  4,
}

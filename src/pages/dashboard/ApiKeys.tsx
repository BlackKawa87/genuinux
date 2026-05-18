import { useState } from 'react'
import { Key, Copy, Trash2, Plus, CheckCircle } from 'lucide-react'
import type { ApiKey } from '../../types'

const MOCK_KEYS: ApiKey[] = [
  {
    id: '1',
    organization_id: 'org_1',
    name: 'Production',
    key_hash: '',
    key_prefix: 'gnx_live_K9x2mP•••••••••••••••••',
    status: 'active',
    created_at: 'Jan 12, 2025',
    last_used_at: '2 minutes ago',
    requests_count: 48291,
  },
  {
    id: '2',
    organization_id: 'org_1',
    name: 'Development',
    key_hash: '',
    key_prefix: 'gnx_test_M2p9xX•••••••••••••••••',
    status: 'active',
    created_at: 'Jan 8, 2025',
    last_used_at: '1 hour ago',
    requests_count: 1204,
  },
]

export default function ApiKeys() {
  const [keys]          = useState<ApiKey[]>(MOCK_KEYS)
  const [copied, setCopied] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')

  const handleCopy = (id: string) => {
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleCreate = () => {
    setNewKeyName('')
    setShowCreate(false)
  }

  return (
    <div className="p-8" style={{ maxWidth: '860px' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#FFFFFF' }}>API Keys</h1>
          <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>
            Manage keys for your platform integration
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-trust px-4 py-2 text-sm gap-2 rounded-lg"
        >
          <Plus size={15} />
          Create key
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="g-card p-6 mb-6">
          <h3 className="text-sm font-semibold mb-4" style={{ color: '#FFFFFF' }}>
            New API key
          </h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="Key name  (e.g. Production)"
              className="g-input flex-1"
              autoFocus
            />
            <button
              onClick={handleCreate}
              className="btn-trust px-4 py-2.5 text-sm rounded-lg"
            >
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="btn-outline px-4 py-2.5 text-sm rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Keys */}
      <div className="space-y-3">
        {keys.map(key => (
          <div
            key={key.id}
            className="g-card p-5 flex items-center gap-4"
          >
            {/* Icon */}
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: 'rgba(22, 199, 132, 0.08)',
                border: '1px solid rgba(22, 199, 132, 0.15)',
              }}
            >
              <Key size={15} style={{ color: '#16C784' }} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>{key.name}</p>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full mono badge-allow"
                >
                  {key.status}
                </span>
              </div>
              <p className="text-xs mono truncate" style={{ color: '#94A3B8' }}>
                {key.key_prefix}
              </p>
            </div>

            {/* Meta */}
            <div
              className="hidden md:flex items-center gap-8 text-xs"
              style={{ color: '#475569' }}
            >
              <div>
                <p className="mb-0.5" style={{ color: '#94A3B8' }}>Created</p>
                <p>{key.created_at}</p>
              </div>
              <div>
                <p className="mb-0.5" style={{ color: '#94A3B8' }}>Last used</p>
                <p>{key.last_used_at ?? '—'}</p>
              </div>
              <div>
                <p className="mb-0.5" style={{ color: '#94A3B8' }}>Requests</p>
                <p className="mono">{(key.requests_count ?? 0).toLocaleString()}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleCopy(key.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-150"
                style={{
                  background: copied === key.id ? 'rgba(22, 199, 132, 0.08)' : '#0B1220',
                  border: '1px solid #1E2D3D',
                  color: copied === key.id ? '#16C784' : '#94A3B8',
                }}
              >
                {copied === key.id ? <CheckCircle size={12} /> : <Copy size={12} />}
                {copied === key.id ? 'Copied' : 'Copy'}
              </button>
              <button
                className="p-1.5 rounded-lg transition-colors duration-150"
                style={{ color: '#475569' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
                title="Revoke key"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Security note */}
      <div
        className="mt-6 p-4 rounded-xl text-sm"
        style={{
          background: 'rgba(22, 199, 132, 0.04)',
          border: '1px solid rgba(22, 199, 132, 0.12)',
        }}
      >
        <p className="font-semibold mb-1" style={{ color: '#16C784' }}>
          Keep your API keys secure
        </p>
        <p style={{ color: '#94A3B8' }}>
          Never expose keys in client-side code. Use server-side only.
          Rotate immediately if compromised.
        </p>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertTriangle, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'

const C = {
  bg: '#F8FAFC', surface: '#FFFFFF', border: '#E2E8F0',
  text: '#0F172A', textSec: '#64748B', trust: '#16C784',
}

type Stage = 'loading' | 'joining' | 'success' | 'error'

export default function Join() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [stage,   setStage]   = useState<Stage>('loading')
  const [orgName, setOrgName] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) { setStage('error'); setMessage('No invite token found in URL.'); return }
    void processInvite()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const processInvite = async () => {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      // User just clicked the email invite link — wait for auth state to settle
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sess) => {
        if (event === 'SIGNED_IN' && sess) {
          subscription.unsubscribe()
          await callAcceptEndpoint(sess.access_token)
        }
      })
      return
    }

    await callAcceptEndpoint(session.access_token)
  }

  const callAcceptEndpoint = async (accessToken: string) => {
    setStage('joining')

    const res = await fetch('/api/team/accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ inviteToken: token }),
    })

    const json = await res.json() as { success?: boolean; org_name?: string; error?: string }

    if (!res.ok) {
      setStage('error')
      setMessage(json.error ?? 'Failed to join organization. Please contact support.')
      return
    }

    setOrgName(json.org_name ?? 'the organization')
    setStage('success')
    setTimeout(() => navigate('/dashboard'), 3000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: C.bg }}>
      <div className="w-full max-w-[420px]">

        <Link to="/" className="flex justify-center mb-8">
          <img src="/logo-full.png" alt="Genuinux" style={{ height: '140px', display: 'block' }} />
        </Link>

        <div className="p-8 rounded-2xl text-center"
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            boxShadow: '0 4px 24px rgba(15,23,42,0.06), 0 1px 4px rgba(15,23,42,0.04)',
          }}>

          {(stage === 'loading' || stage === 'joining') && (
            <div className="flex items-center justify-center gap-3 py-8" style={{ color: C.textSec }}>
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">
                {stage === 'loading' ? 'Validating invite…' : 'Joining organization…'}
              </span>
            </div>
          )}

          {stage === 'success' && (
            <div className="py-2">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(22,199,132,0.1)', border: '1px solid rgba(22,199,132,0.2)' }}>
                <CheckCircle2 size={26} style={{ color: C.trust }} />
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ color: C.text }}>You're in!</h2>
              <p className="text-sm leading-relaxed" style={{ color: C.textSec }}>
                You've joined <strong style={{ color: C.text }}>{orgName}</strong>.
                Taking you to the dashboard…
              </p>
            </div>
          )}

          {stage === 'error' && (
            <div className="py-2">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertTriangle size={22} style={{ color: '#EF4444' }} />
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ color: C.text }}>Invalid invite</h2>
              <p className="text-sm leading-relaxed" style={{ color: C.textSec }}>{message}</p>
              <Link to="/"
                className="inline-flex items-center gap-2 mt-6 text-sm font-semibold"
                style={{ color: C.trust }}>
                <Users size={14} />
                Go to homepage
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

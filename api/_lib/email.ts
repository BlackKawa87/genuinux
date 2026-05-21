import { Resend } from 'resend'
import { betaInviteHtml, betaInviteText } from './emailTemplates'

interface SendInviteEmailParams {
  to: string
  inviteCode: string
  expiresAt: string
  note?: string | null
}

interface SendResult {
  sent: boolean
  error?: string
}

export async function sendInviteEmail(params: SendInviteEmailParams): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { sent: false, error: 'RESEND_API_KEY not configured' }
  }

  const from    = process.env.RESEND_FROM_EMAIL   ?? 'Genuinux Beta <beta@genuinux.com>'
  const replyTo = process.env.BETA_REPLY_TO_EMAIL ?? 'beta@genuinux.io'
  const appUrl  = (process.env.APP_URL ?? 'https://genuinux.vercel.app').replace(/\/$/, '')
  const signupUrl = `${appUrl}/register`

  const emailParams = {
    to:          params.to,
    inviteCode:  params.inviteCode,
    expiresAt:   params.expiresAt,
    signupUrl,
    note:        params.note,
  }

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from,
      to:       [params.to],
      reply_to: replyTo,
      subject:  `Your Genuinux Beta invite — ${params.inviteCode}`,
      html:     betaInviteHtml(emailParams),
      text:     betaInviteText(emailParams),
    })

    if (error) {
      return { sent: false, error: error.message }
    }

    return { sent: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { sent: false, error: msg }
  }
}
